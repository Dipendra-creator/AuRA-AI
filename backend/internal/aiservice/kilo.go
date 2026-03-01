// Package aiservice provides AI-powered document analysis via the Kilo API.
package aiservice

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aura-ai/backend/internal/domain"
)

const (
	kiloBaseURL    = "https://api.kilo.ai/api/openrouter/"
	defaultModel   = "minimax/minimax-m2.5:free"
	requestTimeout = 60 * time.Second
)

// KiloClient communicates with the Kilo AI API for document field extraction.
type KiloClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewKiloClient creates a new KiloClient with the given API key.
func NewKiloClient(apiKey string) *KiloClient {
	return &KiloClient{
		apiKey: apiKey,
		model:  defaultModel,
		httpClient: &http.Client{
			Timeout: requestTimeout,
		},
	}
}

// chatRequest is the OpenAI-compatible request format.
type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse is the OpenAI-compatible response format.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// extractedFieldJSON is the JSON shape we ask the AI to produce.
type extractedFieldJSON struct {
	FieldName  string  `json:"fieldName"`
	Value      string  `json:"value"`
	Confidence float64 `json:"confidence"`
}

// ExtractFields sends document text to the AI and returns structured fields.
func (c *KiloClient) ExtractFields(ctx context.Context, documentText string, documentType domain.DocumentType) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(documentText) == "" {
		return nil, fmt.Errorf("document text is empty")
	}

	prompt := buildExtractionPrompt(documentText, documentType)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{
				Role:    "system",
				Content: "You are a document analysis AI. You extract structured data from documents. Always respond with valid JSON only — no markdown, no explanation.",
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := kiloBaseURL + "chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AI API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AI response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AI API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("AI API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("AI returned no choices")
	}

	content := chatResp.Choices[0].Message.Content
	return parseExtractedFields(content)
}

// buildExtractionPrompt creates a structured prompt for the AI.
func buildExtractionPrompt(text string, docType domain.DocumentType) string {
	typeHint := string(docType)
	if typeHint == "" || typeHint == "other" {
		typeHint = "general document"
	}

	// Truncate very long documents to avoid token limits
	const maxTextLen = 8000
	if len(text) > maxTextLen {
		text = text[:maxTextLen] + "\n... [text truncated]"
	}

	return fmt.Sprintf(`Analyze the following %s and extract all relevant data fields.

Return a JSON array of objects. Each object must have:
- "fieldName": the name of the field (e.g. "Invoice Number", "Date", "Total Amount", "Company Name")
- "value": the extracted value as a string
- "confidence": a float between 0.0 and 1.0 indicating how confident you are

Extract as many meaningful fields as possible. For %s documents, focus on key fields like names, dates, amounts, reference numbers, addresses, etc.

IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation.

Document text:
---
%s
---`, typeHint, typeHint, text)
}

// parseExtractedFields parses the AI's JSON response into domain fields.
func parseExtractedFields(content string) ([]domain.ExtractedField, error) {
	// Clean up common issues: strip markdown fences, trim whitespace
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var rawFields []extractedFieldJSON
	if err := json.Unmarshal([]byte(content), &rawFields); err != nil {
		// Try to find JSON array in the content
		start := strings.Index(content, "[")
		end := strings.LastIndex(content, "]")
		if start >= 0 && end > start {
			if err2 := json.Unmarshal([]byte(content[start:end+1]), &rawFields); err2 != nil {
				return nil, fmt.Errorf("failed to parse AI output as JSON: %w (raw: %s)", err, truncate(content, 200))
			}
		} else {
			return nil, fmt.Errorf("failed to parse AI output as JSON: %w (raw: %s)", err, truncate(content, 200))
		}
	}

	fields := make([]domain.ExtractedField, 0, len(rawFields))
	for _, rf := range rawFields {
		if rf.FieldName == "" || rf.Value == "" {
			continue
		}
		conf := rf.Confidence
		if conf < 0 {
			conf = 0
		}
		if conf > 1 {
			conf = 1
		}
		fields = append(fields, domain.ExtractedField{
			FieldName:  rf.FieldName,
			Value:      rf.Value,
			Confidence: conf,
			Verified:   false,
		})
	}

	if len(fields) == 0 {
		return nil, fmt.Errorf("AI returned no valid fields")
	}

	return fields, nil
}

// truncate shortens a string to maxLen characters.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

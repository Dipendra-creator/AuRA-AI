// Package aiservice provides AI-powered document analysis.
// This file implements the CopilotClient which uses the GitHub Models API
// (https://models.github.ai/inference/chat/completions) for AI inference.
// It is OpenAI-compatible and uses a GitHub PAT for authentication.
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
	copilotBaseURL      = "https://models.github.ai/inference/"
	copilotDefaultModel = "gpt-4o-mini"
)

// CopilotClient communicates with the GitHub Models API for document analysis.
// It uses the same OpenAI-compatible chat/completions format.
type CopilotClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// Ensure CopilotClient satisfies AIClient at compile time.
var _ AIClient = (*CopilotClient)(nil)

// NewCopilotClient creates a CopilotClient with the given GitHub PAT and default model.
func NewCopilotClient(apiKey string) *CopilotClient {
	return NewCopilotClientWithModel(apiKey, copilotDefaultModel)
}

// NewCopilotClientWithModel creates a CopilotClient with the given PAT and model.
func NewCopilotClientWithModel(apiKey, model string) *CopilotClient {
	if model == "" {
		model = copilotDefaultModel
	}
	return &CopilotClient{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{
			Timeout: requestTimeout,
		},
	}
}

// Chat sends a prompt to GitHub Models and returns the raw text response.
func (c *CopilotClient) Chat(ctx context.Context, prompt string) (string, error) {
	if strings.TrimSpace(prompt) == "" {
		return "", fmt.Errorf("prompt is empty")
	}

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
		return "", fmt.Errorf(errMsgMarshalReq, err)
	}

	url := copilotBaseURL + chatCompletionsPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf(errMsgCreateReq, err)
	}
	req.Header.Set(headerContentType, contentTypeJSON)
	req.Header.Set("Authorization", authBearerPrefix+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub Models API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read GitHub Models response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub Models API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("failed to parse GitHub Models response: %w", err)
	}

	if chatResp.Error != nil {
		return "", fmt.Errorf("GitHub Models API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("GitHub Models returned no choices")
	}

	return chatResp.Choices[0].Message.Content, nil
}

// ExtractFields sends document text to GitHub Models and returns structured fields.
// ChatConversation sends a multi-turn conversation with custom system/user messages.
func (c *CopilotClient) ChatConversation(ctx context.Context, messages []ConversationMessage) (string, error) {
	if len(messages) == 0 {
		return "", fmt.Errorf("messages cannot be empty")
	}

	chatMsgs := make([]chatMessage, len(messages))
	for i, m := range messages {
		chatMsgs[i] = chatMessage{Role: m.Role, Content: m.Content}
	}

	reqBody := chatRequest{
		Model:    c.model,
		Messages: chatMsgs,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf(errMsgMarshalReq, err)
	}

	url := copilotBaseURL + chatCompletionsPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf(errMsgCreateReq, err)
	}
	req.Header.Set(headerContentType, contentTypeJSON)
	req.Header.Set("Authorization", authBearerPrefix+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub Models API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read GitHub Models response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub Models API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("failed to parse GitHub Models response: %w", err)
	}

	if chatResp.Error != nil {
		return "", fmt.Errorf("GitHub Models API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("GitHub Models returned no choices")
	}

	return chatResp.Choices[0].Message.Content, nil
}

func (c *CopilotClient) ExtractFields(ctx context.Context, documentText string, documentType domain.DocumentType) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(documentText) == "" {
		return nil, fmt.Errorf("document text is empty")
	}

	prompt := buildExtractionPrompt(documentText, documentType)
	content, err := c.Chat(ctx, prompt)
	if err != nil {
		return nil, err
	}
	return ParseExtractedFields(content)
}

// ExtractFieldsFromPage sends a single page's text to GitHub Models and returns structured fields.
func (c *CopilotClient) ExtractFieldsFromPage(ctx context.Context, pageText string, pageNum, totalPages int, documentType domain.DocumentType) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(pageText) == "" {
		return nil, fmt.Errorf("page %d text is empty", pageNum)
	}

	prompt := buildPageExtractionPrompt(pageText, pageNum, totalPages, documentType)

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
		return nil, fmt.Errorf(errMsgMarshalReq, err)
	}

	url := copilotBaseURL + chatCompletionsPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf(errMsgCreateReq, err)
	}
	req.Header.Set(headerContentType, contentTypeJSON)
	req.Header.Set("Authorization", authBearerPrefix+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub Models API request failed for page %d: %w", pageNum, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response for page %d: %w", pageNum, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub Models API returned status %d for page %d: %s", resp.StatusCode, pageNum, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse response for page %d: %w", pageNum, err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("GitHub Models API error for page %d: %s", pageNum, chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("GitHub Models returned no choices for page %d", pageNum)
	}

	content := chatResp.Choices[0].Message.Content
	return ParseExtractedFields(content)
}

// ExtractFieldsFromPageWithSchema sends a single page using a user-defined schema.
func (c *CopilotClient) ExtractFieldsFromPageWithSchema(ctx context.Context, pageText string, pageNum, totalPages int, schema []domain.SchemaField) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(pageText) == "" {
		return nil, fmt.Errorf("page %d text is empty", pageNum)
	}

	prompt := buildSchemaPageExtractionPrompt(pageText, pageNum, totalPages, schema)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{
				Role:    "system",
				Content: "You are a document analysis AI. You extract structured data from documents according to a user-defined schema. Always respond with valid JSON only — no markdown, no explanation.",
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf(errMsgMarshalReq, err)
	}

	url := copilotBaseURL + chatCompletionsPath
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf(errMsgCreateReq, err)
	}
	req.Header.Set(headerContentType, contentTypeJSON)
	req.Header.Set("Authorization", authBearerPrefix+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub Models API request failed for page %d: %w", pageNum, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response for page %d: %w", pageNum, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub Models API returned status %d for page %d: %s", resp.StatusCode, pageNum, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse response for page %d: %w", pageNum, err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("GitHub Models API error for page %d: %s", pageNum, chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("GitHub Models returned no choices for page %d", pageNum)
	}

	content := chatResp.Choices[0].Message.Content
	return ParseExtractedFields(content)
}

// NewAIClientForProvider is a factory function that creates the correct AIClient
// based on provider type. This is the single place where provider type → client mapping lives.
func NewAIClientForProvider(providerType, apiKey, model string) AIClient {
	switch providerType {
	case "github_copilot":
		return NewCopilotClientWithModel(apiKey, model)
	case "kilo_code":
		return NewKiloClientWithModel(apiKey, model)
	default:
		// Fallback to Kilo for backward compat
		return NewKiloClientWithModel(apiKey, model)
	}
}

// DefaultModelForProvider returns the default model for a given provider type.
func DefaultModelForProvider(providerType string) string {
	switch providerType {
	case "github_copilot":
		return copilotDefaultModel
	case "kilo_code":
		return defaultModel
	default:
		return defaultModel
	}
}

// TestClient creates a temporary client for a given provider type and runs a health-check prompt.
// Returns latency in ms and any error. Used by the test-connection endpoint.
func TestClient(ctx context.Context, providerType, apiKey, model string) (int64, error) {
	client := NewAIClientForProvider(providerType, apiKey, model)
	start := time.Now()
	_, err := client.Chat(ctx, `Reply with only the JSON: {"ok":true}`)
	latency := time.Since(start).Milliseconds()
	return latency, err
}

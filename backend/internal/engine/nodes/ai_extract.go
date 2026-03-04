package nodes

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// AIExtractExecutor handles the ai_extract node — runs AI extraction via the
// Kilo API using a user-supplied prompt describing which fields to extract.
type AIExtractExecutor struct {
	aiClient *aiservice.KiloClient
}

// NewAIExtractExecutor creates a new AIExtractExecutor.
// If aiClient is nil, the node will pass through without AI extraction.
func NewAIExtractExecutor(aiClient *aiservice.KiloClient) *AIExtractExecutor {
	return &AIExtractExecutor{aiClient: aiClient}
}

// Validate checks the AI extract node config.
func (e *AIExtractExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute runs AI field extraction on the raw text from the input data packet.
// Uses the user-supplied prompt from config to determine what fields to extract.
func (e *AIExtractExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Read config
	confidenceThreshold := 0.7
	if v, ok := node.Config["confidenceThreshold"]; ok {
		if f, ok := v.(float64); ok {
			confidenceThreshold = f
		}
	}

	userPrompt, _ := node.Config["prompt"].(string)

	slog.Info("ai_extract: starting extraction",
		"node", node.Name,
		"hasAiClient", e.aiClient != nil,
		"rawTextLen", len(input.RawText),
		"prompt", userPrompt,
	)

	// If no AI client or no raw text, pass through
	if e.aiClient == nil {
		slog.Warn("ai_extract: no AI client configured (set KILO_API_KEY), passing through", "node", node.Name)
		output.Fields["extraction_model"] = "none"
		output.Fields["extraction_error"] = "AI service not configured — set KILO_API_KEY in .env"
		output.Fields["extraction_complete"] = false
		return output, nil
	}

	if input.RawText == "" {
		slog.Warn("ai_extract: no raw text in input, passing through", "node", node.Name)
		output.Fields["extraction_model"] = "pipeline_ai_extract"
		output.Fields["extraction_error"] = "No raw text available — ensure previous node provides text"
		output.Fields["extraction_complete"] = false
		return output, nil
	}

	// Build the extraction prompt
	var prompt string
	if userPrompt != "" {
		// User specified what they want extracted
		prompt = buildCustomExtractionPrompt(input.RawText, userPrompt)
	} else {
		// Fall back to general extraction
		prompt = buildGeneralExtractionPrompt(input.RawText)
	}

	// Call the Kilo AI API using a custom chat completion
	fields, err := e.aiClient.ExtractFields(ctx, prompt, domain.TypeOther)
	if err != nil {
		slog.Error("ai_extract: AI extraction failed", "node", node.Name, "error", err)
		output.Fields["extraction_model"] = "pipeline_ai_extract"
		output.Fields["extraction_error"] = err.Error()
		output.Fields["extraction_complete"] = false
		// Don't fail the pipeline — pass through with error info
		return output, nil
	}

	// Populate fields from AI extraction
	extractedCount := 0
	for _, field := range fields {
		if field.Confidence >= confidenceThreshold {
			output.Fields[field.FieldName] = field.Value
			output.Fields[field.FieldName+"_confidence"] = field.Confidence
			extractedCount++
		}
	}

	output.Fields["extraction_model"] = "pipeline_ai_extract"
	output.Fields["confidence_threshold"] = confidenceThreshold
	output.Fields["extraction_complete"] = true
	output.Fields["total_fields_extracted"] = extractedCount
	output.Fields["total_fields_from_ai"] = len(fields)

	slog.Info("ai_extract node completed",
		"node", node.Name,
		"totalFromAI", len(fields),
		"aboveThreshold", extractedCount,
		"confidenceThreshold", confidenceThreshold,
	)

	return output, nil
}

// buildCustomExtractionPrompt creates a prompt for extracting specific fields
// based on the user's description.
func buildCustomExtractionPrompt(rawText string, userPrompt string) string {
	const maxTextLen = 30000
	text := rawText
	if len(text) > maxTextLen {
		text = text[:maxTextLen] + "\n... [text truncated]"
	}

	return fmt.Sprintf(`You are an expert document data extraction AI. A user wants specific information extracted from the following document text.

USER REQUEST:
%s

EXTRACTION RULES:
1. Extract ONLY the fields the user asked for.
2. If the document doesn't contain a requested piece of information, skip it.
3. Include units and currency symbols in values (e.g. "$1,234.56").
4. For dates, preserve the original format found in the document.
5. Set confidence based on how clearly the value appears: 0.95+ for clear, 0.7-0.94 for partially unclear, below 0.7 for uncertain.

Return a JSON array of objects. Each object MUST have:
- "fieldName": descriptive name of the field
- "value": the extracted value as a string
- "confidence": a float between 0.0 and 1.0

IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation.

Document text:
---
%s
---`, userPrompt, text)
}

// buildGeneralExtractionPrompt creates a prompt for general field extraction.
func buildGeneralExtractionPrompt(rawText string) string {
	const maxTextLen = 30000
	text := rawText
	if len(text) > maxTextLen {
		text = text[:maxTextLen] + "\n... [text truncated]"
	}

	return fmt.Sprintf(`You are an expert document data extraction AI. Extract ALL structured data fields from the following document.

EXTRACTION RULES:
1. Extract EVERY field you can find — do NOT skip any data.
2. For tables, extract each row as a separate field.
3. Include units and currency symbols in values.
4. Set confidence based on text clarity.

Return a JSON array of objects. Each object MUST have:
- "fieldName": descriptive name of the field
- "value": the extracted value as a string
- "confidence": a float between 0.0 and 1.0

IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation.

Document text:
---
%s
---`, text)
}

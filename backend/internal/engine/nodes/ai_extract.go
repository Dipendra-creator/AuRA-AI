package nodes

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// aiExtractTimeout is the maximum time a single AI extract node may run.
// This prevents the pipeline from hanging indefinitely if the AI API is slow.
const aiExtractTimeout = 90 * time.Second

// internalFieldKeys are pipeline-metadata keys that should NOT be forwarded
// to the AI as document content.
var internalFieldKeys = map[string]bool{
	"documentsSelected":      true,
	"rawTextLength":          true,
	"extraction_model":       true,
	"extraction_error":       true,
	"extraction_complete":    true,
	"confidence_threshold":   true,
	"total_fields_extracted": true,
	"total_fields_from_ai":   true,
	"selectedDocuments":      true,
}

// AIExtractExecutor handles the ai_extract node — runs AI extraction via the
// configured AI provider using a user-supplied prompt describing which fields to extract.
type AIExtractExecutor struct {
	aiMgr *aiservice.ClientManager
}

// NewAIExtractExecutor creates a new AIExtractExecutor.
// aiMgr is a shared, hot-swappable client holder; if no provider is configured,
// the node passes through without extraction rather than failing the pipeline.
func NewAIExtractExecutor(aiMgr *aiservice.ClientManager) *AIExtractExecutor {
	return &AIExtractExecutor{aiMgr: aiMgr}
}

// Validate checks the AI extract node config.
func (e *AIExtractExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute runs AI processing on the data produced by the previous pipeline node.
// It feeds two things to the AI:
//  1. Structured fields already extracted by the previous node (e.g. Select Documents)
//     — as JSON, so the AI can reshape/filter/transform real structured data.
//  2. The raw document text — as supplementary context.
//
// This means prompts like "arrange the data into a static model for json" work on
// the real structured data the previous node produced, not re-parsed raw text.
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

	// Collect meaningful data fields from the previous node, filtering out
	// internal pipeline metadata and confidence mirror keys.
	prevFields := collectPreviousFields(input.Fields)

	ai := e.aiMgr.Get()

	slog.Info("ai_extract: starting extraction",
		"node", node.Name,
		"hasAiClient", ai != nil,
		"rawTextLen", len(input.RawText),
		"prevFieldCount", len(prevFields),
		"prompt", userPrompt,
	)

	if ai == nil {
		slog.Warn("ai_extract: no AI client configured, passing through", "node", node.Name)
		output.Fields["extraction_model"] = "none"
		output.Fields["extraction_error"] = "AI service not configured — add an API key in API Configuration"
		output.Fields["extraction_complete"] = false
		return output, nil
	}

	// We need either raw text OR structured fields from the previous node.
	if input.RawText == "" && len(prevFields) == 0 {
		slog.Warn("ai_extract: no data in input (no raw text, no fields), passing through", "node", node.Name)
		output.Fields["extraction_model"] = "pipeline_ai_extract"
		output.Fields["extraction_error"] = "No input data — ensure a previous node provides raw text or extracted fields"
		output.Fields["extraction_complete"] = false
		return output, nil
	}

	// Build the prompt — include structured fields from the previous node as JSON
	// context so the AI operates on real structured data, not just raw text.
	var prompt string
	if userPrompt != "" {
		prompt = buildCustomExtractionPrompt(input.RawText, prevFields, userPrompt)
	} else {
		prompt = buildGeneralExtractionPrompt(input.RawText, prevFields)
	}

	// Apply a per-node timeout so a slow AI response never hangs the pipeline.
	nodeCtx, cancel := context.WithTimeout(ctx, aiExtractTimeout)
	defer cancel()

	// Call Chat() directly with our pre-built prompt.
	rawContent, err := ai.Chat(nodeCtx, prompt)
	if err != nil {
		slog.Error("ai_extract: AI extraction failed", "node", node.Name, "error", err)
		output.Fields["extraction_model"] = "pipeline_ai_extract"
		output.Fields["extraction_error"] = err.Error()
		output.Fields["extraction_complete"] = false
		// Don't fail the pipeline — pass through with error info
		return output, nil
	}

	fields, parseErr := aiservice.ParseExtractedFields(rawContent)
	if parseErr != nil {
		slog.Error("ai_extract: failed to parse AI response", "node", node.Name, "error", parseErr)
		output.Fields["extraction_model"] = "pipeline_ai_extract"
		output.Fields["extraction_error"] = parseErr.Error()
		output.Fields["extraction_complete"] = false
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

// collectPreviousFields gathers meaningful data fields from the input packet,
// filtering out internal pipeline metadata, confidence mirror keys, and doc IDs.
func collectPreviousFields(fields map[string]any) map[string]any {
	result := make(map[string]any, len(fields))
	for k, v := range fields {
		if internalFieldKeys[k] {
			continue
		}
		// Skip confidence-score mirror keys (e.g. "Full Name_confidence")
		if strings.HasSuffix(k, "_confidence") {
			continue
		}
		// Skip document ID tracker keys
		if strings.HasPrefix(k, "documentId_") {
			continue
		}
		result[k] = v
	}
	return result
}

// buildCustomExtractionPrompt builds a prompt that feeds the structured fields
// from the previous node (primary source) and optionally the raw text (fallback)
// into the AI, then asks it to process them per the user's instruction.
//
// To avoid hitting the free-tier model's context limit:
//   - prevFields JSON is capped at 12 000 chars
//   - raw text is included ONLY when there are no structured fields
func buildCustomExtractionPrompt(rawText string, prevFields map[string]any, userPrompt string) string {
	const (
		maxFieldsJSON = 12000
		maxRawText    = 10000
	)

	var sb strings.Builder

	sb.WriteString("You are an expert document data AI assistant. A user wants you to process document data according to their instructions.\n\n")
	sb.WriteString("USER INSTRUCTION:\n")
	sb.WriteString(userPrompt)
	sb.WriteString("\n\n")

	// Prefer structured fields as the primary data source.
	// Only fall back to raw text when no structured fields exist.
	if len(prevFields) > 0 {
		fieldsJSON, err := json.MarshalIndent(prevFields, "", "  ")
		if err == nil {
			jsonStr := string(fieldsJSON)
			if len(jsonStr) > maxFieldsJSON {
				jsonStr = jsonStr[:maxFieldsJSON] + "\n  ... [truncated]"
			}
			sb.WriteString("STRUCTURED DATA FROM PREVIOUS STEP (already extracted from the document):\n```json\n")
			sb.WriteString(jsonStr)
			sb.WriteString("\n```\n\n")
		}
	} else if rawText != "" {
		// No structured fields — fall back to raw text
		text := rawText
		if len(text) > maxRawText {
			text = text[:maxRawText] + "\n... [text truncated]"
		}
		sb.WriteString("RAW DOCUMENT TEXT:\n---\n")
		sb.WriteString(text)
		sb.WriteString("\n---\n\n")
	}

	sb.WriteString("OUTPUT RULES:\n")
	sb.WriteString("1. Apply the user instruction to the data provided above.\n")
	sb.WriteString("2. Return your result as a JSON array of objects. Each object MUST have:\n")
	sb.WriteString("   - \"fieldName\": descriptive name of the output field\n")
	sb.WriteString("   - \"value\": the field value as a string\n")
	sb.WriteString("   - \"confidence\": a float between 0.0 and 1.0\n")
	sb.WriteString("3. Use 0.95+ confidence for data taken directly from the structured input.\n")
	sb.WriteString("4. IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation.\n")

	return sb.String()
}

// buildGeneralExtractionPrompt builds a general extraction prompt using the
// structured fields from the previous node (preferred) or raw text (fallback).
// Only one source is included to stay within the model's context limit.
func buildGeneralExtractionPrompt(rawText string, prevFields map[string]any) string {
	const (
		maxFieldsJSON = 12000
		maxRawText    = 10000
	)

	var sb strings.Builder

	sb.WriteString("You are an expert document data extraction AI. Extract ALL structured data fields from the following document data.\n\n")

	if len(prevFields) > 0 {
		fieldsJSON, err := json.MarshalIndent(prevFields, "", "  ")
		if err == nil {
			jsonStr := string(fieldsJSON)
			if len(jsonStr) > maxFieldsJSON {
				jsonStr = jsonStr[:maxFieldsJSON] + "\n  ... [truncated]"
			}
			sb.WriteString("STRUCTURED DATA FROM PREVIOUS STEP:\n```json\n")
			sb.WriteString(jsonStr)
			sb.WriteString("\n```\n\n")
		}
	} else if rawText != "" {
		text := rawText
		if len(text) > maxRawText {
			text = text[:maxRawText] + "\n... [text truncated]"
		}
		sb.WriteString("RAW DOCUMENT TEXT:\n---\n")
		sb.WriteString(text)
		sb.WriteString("\n---\n\n")
	}

	sb.WriteString("EXTRACTION RULES:\n")
	sb.WriteString("1. Extract EVERY field you can find — do NOT skip any data.\n")
	sb.WriteString("2. For tables, extract each row as a separate field.\n")
	sb.WriteString("3. Include units and currency symbols in values.\n")
	sb.WriteString("4. Set confidence based on data clarity.\n\n")
	sb.WriteString("Return a JSON array of objects. Each object MUST have:\n")
	sb.WriteString("- \"fieldName\": descriptive name of the field\n")
	sb.WriteString("- \"value\": the extracted value as a string\n")
	sb.WriteString("- \"confidence\": a float between 0.0 and 1.0\n\n")
	sb.WriteString("IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation.")

	return sb.String()
}

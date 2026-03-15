package nodes

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// FormFillExecutor handles the form_fill node — maps extracted fields to form templates.
type FormFillExecutor struct{}

// NewFormFillExecutor creates a new FormFillExecutor.
func NewFormFillExecutor() *FormFillExecutor {
	return &FormFillExecutor{}
}

// Validate checks the form fill node config.
func (e *FormFillExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute maps extracted fields to a form template using the configured field mapping
// and writes a JSON artifact to uploads/form_results_{nodeID}.json.
func (e *FormFillExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Get field mapping from config — supports two formats:
	// 1. Map format: { "formField": "extractedField" }
	// 2. Array format: [ { "source": "extractedField", "target": "formField" } ]
	mappingRaw, ok := node.Config["fieldMapping"]
	if !ok {
		slog.Info("form_fill node has no field mapping, passing through", "node", node.Name)
		return output, nil
	}

	// Build mapping from either format
	mapping := make(map[string]string)

	switch v := mappingRaw.(type) {
	case map[string]any:
		for formField, extractedFieldRaw := range v {
			if s, ok := extractedFieldRaw.(string); ok {
				mapping[formField] = s
			}
		}
	case []any:
		for _, item := range v {
			row, ok := item.(map[string]any)
			if !ok {
				continue
			}
			source, _ := row["source"].(string)
			target, _ := row["target"].(string)
			if source != "" && target != "" {
				mapping[target] = source
			}
		}
	default:
		return output, fmt.Errorf("fieldMapping must be an object or array")
	}

	// Apply field mapping: form_field -> extracted_field
	filledFields := make(map[string]any)
	for formField, extractedField := range mapping {
		// Support dot notation: "extracted.name" -> look up "name" in input fields
		fieldName := extractedField
		if len(fieldName) > 10 && fieldName[:10] == "extracted." {
			fieldName = fieldName[10:]
		}

		if val, exists := input.Fields[fieldName]; exists {
			filledFields[formField] = val
		}
	}

	// Apply validation rules if present
	validationRaw, _ := node.Config["validationRules"]
	if rules, ok := validationRaw.([]any); ok {
		for _, ruleRaw := range rules {
			rule, ok := ruleRaw.(map[string]any)
			if !ok {
				continue
			}
			field, _ := rule["field"].(string)
			required, _ := rule["required"].(bool)

			if required {
				if _, exists := filledFields[field]; !exists {
					output.Errors = append(output.Errors, engine.DataPacketError{
						NodeID:  node.NodeID,
						Message: fmt.Sprintf("required form field %q is not mapped", field),
						Field:   field,
					})
				}
			}
		}
	}

	// Write JSON artifact file.
	artifactPath, err := writeFormResultArtifact(node.NodeID, filledFields)
	if err != nil {
		// Non-fatal: log but don't fail the node.
		slog.Warn("form_fill: failed to write artifact", "node", node.Name, "error", err)
	} else {
		output.Fields["form_result_artifact"] = artifactPath
		output.Files = append(output.Files, engine.FileReference{
			Path:     artifactPath,
			Name:     filepath.Base(artifactPath),
			MimeType: "application/json",
		})
	}

	// Merge filled fields into output
	for k, v := range filledFields {
		output.Fields[k] = v
	}
	output.Fields["form_fill_complete"] = true
	output.Fields["mapped_fields_count"] = len(filledFields)

	slog.Info("form_fill node completed",
		"node", node.Name,
		"mappedFields", len(filledFields),
	)

	return output, nil
}

// writeFormResultArtifact writes the filled fields as a JSON file and returns its path.
func writeFormResultArtifact(nodeID string, fields map[string]any) (string, error) {
	dir := "uploads"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("form_results_%s.json", nodeID)
	path := filepath.Join(dir, filename)

	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	enc := json.NewEncoder(file)
	enc.SetIndent("", "  ")
	if err := enc.Encode(fields); err != nil {
		return "", err
	}

	return path, nil
}

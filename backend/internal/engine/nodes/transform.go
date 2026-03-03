package nodes

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// TransformExecutor handles the transform node — rename, compute, format, filter, default, coerce.
type TransformExecutor struct{}

// NewTransformExecutor creates a new TransformExecutor.
func NewTransformExecutor() *TransformExecutor {
	return &TransformExecutor{}
}

// Validate checks the transform node config.
func (e *TransformExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute applies transformation operations to the data packet fields.
func (e *TransformExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Get operations from config
	opsRaw, ok := node.Config["operations"]
	if !ok {
		slog.Info("transform node has no operations, passing through", "node", node.Name)
		return output, nil
	}

	ops, ok := opsRaw.([]any)
	if !ok {
		return output, fmt.Errorf("transform operations must be an array")
	}

	for _, opRaw := range ops {
		op, ok := opRaw.(map[string]any)
		if !ok {
			continue
		}

		opType, _ := op["type"].(string)
		switch opType {
		case "rename":
			from, _ := op["from"].(string)
			to, _ := op["to"].(string)
			if from != "" && to != "" {
				if val, exists := output.Fields[from]; exists {
					output.Fields[to] = val
					delete(output.Fields, from)
				}
			}

		case "default":
			field, _ := op["field"].(string)
			value := op["value"]
			if field != "" && value != nil {
				if _, exists := output.Fields[field]; !exists {
					output.Fields[field] = value
				}
			}

		case "coerce":
			field, _ := op["field"].(string)
			targetType, _ := op["targetType"].(string)
			if field != "" && targetType != "" {
				if val, exists := output.Fields[field]; exists {
					output.Fields[field] = coerceValue(val, targetType)
				}
			}

		case "concat":
			fields, _ := op["fields"].([]any)
			target, _ := op["target"].(string)
			separator, _ := op["separator"].(string)
			if separator == "" {
				separator = " "
			}
			if target != "" && len(fields) > 0 {
				var parts []string
				for _, f := range fields {
					if fieldName, ok := f.(string); ok {
						if val, exists := output.Fields[fieldName]; exists {
							parts = append(parts, fmt.Sprintf("%v", val))
						}
					}
				}
				output.Fields[target] = strings.Join(parts, separator)
			}

		case "filter":
			// Remove fields not matching condition (simplified: just drops a field)
			field, _ := op["field"].(string)
			if field != "" {
				delete(output.Fields, field)
			}

		case "compute":
			field, _ := op["field"].(string)
			expression, _ := op["expression"].(string)
			if field != "" && expression != "" {
				// Simple expression evaluation for common patterns
				result := evaluateSimpleExpression(expression, output.Fields)
				if result != nil {
					output.Fields[field] = result
				}
			}

		case "format":
			// Format operations are stored but applied at output time
			field, _ := op["field"].(string)
			formatStr, _ := op["format"].(string)
			if field != "" && formatStr != "" {
				// Store format metadata
				output.Fields[field+"_format"] = formatStr
			}

		default:
			slog.Warn("unknown transform operation", "type", opType, "node", node.Name)
		}
	}

	slog.Info("transform node completed",
		"node", node.Name,
		"operationCount", len(ops),
		"fieldCount", len(output.Fields),
	)

	return output, nil
}

// coerceValue converts a value to the specified target type.
func coerceValue(val any, targetType string) any {
	switch targetType {
	case "number":
		switch v := val.(type) {
		case string:
			if f, err := strconv.ParseFloat(v, 64); err == nil {
				return f
			}
			return 0
		case float64:
			return v
		case int:
			return float64(v)
		default:
			return 0
		}
	case "string":
		return fmt.Sprintf("%v", val)
	case "boolean":
		switch v := val.(type) {
		case string:
			return strings.ToLower(v) == "true" || v == "1"
		case float64:
			return v != 0
		case bool:
			return v
		default:
			return false
		}
	default:
		return val
	}
}

// evaluateSimpleExpression handles basic arithmetic expressions.
// For production use, this would use govaluate.
func evaluateSimpleExpression(expression string, fields map[string]any) any {
	// Handle simple "field * number" patterns
	parts := strings.Fields(expression)
	if len(parts) == 3 {
		leftVal := resolveValue(parts[0], fields)
		rightVal := resolveValue(parts[2], fields)

		left, leftOk := toFloat(leftVal)
		right, rightOk := toFloat(rightVal)

		if leftOk && rightOk {
			switch parts[1] {
			case "*":
				return left * right
			case "+":
				return left + right
			case "-":
				return left - right
			case "/":
				if right != 0 {
					return left / right
				}
				return 0
			}
		}
	}
	return nil
}

// resolveValue looks up a field name in the fields map or parses it as a number.
func resolveValue(token string, fields map[string]any) any {
	if val, ok := fields[token]; ok {
		return val
	}
	if f, err := strconv.ParseFloat(token, 64); err == nil {
		return f
	}
	return token
}

// toFloat converts a value to float64.
func toFloat(val any) (float64, bool) {
	switch v := val.(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case string:
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

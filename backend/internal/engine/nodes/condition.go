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

// ConditionExecutor handles the condition node — evaluates rules and selects branches.
type ConditionExecutor struct{}

// NewConditionExecutor creates a new ConditionExecutor.
func NewConditionExecutor() *ConditionExecutor {
	return &ConditionExecutor{}
}

// Validate checks the condition node config.
func (e *ConditionExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute evaluates condition rules against the input fields and marks which
// branch should be taken. The executor doesn't change the DAG traversal
// itself — it sets output metadata that the engine can use. For the current
// linear execution, it evaluates the first matching rule and adds the result
// to the output fields.
func (e *ConditionExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	rulesRaw, ok := node.Config["rules"]
	if !ok {
		slog.Info("condition node has no rules, passing through", "node", node.Name)
		output.Fields["condition_result"] = "default"
		return output, nil
	}

	rules, ok := rulesRaw.([]any)
	if !ok {
		return output, fmt.Errorf("condition rules must be an array")
	}

	defaultTarget, _ := node.Config["defaultTargetNodeId"].(string)

	// Evaluate rules in order, first match wins
	for _, ruleRaw := range rules {
		rule, ok := ruleRaw.(map[string]any)
		if !ok {
			continue
		}

		ruleID, _ := rule["id"].(string)
		condition, _ := rule["condition"].(string)
		targetNodeID, _ := rule["targetNodeId"].(string)

		if condition == "" || targetNodeID == "" {
			continue
		}

		if evaluateCondition(condition, input.Fields) {
			output.Fields["condition_matched_rule"] = ruleID
			output.Fields["condition_target_node"] = targetNodeID
			output.Fields["condition_result"] = "matched"

			slog.Info("condition node matched rule",
				"node", node.Name,
				"rule", ruleID,
				"target", targetNodeID,
			)
			return output, nil
		}
	}

	// No rule matched, use default
	output.Fields["condition_result"] = "default"
	output.Fields["condition_target_node"] = defaultTarget

	slog.Info("condition node using default target",
		"node", node.Name,
		"target", defaultTarget,
	)

	return output, nil
}

// evaluateCondition evaluates a simple condition string against fields.
// Supports: "field >= value", "field < value", "field == value", etc.
func evaluateCondition(condition string, fields map[string]any) bool {
	// Parse condition: "confidence >= 0.9"
	operators := []string{">=", "<=", "!=", "==", ">", "<"}

	for _, op := range operators {
		parts := strings.SplitN(condition, op, 2)
		if len(parts) != 2 {
			continue
		}

		fieldName := strings.TrimSpace(parts[0])
		valueStr := strings.TrimSpace(parts[1])

		fieldVal, exists := fields[fieldName]
		if !exists {
			return false
		}

		fieldFloat, fieldOk := toFloat(fieldVal)
		compareFloat, err := strconv.ParseFloat(valueStr, 64)

		if fieldOk && err == nil {
			switch op {
			case ">=":
				return fieldFloat >= compareFloat
			case "<=":
				return fieldFloat <= compareFloat
			case ">":
				return fieldFloat > compareFloat
			case "<":
				return fieldFloat < compareFloat
			case "==":
				return fieldFloat == compareFloat
			case "!=":
				return fieldFloat != compareFloat
			}
		}

		// String comparison
		fieldStr := fmt.Sprintf("%v", fieldVal)
		switch op {
		case "==":
			return fieldStr == valueStr
		case "!=":
			return fieldStr != valueStr
		}

		break
	}

	return false
}

package nodes

import (
	"context"
	"log/slog"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// ReviewExecutor handles the review node — pauses pipeline for human approval.
type ReviewExecutor struct{}

// NewReviewExecutor creates a new ReviewExecutor.
func NewReviewExecutor() *ReviewExecutor {
	return &ReviewExecutor{}
}

// Validate checks the review node config.
func (e *ReviewExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute the review node. In the current implementation, review nodes
// pass through immediately. The full human-in-the-loop flow with
// pausing/resuming will be wired in a later phase via the WebSocket
// handler and review approval API.
func (e *ReviewExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Check auto-approve threshold
	autoApproveThreshold := 0.95
	if v, ok := node.Config["autoApproveThreshold"]; ok {
		if f, ok := v.(float64); ok {
			autoApproveThreshold = f
		}
	}

	// Check if confidence is high enough for auto-approval
	if confidence, ok := input.Fields["confidence"]; ok {
		if conf, ok := confidence.(float64); ok && conf >= autoApproveThreshold {
			output.Fields["review_status"] = "auto_approved"
			output.Fields["review_confidence"] = conf
			slog.Info("review node auto-approved",
				"node", node.Name,
				"confidence", conf,
				"threshold", autoApproveThreshold,
			)
			return output, nil
		}
	}

	// For now, mark as approved (manual flow will be implemented later)
	output.Fields["review_status"] = "approved"
	output.Fields["review_note"] = "auto-approved in pipeline mode"

	slog.Info("review node completed",
		"node", node.Name,
		"autoApproveThreshold", autoApproveThreshold,
	)

	return output, nil
}

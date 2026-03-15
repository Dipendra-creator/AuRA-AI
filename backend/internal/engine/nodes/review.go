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

// Execute implements the review node. If confidence exceeds the auto-approve
// threshold, the node passes through immediately. Otherwise it returns
// engine.ErrWaitingReview so the executor pauses the run for human approval.
func (e *ReviewExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Read auto-approve threshold from config (default 0.95).
	autoApproveThreshold := 0.95
	if v, ok := node.Config["autoApproveThreshold"]; ok {
		if f, ok := v.(float64); ok {
			autoApproveThreshold = f
		}
	}

	// Auto-approve when confidence is high enough.
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

	// Requires human approval — signal the executor to pause.
	slog.Info("review node waiting for human approval", "node", node.Name)
	return output, engine.ErrWaitingReview
}

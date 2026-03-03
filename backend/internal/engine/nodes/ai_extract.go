package nodes

import (
	"context"
	"log/slog"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

// AIExtractExecutor handles the ai_extract node — runs AI model extraction.
type AIExtractExecutor struct{}

// NewAIExtractExecutor creates a new AIExtractExecutor.
func NewAIExtractExecutor() *AIExtractExecutor {
	return &AIExtractExecutor{}
}

// Validate checks the AI extract node config.
func (e *AIExtractExecutor) Validate(node domain.PipelineNode) error {
	return nil
}

// Execute runs AI field extraction on the raw text from the input data packet.
// In production this would call the KiloClient; for now it passes through
// any existing fields and marks the extraction as complete.
func (e *AIExtractExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Read config for confidence threshold
	confidenceThreshold := 0.7
	if v, ok := node.Config["confidenceThreshold"]; ok {
		if f, ok := v.(float64); ok {
			confidenceThreshold = f
		}
	}

	// Pass through existing fields from input
	// In a full implementation, this would call the AI service
	output.Fields["extraction_model"] = "pipeline_ai_extract"
	output.Fields["confidence_threshold"] = confidenceThreshold
	output.Fields["extraction_complete"] = true

	slog.Info("ai_extract node completed",
		"node", node.Name,
		"fieldCount", len(output.Fields),
		"confidenceThreshold", confidenceThreshold,
	)

	return output, nil
}

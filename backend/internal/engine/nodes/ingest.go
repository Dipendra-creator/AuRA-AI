package nodes

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
	"github.com/aura-ai/backend/internal/ocr"
)

// IngestExecutor handles the ingest node — reads files and runs OCR.
type IngestExecutor struct{}

// NewIngestExecutor creates a new IngestExecutor.
func NewIngestExecutor() *IngestExecutor {
	return &IngestExecutor{}
}

// Validate checks the ingest node config.
func (e *IngestExecutor) Validate(node domain.PipelineNode) error {
	// Ingest nodes are valid with default config
	return nil
}

// Execute reads the uploaded file(s) from the input data packet and runs OCR.
func (e *IngestExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Check if OCR is enabled (defaults to true)
	ocrEnabled := true
	if v, ok := node.Config["ocrEnabled"]; ok {
		if b, ok := v.(bool); ok {
			ocrEnabled = b
		}
	}

	// Process files from the input packet
	if len(input.Files) > 0 {
		var allText []string
		for _, file := range input.Files {
			if !ocrEnabled {
				slog.Info("OCR disabled, skipping file", "file", file.Name)
				continue
			}

			text, err := ocr.ExtractText(file.Path)
			if err != nil {
				slog.Warn("OCR extraction failed for file", "file", file.Name, "error", err)
				output.Errors = append(output.Errors, engine.DataPacketError{
					NodeID:  node.NodeID,
					Message: fmt.Sprintf("OCR failed for %s: %s", file.Name, err.Error()),
				})
				continue
			}
			allText = append(allText, text)
		}
		if len(allText) > 0 {
			output.RawText = strings.Join(allText, "\n\n---PAGE BREAK---\n\n")
		}
	}

	// If raw text was already provided (e.g., from a previous step), keep it
	if output.RawText == "" && input.RawText != "" {
		output.RawText = input.RawText
	}

	output.Fields["rawTextLength"] = len(output.RawText)
	output.Fields["filesProcessed"] = len(input.Files)

	slog.Info("ingest node completed",
		"node", node.Name,
		"rawTextLength", len(output.RawText),
		"filesProcessed", len(input.Files),
	)

	return output, nil
}

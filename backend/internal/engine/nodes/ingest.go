package nodes

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
	"github.com/aura-ai/backend/internal/ocr"
	"github.com/aura-ai/backend/internal/repository"
)

// IngestExecutor handles the ingest node — reads files and runs OCR.
// When no files are provided in the input, it fetches pending documents
// from the database and processes them.
type IngestExecutor struct {
	docRepo *repository.DocumentRepo
}

// NewIngestExecutor creates a new IngestExecutor.
func NewIngestExecutor(docRepo *repository.DocumentRepo) *IngestExecutor {
	return &IngestExecutor{docRepo: docRepo}
}

// Validate checks the ingest node config.
func (e *IngestExecutor) Validate(node domain.PipelineNode) error {
	// Ingest nodes are valid with default config
	return nil
}

// Execute reads the uploaded file(s) from the input data packet and runs OCR.
// If no files are provided in the input, it fetches pending documents from the DB.
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

	// If no files in the input, fetch pending documents from the database
	files := input.Files
	if len(files) == 0 && e.docRepo != nil {
		slog.Info("no files in input, fetching pending documents from database")
		docs, _, err := e.docRepo.List(ctx, domain.DocumentFilter{
			Status: string(domain.StatusPending),
			Page:   1,
			Limit:  100,
		})
		if err != nil {
			slog.Warn("failed to fetch pending documents", "error", err)
		} else {
			for _, doc := range docs {
				if doc.FilePath != "" {
					files = append(files, engine.FileReference{
						Path:      doc.FilePath,
						Name:      doc.Name,
						MimeType:  doc.MimeType,
						SizeBytes: doc.FileSize,
					})
					output.Fields["documentId_"+doc.ID.Hex()] = doc.ID.Hex()
				}
			}
			slog.Info("loaded pending documents", "count", len(files))
		}
	}

	output.Files = files

	// Process files with OCR
	if len(files) > 0 {
		var allText []string
		var processedDocs []string

		for _, file := range files {
			if !ocrEnabled {
				slog.Info("OCR disabled, skipping file", "file", file.Name)
				continue
			}

			slog.Info("processing file with OCR", "file", file.Name, "path", file.Path)
			text, err := ocr.ExtractText(file.Path)
			if err != nil {
				slog.Warn("OCR extraction failed for file", "file", file.Name, "error", err)
				output.Errors = append(output.Errors, engine.DataPacketError{
					NodeID:  node.NodeID,
					Message: fmt.Sprintf("OCR failed for %s: %s", file.Name, err.Error()),
				})
				continue
			}

			slog.Info("OCR extraction completed", "file", file.Name, "textLength", len(text))
			allText = append(allText, text)
			processedDocs = append(processedDocs, file.Name)

			// Update document status to processing if we have the repo
			if e.docRepo != nil {
				processingStatus := domain.StatusProcessing
				step := "ocr_complete"
				for docKey, docVal := range output.Fields {
					if strings.HasPrefix(docKey, "documentId_") {
						if idStr, ok := docVal.(string); ok && file.Name != "" {
							_ = idStr // track for later use
						}
					}
				}
				// Find matching doc by filename and update
				matchDocs, _, _ := e.docRepo.List(ctx, domain.DocumentFilter{
					Search: file.Name,
					Page:   1,
					Limit:  1,
				})
				if len(matchDocs) > 0 {
					rawText := text
					_, _ = e.docRepo.Update(ctx, matchDocs[0].ID, domain.UpdateDocumentInput{
						Status:         &processingStatus,
						ProcessingStep: &step,
						RawText:        &rawText,
					})
				}
			}
		}
		if len(allText) > 0 {
			output.RawText = strings.Join(allText, "\n\n---PAGE BREAK---\n\n")
		}

		output.Fields["processedFiles"] = processedDocs
	}

	// If raw text was already provided (e.g., from a previous step), keep it
	if output.RawText == "" && input.RawText != "" {
		output.RawText = input.RawText
	}

	output.Fields["rawTextLength"] = len(output.RawText)
	output.Fields["filesProcessed"] = len(files)

	slog.Info("ingest node completed",
		"node", node.Name,
		"rawTextLength", len(output.RawText),
		"filesProcessed", len(files),
	)

	return output, nil
}

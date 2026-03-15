package nodes

import (
	"context"
	"fmt"
	"log/slog"
	"reflect"
	"strings"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// DocumentProvider defines the interface for fetching documents
type DocumentProvider interface {
	GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error)
}

// DocSelectExecutor handles the doc_select node — fetches already-processed
// documents from the database by their IDs and feeds their data into the pipeline.
type DocSelectExecutor struct {
	docRepo DocumentProvider
}

// NewDocSelectExecutor creates a new DocSelectExecutor.
func NewDocSelectExecutor(docRepo DocumentProvider) *DocSelectExecutor {
	return &DocSelectExecutor{docRepo: docRepo}
}

// Validate checks the doc_select node config.
// Validation is lenient — missing documentIds is allowed; the node will pass
// through at execution time with a warning.
func (e *DocSelectExecutor) Validate(node domain.PipelineNode) error {
	ids, ok := node.Config["documentIds"]
	if !ok || ids == nil {
		// No documentIds configured yet — acceptable, will pass through at execute time
		return nil
	}

	// Accept any array-like value
	switch ids.(type) {
	case []any, []string:
		return nil
	case string:
		// Single ID passed as a string — acceptable
		return nil
	}
	// Be lenient for any unknown types — let Execute handle the actual parsing
	return nil
}

// Execute fetches the selected documents from the database and populates the
// data packet with their file paths, raw text, and extracted fields.
func (e *DocSelectExecutor) Execute(ctx context.Context, node domain.PipelineNode, input engine.DataPacket) (engine.DataPacket, error) {
	output := input.Clone()
	output.Metadata.SourceNode = node.NodeID

	// Parse document IDs from config
	docIDs := extractStringSlice(node.Config["documentIds"])

	// Handle single string ID
	if len(docIDs) == 0 {
		if idStr, ok := node.Config["documentIds"].(string); ok && idStr != "" {
			docIDs = []string{idStr}
		}
	}

	if len(docIDs) == 0 {
		slog.Warn("doc_select: no document IDs configured, passing through", "node", node.Name)
		output.Fields["documentsSelected"] = 0
		output.Fields["selectedDocuments"] = []string{}
		return output, nil
	}

	includeRawText := getBoolConfig(node.Config, "includeRawText", true)
	includeExtractedFields := getBoolConfig(node.Config, "includeExtractedFields", true)

	slog.Info("doc_select: fetching documents",
		"node", node.Name,
		"documentIds", docIDs,
		"includeRawText", includeRawText,
		"includeExtractedFields", includeExtractedFields,
	)

	var allText []string
	var processedDocs []string

	for _, idStr := range docIDs {
		doc, docErr := e.fetchDocument(ctx, idStr, node.NodeID, &output)
		if docErr != nil || doc == nil {
			continue
		}

		e.populateDocData(doc, idStr, includeRawText, includeExtractedFields, &output, &allText)
		processedDocs = append(processedDocs, doc.Name)

		slog.Info("doc_select: loaded document",
			"id", idStr,
			"name", doc.Name,
			"status", doc.Status,
			"rawTextLen", len(doc.RawText),
			"fieldsCount", len(doc.ExtractedFields),
		)
	}

	// Combine raw text from all selected documents
	if len(allText) > 0 {
		output.RawText = strings.Join(allText, "\n\n---PAGE BREAK---\n\n")
	}

	output.Fields["selectedDocuments"] = processedDocs
	output.Fields["documentsSelected"] = len(processedDocs)
	output.Fields["rawTextLength"] = len(output.RawText)

	slog.Info("doc_select node completed",
		"node", node.Name,
		"documentsSelected", len(processedDocs),
		"rawTextLength", len(output.RawText),
	)

	return output, nil
}

// fetchDocument fetches a single document by hex ID, appending errors to output if retrieval fails.
func (e *DocSelectExecutor) fetchDocument(ctx context.Context, idStr, nodeID string, output *engine.DataPacket) (*domain.Document, error) {
	objID, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		slog.Warn("doc_select: invalid document ID", "id", idStr, "error", err)
		output.Errors = append(output.Errors, engine.DataPacketError{
			NodeID:  nodeID,
			Message: fmt.Sprintf("Invalid document ID: %s", idStr),
		})
		return nil, err
	}

	doc, err := e.docRepo.GetByID(ctx, objID)
	if err != nil {
		slog.Warn("doc_select: failed to fetch document", "id", idStr, "error", err)
		output.Errors = append(output.Errors, engine.DataPacketError{
			NodeID:  nodeID,
			Message: fmt.Sprintf("Failed to fetch document %s: %s", idStr, err.Error()),
		})
		return nil, err
	}
	if doc == nil {
		slog.Warn("doc_select: document not found", "id", idStr)
		output.Errors = append(output.Errors, engine.DataPacketError{
			NodeID:  nodeID,
			Message: fmt.Sprintf("Document not found: %s", idStr),
		})
		return nil, fmt.Errorf("document not found: %s", idStr)
	}

	return doc, nil
}

// populateDocData adds a document's data (file refs, raw text, extracted fields) to the output.
func (e *DocSelectExecutor) populateDocData(doc *domain.Document, idStr string, includeRawText, includeExtractedFields bool, output *engine.DataPacket, allText *[]string) {
	if doc.FilePath != "" {
		output.Files = append(output.Files, engine.FileReference{
			Path:      doc.FilePath,
			Name:      doc.Name,
			MimeType:  doc.MimeType,
			SizeBytes: doc.FileSize,
		})
	}

	if includeRawText && doc.RawText != "" {
		*allText = append(*allText, doc.RawText)
	}

	if includeExtractedFields && len(doc.ExtractedFields) > 0 {
		for _, field := range doc.ExtractedFields {
			output.Fields[field.FieldName] = field.Value
			output.Fields[field.FieldName+"_confidence"] = field.Confidence
		}
	}

	output.Fields["documentId_"+idStr] = idStr
}

// extractStringSlice converts an interface{} to []string.
// Handles []string, []any, and bson.A (type A []interface{} — a named type returned
// by the MongoDB driver when decoding arrays from map[string]any, which does NOT
// satisfy a case []any: type switch).
func extractStringSlice(v any) []string {
	if v == nil {
		return nil
	}
	// Fast paths for common types
	if arr, ok := v.([]string); ok {
		return arr
	}
	// Use reflection to handle bson.A ([]interface{} named type) and []any uniformly
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice {
		return nil
	}
	result := make([]string, 0, rv.Len())
	for i := range rv.Len() {
		if s, ok := rv.Index(i).Interface().(string); ok {
			result = append(result, s)
		}
	}
	return result
}

// getBoolConfig reads a boolean config value with a default fallback.
func getBoolConfig(config map[string]any, key string, defaultVal bool) bool {
	v, ok := config[key]
	if !ok {
		return defaultVal
	}
	if b, ok := v.(bool); ok {
		return b
	}
	return defaultVal
}

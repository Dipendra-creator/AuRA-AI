// Package handler provides HTTP request handlers for all API endpoints.
package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
	"github.com/xuri/excelize/v2"
)

// ExportHandler handles document export to CSV/Excel.
type ExportHandler struct {
	svc *service.DocumentService
}

// NewExportHandler creates a new ExportHandler.
func NewExportHandler(svc *service.DocumentService) *ExportHandler {
	return &ExportHandler{svc: svc}
}

// exportRequest is the JSON body for the export endpoint.
type exportRequest struct {
	Format string `json:"format"` // "csv" or "xlsx"
}

// Export handles POST /api/v1/documents/{id}/export
func (h *ExportHandler) Export(w http.ResponseWriter, r *http.Request) {
	// Parse document ID from path
	path := r.URL.Path
	parts := strings.Split(strings.TrimSuffix(path, "/export"), "/")
	idStr := parts[len(parts)-1]

	oid, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid document id"))
		return
	}

	// Parse request body
	var req exportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	format := strings.ToLower(req.Format)
	if format != "csv" && format != "xlsx" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("format must be 'csv' or 'xlsx'"))
		return
	}

	// Fetch the document
	doc, err := h.svc.GetByID(r.Context(), oid)
	if err != nil {
		if appErr, ok := err.(*domain.AppError); ok {
			domain.WriteJSON(w, appErr.Code, domain.ErrorResponse(appErr.Message))
			return
		}
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch document"))
		return
	}

	if len(doc.ExtractedFields) == 0 {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("no extracted fields to export — run analysis first"))
		return
	}

	switch format {
	case "csv":
		h.exportCSV(w, doc)
	case "xlsx":
		h.exportExcel(w, doc)
	}
}

// exportCSV writes extracted fields as a CSV download.
func (h *ExportHandler) exportCSV(w http.ResponseWriter, doc *domain.Document) {
	filename := sanitizeFilename(doc.Name) + "_extracted.csv"

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Header row
	if err := writer.Write([]string{"Field Name", "Value", "Confidence", "Verified"}); err != nil {
		return
	}

	// Data rows
	for _, field := range doc.ExtractedFields {
		verified := "No"
		if field.Verified {
			verified = "Yes"
		}
		if err := writer.Write([]string{
			field.FieldName,
			field.Value,
			fmt.Sprintf("%.1f%%", field.Confidence*100),
			verified,
		}); err != nil {
			return
		}
	}
}

// exportExcel writes extracted fields as an Excel (.xlsx) download.
func (h *ExportHandler) exportExcel(w http.ResponseWriter, doc *domain.Document) {
	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Extracted Data"
	index, _ := f.NewSheet(sheetName)
	f.SetActiveSheet(index)
	// Remove default "Sheet1" if it exists
	f.DeleteSheet("Sheet1")

	// Header style
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 12, Color: "#FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#4A90D9"}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "bottom", Color: "#2C5F8A", Style: 2},
		},
	})

	// Set column widths
	f.SetColWidth(sheetName, "A", "A", 25)
	f.SetColWidth(sheetName, "B", "B", 40)
	f.SetColWidth(sheetName, "C", "C", 15)
	f.SetColWidth(sheetName, "D", "D", 12)

	// Write header row
	headers := []string{"Field Name", "Value", "Confidence", "Verified"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	// Write data rows
	for i, field := range doc.ExtractedFields {
		row := i + 2
		cellA, _ := excelize.CoordinatesToCellName(1, row)
		cellB, _ := excelize.CoordinatesToCellName(2, row)
		cellC, _ := excelize.CoordinatesToCellName(3, row)
		cellD, _ := excelize.CoordinatesToCellName(4, row)

		f.SetCellValue(sheetName, cellA, field.FieldName)
		f.SetCellValue(sheetName, cellB, field.Value)
		f.SetCellValue(sheetName, cellC, fmt.Sprintf("%.1f%%", field.Confidence*100))

		verified := "No"
		if field.Verified {
			verified = "Yes"
		}
		f.SetCellValue(sheetName, cellD, verified)
	}

	// Document metadata at the top as a merged header (optional extra sheet)
	metaSheet := "Document Info"
	f.NewSheet(metaSheet)
	f.SetColWidth(metaSheet, "A", "A", 20)
	f.SetColWidth(metaSheet, "B", "B", 50)
	f.SetCellValue(metaSheet, "A1", "Document Name")
	f.SetCellValue(metaSheet, "B1", doc.Name)
	f.SetCellValue(metaSheet, "A2", "Type")
	f.SetCellValue(metaSheet, "B2", string(doc.Type))
	f.SetCellValue(metaSheet, "A3", "Status")
	f.SetCellValue(metaSheet, "B3", string(doc.Status))
	f.SetCellValue(metaSheet, "A4", "Overall Confidence")
	f.SetCellValue(metaSheet, "B4", fmt.Sprintf("%.1f%%", doc.Confidence))
	f.SetCellValue(metaSheet, "A5", "Fields Extracted")
	f.SetCellValue(metaSheet, "B5", len(doc.ExtractedFields))

	// Write the file to the response
	filename := sanitizeFilename(doc.Name) + "_extracted.xlsx"
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	if err := f.Write(w); err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to generate Excel file"))
	}
}

// sanitizeFilename removes problematic characters from filenames.
func sanitizeFilename(name string) string {
	// Remove extension and special characters
	name = strings.TrimSuffix(name, ".pdf")
	name = strings.TrimSuffix(name, ".PDF")
	replacer := strings.NewReplacer("/", "_", "\\", "_", " ", "_", "\"", "", "'", "")
	return replacer.Replace(name)
}

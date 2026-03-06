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

// buildFieldIndex creates a map from field name (lowercase) to ExtractedField
// for fast lookup when mapping schema columns to values.
func buildFieldIndex(fields []domain.ExtractedField) map[string]domain.ExtractedField {
	idx := make(map[string]domain.ExtractedField, len(fields))
	for _, f := range fields {
		key := strings.ToLower(strings.TrimSpace(f.FieldName))
		idx[key] = f
	}
	return idx
}

// exportCSV writes extracted fields as a CSV download.
// When an applied schema exists, column headers use schema column names and
// data is arranged in a single row matching those columns (table format).
// Without a schema, falls back to traditional Field Name | Value rows.
func (h *ExportHandler) exportCSV(w http.ResponseWriter, doc *domain.Document) {
	filename := sanitizeFilename(doc.Name) + "_extracted.csv"

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	writer := csv.NewWriter(w)
	defer writer.Flush()

	if len(doc.AppliedSchema) > 0 {
		// Schema-aware export: columns from schema, one data row
		fieldIndex := buildFieldIndex(doc.ExtractedFields)

		// Header row: schema column names + Confidence
		headers := make([]string, 0, len(doc.AppliedSchema)+1)
		for _, sf := range doc.AppliedSchema {
			headers = append(headers, sf.ColumnName)
		}
		headers = append(headers, "Avg Confidence")
		if err := writer.Write(headers); err != nil {
			return
		}

		// Data row: values mapped by field name
		row := make([]string, 0, len(doc.AppliedSchema)+1)
		var totalConf float64
		var confCount int
		for _, sf := range doc.AppliedSchema {
			key := strings.ToLower(strings.TrimSpace(sf.Field))
			if ef, ok := fieldIndex[key]; ok {
				row = append(row, ef.Value)
				totalConf += ef.Confidence
				confCount++
			} else {
				row = append(row, "")
			}
		}
		avgConf := 0.0
		if confCount > 0 {
			avgConf = totalConf / float64(confCount)
		}
		row = append(row, fmt.Sprintf("%.1f%%", avgConf*100))
		if err := writer.Write(row); err != nil {
			return
		}
	} else {
		// Legacy export: one row per field
		if err := writer.Write([]string{"Field Name", "Value", "Confidence", "Verified"}); err != nil {
			return
		}
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
}

// exportExcel writes extracted fields as an Excel (.xlsx) download.
// When an applied schema exists, uses schema column names as headers
// and arranges data in a proper table format.
func (h *ExportHandler) exportExcel(w http.ResponseWriter, doc *domain.Document) {
	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Extracted Data"
	index, _ := f.NewSheet(sheetName)
	f.SetActiveSheet(index)
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

	// Confidence color styles
	confHighStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Color: "#22C55E"},
	})
	confMedStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Color: "#F59E0B"},
	})
	confLowStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Color: "#EF4444"},
	})

	if len(doc.AppliedSchema) > 0 {
		// Schema-aware export
		fieldIndex := buildFieldIndex(doc.ExtractedFields)
		numCols := len(doc.AppliedSchema)

		// Set column widths
		for i := 0; i < numCols; i++ {
			col, _ := excelize.ColumnNumberToName(i + 1)
			f.SetColWidth(sheetName, col, col, 25)
		}
		// Confidence column
		confCol, _ := excelize.ColumnNumberToName(numCols + 1)
		f.SetColWidth(sheetName, confCol, confCol, 18)

		// Header row: schema column names
		for i, sf := range doc.AppliedSchema {
			cell, _ := excelize.CoordinatesToCellName(i+1, 1)
			f.SetCellValue(sheetName, cell, sf.ColumnName)
			f.SetCellStyle(sheetName, cell, cell, headerStyle)
		}
		// Confidence header
		confHeaderCell, _ := excelize.CoordinatesToCellName(numCols+1, 1)
		f.SetCellValue(sheetName, confHeaderCell, "Confidence")
		f.SetCellStyle(sheetName, confHeaderCell, confHeaderCell, headerStyle)

		// Data row
		var totalConf float64
		var confCount int
		for i, sf := range doc.AppliedSchema {
			key := strings.ToLower(strings.TrimSpace(sf.Field))
			cell, _ := excelize.CoordinatesToCellName(i+1, 2)
			if ef, ok := fieldIndex[key]; ok {
				f.SetCellValue(sheetName, cell, ef.Value)
				totalConf += ef.Confidence
				confCount++
			} else {
				f.SetCellValue(sheetName, cell, "")
			}
		}

		// Average confidence cell
		avgConf := 0.0
		if confCount > 0 {
			avgConf = totalConf / float64(confCount)
		}
		confCell, _ := excelize.CoordinatesToCellName(numCols+1, 2)
		f.SetCellValue(sheetName, confCell, fmt.Sprintf("%.1f%%", avgConf*100))
		confStyle := confHighStyle
		if avgConf < 0.7 {
			confStyle = confLowStyle
		} else if avgConf < 0.9 {
			confStyle = confMedStyle
		}
		f.SetCellStyle(sheetName, confCell, confCell, confStyle)

		// Per-field confidence sheet
		detailSheet := "Field Details"
		f.NewSheet(detailSheet)
		f.SetColWidth(detailSheet, "A", "A", 25)
		f.SetColWidth(detailSheet, "B", "B", 40)
		f.SetColWidth(detailSheet, "C", "C", 15)

		detailHeaders := []string{"Column", "Value", "Confidence"}
		for i, h := range detailHeaders {
			cell, _ := excelize.CoordinatesToCellName(i+1, 1)
			f.SetCellValue(detailSheet, cell, h)
			f.SetCellStyle(detailSheet, cell, cell, headerStyle)
		}
		row := 2
		for _, sf := range doc.AppliedSchema {
			key := strings.ToLower(strings.TrimSpace(sf.Field))
			cellA, _ := excelize.CoordinatesToCellName(1, row)
			cellB, _ := excelize.CoordinatesToCellName(2, row)
			cellC, _ := excelize.CoordinatesToCellName(3, row)
			f.SetCellValue(detailSheet, cellA, sf.ColumnName)
			if ef, ok := fieldIndex[key]; ok {
				f.SetCellValue(detailSheet, cellB, ef.Value)
				confStr := fmt.Sprintf("%.1f%%", ef.Confidence*100)
				f.SetCellValue(detailSheet, cellC, confStr)
				cs := confHighStyle
				if ef.Confidence < 0.7 {
					cs = confLowStyle
				} else if ef.Confidence < 0.9 {
					cs = confMedStyle
				}
				f.SetCellStyle(detailSheet, cellC, cellC, cs)
			}
			row++
		}
	} else {
		// Legacy export: one row per field
		f.SetColWidth(sheetName, "A", "A", 25)
		f.SetColWidth(sheetName, "B", "B", 40)
		f.SetColWidth(sheetName, "C", "C", 15)
		f.SetColWidth(sheetName, "D", "D", 12)

		headers := []string{"Field Name", "Value", "Confidence", "Verified"}
		for i, h := range headers {
			cell, _ := excelize.CoordinatesToCellName(i+1, 1)
			f.SetCellValue(sheetName, cell, h)
			f.SetCellStyle(sheetName, cell, cell, headerStyle)
		}

		for i, field := range doc.ExtractedFields {
			row := i + 2
			cellA, _ := excelize.CoordinatesToCellName(1, row)
			cellB, _ := excelize.CoordinatesToCellName(2, row)
			cellC, _ := excelize.CoordinatesToCellName(3, row)
			cellD, _ := excelize.CoordinatesToCellName(4, row)

			f.SetCellValue(sheetName, cellA, field.FieldName)
			f.SetCellValue(sheetName, cellB, field.Value)
			confStr := fmt.Sprintf("%.1f%%", field.Confidence*100)
			f.SetCellValue(sheetName, cellC, confStr)

			cs := confHighStyle
			if field.Confidence < 0.7 {
				cs = confLowStyle
			} else if field.Confidence < 0.9 {
				cs = confMedStyle
			}
			f.SetCellStyle(sheetName, cellC, cellC, cs)

			verified := "No"
			if field.Verified {
				verified = "Yes"
			}
			f.SetCellValue(sheetName, cellD, verified)
		}
	}

	// Document metadata sheet
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
	if len(doc.AppliedSchema) > 0 {
		f.SetCellValue(metaSheet, "A6", "Schema Columns")
		f.SetCellValue(metaSheet, "B6", len(doc.AppliedSchema))
	}

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
	name = strings.TrimSuffix(name, ".pdf")
	name = strings.TrimSuffix(name, ".PDF")
	replacer := strings.NewReplacer("/", "_", "\\", "_", " ", "_", "\"", "", "'", "")
	return replacer.Replace(name)
}

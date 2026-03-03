// Package ocr provides text extraction from document files.
package ocr

import (
	"bytes"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/ledongthuc/pdf"
)

// ExtractText extracts text content from a file.
// Supports PDFs (text-layer and scanned), images (via Tesseract), and plain text files.
func ExtractText(filePath string) (string, error) {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return "", fmt.Errorf("file not found: %s", filePath)
	}

	ext := strings.ToLower(filepath.Ext(filePath))

	// Image files → Tesseract OCR
	if IsImageFile(filePath) {
		return extractWithTesseract(filePath)
	}

	switch ext {
	case ".pdf":
		return extractPDFWithFallback(filePath)
	case ".txt", ".csv", ".md":
		return readTextFile(filePath)
	default:
		// Try reading as plain text for unknown formats
		text, err := readTextFile(filePath)
		if err != nil {
			return "", fmt.Errorf("unsupported file type %s and cannot read as text: %w", ext, err)
		}
		return text, nil
	}
}

// extractPDF uses a pure-Go PDF reader to extract text.
func extractPDF(filePath string) (string, error) {
	f, r, err := pdf.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open PDF: %w", err)
	}
	defer f.Close()

	var buf bytes.Buffer
	totalPages := r.NumPage()

	for i := 1; i <= totalPages; i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			// Skip pages that fail to parse
			continue
		}
		buf.WriteString(text)
		buf.WriteString("\n")
	}

	result := strings.TrimSpace(buf.String())
	if result == "" {
		return "", fmt.Errorf("PDF contains no extractable text (may be image-only)")
	}

	return result, nil
}

// PageText holds extracted text for a single PDF page.
type PageText struct {
	PageNumber int
	Text       string
}

// ExtractPages extracts text from each page of a document individually.
// Returns a slice of PageText (one per page) and the total page count.
// Supports PDFs (text-layer and scanned via Tesseract), images, and text files.
func ExtractPages(filePath string) ([]PageText, int, error) {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, 0, fmt.Errorf("file not found: %s", filePath)
	}

	ext := strings.ToLower(filepath.Ext(filePath))

	// Image files → Tesseract OCR, return as a single page
	if IsImageFile(filePath) {
		text, err := extractWithTesseract(filePath)
		if err != nil {
			return nil, 0, err
		}
		return []PageText{{PageNumber: 1, Text: text}}, 1, nil
	}

	if ext != ".pdf" {
		// For non-PDF, non-image files, return a single "page" with all text
		text, err := readTextFile(filePath)
		if err != nil {
			return nil, 0, err
		}
		return []PageText{{PageNumber: 1, Text: text}}, 1, nil
	}

	// PDF: try pure-Go extraction first
	pages, totalPages, err := extractPDFPages(filePath)
	if err == nil && len(pages) > 0 {
		return pages, totalPages, nil
	}

	// Pure-Go failed or returned no text — fall back to Tesseract for scanned PDFs
	slog.Info("pure-Go PDF extraction yielded no text, falling back to Tesseract", "file", filepath.Base(filePath))
	return extractPDFPagesWithTesseract(filePath)
}

// readTextFile reads a file as UTF-8 text.
func readTextFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}
	return strings.TrimSpace(string(data)), nil
}

// extractPDFPages tries pure-Go PDF text extraction page by page.
func extractPDFPages(filePath string) ([]PageText, int, error) {
	f, r, err := pdf.Open(filePath)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to open PDF: %w", err)
	}
	defer f.Close()

	totalPages := r.NumPage()
	pages := make([]PageText, 0, totalPages)

	for i := 1; i <= totalPages; i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			continue
		}
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			continue
		}
		pages = append(pages, PageText{
			PageNumber: i,
			Text:       trimmed,
		})
	}

	if len(pages) == 0 {
		return nil, totalPages, fmt.Errorf("PDF contains no extractable text (may be image-only)")
	}

	return pages, totalPages, nil
}

// extractPDFWithFallback tries pure-Go PDF extraction first, then Tesseract.
func extractPDFWithFallback(filePath string) (string, error) {
	text, err := extractPDF(filePath)
	if err == nil && strings.TrimSpace(text) != "" {
		return text, nil
	}

	// Fall back to Tesseract for scanned/image-only PDFs
	slog.Info("pure-Go PDF extraction failed, falling back to Tesseract", "file", filepath.Base(filePath))
	return extractWithTesseract(filePath)
}

// extractWithTesseract delegates OCR to the Tesseract engine.
func extractWithTesseract(filePath string) (string, error) {
	engine := GetTesseract()
	if engine == nil {
		return "", fmt.Errorf("tesseract OCR not available — install tesseract and set TESSERACT_PATH")
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == ".pdf" {
		return engine.extractFullPDFText(filePath)
	}
	return engine.ExtractTextFromImage(filePath)
}

// extractPDFPagesWithTesseract delegates page-level PDF OCR to Tesseract.
func extractPDFPagesWithTesseract(filePath string) ([]PageText, int, error) {
	engine := GetTesseract()
	if engine == nil {
		return nil, 0, fmt.Errorf("tesseract OCR not available — install tesseract and set TESSERACT_PATH")
	}
	return engine.ExtractPagesFromPDF(filePath)
}

// extractFullPDFText uses Tesseract to OCR an entire PDF and return the combined text.
func (t *TesseractEngine) extractFullPDFText(pdfPath string) (string, error) {
	pages, _, err := t.ExtractPagesFromPDF(pdfPath)
	if err != nil {
		return "", err
	}

	var buf strings.Builder
	for _, page := range pages {
		buf.WriteString(page.Text)
		buf.WriteString("\n")
	}
	return strings.TrimSpace(buf.String()), nil
}

// Package ocr provides text extraction from document files.
package ocr

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ledongthuc/pdf"
)

// ExtractText extracts text content from a file.
// For PDFs, uses a pure-Go PDF reader. For text files, reads directly.
func ExtractText(filePath string) (string, error) {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return "", fmt.Errorf("file not found: %s", filePath)
	}

	ext := strings.ToLower(filepath.Ext(filePath))

	switch ext {
	case ".pdf":
		return extractPDF(filePath)
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

// ExtractPages extracts text from each page of a PDF individually.
// Returns a slice of PageText (one per page) and the total page count.
func ExtractPages(filePath string) ([]PageText, int, error) {
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, 0, fmt.Errorf("file not found: %s", filePath)
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if ext != ".pdf" {
		// For non-PDF files, return a single "page" with all text
		text, err := readTextFile(filePath)
		if err != nil {
			return nil, 0, err
		}
		return []PageText{{PageNumber: 1, Text: text}}, 1, nil
	}

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
			// Skip pages that fail to parse but include an empty entry
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

// readTextFile reads a file as UTF-8 text.
func readTextFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}
	return strings.TrimSpace(string(data)), nil
}

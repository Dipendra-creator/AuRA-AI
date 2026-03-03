// Package ocr provides text extraction from document files.
// image.go contains image format detection and classification utilities.
package ocr

import (
	"path/filepath"
	"strings"
)

// supportedImageExts lists the file extensions that Tesseract can process.
var supportedImageExts = map[string]bool{
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".tiff": true,
	".tif":  true,
	".bmp":  true,
	".webp": true,
	".gif":  true,
}

// IsImageFile checks whether the file extension matches a supported image format.
func IsImageFile(filePath string) bool {
	ext := strings.ToLower(filepath.Ext(filePath))
	return supportedImageExts[ext]
}

// SupportedImageExtensions returns the list of image extensions Tesseract supports.
func SupportedImageExtensions() []string {
	exts := make([]string, 0, len(supportedImageExts))
	for ext := range supportedImageExts {
		exts = append(exts, ext)
	}
	return exts
}

// IsScannedPDF attempts pure-Go text extraction on a PDF.
// If the extracted text is empty or extremely short (< 20 chars),
// the PDF is likely a scanned image and needs OCR.
func IsScannedPDF(filePath string) bool {
	text, err := extractPDF(filePath)
	if err != nil {
		// If the pure-Go reader fails, assume it needs OCR
		return true
	}
	return len(strings.TrimSpace(text)) < 20
}

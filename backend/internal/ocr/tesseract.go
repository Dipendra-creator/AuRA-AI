// Package ocr provides text extraction from document files.
// tesseract.go wraps the Tesseract CLI binary for image-based OCR.
package ocr

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// defaultTimeout is the max duration for a single Tesseract invocation.
const defaultTimeout = 60 * time.Second

// TesseractEngine wraps the Tesseract CLI binary for OCR operations.
type TesseractEngine struct {
	binaryPath string
	language   string
	timeout    time.Duration
}

// tesseractInstance is the package-level engine, initialized via InitTesseract.
var tesseractInstance *TesseractEngine

// InitTesseract initialises the package-level Tesseract engine.
// If the binary is not found, the engine is nil and image OCR is unavailable.
func InitTesseract(binaryPath string) {
	if binaryPath == "" {
		binaryPath = "tesseract"
	}

	engine := &TesseractEngine{
		binaryPath: binaryPath,
		language:   "eng",
		timeout:    defaultTimeout,
	}

	if engine.Available() {
		ver, _ := engine.Version()
		slog.Info("tesseract OCR initialized", "path", binaryPath, "version", ver)
		tesseractInstance = engine
	} else {
		slog.Warn("tesseract binary not found — image OCR disabled", "path", binaryPath)
		tesseractInstance = nil
	}
}

// GetTesseract returns the package-level TesseractEngine (may be nil).
func GetTesseract() *TesseractEngine {
	return tesseractInstance
}

// Available checks whether the Tesseract binary is executable.
func (t *TesseractEngine) Available() bool {
	_, err := exec.LookPath(t.binaryPath)
	return err == nil
}

// Version returns the installed Tesseract version string.
func (t *TesseractEngine) Version() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, t.binaryPath, "--version").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("tesseract --version failed: %w", err)
	}

	// First line is typically "tesseract X.Y.Z"
	lines := strings.SplitN(string(out), "\n", 2)
	return strings.TrimSpace(lines[0]), nil
}

// ExtractTextFromImage runs Tesseract on a single image file and returns the recognised text.
func (t *TesseractEngine) ExtractTextFromImage(imagePath string) (string, error) {
	return t.ExtractTextFromImageWithLang(imagePath, t.language)
}

// ExtractTextFromImageWithLang runs Tesseract on an image with a specific language pack.
func (t *TesseractEngine) ExtractTextFromImageWithLang(imagePath, lang string) (string, error) {
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		return "", fmt.Errorf("image file not found: %s", imagePath)
	}

	ctx, cancel := context.WithTimeout(context.Background(), t.timeout)
	defer cancel()

	// tesseract <input> stdout -l <lang>
	cmd := exec.CommandContext(ctx, t.binaryPath, imagePath, "stdout", "-l", lang)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("tesseract failed on %s: %w (stderr: %s)", filepath.Base(imagePath), err, stderr.String())
	}

	text := strings.TrimSpace(stdout.String())
	if text == "" {
		return "", fmt.Errorf("tesseract returned no text for %s", filepath.Base(imagePath))
	}

	return text, nil
}

// ExtractPagesFromPDF converts a scanned/image-only PDF to page images using
// pdftoppm (poppler), then OCRs each page image with Tesseract.
// Temporary images are cleaned up after processing.
func (t *TesseractEngine) ExtractPagesFromPDF(pdfPath string) ([]PageText, int, error) {
	if _, err := os.Stat(pdfPath); os.IsNotExist(err) {
		return nil, 0, fmt.Errorf("PDF file not found: %s", pdfPath)
	}

	// Check that pdftoppm is available
	if _, err := exec.LookPath("pdftoppm"); err != nil {
		return nil, 0, fmt.Errorf("pdftoppm not found — install poppler: brew install poppler")
	}

	// Create temp directory for page images
	tmpDir, err := os.MkdirTemp("", "aura-ocr-*")
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer os.RemoveAll(tmpDir) // clean up all temp images

	// Convert PDF pages to PNG images using pdftoppm
	// pdftoppm -png -r 300 input.pdf outputPrefix
	// This creates files like: outputPrefix-1.png, outputPrefix-2.png, etc.
	outputPrefix := filepath.Join(tmpDir, "page")

	ctx, cancel := context.WithTimeout(context.Background(), t.timeout*2)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pdftoppm", "-png", "-r", "300", pdfPath, outputPrefix)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, 0, fmt.Errorf("pdftoppm failed on %s: %w (stderr: %s)", filepath.Base(pdfPath), err, stderr.String())
	}

	// Find all generated page images (sorted by name = page order)
	pattern := filepath.Join(tmpDir, "page-*.png")
	imageFiles, err := filepath.Glob(pattern)
	if err != nil || len(imageFiles) == 0 {
		return nil, 0, fmt.Errorf("pdftoppm produced no page images for %s", filepath.Base(pdfPath))
	}

	// Sort to ensure correct page order (glob doesn't guarantee order)
	sortedFiles := make([]string, len(imageFiles))
	copy(sortedFiles, imageFiles)
	// filepath.Glob returns sorted results on most systems, but we rely on the naming
	// convention: page-01.png, page-02.png, etc.

	totalPages := len(sortedFiles)
	pages := make([]PageText, 0, totalPages)

	slog.Info("converting scanned PDF pages via pdftoppm", "file", filepath.Base(pdfPath), "totalPages", totalPages)

	// OCR each page image with Tesseract
	for i, imgPath := range sortedFiles {
		pageNum := i + 1
		text, err := t.ExtractTextFromImage(imgPath)
		if err != nil {
			slog.Warn("tesseract failed on page image", "file", filepath.Base(pdfPath), "page", pageNum, "error", err)
			continue
		}

		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			continue
		}

		pages = append(pages, PageText{
			PageNumber: pageNum,
			Text:       trimmed,
		})
	}

	if len(pages) == 0 {
		return nil, totalPages, fmt.Errorf("tesseract returned no extractable text from any page of %s", filepath.Base(pdfPath))
	}

	slog.Info("tesseract PDF OCR complete", "file", filepath.Base(pdfPath), "totalPages", totalPages, "pagesWithText", len(pages))
	return pages, totalPages, nil
}

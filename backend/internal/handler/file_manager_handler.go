package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aura-ai/backend/internal/domain"
)

// ExportFileInfo describes a single file in the exports directory.
type ExportFileInfo struct {
	Name        string    `json:"name"`
	Size        int64     `json:"size"`
	ModifiedAt  time.Time `json:"modifiedAt"`
	MimeType    string    `json:"mimeType"`
	DownloadURL string    `json:"downloadUrl"`
}

// FileManagerHandler handles listing and deleting exported files.
type FileManagerHandler struct{}

// NewFileManagerHandler creates a new FileManagerHandler.
func NewFileManagerHandler() *FileManagerHandler {
	return &FileManagerHandler{}
}

// ListExports handles GET /api/v1/exports
// Returns a list of all files in the uploads/exports directory.
func (h *FileManagerHandler) ListExports(w http.ResponseWriter, r *http.Request) {
	dir := filepath.Join("uploads", "exports")

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse([]ExportFileInfo{}))
			return
		}
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to list exports"))
		return
	}

	files := make([]ExportFileInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		name := entry.Name()
		files = append(files, ExportFileInfo{
			Name:        name,
			Size:        info.Size(),
			ModifiedAt:  info.ModTime(),
			MimeType:    exportMimeType(name),
			DownloadURL: "/api/v1/files/exports/" + name,
		})
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(files))
}

// DeleteExport handles DELETE /api/v1/exports/{filename}
// Removes a single file from the uploads/exports directory.
func (h *FileManagerHandler) DeleteExport(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid filename"))
		return
	}

	path := filepath.Join("uploads", "exports", filename)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			domain.WriteJSON(w, http.StatusNotFound, domain.ErrorResponse("file not found"))
			return
		}
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to delete file"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.APIResponse{Success: true, Data: map[string]string{"message": "deleted"}})
}

// exportMimeType returns the MIME type based on file extension.
func exportMimeType(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".csv":
		return "text/csv"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".json":
		return "application/json"
	case ".pdf":
		return "application/pdf"
	default:
		return "application/octet-stream"
	}
}

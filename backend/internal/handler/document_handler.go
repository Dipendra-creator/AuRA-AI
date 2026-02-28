// Package handler provides HTTP request handlers for all API endpoints.
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

// DocumentHandler handles HTTP requests for document endpoints.
type DocumentHandler struct {
	svc *service.DocumentService
}

// NewDocumentHandler creates a new DocumentHandler.
func NewDocumentHandler(svc *service.DocumentService) *DocumentHandler {
	return &DocumentHandler{svc: svc}
}

// List handles GET /api/v1/documents
func (h *DocumentHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	filter := domain.DocumentFilter{
		Status: q.Get("status"),
		Type:   q.Get("type"),
		Search: q.Get("search"),
		Page:   page,
		Limit:  limit,
		Sort:   q.Get("sort"),
	}

	docs, total, err := h.svc.List(r.Context(), filter)
	if err != nil {
		handleError(w, err)
		return
	}

	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 10
	}

	domain.WriteJSON(w, http.StatusOK, domain.PaginatedResponse(docs, total, filter.Page, filter.Limit))
}

// GetByID handles GET /api/v1/documents/{id}
func (h *DocumentHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	doc, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(doc))
}

// Create handles POST /api/v1/documents
func (h *DocumentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var input domain.CreateDocumentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	doc, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusCreated, domain.SuccessResponse(doc))
}

// Update handles PATCH /api/v1/documents/{id}
func (h *DocumentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	var input domain.UpdateDocumentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	doc, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(doc))
}

// Delete handles DELETE /api/v1/documents/{id}
func (h *DocumentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.APIResponse{Success: true, Data: map[string]string{"message": "deleted"}})
}

// Analyze handles POST /api/v1/documents/{id}/analyze
func (h *DocumentHandler) Analyze(w http.ResponseWriter, r *http.Request) {
	// Extract ID from path — strip the /analyze suffix
	path := r.URL.Path
	parts := strings.Split(strings.TrimSuffix(path, "/analyze"), "/")
	idStr := parts[len(parts)-1]

	oid, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid document id"))
		return
	}

	doc, err := h.svc.Analyze(r.Context(), oid)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(doc))
}

// parseObjectID extracts and validates an ObjectID from the URL path.
func parseObjectID(w http.ResponseWriter, r *http.Request) (bson.ObjectID, bool) {
	idStr := r.PathValue("id")
	if idStr == "" {
		// Fallback: extract from path
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) > 0 {
			idStr = parts[len(parts)-1]
		}
	}

	oid, err := bson.ObjectIDFromHex(idStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid id format"))
		return bson.ObjectID{}, false
	}
	return oid, true
}

// handleError writes an appropriate error response.
func handleError(w http.ResponseWriter, err error) {
	if appErr, ok := err.(*domain.AppError); ok {
		domain.WriteJSON(w, appErr.Code, domain.ErrorResponse(appErr.Message))
		return
	}
	domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("internal server error"))
}

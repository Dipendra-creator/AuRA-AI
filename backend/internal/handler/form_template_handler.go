package handler

import (
	"encoding/json"
	"net/http"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// FormTemplateHandler handles HTTP requests for form template endpoints.
type FormTemplateHandler struct {
	repo *repository.FormTemplateRepo
}

// NewFormTemplateHandler creates a new FormTemplateHandler.
func NewFormTemplateHandler(repo *repository.FormTemplateRepo) *FormTemplateHandler {
	return &FormTemplateHandler{repo: repo}
}

// ListTemplates handles GET /api/v1/form-templates
func (h *FormTemplateHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := h.repo.List(r.Context())
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch form templates"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(templates))
}

// GetTemplate handles GET /api/v1/form-templates/{id}
func (h *FormTemplateHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	t, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	if t == nil {
		domain.WriteJSON(w, http.StatusNotFound, domain.ErrorResponse("form template not found"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(t))
}

// CreateTemplate handles POST /api/v1/form-templates
func (h *FormTemplateHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	var t domain.FormTemplate
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	if t.Name == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("name is required"))
		return
	}

	created, err := h.repo.Create(r.Context(), &t)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusCreated, domain.SuccessResponse(created))
}

// DeleteTemplate handles DELETE /api/v1/form-templates/{id}
func (h *FormTemplateHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.APIResponse{Success: true, Data: map[string]string{"message": "deleted"}})
}

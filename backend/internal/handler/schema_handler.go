package handler

import (
	"encoding/json"
	"net/http"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// SchemaHandler handles HTTP requests for extraction schema endpoints.
type SchemaHandler struct {
	repo *repository.SchemaRepo
}

// NewSchemaHandler creates a new SchemaHandler.
func NewSchemaHandler(repo *repository.SchemaRepo) *SchemaHandler {
	return &SchemaHandler{repo: repo}
}

// ListSchemas handles GET /api/v1/schemas
func (h *SchemaHandler) ListSchemas(w http.ResponseWriter, r *http.Request) {
	schemas, err := h.repo.List(r.Context())
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch schemas"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(schemas))
}

// GetSchema handles GET /api/v1/schemas/{id}
func (h *SchemaHandler) GetSchema(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	s, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	if s == nil {
		domain.WriteJSON(w, http.StatusNotFound, domain.ErrorResponse("schema not found"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(s))
}

// CreateSchema handles POST /api/v1/schemas
func (h *SchemaHandler) CreateSchema(w http.ResponseWriter, r *http.Request) {
	var s domain.ExtractionSchema
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	if s.Name == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("name is required"))
		return
	}

	created, err := h.repo.Create(r.Context(), &s)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusCreated, domain.SuccessResponse(created))
}

// UpdateSchema handles PATCH /api/v1/schemas/{id}
func (h *SchemaHandler) UpdateSchema(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	var input domain.UpdateSchemaInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	updated, err := h.repo.Update(r.Context(), id, &input)
	if err != nil {
		handleError(w, err)
		return
	}
	if updated == nil {
		domain.WriteJSON(w, http.StatusNotFound, domain.ErrorResponse("schema not found"))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(updated))
}

// DeleteSchema handles DELETE /api/v1/schemas/{id}
func (h *SchemaHandler) DeleteSchema(w http.ResponseWriter, r *http.Request) {
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

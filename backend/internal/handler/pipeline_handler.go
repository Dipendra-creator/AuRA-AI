package handler

import (
	"encoding/json"
	"net/http"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

// PipelineHandler handles HTTP requests for pipeline endpoints.
type PipelineHandler struct {
	svc *service.PipelineService
}

// NewPipelineHandler creates a new PipelineHandler.
func NewPipelineHandler(svc *service.PipelineService) *PipelineHandler {
	return &PipelineHandler{svc: svc}
}

// List handles GET /api/v1/pipelines
func (h *PipelineHandler) List(w http.ResponseWriter, r *http.Request) {
	pipelines, err := h.svc.List(r.Context())
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch pipelines"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(pipelines))
}

// GetByID handles GET /api/v1/pipelines/{id}
func (h *PipelineHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	p, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(p))
}

// Create handles POST /api/v1/pipelines
func (h *PipelineHandler) Create(w http.ResponseWriter, r *http.Request) {
	var input domain.CreatePipelineInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	p, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusCreated, domain.SuccessResponse(p))
}

// Update handles PATCH /api/v1/pipelines/{id}
func (h *PipelineHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	var input domain.UpdatePipelineInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body"))
		return
	}

	p, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(p))
}

// Delete handles DELETE /api/v1/pipelines/{id}
func (h *PipelineHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
	"github.com/aura-ai/backend/internal/service"
)

// ExecutionHandler handles HTTP requests for pipeline execution endpoints.
type ExecutionHandler struct {
	svc *service.PipelineExecService
}

// NewExecutionHandler creates a new ExecutionHandler.
func NewExecutionHandler(svc *service.PipelineExecService) *ExecutionHandler {
	return &ExecutionHandler{svc: svc}
}

// Execute handles POST /api/v1/pipelines/{id}/execute
// The execution starts asynchronously; the run record is returned immediately.
func (h *ExecutionHandler) Execute(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	// Parse optional input data from request body
	var inputData map[string]any
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&inputData); err != nil {
			domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid request body: "+err.Error()))
			return
		}
	}

	input := engine.NewDataPacket()
	if inputData != nil {
		input.Fields = inputData
	}

	// Start asynchronously — returns the run record immediately with status "running".
	run, err := h.svc.ExecuteAsync(r.Context(), id, input)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse(err.Error()))
		return
	}

	domain.WriteJSON(w, http.StatusAccepted, domain.SuccessResponse(run))
}

// ListRuns handles GET /api/v1/pipelines/{id}/runs
func (h *ExecutionHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	runs, err := h.svc.ListRuns(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(runs))
}

// GetRun handles GET /api/v1/pipelines/{id}/runs/{runId}
func (h *ExecutionHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("runId")
	if runIDStr == "" {
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) > 0 {
			runIDStr = parts[len(parts)-1]
		}
	}

	runID, err := bson.ObjectIDFromHex(runIDStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid runId format"))
		return
	}

	run, err := h.svc.GetRun(r.Context(), runID)
	if err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(run))
}

// CancelRun handles POST /api/v1/pipelines/{id}/runs/{runId}/cancel
func (h *ExecutionHandler) CancelRun(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("runId")
	if runIDStr == "" {
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) >= 2 {
			runIDStr = parts[len(parts)-2]
		}
	}

	runID, err := bson.ObjectIDFromHex(runIDStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid runId format"))
		return
	}

	if err := h.svc.CancelRun(r.Context(), runID); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{"message": "run cancelled"}))
}

// Validate handles POST /api/v1/pipelines/{id}/validate
func (h *ExecutionHandler) Validate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseObjectID(w, r)
	if !ok {
		return
	}

	if err := h.svc.ValidatePipeline(r.Context(), id); err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse(err.Error()))
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{"message": "pipeline is valid"}))
}

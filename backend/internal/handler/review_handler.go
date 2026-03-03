package handler

import (
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// ReviewHandler handles HTTP requests for pipeline review node approval/rejection.
type ReviewHandler struct {
	runRepo *repository.PipelineRunRepo
}

// NewReviewHandler creates a new ReviewHandler.
func NewReviewHandler(runRepo *repository.PipelineRunRepo) *ReviewHandler {
	return &ReviewHandler{runRepo: runRepo}
}

// Approve handles POST /api/v1/runs/{runId}/nodes/{nodeId}/approve
func (h *ReviewHandler) Approve(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("runId")
	if runIDStr == "" {
		parts := strings.Split(r.URL.Path, "/")
		for i, p := range parts {
			if p == "runs" && i+1 < len(parts) {
				runIDStr = parts[i+1]
				break
			}
		}
	}

	runID, err := bson.ObjectIDFromHex(runIDStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid runId format"))
		return
	}

	// Resume the paused pipeline run
	if err := h.runRepo.UpdateStatus(r.Context(), runID, domain.RunStatusRunning, nil); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{"message": "node approved, pipeline resuming"}))
}

// Reject handles POST /api/v1/runs/{runId}/nodes/{nodeId}/reject
func (h *ReviewHandler) Reject(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("runId")
	if runIDStr == "" {
		parts := strings.Split(r.URL.Path, "/")
		for i, p := range parts {
			if p == "runs" && i+1 < len(parts) {
				runIDStr = parts[i+1]
				break
			}
		}
	}

	runID, err := bson.ObjectIDFromHex(runIDStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid runId format"))
		return
	}

	if err := h.runRepo.UpdateStatus(r.Context(), runID, domain.RunStatusFailed, nil); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{"message": "node rejected, pipeline failed"}))
}

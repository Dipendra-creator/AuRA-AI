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

// parseReviewParams extracts and validates both runId and nodeId from the
// request path. Returns zero-value ObjectID on error (response already written).
func (h *ReviewHandler) parseReviewParams(w http.ResponseWriter, r *http.Request) (bson.ObjectID, string) {
	runIDStr := r.PathValue("runId")
	nodeID := r.PathValue("nodeId")

	// Fallback: parse from URL path segments
	if runIDStr == "" || nodeID == "" {
		parts := strings.Split(r.URL.Path, "/")
		for i, p := range parts {
			if p == "runs" && i+1 < len(parts) {
				runIDStr = parts[i+1]
			}
			if p == "nodes" && i+1 < len(parts) {
				nodeID = parts[i+1]
			}
		}
	}

	runID, err := bson.ObjectIDFromHex(runIDStr)
	if err != nil {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("invalid runId format"))
		return bson.ObjectID{}, ""
	}

	if nodeID == "" {
		domain.WriteJSON(w, http.StatusBadRequest, domain.ErrorResponse("nodeId is required"))
		return bson.ObjectID{}, ""
	}

	return runID, nodeID
}

// Approve handles POST /api/v1/runs/{runId}/nodes/{nodeId}/approve
func (h *ReviewHandler) Approve(w http.ResponseWriter, r *http.Request) {
	runID, nodeID := h.parseReviewParams(w, r)
	if runID.IsZero() {
		return
	}

	// Update the specific node run from waiting_review -> completed
	if err := h.runRepo.UpdateNodeRunStatus(r.Context(), runID, nodeID, domain.NodeRunCompleted); err != nil {
		handleError(w, err)
		return
	}

	// Resume the overall pipeline run
	if err := h.runRepo.UpdateStatus(r.Context(), runID, domain.RunStatusRunning, nil); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{
		"message": "node approved, pipeline resuming",
		"nodeId":  nodeID,
	}))
}

// Reject handles POST /api/v1/runs/{runId}/nodes/{nodeId}/reject
func (h *ReviewHandler) Reject(w http.ResponseWriter, r *http.Request) {
	runID, nodeID := h.parseReviewParams(w, r)
	if runID.IsZero() {
		return
	}

	// Update the specific node run to failed
	if err := h.runRepo.UpdateNodeRunStatus(r.Context(), runID, nodeID, domain.NodeRunFailed); err != nil {
		handleError(w, err)
		return
	}

	// Fail the overall pipeline run
	if err := h.runRepo.UpdateStatus(r.Context(), runID, domain.RunStatusFailed, nil); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{
		"message": "node rejected, pipeline failed",
		"nodeId":  nodeID,
	}))
}

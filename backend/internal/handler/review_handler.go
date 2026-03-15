package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
	"github.com/aura-ai/backend/internal/service"
)

// ReviewHandler handles approval/rejection of paused review nodes.
type ReviewHandler struct {
	runRepo *repository.PipelineRunRepo
	execSvc *service.PipelineExecService
}

// NewReviewHandler creates a new ReviewHandler.
func NewReviewHandler(runRepo *repository.PipelineRunRepo, execSvc *service.PipelineExecService) *ReviewHandler {
	return &ReviewHandler{runRepo: runRepo, execSvc: execSvc}
}

// Approve handles POST /api/v1/runs/{runId}/nodes/{nodeId}/approve
// It marks the review node as completed and resumes execution asynchronously.
func (h *ReviewHandler) Approve(w http.ResponseWriter, r *http.Request) {
	runID, nodeID := h.parseReviewParams(w, r)
	if runID.IsZero() {
		return
	}

	// Mark the node as completed in the DB.
	if err := h.runRepo.UpdateNodeRunStatus(r.Context(), runID, nodeID, domain.NodeRunCompleted); err != nil {
		handleError(w, err)
		return
	}

	// Resume execution in a background goroutine.
	if err := h.execSvc.ResumeAsync(runID); err != nil {
		// If resume fails (e.g. no pending nodes) log it but don't fail the response —
		// the node was already approved in the DB.
		slog.Warn("review approve: resume failed", "runId", runID.Hex(), "nodeId", nodeID, "error", err)
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{
		"message": "node approved, pipeline resuming",
		"nodeId":  nodeID,
		"runId":   runID.Hex(),
	}))
}

// Reject handles POST /api/v1/runs/{runId}/nodes/{nodeId}/reject
// It marks the review node as failed and sets the run to failed.
func (h *ReviewHandler) Reject(w http.ResponseWriter, r *http.Request) {
	runID, nodeID := h.parseReviewParams(w, r)
	if runID.IsZero() {
		return
	}

	if err := h.runRepo.UpdateNodeRunStatus(r.Context(), runID, nodeID, domain.NodeRunFailed); err != nil {
		handleError(w, err)
		return
	}

	if err := h.runRepo.UpdateStatus(r.Context(), runID, domain.RunStatusFailed, nil); err != nil {
		handleError(w, err)
		return
	}

	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(map[string]string{
		"message": "node rejected, pipeline failed",
		"nodeId":  nodeID,
		"runId":   runID.Hex(),
	}))
}

// parseReviewParams extracts runId and nodeId from the request path.
func (h *ReviewHandler) parseReviewParams(w http.ResponseWriter, r *http.Request) (bson.ObjectID, string) {
	runIDStr := r.PathValue("runId")
	nodeID := r.PathValue("nodeId")
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

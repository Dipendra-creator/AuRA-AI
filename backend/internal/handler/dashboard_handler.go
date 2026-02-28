package handler

import (
	"net/http"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

// DashboardHandler handles HTTP requests for dashboard endpoints.
type DashboardHandler struct {
	svc *service.DashboardService
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(svc *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{svc: svc}
}

// GetStats handles GET /api/v1/dashboard/stats
func (h *DashboardHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetStats(r.Context())
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch stats"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(stats))
}

// GetChart handles GET /api/v1/dashboard/chart
func (h *DashboardHandler) GetChart(w http.ResponseWriter, r *http.Request) {
	data, err := h.svc.GetChartData(r.Context())
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch chart data"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(data))
}

// GetRecent handles GET /api/v1/dashboard/recent
func (h *DashboardHandler) GetRecent(w http.ResponseWriter, r *http.Request) {
	docs, err := h.svc.GetRecentDocuments(r.Context())
	if err != nil {
		domain.WriteJSON(w, http.StatusInternalServerError, domain.ErrorResponse("failed to fetch recent documents"))
		return
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(docs))
}

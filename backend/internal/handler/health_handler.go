package handler

import (
	"net/http"
	"time"

	"github.com/aura-ai/backend/internal/domain"
)

var startTime = time.Now()

// HealthResponse is the response for the health check endpoint.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Uptime  string `json:"uptime"`
	DB      string `json:"db"`
}

// HealthCheck handles GET /api/v1/health
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:  "healthy",
		Version: "1.0.0",
		Uptime:  time.Since(startTime).Round(time.Second).String(),
		DB:      "connected",
	}
	domain.WriteJSON(w, http.StatusOK, domain.SuccessResponse(resp))
}

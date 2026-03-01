// Package server provides HTTP server setup and route registration.
package server

import (
	"net/http"

	"github.com/aura-ai/backend/internal/handler"
	"github.com/aura-ai/backend/internal/middleware"
	"github.com/aura-ai/backend/internal/repository"
	"github.com/aura-ai/backend/internal/service"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// NewRouter creates and configures the HTTP router with all routes and middleware.
func NewRouter(db *mongo.Database, corsOrigins string, kiloAPIKey string) http.Handler {
	// --- Repositories ---
	docRepo := repository.NewDocumentRepo(db)
	pipelineRepo := repository.NewPipelineRepo(db)
	activityRepo := repository.NewActivityRepo(db)

	// --- Services ---
	docSvc := service.NewDocumentService(docRepo, kiloAPIKey)
	dashSvc := service.NewDashboardService(docRepo, pipelineRepo)
	pipeSvc := service.NewPipelineService(pipelineRepo)

	// --- Handlers ---
	docH := handler.NewDocumentHandler(docSvc)
	dashH := handler.NewDashboardHandler(dashSvc)
	pipeH := handler.NewPipelineHandler(pipeSvc)
	actH := handler.NewActivityHandler(activityRepo)
	exportH := handler.NewExportHandler(docSvc)

	// --- Routes ---
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /api/v1/health", handler.HealthCheck)

	// Documents
	mux.HandleFunc("GET /api/v1/documents", docH.List)
	mux.HandleFunc("GET /api/v1/documents/{id}", docH.GetByID)
	mux.HandleFunc("POST /api/v1/documents", docH.Create)
	mux.HandleFunc("POST /api/v1/documents/upload", docH.Upload)
	mux.HandleFunc("PATCH /api/v1/documents/{id}", docH.Update)
	mux.HandleFunc("DELETE /api/v1/documents/{id}", docH.Delete)
	mux.HandleFunc("POST /api/v1/documents/{id}/analyze", docH.Analyze)
	mux.HandleFunc("POST /api/v1/documents/{id}/export", exportH.Export)

	// Uploaded file serving (for PDF preview)
	fileServer := http.StripPrefix("/api/v1/files/", http.FileServer(http.Dir("uploads")))
	mux.Handle("GET /api/v1/files/", fileServer)

	// Dashboard
	mux.HandleFunc("GET /api/v1/dashboard/stats", dashH.GetStats)
	mux.HandleFunc("GET /api/v1/dashboard/chart", dashH.GetChart)
	mux.HandleFunc("GET /api/v1/dashboard/recent", dashH.GetRecent)

	// Pipelines
	mux.HandleFunc("GET /api/v1/pipelines", pipeH.List)
	mux.HandleFunc("GET /api/v1/pipelines/{id}", pipeH.GetByID)
	mux.HandleFunc("POST /api/v1/pipelines", pipeH.Create)
	mux.HandleFunc("PATCH /api/v1/pipelines/{id}", pipeH.Update)
	mux.HandleFunc("DELETE /api/v1/pipelines/{id}", pipeH.Delete)

	// Activity
	mux.HandleFunc("GET /api/v1/activity", actH.List)
	mux.HandleFunc("POST /api/v1/activity", actH.Create)

	// --- Middleware Chain ---
	var h http.Handler = mux
	h = middleware.CORS(corsOrigins)(h)
	h = middleware.Logger()(h)
	h = middleware.RequestID()(h)
	h = middleware.Recovery()(h)

	return h
}

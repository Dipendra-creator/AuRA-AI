// Package server provides HTTP server setup and route registration.
package server

import (
	"net/http"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/engine"
	"github.com/aura-ai/backend/internal/engine/nodes"
	"github.com/aura-ai/backend/internal/handler"
	"github.com/aura-ai/backend/internal/middleware"
	"github.com/aura-ai/backend/internal/repository"
	"github.com/aura-ai/backend/internal/service"

	"github.com/aura-ai/backend/internal/domain"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// NewRouter creates and configures the HTTP router with all routes and middleware.
func NewRouter(db *mongo.Database, corsOrigins string, kiloAPIKey string) http.Handler {
	// --- Repositories ---
	docRepo := repository.NewDocumentRepo(db)
	pipelineRepo := repository.NewPipelineRepo(db)
	activityRepo := repository.NewActivityRepo(db)
	runRepo := repository.NewPipelineRunRepo(db)
	formTemplateRepo := repository.NewFormTemplateRepo(db)
	schemaRepo := repository.NewSchemaRepo(db)

	// --- AI Client ---
	var aiClient *aiservice.KiloClient
	if kiloAPIKey != "" {
		aiClient = aiservice.NewKiloClient(kiloAPIKey)
	}

	// --- Pipeline Event Broker ---
	broker := engine.NewPipelineEventBroker()

	// --- Engine: Node Registry ---
	registry := engine.NewNodeRegistry()
	registry.Register(domain.NodeTypeDocSelect, nodes.NewDocSelectExecutor(docRepo))
	registry.Register(domain.NodeTypeAIExtract, nodes.NewAIExtractExecutor(aiClient))
	registry.Register(domain.NodeTypeTransform, nodes.NewTransformExecutor())
	registry.Register(domain.NodeTypeFormFill, nodes.NewFormFillExecutor())
	registry.Register(domain.NodeTypeCustomAPI, nodes.NewCustomAPIExecutor())
	registry.Register(domain.NodeTypeReview, nodes.NewReviewExecutor())
	registry.Register(domain.NodeTypeCondition, nodes.NewConditionExecutor())
	registry.Register(domain.NodeTypeExport, nodes.NewExportExecutor())

	// --- Engine: Executor ---
	executor := engine.NewPipelineExecutor(registry, runRepo)

	// --- Services ---
	docSvc := service.NewDocumentService(docRepo, kiloAPIKey)
	dashSvc := service.NewDashboardService(docRepo, pipelineRepo)
	pipeSvc := service.NewPipelineService(pipelineRepo)
	pipeExecSvc := service.NewPipelineExecService(pipelineRepo, runRepo, executor, broker)

	// --- Handlers ---
	docH := handler.NewDocumentHandler(docSvc)
	dashH := handler.NewDashboardHandler(dashSvc)
	pipeH := handler.NewPipelineHandler(pipeSvc)
	actH := handler.NewActivityHandler(activityRepo)
	exportH := handler.NewExportHandler(docSvc)
	wsH := handler.NewWSHandler(docSvc, broker)
	execH := handler.NewExecutionHandler(pipeExecSvc)
	reviewH := handler.NewReviewHandler(runRepo, pipeExecSvc)
	formH := handler.NewFormTemplateHandler(formTemplateRepo)
	schemaH := handler.NewSchemaHandler(schemaRepo)
	fileH := handler.NewFileManagerHandler()

	// --- Routes ---
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /api/v1/health", handler.HealthCheck)

	// WebSocket
	mux.HandleFunc("GET /api/v1/ws", wsH.HandleWS)

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

	// Pipelines — CRUD
	mux.HandleFunc("GET /api/v1/pipelines", pipeH.List)
	mux.HandleFunc("GET /api/v1/pipelines/{id}", pipeH.GetByID)
	mux.HandleFunc("POST /api/v1/pipelines", pipeH.Create)
	mux.HandleFunc("PATCH /api/v1/pipelines/{id}", pipeH.Update)
	mux.HandleFunc("DELETE /api/v1/pipelines/{id}", pipeH.Delete)

	// Pipelines — Execution
	mux.HandleFunc("POST /api/v1/pipelines/{id}/execute", execH.Execute)
	mux.HandleFunc("GET /api/v1/pipelines/{id}/runs", execH.ListRuns)
	mux.HandleFunc("GET /api/v1/pipelines/{id}/runs/{runId}", execH.GetRun)
	mux.HandleFunc("POST /api/v1/pipelines/{id}/runs/{runId}/cancel", execH.CancelRun)

	// Pipelines — Validation
	mux.HandleFunc("POST /api/v1/pipelines/{id}/validate", execH.Validate)

	// Review Gate
	mux.HandleFunc("POST /api/v1/runs/{runId}/nodes/{nodeId}/approve", reviewH.Approve)
	mux.HandleFunc("POST /api/v1/runs/{runId}/nodes/{nodeId}/reject", reviewH.Reject)

	// Form Templates
	mux.HandleFunc("GET /api/v1/form-templates", formH.ListTemplates)
	mux.HandleFunc("POST /api/v1/form-templates", formH.CreateTemplate)
	mux.HandleFunc("GET /api/v1/form-templates/{id}", formH.GetTemplate)
	mux.HandleFunc("DELETE /api/v1/form-templates/{id}", formH.DeleteTemplate)

	// Extraction Schemas
	mux.HandleFunc("GET /api/v1/schemas", schemaH.ListSchemas)
	mux.HandleFunc("POST /api/v1/schemas", schemaH.CreateSchema)
	mux.HandleFunc("GET /api/v1/schemas/{id}", schemaH.GetSchema)
	mux.HandleFunc("PATCH /api/v1/schemas/{id}", schemaH.UpdateSchema)
	mux.HandleFunc("DELETE /api/v1/schemas/{id}", schemaH.DeleteSchema)

	// Export File Management
	mux.HandleFunc("GET /api/v1/exports", fileH.ListExports)
	mux.HandleFunc("DELETE /api/v1/exports/{filename}", fileH.DeleteExport)

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

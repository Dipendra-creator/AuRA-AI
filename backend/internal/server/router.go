// Package server provides HTTP server setup and route registration.
package server

import (
	"net/http"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/config"
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
func NewRouter(db *mongo.Database, cfg *config.Config) http.Handler {
	// --- Repositories ---
	docRepo := repository.NewDocumentRepo(db)
	pipelineRepo := repository.NewPipelineRepo(db)
	activityRepo := repository.NewActivityRepo(db)
	runRepo := repository.NewPipelineRunRepo(db)
	formTemplateRepo := repository.NewFormTemplateRepo(db)
	schemaRepo := repository.NewSchemaRepo(db)
	userRepo := repository.NewUserRepo(db)

	// --- AI Client ---
	var aiClient *aiservice.KiloClient
	if cfg.KiloAPIKey != "" {
		aiClient = aiservice.NewKiloClient(cfg.KiloAPIKey)
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
	docSvc := service.NewDocumentService(docRepo, cfg.KiloAPIKey)
	dashSvc := service.NewDashboardService(docRepo, pipelineRepo)
	pipeSvc := service.NewPipelineService(pipelineRepo)
	pipeExecSvc := service.NewPipelineExecService(pipelineRepo, runRepo, executor, broker)

	// --- Handlers ---
	authH := handler.NewAuthHandler(userRepo, docRepo, cfg)
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

	// --- Auth middleware (protects all /api/v1/* routes below) ---
	requireAuth := middleware.RequireAuth(cfg.JWTSecret, userRepo)

	// --- Routes ---
	mux := http.NewServeMux()

	// Health (public)
	mux.HandleFunc("GET /api/v1/health", handler.HealthCheck)

	// ── Auth routes (public) ──────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/auth/register", authH.Register)
	mux.HandleFunc("POST /api/v1/auth/login", authH.Login)
	mux.HandleFunc("GET /api/v1/auth/github", authH.GitHubLogin)
	mux.HandleFunc("GET /api/v1/auth/github/callback", authH.GitHubCallback)
	mux.HandleFunc("GET /api/v1/auth/github/status", authH.GitHubStatus)

	// ── Auth routes (protected) ───────────────────────────────────────────────
	mux.Handle("GET /api/v1/auth/me", requireAuth(http.HandlerFunc(authH.Me)))
	mux.Handle("PATCH /api/v1/auth/me", requireAuth(http.HandlerFunc(authH.UpdateProfile)))
	mux.Handle("POST /api/v1/auth/me/password", requireAuth(http.HandlerFunc(authH.ChangePassword)))
	mux.Handle("GET /api/v1/auth/me/usage", requireAuth(http.HandlerFunc(authH.GetUsage)))

	// ── WebSocket (protected) ─────────────────────────────────────────────────
	mux.Handle("GET /api/v1/ws", requireAuth(http.HandlerFunc(wsH.HandleWS)))

	// ── Documents (protected) ─────────────────────────────────────────────────
	mux.Handle("GET /api/v1/documents", requireAuth(http.HandlerFunc(docH.List)))
	mux.Handle("GET /api/v1/documents/{id}", requireAuth(http.HandlerFunc(docH.GetByID)))
	mux.Handle("POST /api/v1/documents", requireAuth(http.HandlerFunc(docH.Create)))
	mux.Handle("POST /api/v1/documents/upload", requireAuth(http.HandlerFunc(docH.Upload)))
	mux.Handle("PATCH /api/v1/documents/{id}", requireAuth(http.HandlerFunc(docH.Update)))
	mux.Handle("DELETE /api/v1/documents/{id}", requireAuth(http.HandlerFunc(docH.Delete)))
	mux.Handle("POST /api/v1/documents/{id}/analyze", requireAuth(http.HandlerFunc(docH.Analyze)))
	mux.Handle("POST /api/v1/documents/{id}/export", requireAuth(http.HandlerFunc(exportH.Export)))

	// Uploaded file serving (protected)
	fileServer := http.StripPrefix("/api/v1/files/", http.FileServer(http.Dir("uploads")))
	mux.Handle("GET /api/v1/files/", requireAuth(fileServer))

	// ── Dashboard (protected) ─────────────────────────────────────────────────
	mux.Handle("GET /api/v1/dashboard/stats", requireAuth(http.HandlerFunc(dashH.GetStats)))
	mux.Handle("GET /api/v1/dashboard/chart", requireAuth(http.HandlerFunc(dashH.GetChart)))
	mux.Handle("GET /api/v1/dashboard/recent", requireAuth(http.HandlerFunc(dashH.GetRecent)))

	// ── Pipelines — CRUD (protected) ──────────────────────────────────────────
	mux.Handle("GET /api/v1/pipelines", requireAuth(http.HandlerFunc(pipeH.List)))
	mux.Handle("GET /api/v1/pipelines/{id}", requireAuth(http.HandlerFunc(pipeH.GetByID)))
	mux.Handle("POST /api/v1/pipelines", requireAuth(http.HandlerFunc(pipeH.Create)))
	mux.Handle("PATCH /api/v1/pipelines/{id}", requireAuth(http.HandlerFunc(pipeH.Update)))
	mux.Handle("DELETE /api/v1/pipelines/{id}", requireAuth(http.HandlerFunc(pipeH.Delete)))

	// ── Pipelines — Execution (protected) ─────────────────────────────────────
	mux.Handle("POST /api/v1/pipelines/{id}/execute", requireAuth(http.HandlerFunc(execH.Execute)))
	mux.Handle("GET /api/v1/pipelines/{id}/runs", requireAuth(http.HandlerFunc(execH.ListRuns)))
	mux.Handle("GET /api/v1/pipelines/{id}/runs/{runId}", requireAuth(http.HandlerFunc(execH.GetRun)))
	mux.Handle("POST /api/v1/pipelines/{id}/runs/{runId}/cancel", requireAuth(http.HandlerFunc(execH.CancelRun)))

	// ── Pipelines — Validation (protected) ────────────────────────────────────
	mux.Handle("POST /api/v1/pipelines/{id}/validate", requireAuth(http.HandlerFunc(execH.Validate)))

	// ── Review Gate (protected) ───────────────────────────────────────────────
	mux.Handle("POST /api/v1/runs/{runId}/nodes/{nodeId}/approve", requireAuth(http.HandlerFunc(reviewH.Approve)))
	mux.Handle("POST /api/v1/runs/{runId}/nodes/{nodeId}/reject", requireAuth(http.HandlerFunc(reviewH.Reject)))

	// ── Form Templates (protected) ────────────────────────────────────────────
	mux.Handle("GET /api/v1/form-templates", requireAuth(http.HandlerFunc(formH.ListTemplates)))
	mux.Handle("POST /api/v1/form-templates", requireAuth(http.HandlerFunc(formH.CreateTemplate)))
	mux.Handle("GET /api/v1/form-templates/{id}", requireAuth(http.HandlerFunc(formH.GetTemplate)))
	mux.Handle("DELETE /api/v1/form-templates/{id}", requireAuth(http.HandlerFunc(formH.DeleteTemplate)))

	// ── Extraction Schemas (protected) ────────────────────────────────────────
	mux.Handle("GET /api/v1/schemas", requireAuth(http.HandlerFunc(schemaH.ListSchemas)))
	mux.Handle("POST /api/v1/schemas", requireAuth(http.HandlerFunc(schemaH.CreateSchema)))
	mux.Handle("GET /api/v1/schemas/{id}", requireAuth(http.HandlerFunc(schemaH.GetSchema)))
	mux.Handle("PATCH /api/v1/schemas/{id}", requireAuth(http.HandlerFunc(schemaH.UpdateSchema)))
	mux.Handle("DELETE /api/v1/schemas/{id}", requireAuth(http.HandlerFunc(schemaH.DeleteSchema)))

	// ── Export File Management (protected) ────────────────────────────────────
	mux.Handle("GET /api/v1/exports", requireAuth(http.HandlerFunc(fileH.ListExports)))
	mux.Handle("DELETE /api/v1/exports/{filename}", requireAuth(http.HandlerFunc(fileH.DeleteExport)))

	// ── Activity (protected) ──────────────────────────────────────────────────
	mux.Handle("GET /api/v1/activity", requireAuth(http.HandlerFunc(actH.List)))
	mux.Handle("POST /api/v1/activity", requireAuth(http.HandlerFunc(actH.Create)))

	// --- Middleware Chain ---
	var h http.Handler = mux
	h = middleware.CORS(cfg.CORSOrigins)(h)
	h = middleware.Logger()(h)
	h = middleware.RequestID()(h)
	h = middleware.Recovery()(h)

	return h
}

// Aura AI Backend Server — entry point.
//
// This is the main entry point for the Go API server. It wires together
// configuration, database, logging, and the HTTP server with graceful shutdown.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aura-ai/backend/internal/config"
	"github.com/aura-ai/backend/internal/database"
	"github.com/aura-ai/backend/internal/logger"
	"github.com/aura-ai/backend/internal/server"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (ignore error — env vars may already be set)
	_ = godotenv.Load()

	// Load configuration
	cfg := config.Load()

	// Initialize structured logger
	logger.Init(cfg.LogLevel)

	slog.Info("starting Aura AI server",
		"port", cfg.Port,
		"mongo_db", cfg.MongoDB,
	)

	// Connect to MongoDB
	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		slog.Error("failed to connect to MongoDB", "error", err)
		os.Exit(1)
	}

	// Build HTTP router
	router := server.NewRouter(db.Database(), cfg.CORSOrigins)

	// Configure HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: cfg.RequestTimeout,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		slog.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}

	if err := db.Disconnect(shutdownCtx); err != nil {
		slog.Error("failed to disconnect MongoDB", "error", err)
	}

	slog.Info("server stopped")
}

// Package aiservice provides AI-powered document analysis.
// This file defines the AIClient interface and a thread-safe ClientManager
// that allows hot-swapping the active AI provider without restarting.
package aiservice

import (
	"context"
	"sync"

	"github.com/aura-ai/backend/internal/domain"
)

// AIClient is the interface all AI providers must implement.
// Currently only KiloClient satisfies this interface.
type AIClient interface {
	Chat(ctx context.Context, prompt string) (string, error)
	ExtractFields(ctx context.Context, documentText string, documentType domain.DocumentType) ([]domain.ExtractedField, error)
	ExtractFieldsFromPage(ctx context.Context, pageText string, pageNum, totalPages int, documentType domain.DocumentType) ([]domain.ExtractedField, error)
	ExtractFieldsFromPageWithSchema(ctx context.Context, pageText string, pageNum, totalPages int, schema []domain.SchemaField) ([]domain.ExtractedField, error)
}

// Ensure KiloClient satisfies AIClient at compile time.
var _ AIClient = (*KiloClient)(nil)

// ClientManager is a thread-safe, hot-swappable AI client holder.
// Both DocumentService and AIExtractExecutor hold a *ClientManager so that
// when the user saves a new API key via the API Configuration page, the live
// client is replaced immediately without a server restart.
type ClientManager struct {
	mu     sync.RWMutex
	client AIClient
}

// NewClientManager creates a ClientManager with an optional initial client (may be nil).
func NewClientManager(c AIClient) *ClientManager {
	return &ClientManager{client: c}
}

// Get returns the current AI client. Returns nil if no provider is configured.
func (m *ClientManager) Get() AIClient {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.client
}

// Set replaces the current AI client. Safe to call concurrently.
func (m *ClientManager) Set(c AIClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.client = c
}

// IsConfigured returns true if a client has been set.
func (m *ClientManager) IsConfigured() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.client != nil
}

package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/crypto"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

const (
	providerTypeKilo    = "kilo_code"
	kiloDefaultModel    = "minimax/minimax-m2.5:free"
	kiloDefaultBaseURL  = "https://api.kilo.ai/api/openrouter/"
)

// AIProviderService manages AI provider configurations and updates the live ClientManager.
type AIProviderService struct {
	repo          *repository.AIProviderRepo
	encryptionKey []byte
	clientMgr     *aiservice.ClientManager
}

// NewAIProviderService creates a new AIProviderService.
func NewAIProviderService(repo *repository.AIProviderRepo, encryptionKey []byte, clientMgr *aiservice.ClientManager) *AIProviderService {
	return &AIProviderService{
		repo:          repo,
		encryptionKey: encryptionKey,
		clientMgr:     clientMgr,
	}
}

// GetProvider returns the Kilo Code provider config for a user (API key masked).
// Returns nil if not configured yet.
func (s *AIProviderService) GetProvider(ctx context.Context, userID bson.ObjectID) (*domain.AIProvider, error) {
	return s.repo.GetByUserAndType(ctx, userID, providerTypeKilo)
}

// SaveProvider creates or updates the Kilo Code API key for a user.
// The key is encrypted before storage. The live ClientManager is updated immediately
// so all in-flight and subsequent requests use the new key without a restart.
func (s *AIProviderService) SaveProvider(ctx context.Context, userID bson.ObjectID, apiKey, model string) (*domain.AIProvider, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, &domain.AppError{Code: 400, Message: "API key is required"}
	}

	encrypted, err := crypto.Encrypt(apiKey, s.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt API key: %w", err)
	}

	if model == "" {
		model = kiloDefaultModel
	}

	p := &domain.AIProvider{
		UserID:          userID,
		Type:            providerTypeKilo,
		APIKeyEncrypted: encrypted,
		APIKeyPreview:   crypto.APIKeyPreview(apiKey),
		BaseURL:         kiloDefaultBaseURL,
		Model:           model,
		IsActive:        true,
	}

	saved, err := s.repo.Upsert(ctx, p)
	if err != nil {
		return nil, fmt.Errorf("failed to save provider: %w", err)
	}

	// Hot-swap the live client so changes take effect immediately.
	s.clientMgr.Set(aiservice.NewKiloClientWithModel(apiKey, model))

	return saved, nil
}

// UpdateModel changes only the model for an existing provider config.
// The existing encrypted API key is reused to hot-swap the live client.
func (s *AIProviderService) UpdateModel(ctx context.Context, userID bson.ObjectID, model string) (*domain.AIProvider, error) {
	if model == "" {
		return nil, &domain.AppError{Code: 400, Message: "model is required"}
	}

	// Fetch existing so we can decrypt the key for the client hot-swap.
	existing, err := s.repo.GetByUserAndType(ctx, userID, providerTypeKilo)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, &domain.AppError{Code: 404, Message: "Kilo Code provider not configured"}
	}

	saved, err := s.repo.UpdateModel(ctx, userID, providerTypeKilo, model)
	if err != nil {
		return nil, fmt.Errorf("failed to update model: %w", err)
	}

	// Hot-swap with the same key but the new model.
	decrypted, err := crypto.Decrypt(existing.APIKeyEncrypted, s.encryptionKey)
	if err == nil {
		s.clientMgr.Set(aiservice.NewKiloClientWithModel(decrypted, model))
	}

	return saved, nil
}

// DeleteProvider removes the Kilo Code config for a user and clears the live client.
func (s *AIProviderService) DeleteProvider(ctx context.Context, userID bson.ObjectID) error {
	if err := s.repo.Delete(ctx, userID, providerTypeKilo); err != nil {
		return fmt.Errorf("failed to delete provider: %w", err)
	}
	s.clientMgr.Set(nil)
	return nil
}

// TestProvider sends a minimal request to the Kilo API using the user's stored key
// and returns the connectivity result with latency.
func (s *AIProviderService) TestProvider(ctx context.Context, userID bson.ObjectID) (*domain.ProviderTestResult, error) {
	p, err := s.repo.GetByUserAndType(ctx, userID, providerTypeKilo)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, &domain.AppError{Code: 404, Message: "Kilo Code provider not configured"}
	}

	decrypted, err := crypto.Decrypt(p.APIKeyEncrypted, s.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API key: %w", err)
	}

	client := aiservice.NewKiloClient(decrypted)
	start := time.Now()
	_, testErr := client.Chat(ctx, `Reply with only the JSON: {"ok":true}`)
	latency := time.Since(start).Milliseconds()

	result := &domain.ProviderTestResult{
		TestedAt:  time.Now(),
		LatencyMs: latency,
	}
	if testErr != nil {
		result.Success = false
		result.Message = testErr.Error()
	} else {
		result.Success = true
		result.Message = "Connection successful"
	}

	return result, nil
}

// BootstrapFromEnv initialises the ClientManager from the KILO_API_KEY env var value
// (already loaded into cfg.KiloAPIKey). Call this from router.go on startup so the
// env-var key works immediately before any user has visited the UI to save a DB key.
func (s *AIProviderService) BootstrapFromEnv(apiKey string) {
	if apiKey != "" {
		s.clientMgr.Set(aiservice.NewKiloClient(apiKey))
	}
}

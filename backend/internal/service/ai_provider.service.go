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
	providerTypeCopilot = "github_copilot"
)

// supportedProviders lists all valid provider type strings.
var supportedProviders = map[string]bool{
	providerTypeKilo:    true,
	providerTypeCopilot: true,
}

// providerBaseURL returns the display base URL for a provider type.
func providerBaseURL(providerType string) string {
	switch providerType {
	case providerTypeCopilot:
		return "https://models.github.ai/inference/"
	case providerTypeKilo:
		return "https://api.kilo.ai/api/openrouter/"
	default:
		return ""
	}
}

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

// GetProvider returns a specific provider config for a user (API key masked).
// Returns nil if not configured yet.
func (s *AIProviderService) GetProvider(ctx context.Context, userID bson.ObjectID, providerType string) (*domain.AIProvider, error) {
	return s.repo.GetByUserAndType(ctx, userID, providerType)
}

// GetAllProviders returns all configured providers for a user.
func (s *AIProviderService) GetAllProviders(ctx context.Context, userID bson.ObjectID) ([]domain.AIProvider, error) {
	return s.repo.GetByUser(ctx, userID)
}

// GetActiveProvider returns the provider that is currently marked as active for a user.
// Returns nil if none is active.
func (s *AIProviderService) GetActiveProvider(ctx context.Context, userID bson.ObjectID) (*domain.AIProvider, error) {
	providers, err := s.repo.GetByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i := range providers {
		if providers[i].IsActive {
			return &providers[i], nil
		}
	}
	return nil, nil
}

// SaveProvider creates or updates an AI provider config for a user.
// The key is encrypted before storage. The live ClientManager is updated if this
// provider is active so all in-flight requests use the new key immediately.
func (s *AIProviderService) SaveProvider(ctx context.Context, userID bson.ObjectID, providerType, apiKey, model string) (*domain.AIProvider, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, &domain.AppError{Code: 400, Message: "API key is required"}
	}
	if !supportedProviders[providerType] {
		return nil, &domain.AppError{Code: 400, Message: "unsupported provider type: " + providerType}
	}

	encrypted, err := crypto.Encrypt(apiKey, s.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt API key: %w", err)
	}

	if model == "" {
		model = aiservice.DefaultModelForProvider(providerType)
	}

	// Deactivate all other providers for this user — only one active at a time
	if err := s.repo.DeactivateAll(ctx, userID); err != nil {
		return nil, fmt.Errorf("failed to deactivate providers: %w", err)
	}

	p := &domain.AIProvider{
		UserID:          userID,
		Type:            providerType,
		APIKeyEncrypted: encrypted,
		APIKeyPreview:   crypto.APIKeyPreview(apiKey),
		BaseURL:         providerBaseURL(providerType),
		Model:           model,
		IsActive:        true,
	}

	saved, err := s.repo.Upsert(ctx, p)
	if err != nil {
		return nil, fmt.Errorf("failed to save provider: %w", err)
	}

	// Hot-swap the live client
	s.clientMgr.Set(aiservice.NewAIClientForProvider(providerType, apiKey, model))

	return saved, nil
}

// SetActiveProvider marks a provider type as active and deactivates all others.
func (s *AIProviderService) SetActiveProvider(ctx context.Context, userID bson.ObjectID, providerType string) (*domain.AIProvider, error) {
	provider, err := s.repo.GetByUserAndType(ctx, userID, providerType)
	if err != nil {
		return nil, err
	}
	if provider == nil {
		return nil, &domain.AppError{Code: 404, Message: providerType + " provider not configured"}
	}

	// Deactivate all, then activate this one
	if err := s.repo.DeactivateAll(ctx, userID); err != nil {
		return nil, fmt.Errorf("failed to deactivate providers: %w", err)
	}
	saved, err := s.repo.SetActive(ctx, userID, providerType)
	if err != nil {
		return nil, fmt.Errorf("failed to activate provider: %w", err)
	}

	// Hot-swap the live client with this provider
	decrypted, err := crypto.Decrypt(provider.APIKeyEncrypted, s.encryptionKey)
	if err == nil {
		s.clientMgr.Set(aiservice.NewAIClientForProvider(providerType, decrypted, provider.Model))
	}

	return saved, nil
}

// UpdateModel changes only the model for an existing provider config.
func (s *AIProviderService) UpdateModel(ctx context.Context, userID bson.ObjectID, providerType, model string) (*domain.AIProvider, error) {
	if model == "" {
		return nil, &domain.AppError{Code: 400, Message: "model is required"}
	}

	existing, err := s.repo.GetByUserAndType(ctx, userID, providerType)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, &domain.AppError{Code: 404, Message: providerType + " provider not configured"}
	}

	saved, err := s.repo.UpdateModel(ctx, userID, providerType, model)
	if err != nil {
		return nil, fmt.Errorf("failed to update model: %w", err)
	}

	// Hot-swap with the same key but new model if this is the active provider
	if existing.IsActive {
		decrypted, err := crypto.Decrypt(existing.APIKeyEncrypted, s.encryptionKey)
		if err == nil {
			s.clientMgr.Set(aiservice.NewAIClientForProvider(providerType, decrypted, model))
		}
	}

	return saved, nil
}

// DeleteProvider removes a provider config and clears the live client if it was active.
func (s *AIProviderService) DeleteProvider(ctx context.Context, userID bson.ObjectID, providerType string) error {
	existing, err := s.repo.GetByUserAndType(ctx, userID, providerType)
	if err != nil {
		return err
	}

	if err := s.repo.Delete(ctx, userID, providerType); err != nil {
		return fmt.Errorf("failed to delete provider: %w", err)
	}

	// If the deleted provider was active, clear the live client.
	// Try to fall back to another configured provider.
	if existing != nil && existing.IsActive {
		providers, _ := s.repo.GetByUser(ctx, userID)
		if len(providers) > 0 {
			// Activate the first remaining provider
			p := providers[0]
			_, _ = s.repo.SetActive(ctx, userID, p.Type)
			decrypted, err := crypto.Decrypt(p.APIKeyEncrypted, s.encryptionKey)
			if err == nil {
				s.clientMgr.Set(aiservice.NewAIClientForProvider(p.Type, decrypted, p.Model))
			}
		} else {
			s.clientMgr.Set(nil)
		}
	}
	return nil
}

// TestProvider tests connectivity using the stored key for the given provider type.
func (s *AIProviderService) TestProvider(ctx context.Context, userID bson.ObjectID, providerType string) (*domain.ProviderTestResult, error) {
	p, err := s.repo.GetByUserAndType(ctx, userID, providerType)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, &domain.AppError{Code: 404, Message: providerType + " provider not configured"}
	}

	decrypted, err := crypto.Decrypt(p.APIKeyEncrypted, s.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API key: %w", err)
	}

	latency, testErr := aiservice.TestClient(ctx, providerType, decrypted, p.Model)

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

// BootstrapFromDB reads the active provider from the database and initializes the
// ClientManager. Called once on startup after repository is available.
func (s *AIProviderService) BootstrapFromDB(ctx context.Context) {
	// We don't have a user ID at startup, so find any active provider.
	// In a multi-user app, the client manager is per-request; for this
	// single-user desktop app we pick the first active one we find.
	providers, err := s.repo.FindAllActive(ctx)
	if err != nil || len(providers) == 0 {
		return
	}
	p := providers[0]
	decrypted, err := crypto.Decrypt(p.APIKeyEncrypted, s.encryptionKey)
	if err != nil {
		return
	}
	s.clientMgr.Set(aiservice.NewAIClientForProvider(p.Type, decrypted, p.Model))
}

// BootstrapFromEnv initialises the ClientManager from the KILO_API_KEY env var value.
// This is a backward-compat fallback — the DB-stored provider takes precedence.
func (s *AIProviderService) BootstrapFromEnv(apiKey string) {
	if apiKey != "" && !s.clientMgr.IsConfigured() {
		s.clientMgr.Set(aiservice.NewKiloClient(apiKey))
	}
}

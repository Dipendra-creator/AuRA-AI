package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// AIProvider stores an AI provider configuration for a user.
// Supports Kilo Code ("kilo_code") and GitHub Copilot ("github_copilot").
type AIProvider struct {
	ID              bson.ObjectID `bson:"_id,omitempty"               json:"id"`
	UserID          bson.ObjectID `bson:"user_id"                     json:"userId"`
	Type            string        `bson:"type"                        json:"type"`                    // e.g. "kilo_code"
	APIKeyEncrypted string        `bson:"api_key_encrypted,omitempty" json:"-"`                       // AES-256-GCM — never returned to client
	APIKeyPreview   string        `bson:"api_key_preview,omitempty"   json:"apiKeyPreview,omitempty"` // e.g. "...sk3f"
	BaseURL         string        `bson:"base_url,omitempty"          json:"baseUrl,omitempty"`
	Model           string        `bson:"model,omitempty"             json:"model,omitempty"`
	IsActive        bool          `bson:"is_active"                   json:"isActive"`
	CreatedAt       time.Time     `bson:"created_at"                  json:"createdAt"`
	UpdatedAt       time.Time     `bson:"updated_at"                  json:"updatedAt"`
}

// ProviderTestResult captures the result of a connectivity test against a provider.
type ProviderTestResult struct {
	Success   bool      `json:"success"`
	LatencyMs int64     `json:"latencyMs"`
	Message   string    `json:"message"`
	TestedAt  time.Time `json:"testedAt"`
}

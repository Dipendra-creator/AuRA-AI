package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const aiProvidersCollection = "ai_providers"

// AIProviderRepo handles persistence for AI provider configurations.
type AIProviderRepo struct {
	col *mongo.Collection
}

// NewAIProviderRepo creates a new AIProviderRepo and ensures required indexes exist.
func NewAIProviderRepo(db *mongo.Database) *AIProviderRepo {
	col := db.Collection(aiProvidersCollection)
	ctx := context.Background()
	_, _ = col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "user_id", Value: 1}}},
		// Enforce one config per (user, provider type)
		{
			Keys:    bson.D{{Key: "user_id", Value: 1}, {Key: "type", Value: 1}},
			Options: options.Index().SetUnique(true),
		},
	})
	return &AIProviderRepo{col: col}
}

// GetByUserAndType returns the config for a specific user and provider type, or nil if not found.
func (r *AIProviderRepo) GetByUserAndType(ctx context.Context, userID bson.ObjectID, providerType string) (*domain.AIProvider, error) {
	var p domain.AIProvider
	err := r.col.FindOne(ctx, bson.M{"user_id": userID, "type": providerType}).Decode(&p)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetByUser returns all provider configs for a user.
func (r *AIProviderRepo) GetByUser(ctx context.Context, userID bson.ObjectID) ([]domain.AIProvider, error) {
	cur, err := r.col.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var providers []domain.AIProvider
	if err := cur.All(ctx, &providers); err != nil {
		return nil, err
	}
	return providers, nil
}

// Upsert creates or updates an AI provider config for the given user/type pair.
func (r *AIProviderRepo) Upsert(ctx context.Context, p *domain.AIProvider) (*domain.AIProvider, error) {
	now := time.Now()
	filter := bson.M{"user_id": p.UserID, "type": p.Type}
	update := bson.M{
		"$set": bson.M{
			"api_key_encrypted": p.APIKeyEncrypted,
			"api_key_preview":   p.APIKeyPreview,
			"base_url":          p.BaseURL,
			"model":             p.Model,
			"is_active":         p.IsActive,
			"updated_at":        now,
		},
		"$setOnInsert": bson.M{
			"user_id":    p.UserID,
			"type":       p.Type,
			"created_at": now,
		},
	}

	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(options.After)

	var result domain.AIProvider
	if err := r.col.FindOneAndUpdate(ctx, filter, update, opts).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpdateModel updates only the model field for an existing provider config.
// Returns nil if no matching document was found.
func (r *AIProviderRepo) UpdateModel(ctx context.Context, userID bson.ObjectID, providerType, model string) (*domain.AIProvider, error) {
	filter := bson.M{"user_id": userID, "type": providerType}
	update := bson.M{
		"$set": bson.M{
			"model":      model,
			"updated_at": time.Now(),
		},
	}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var result domain.AIProvider
	err := r.col.FindOneAndUpdate(ctx, filter, update, opts).Decode(&result)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// Delete removes the provider config for a given user and type.
func (r *AIProviderRepo) Delete(ctx context.Context, userID bson.ObjectID, providerType string) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"user_id": userID, "type": providerType})
	return err
}

// DeactivateAll sets is_active=false for all providers belonging to a user.
func (r *AIProviderRepo) DeactivateAll(ctx context.Context, userID bson.ObjectID) error {
	_, err := r.col.UpdateMany(ctx, bson.M{"user_id": userID}, bson.M{
		"$set": bson.M{"is_active": false, "updated_at": time.Now()},
	})
	return err
}

// SetActive marks a specific provider as active for a user. Returns the updated document.
func (r *AIProviderRepo) SetActive(ctx context.Context, userID bson.ObjectID, providerType string) (*domain.AIProvider, error) {
	filter := bson.M{"user_id": userID, "type": providerType}
	update := bson.M{
		"$set": bson.M{"is_active": true, "updated_at": time.Now()},
	}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var result domain.AIProvider
	err := r.col.FindOneAndUpdate(ctx, filter, update, opts).Decode(&result)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// FindAllActive returns all provider configs across all users where is_active=true.
func (r *AIProviderRepo) FindAllActive(ctx context.Context) ([]domain.AIProvider, error) {
	cur, err := r.col.Find(ctx, bson.M{"is_active": true})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var providers []domain.AIProvider
	if err := cur.All(ctx, &providers); err != nil {
		return nil, err
	}
	return providers, nil
}

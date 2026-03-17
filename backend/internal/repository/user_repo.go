// Package repository provides MongoDB persistence for all domain entities.
package repository

import (
	"context"
	"time"

	"github.com/aura-ai/backend/internal/domain"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// UserRepo handles persistence for User entities.
type UserRepo struct {
	col *mongo.Collection
}

// NewUserRepo creates a new UserRepo backed by the given database.
func NewUserRepo(db *mongo.Database) *UserRepo {
	col := db.Collection("users")

	// Ensure unique index on email
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	col.Indexes().CreateOne(ctx, mongo.IndexModel{ //nolint:errcheck
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	return &UserRepo{col: col}
}

// FindByEmail returns the user with the given email, or nil if not found.
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	err := r.col.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByID returns the user with the given ObjectID hex string.
func (r *UserRepo) FindByID(ctx context.Context, id string) (*domain.User, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	var user domain.User
	err = r.col.FindOne(ctx, bson.M{"_id": oid}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByProvider returns a user matched by OAuth provider + provider user ID.
func (r *UserRepo) FindByProvider(ctx context.Context, provider domain.AuthProvider, providerID string) (*domain.User, error) {
	var user domain.User
	err := r.col.FindOne(ctx, bson.M{
		"provider":    provider,
		"provider_id": providerID,
	}).Decode(&user)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdateProfile updates the mutable fields of a user (name, avatar_url).
// Only non-empty values in the updates map are applied.
func (r *UserRepo) UpdateProfile(ctx context.Context, id string, updates map[string]interface{}) (*domain.User, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, domain.ErrNotFound
	}
	updates["updated_at"] = time.Now()
	_, err = r.col.UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": updates})
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

// UpdatePasswordHash replaces the password hash for a local user.
func (r *UserRepo) UpdatePasswordHash(ctx context.Context, id string, hash string) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return domain.ErrNotFound
	}
	_, err = r.col.UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": bson.M{
		"password_hash": hash,
		"updated_at":    time.Now(),
	}})
	return err
}

// Create inserts a new user and returns it with the generated ID.
func (r *UserRepo) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	user.ID = bson.NewObjectID()
	now := time.Now()
	user.CreatedAt = now
	user.UpdatedAt = now

	_, err := r.col.InsertOne(ctx, user)
	if err != nil {
		return nil, err
	}
	return user, nil
}

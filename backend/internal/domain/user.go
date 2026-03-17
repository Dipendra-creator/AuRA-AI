// Package domain defines the core business entities and shared types.
package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// AuthProvider identifies the authentication method used.
type AuthProvider string

const (
	AuthProviderLocal  AuthProvider = "local"
	AuthProviderGitHub AuthProvider = "github"
)

// User represents an authenticated user of Aura AI.
type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Email        string             `bson:"email" json:"email"`
	Name         string             `bson:"name" json:"name"`
	PasswordHash string        `bson:"password_hash,omitempty" json:"-"`
	Provider     AuthProvider  `bson:"provider" json:"provider"`
	ProviderID   string        `bson:"provider_id,omitempty" json:"provider_id,omitempty"`
	AvatarURL    string        `bson:"avatar_url,omitempty" json:"avatar_url,omitempty"`
	CreatedAt    time.Time     `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time     `bson:"updated_at" json:"updated_at"`
}

// UserPublic is a safe-to-expose user representation (no password hash).
type UserPublic struct {
	ID        string       `json:"id"`
	Email     string       `json:"email"`
	Name      string       `json:"name"`
	Provider  AuthProvider `json:"provider"`
	AvatarURL string       `json:"avatar_url,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
}

// ToPublic converts a User to its safe public form.
func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:        u.ID.Hex(),
		Email:     u.Email,
		Name:      u.Name,
		Provider:  u.Provider,
		AvatarURL: u.AvatarURL,
		CreatedAt: u.CreatedAt,
	}
}

// contextKey is an unexported type to avoid context key collisions.
type contextKey string

// ContextKeyUser is the context key for storing the authenticated user.
const ContextKeyUser contextKey = "user"

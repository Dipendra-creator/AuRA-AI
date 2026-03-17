// Package middleware provides HTTP middleware for the Aura AI server.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/aura-ai/backend/internal/auth"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// RequireAuth validates the Bearer JWT and attaches the user to the request context.
// Returns 401 if the token is missing or invalid.
func RequireAuth(jwtSecret string, userRepo *repository.UserRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := extractBearerToken(r)
			if tokenString == "" {
				domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("authorization token required"))
				return
			}

			claims, err := auth.ParseToken(tokenString, jwtSecret)
			if err != nil {
				domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse(err.Error()))
				return
			}

			// Load full user from DB to ensure account still exists
			user, err := userRepo.FindByID(r.Context(), claims.UserID)
			if err != nil || user == nil {
				domain.WriteJSON(w, http.StatusUnauthorized, domain.ErrorResponse("user not found"))
				return
			}

			ctx := context.WithValue(r.Context(), domain.ContextKeyUser, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractBearerToken pulls the token from the Authorization header.
func extractBearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

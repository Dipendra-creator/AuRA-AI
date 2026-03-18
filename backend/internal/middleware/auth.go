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

// extractBearerToken pulls the JWT from the Authorization header first,
// then falls back to the ?token= query parameter.
// The query-param fallback is required for WebSocket connections: browsers
// cannot send custom headers during the HTTP upgrade handshake, so the WS
// client appends the token as ?token=<jwt> instead.
func extractBearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if header != "" {
		parts := strings.SplitN(header, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return strings.TrimSpace(parts[1])
		}
	}
	// Fallback: query param (used by WebSocket upgrade requests)
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}
	return ""
}

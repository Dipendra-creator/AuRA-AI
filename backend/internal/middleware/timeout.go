package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/aura-ai/backend/internal/domain"
)

// Timeout returns middleware that enforces a request timeout.
func Timeout(d time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d)
			defer cancel()

			done := make(chan struct{})
			go func() {
				next.ServeHTTP(w, r.WithContext(ctx))
				close(done)
			}()

			select {
			case <-done:
				return
			case <-ctx.Done():
				domain.WriteJSON(w, http.StatusGatewayTimeout,
					domain.ErrorResponse("request timeout"))
			}
		})
	}
}

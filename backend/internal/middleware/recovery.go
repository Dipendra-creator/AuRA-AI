package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/aura-ai/backend/internal/domain"
)

// Recovery returns middleware that recovers from panics and returns a 500 error.
func Recovery() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					slog.Error("panic recovered",
						"error", err,
						"stack", string(debug.Stack()),
						"path", r.URL.Path,
					)
					domain.WriteJSON(w, http.StatusInternalServerError,
						domain.ErrorResponse("internal server error"))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

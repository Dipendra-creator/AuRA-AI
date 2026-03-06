package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
)

const headerRequestID = "X-Request-ID"

// RequestID returns middleware that injects a unique X-Request-ID header.
func RequestID() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get(headerRequestID)
			if id == "" {
				id = generateID()
			}
			w.Header().Set(headerRequestID, id)
			r.Header.Set(headerRequestID, id)
			next.ServeHTTP(w, r)
		})
	}
}

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b) //nolint:errcheck
	return hex.EncodeToString(b)
}

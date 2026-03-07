package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestID(t *testing.T) {
	middleware := RequestID()

	// Create a dummy handler to check the context passed.
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(headerRequestID)
		if id == "" {
			t.Errorf("expected %s header to be set in request, got empty", headerRequestID)
		}
	})

	handler := middleware(nextHandler)

	t.Run("Generates New Request ID when missing", func(t *testing.T) {
		req := httptest.NewRequest("GET", "http://example.com/foo", nil)
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		res := rr.Result()
		id := res.Header.Get(headerRequestID)
		if id == "" {
			t.Errorf("expected %s header to be set in response, got empty", headerRequestID)
		}
	})

	t.Run("Preserves Existing Request ID", func(t *testing.T) {
		expectedID := "custom-request-id-123"
		req := httptest.NewRequest("GET", "http://example.com/foo", nil)
		req.Header.Set(headerRequestID, expectedID)

		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		res := rr.Result()
		id := res.Header.Get(headerRequestID)
		if id != expectedID {
			t.Errorf("expected %s to be preserved, got %s", headerRequestID, id)
		}
	})
}

func TestGenerateID(t *testing.T) {
	id1 := generateID()
	id2 := generateID()

	if id1 == "" {
		t.Error("generateID returned empty string")
	}

	if id1 == id2 {
		t.Errorf("generateID returning duplicate IDs: %s", id1)
	}

	if len(id1) != 16 {
		t.Errorf("expected generated ID length 16, got %d", len(id1))
	}
}

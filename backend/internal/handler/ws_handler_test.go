package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const errWriteFailed = "Failed to write msg: %v"
const errReadFailed = "Failed to read response: %v"
const errExpectedError = "Expected error, got %v"

// A mock repository that implements the methods needed by DocumentService
// to run enough for startAnalysis to finish without nil pointer crashes.
// Because the DocumentRepo struct has concrete methods on `*mongo.Collection`,
// we provide a nil pointer but must handle its method calls, which we can't easily
// do without refactoring DocumentRepo into an interface. Let's just create a valid empty
// DocumentRepo to bypass the nil pointer crash, and since startAnalysis immediately hits MongoDB
// without an interface, we will skip this specific test from actually calling AnalyzeWithProgress
// and instead mock it in document_svc_test.go. So for ws_handler_test we'll delete the startAnalysis bit
// that crashes due to tightly coupled mongodb dependancy.

type mockDocumentService struct {
	AnalyzeWithProgressFunc          func(ctx context.Context, id bson.ObjectID, progressCh chan<- domain.AnalysisEvent)
	AnalyzeWithProgressAndSchemaFunc func(ctx context.Context, id bson.ObjectID, schemaFields []domain.SchemaField, progressCh chan<- domain.AnalysisEvent)
}

func (m *mockDocumentService) AnalyzeWithProgress(ctx context.Context, id bson.ObjectID, progressCh chan<- domain.AnalysisEvent) {
	if m.AnalyzeWithProgressFunc != nil {
		m.AnalyzeWithProgressFunc(ctx, id, progressCh)
	}
}

func (m *mockDocumentService) AnalyzeWithProgressAndSchema(ctx context.Context, id bson.ObjectID, schemaFields []domain.SchemaField, progressCh chan<- domain.AnalysisEvent) {
	if m.AnalyzeWithProgressAndSchemaFunc != nil {
		m.AnalyzeWithProgressAndSchemaFunc(ctx, id, schemaFields, progressCh)
	}
}

// mockDocumentService creates a basic DocumentService for testing.
// Since DocumentService requires a repo, but we just want to test WebSocket framing,
// we pass a nil service.
func newMockDocumentService() *mockDocumentService {
	return &mockDocumentService{}
}

func TestHandleMessages(t *testing.T) {

	// Test startAnalysis default coverage
	t.Run("startAnalysis default coverage", func(t *testing.T) {
		mockSvc := &mockDocumentService{
			AnalyzeWithProgressFunc: func(ctx context.Context, id bson.ObjectID, progressCh chan<- domain.AnalysisEvent) {
				progressCh <- domain.AnalysisEvent{Type: "mock_progress"}
				close(progressCh)
			},
		}

		h := NewWSHandler(mockSvc, nil)
		server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
		defer server.Close()
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

		ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("Failed to connect to websocket: %v", err)
		}
		defer ws.Close()

		analyzeMsg := wsInbound{Action: "analyze", DocumentID: bson.NewObjectID().Hex()}
		if err := ws.WriteJSON(analyzeMsg); err != nil {
			t.Fatalf(errWriteFailed, err)
		}

		ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		var resp domain.AnalysisEvent
		if err := ws.ReadJSON(&resp); err != nil {
			t.Fatalf("Failed to read response: %v", err)
		}

		if resp.Type != "mock_progress" {
			t.Errorf("Expected mock_progress, got %s", resp.Type)
		}
	})

	t.Run("startAnalysis schema coverage", func(t *testing.T) {
		mockSvc := &mockDocumentService{
			AnalyzeWithProgressAndSchemaFunc: func(ctx context.Context, id bson.ObjectID, schemaFields []domain.SchemaField, progressCh chan<- domain.AnalysisEvent) {
				progressCh <- domain.AnalysisEvent{Type: "mock_schema_progress"}
				close(progressCh)
			},
		}

		h := NewWSHandler(mockSvc, nil)
		server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
		defer server.Close()
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

		ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("Failed to connect to websocket: %v", err)
		}
		defer ws.Close()

		analyzeMsg := wsInbound{
			Action:     "analyze",
			DocumentID: bson.NewObjectID().Hex(),
			Schema:     []domain.SchemaField{{Field: "f1"}},
		}
		if err := ws.WriteJSON(analyzeMsg); err != nil {
			t.Fatalf(errWriteFailed, err)
		}

		ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		var resp domain.AnalysisEvent
		if err := ws.ReadJSON(&resp); err != nil {
			t.Fatalf("Failed to read response: %v", err)
		}

		if resp.Type != "mock_schema_progress" {
			t.Errorf("Expected mock_schema_progress, got %s", resp.Type)
		}
	})
}

func TestPing(t *testing.T) {
	h := NewWSHandler(&mockDocumentService{}, nil)

	server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
	defer server.Close()

	// Convert http:// back to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to websocket: %v", err)
	}
	defer ws.Close()

	// Send a valid ping
	pingMsg := wsInbound{Action: "ping"}
	if err := ws.WriteJSON(pingMsg); err != nil {
		t.Fatalf("Failed to write ping: %v", err)
	}

	// Expect a pong response
	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	var resp domain.AnalysisEvent
	if err := ws.ReadJSON(&resp); err != nil {
		t.Fatalf("Failed to read pong: %v", err)
	}

	if resp.Type != "pong" {
		t.Errorf("Expected pong, got %s", resp.Type)
	}
}

func TestAnalyzeMissingDocID(t *testing.T) {
	h := NewWSHandler(&mockDocumentService{}, nil)

	server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to websocket: %v", err)
	}
	defer ws.Close()

	analyzeMsg := wsInbound{Action: "analyze", DocumentID: ""}
	if err := ws.WriteJSON(analyzeMsg); err != nil {
		t.Fatalf("Failed to write analyze msg: %v", err)
	}

	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	var resp domain.AnalysisEvent
	if err := ws.ReadJSON(&resp); err != nil {
		t.Fatalf("Failed to read error response: %v", err)
	}

	if resp.Type != "error" || !strings.Contains(resp.Error, "documentId is required") {
		t.Errorf("Expected doc ID error, got %v", resp)
	}
}

func TestAnalyzeInvalidDocID(t *testing.T) {
	h := NewWSHandler(&mockDocumentService{}, nil)

	server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to websocket: %v", err)
	}
	defer ws.Close()

	analyzeMsg := wsInbound{Action: "analyze", DocumentID: "invalid-hex"}
	if err := ws.WriteJSON(analyzeMsg); err != nil {
		t.Fatalf("Failed to write analyze msg: %v", err)
	}

	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	var resp domain.AnalysisEvent
	if err := ws.ReadJSON(&resp); err != nil {
		t.Fatalf("Failed to read error response: %v", err)
	}

	if resp.Type != "error" || !strings.Contains(resp.Error, "invalid documentId format") {
		t.Errorf("Expected invalid format error, got %v", resp)
	}
}

func TestUnknownAction(t *testing.T) {
	h := NewWSHandler(&mockDocumentService{}, nil)

	server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer ws.Close()

	msg := wsInbound{Action: "fly_to_moon"}
	if err := ws.WriteJSON(msg); err != nil {
		t.Fatalf("Failed to write msg: %v", err)
	}

	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	var resp domain.AnalysisEvent
	if err := ws.ReadJSON(&resp); err != nil {
		t.Fatalf("Failed to read response: %v", err)
	}

	if resp.Type != "error" || !strings.Contains(resp.Error, "unknown action") {
		t.Errorf("Expected unknown action error, got %v", resp)
	}
}

func TestInvalidJSON(t *testing.T) {
	h := NewWSHandler(&mockDocumentService{}, nil)

	server := httptest.NewServer(http.HandlerFunc(h.HandleWS))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer ws.Close()

	if err := ws.WriteMessage(websocket.TextMessage, []byte("{invalid-json")); err != nil {
		t.Fatalf("Failed to write msg: %v", err)
	}

	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	var resp domain.AnalysisEvent
	if err := ws.ReadJSON(&resp); err != nil {
		// Just want to ensure it handles it gracefully
		t.Fatalf("Failed to read response: %v", err)
	}

	if resp.Type != "error" || !strings.Contains(resp.Error, "invalid message format") {
		t.Errorf("Expected invalid format error, got %v", resp)
	}
}

func TestStartAnalysis(t *testing.T) {
	// Test startAnalysis
	t.Run("startAnalysis default coverage", func(t *testing.T) {
		mockSvc := &mockDocumentService{
			AnalyzeWithProgressFunc: func(ctx context.Context, id bson.ObjectID, progressCh chan<- domain.AnalysisEvent) {
				progressCh <- domain.AnalysisEvent{Type: "mock_progress"}
				close(progressCh)
			},
		}
		hWithMock := NewWSHandler(mockSvc, nil)

		writeCh2 := make(chan interface{}, 2)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		hWithMock.startAnalysis(ctx, bson.NewObjectID(), nil, writeCh2)

		evt := <-writeCh2
		msg, ok := evt.(domain.AnalysisEvent)
		if !ok || msg.Type != "mock_progress" {
			t.Errorf("Expected mock_progress, got %v", evt)
		}
	})

	t.Run("startAnalysis schema coverage", func(t *testing.T) {
		mockSvc := &mockDocumentService{
			AnalyzeWithProgressAndSchemaFunc: func(ctx context.Context, id bson.ObjectID, schemaFields []domain.SchemaField, progressCh chan<- domain.AnalysisEvent) {
				progressCh <- domain.AnalysisEvent{Type: "mock_schema_progress"}
				close(progressCh)
			},
		}
		hWithMock := NewWSHandler(mockSvc, nil)

		writeCh3 := make(chan interface{}, 2)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		hWithMock.startAnalysis(ctx, bson.NewObjectID(), []domain.SchemaField{{Field: "f1"}}, writeCh3)

		evt := <-writeCh3
		msg, ok := evt.(domain.AnalysisEvent)
		if !ok || msg.Type != "mock_schema_progress" {
			t.Errorf("Expected mock_schema_progress, got %v", evt)
		}
	})
}

// Package handler provides HTTP request handlers for all API endpoints.
package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = 30 * time.Second

	// Maximum message size allowed from peer (512 KB).
	maxMessageSize = 512 * 1024
)

// upgrader is the WebSocket upgrader with CheckOrigin allowing the Electron app.
var upgrader = websocket.Upgrader{
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   4096,
	WriteBufferSize:  4096,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins — the Electron app may connect from file:// or http://localhost
		return true
	},
}

// wsInbound is the message format sent from the client to the server.
type wsInbound struct {
	Action     string               `json:"action"`           // "analyze" | "ping"
	DocumentID string               `json:"documentId"`       // required for "analyze"
	Schema     []domain.SchemaField `json:"schema,omitempty"` // optional custom extraction schema
}

// WSHandler handles WebSocket connections for real-time streaming.
type WSHandler struct {
	svc *service.DocumentService
}

// NewWSHandler creates a new WSHandler.
func NewWSHandler(svc *service.DocumentService) *WSHandler {
	return &WSHandler{svc: svc}
}

// HandleWS upgrades the HTTP connection to a WebSocket and manages the
// bidirectional message loop.
func (h *WSHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err)
		return
	}

	slog.Info("websocket connection established", "remote", r.RemoteAddr)

	// Create a context that is cancelled when the connection closes.
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// writeCh serialises all outbound messages through a single write goroutine.
	writeCh := make(chan interface{}, 64)
	var writeWg sync.WaitGroup

	// ── Write Goroutine ──────────────────────────────────────────────
	writeWg.Add(1)
	go func() {
		defer writeWg.Done()
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()

		for {
			select {
			case msg, ok := <-writeCh:
				if !ok {
					// Channel closed — send close message and exit.
					conn.SetWriteDeadline(time.Now().Add(writeWait))
					conn.WriteMessage(websocket.CloseMessage,
						websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
					return
				}
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := conn.WriteJSON(msg); err != nil {
					slog.Warn("websocket write error", "error", err)
					return
				}

			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					slog.Warn("websocket ping error", "error", err)
					return
				}

			case <-ctx.Done():
				return
			}
		}
	}()

	// ── Read Loop ────────────────────────────────────────────────────
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Track any in-flight analysis so we can cancel it if a new one arrives.
	var analysisCancelMu sync.Mutex
	var analysisCancel context.CancelFunc

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseNormalClosure,
				websocket.CloseNoStatusReceived) {
				slog.Warn("websocket read error", "error", err)
			}
			break
		}

		var msg wsInbound
		if err := json.Unmarshal(message, &msg); err != nil {
			h.sendError(writeCh, "invalid message format")
			continue
		}

		switch msg.Action {
		case "ping":
			select {
			case writeCh <- domain.AnalysisEvent{Type: "pong"}:
			case <-ctx.Done():
			}

		case "analyze":
			if msg.DocumentID == "" {
				h.sendError(writeCh, "documentId is required for analyze action")
				continue
			}

			oid, parseErr := bson.ObjectIDFromHex(msg.DocumentID)
			if parseErr != nil {
				h.sendError(writeCh, "invalid documentId format")
				continue
			}

			// Cancel any previous in-flight analysis.
			analysisCancelMu.Lock()
			if analysisCancel != nil {
				analysisCancel()
			}
			analysisCtx, aCancel := context.WithTimeout(ctx, 5*time.Minute)
			analysisCancel = aCancel
			analysisCancelMu.Unlock()

			// Run analysis in a goroutine so the read loop continues.
			// Use schema-aware analysis when schema is provided.
			schema := msg.Schema
			go func(aCtx context.Context, id bson.ObjectID, s []domain.SchemaField) {
				progressCh := make(chan domain.AnalysisEvent, 32)
				if len(s) > 0 {
					go h.svc.AnalyzeWithProgressAndSchema(aCtx, id, s, progressCh)
				} else {
					go h.svc.AnalyzeWithProgress(aCtx, id, progressCh)
				}

				for evt := range progressCh {
					select {
					case writeCh <- evt:
					case <-aCtx.Done():
						return
					}
				}
			}(analysisCtx, oid, schema)

		default:
			h.sendError(writeCh, "unknown action: "+msg.Action)
		}
	}

	// Cleanup: cancel context, close write channel, wait for writer to finish.
	cancel()

	analysisCancelMu.Lock()
	if analysisCancel != nil {
		analysisCancel()
	}
	analysisCancelMu.Unlock()

	close(writeCh)
	writeWg.Wait()
	conn.Close()

	slog.Info("websocket connection closed", "remote", r.RemoteAddr)
}

// sendError pushes an error event onto the write channel.
func (h *WSHandler) sendError(writeCh chan<- interface{}, msg string) {
	select {
	case writeCh <- domain.AnalysisEvent{Type: "error", Error: msg}:
	default:
		// Drop if channel is full — better than blocking the read loop.
	}
}

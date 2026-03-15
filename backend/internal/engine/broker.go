package engine

import (
	"log/slog"
	"sync"

	"github.com/aura-ai/backend/internal/domain"
)

// PipelineEventBroker fans out pipeline events to all registered subscribers
// for a given run ID. It is safe for concurrent use.
type PipelineEventBroker struct {
	mu          sync.RWMutex
	subscribers map[string][]chan domain.PipelineEvent
}

// NewPipelineEventBroker creates a new PipelineEventBroker.
func NewPipelineEventBroker() *PipelineEventBroker {
	return &PipelineEventBroker{
		subscribers: make(map[string][]chan domain.PipelineEvent),
	}
}

// Subscribe registers a channel to receive events for the given runID.
// Returns a channel that will receive events and an unsubscribe function.
// The caller must drain the channel until it is closed.
func (b *PipelineEventBroker) Subscribe(runID string) (<-chan domain.PipelineEvent, func()) {
	ch := make(chan domain.PipelineEvent, 64)

	b.mu.Lock()
	b.subscribers[runID] = append(b.subscribers[runID], ch)
	b.mu.Unlock()

	unsub := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		subs := b.subscribers[runID]
		for i, sub := range subs {
			if sub == ch {
				b.subscribers[runID] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		if len(b.subscribers[runID]) == 0 {
			delete(b.subscribers, runID)
		}
	}

	return ch, unsub
}

// Publish sends an event to all subscribers for the run identified by event.RunID.
// Channels that are full receive a warning and the event is dropped for that subscriber.
func (b *PipelineEventBroker) Publish(event domain.PipelineEvent) {
	b.mu.RLock()
	subs := b.subscribers[event.RunID]
	if len(subs) == 0 {
		b.mu.RUnlock()
		return
	}
	// Copy slice under read lock so we can iterate without holding it.
	targets := make([]chan domain.PipelineEvent, len(subs))
	copy(targets, subs)
	b.mu.RUnlock()

	for _, ch := range targets {
		select {
		case ch <- event:
		default:
			slog.Warn("broker: subscriber channel full, dropping event",
				"runId", event.RunID,
				"type", event.Type,
			)
		}
	}
}

// CloseRun closes and removes all subscriber channels for the given runID.
// Call this when a run reaches a terminal state (completed, failed, cancelled).
func (b *PipelineEventBroker) CloseRun(runID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	subs := b.subscribers[runID]
	for _, ch := range subs {
		close(ch)
	}
	delete(b.subscribers, runID)
}

// NewProgressChannel creates a buffered channel and a goroutine that publishes
// every event on it to the broker. The returned channel should be passed to
// executor.Execute or executor.Resume as the progressCh.
// The broker.CloseRun is called automatically after the channel is drained.
func (b *PipelineEventBroker) NewProgressChannel(runID string) chan<- domain.PipelineEvent {
	// Larger buffer so the executor is unlikely to block.
	ch := make(chan domain.PipelineEvent, 128)
	go func() {
		for evt := range ch {
			b.Publish(evt)
		}
		// Channel was closed by the executor (defer close) — close subscribers.
		b.CloseRun(runID)
	}()
	return ch
}

package engine

import (
	"log/slog"
	"sync"
	"time"

	"github.com/aura-ai/backend/internal/domain"
)

// replayEntry holds the terminal events for a completed run so late subscribers
// can receive them without missing the result.
type replayEntry struct {
	events    []domain.PipelineEvent
	expiresAt time.Time
}

// PipelineEventBroker fans out pipeline events to all registered subscribers
// for a given run ID. It is safe for concurrent use.
type PipelineEventBroker struct {
	mu          sync.RWMutex
	subscribers map[string][]chan domain.PipelineEvent
	replays     map[string]*replayEntry // runID → terminal events for late subscribers
}

// NewPipelineEventBroker creates a new PipelineEventBroker.
func NewPipelineEventBroker() *PipelineEventBroker {
	return &PipelineEventBroker{
		subscribers: make(map[string][]chan domain.PipelineEvent),
		replays:     make(map[string]*replayEntry),
	}
}

// Subscribe registers a channel to receive events for the given runID.
// Returns a channel that will receive events and an unsubscribe function.
// If the run already completed, the replay events are delivered immediately
// and the returned channel will be closed shortly after — no events are missed.
func (b *PipelineEventBroker) Subscribe(runID string) (<-chan domain.PipelineEvent, func()) {
	ch := make(chan domain.PipelineEvent, 64)

	b.mu.Lock()
	// Check for a replay buffer (run already completed before we subscribed).
	if entry, ok := b.replays[runID]; ok && time.Now().Before(entry.expiresAt) {
		b.mu.Unlock()
		go func() {
			for _, evt := range entry.events {
				ch <- evt
			}
			close(ch)
		}()
		return ch, func() {} // no-op unsub for replay channels
	}

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
	b.mu.Lock()
	subs := b.subscribers[event.RunID]
	targets := make([]chan domain.PipelineEvent, len(subs))
	copy(targets, subs)

	// Accumulate replay events (all pipeline:run:* terminal events + node events).
	// We keep a rolling buffer; terminal events are the ones that matter most.
	if entry, ok := b.replays[event.RunID]; ok {
		entry.events = append(entry.events, event)
	} else {
		b.replays[event.RunID] = &replayEntry{
			events:    []domain.PipelineEvent{event},
			expiresAt: time.Now().Add(60 * time.Second),
		}
	}
	b.mu.Unlock()

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

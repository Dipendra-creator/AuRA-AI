package repository

import (
	"context"
	"fmt"
	"math"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const activityCollection = "activity_events"

// ActivityRepo handles MongoDB operations for activity events.
type ActivityRepo struct {
	coll *mongo.Collection
}

// NewActivityRepo creates a new ActivityRepo.
func NewActivityRepo(db *mongo.Database) *ActivityRepo {
	return &ActivityRepo{coll: db.Collection(activityCollection)}
}

// List returns recent activity events.
func (r *ActivityRepo) List(ctx context.Context, limit int) ([]domain.ActivityEvent, error) {
	if limit <= 0 {
		limit = 20
	}
	opts := options.Find().SetSort(bson.M{"created_at": -1}).SetLimit(int64(limit))
	cursor, err := r.coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var events []domain.ActivityEvent
	if err := cursor.All(ctx, &events); err != nil {
		return nil, err
	}

	// Compute human-readable timestamps
	now := time.Now()
	for i := range events {
		events[i].Timestamp = humanizeTimestamp(events[i].CreatedAt, now)
	}

	if events == nil {
		events = []domain.ActivityEvent{}
	}
	return events, nil
}

// Create inserts a new activity event.
func (r *ActivityRepo) Create(ctx context.Context, input domain.CreateActivityInput) (*domain.ActivityEvent, error) {
	event := domain.ActivityEvent{
		Type:      input.Type,
		Title:     input.Title,
		Source:    input.Source,
		Icon:      input.Icon,
		CreatedAt: time.Now(),
	}

	result, err := r.coll.InsertOne(ctx, event)
	if err != nil {
		return nil, err
	}
	event.ID = result.InsertedID.(bson.ObjectID)
	event.Timestamp = "just now"
	return &event, nil
}

// InsertMany bulk-inserts events (used by seeder).
func (r *ActivityRepo) InsertMany(ctx context.Context, events []domain.ActivityEvent) error {
	ifaces := make([]interface{}, len(events))
	for i, e := range events {
		ifaces[i] = e
	}
	_, err := r.coll.InsertMany(ctx, ifaces)
	return err
}

// humanizeTimestamp converts a time.Time to a human-readable relative string.
func humanizeTimestamp(t time.Time, now time.Time) string {
	diff := now.Sub(t)
	minutes := int(math.Round(diff.Minutes()))
	hours := int(math.Round(diff.Hours()))
	days := int(math.Round(diff.Hours() / 24))

	switch {
	case minutes < 1:
		return "just now"
	case minutes == 1:
		return "1 min ago"
	case minutes < 60:
		return fmt.Sprintf("%d mins ago", minutes)
	case hours == 1:
		return "1 hour ago"
	case hours < 24:
		return fmt.Sprintf("%d hours ago", hours)
	case days == 1:
		return "1 day ago"
	default:
		return fmt.Sprintf("%d days ago", days)
	}
}

package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ActivityEventType classifies the kind of activity event.
type ActivityEventType string

const (
	EventProcessed ActivityEventType = "processed"
	EventSystem    ActivityEventType = "system"
	EventCreated   ActivityEventType = "created"
	EventReview    ActivityEventType = "review"
)

// ActivityEventIcon specifies the icon shown for an activity event.
type ActivityEventIcon string

const (
	IconCheck   ActivityEventIcon = "check"
	IconRefresh ActivityEventIcon = "refresh"
	IconPlus    ActivityEventIcon = "plus"
	IconWarning ActivityEventIcon = "warning"
)

// ActivityEvent represents a timeline entry in the system activity log.
type ActivityEvent struct {
	ID        bson.ObjectID     `json:"id"        bson:"_id,omitempty"`
	Type      ActivityEventType `json:"type"      bson:"type"`
	Title     string            `json:"title"     bson:"title"`
	Timestamp string            `json:"timestamp" bson:"-"`
	Source    string            `json:"source"    bson:"source"`
	Icon      ActivityEventIcon `json:"icon"      bson:"icon"`
	CreatedAt time.Time         `json:"-"         bson:"created_at"`
}

// CreateActivityInput is the payload for logging a new activity event.
type CreateActivityInput struct {
	Type   ActivityEventType `json:"type"`
	Title  string            `json:"title"`
	Source string            `json:"source"`
	Icon   ActivityEventIcon `json:"icon"`
}

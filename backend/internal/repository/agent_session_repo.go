package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const agentSessionsCollection = "agent_sessions"

// AgentSessionRepo handles persistence for conversational agent sessions.
type AgentSessionRepo struct {
	col *mongo.Collection
}

// NewAgentSessionRepo creates a new AgentSessionRepo with required indexes.
func NewAgentSessionRepo(db *mongo.Database) *AgentSessionRepo {
	col := db.Collection(agentSessionsCollection)
	ctx := context.Background()
	_, _ = col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "last_activity_at", Value: -1}}},
	})
	return &AgentSessionRepo{col: col}
}

// Create inserts a new session document.
func (r *AgentSessionRepo) Create(ctx context.Context, sess *domain.AgentSession) (*domain.AgentSession, error) {
	now := time.Now()
	sess.CreatedAt = now
	sess.LastActivityAt = now
	if sess.Messages == nil {
		sess.Messages = []domain.AgentMessage{}
	}
	if sess.Filters == nil {
		sess.Filters = map[string]string{}
	}

	result, err := r.col.InsertOne(ctx, sess)
	if err != nil {
		return nil, err
	}

	oid, ok := result.InsertedID.(bson.ObjectID)
	if ok {
		sess.ID = oid
	}
	return sess, nil
}

// GetByID returns a session by its ObjectID.
func (r *AgentSessionRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.AgentSession, error) {
	var sess domain.AgentSession
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&sess)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

// Update saves the full session state (messages, active doc, title, timestamps).
func (r *AgentSessionRepo) Update(ctx context.Context, sess *domain.AgentSession) error {
	_, err := r.col.UpdateOne(ctx, bson.M{"_id": sess.ID}, bson.M{
		"$set": bson.M{
			"title":            sess.Title,
			"active_doc_id":    sess.ActiveDocID,
			"active_doc_name":  sess.ActiveDocName,
			"messages":         sess.Messages,
			"filters":          sess.Filters,
			"last_activity_at": sess.LastActivityAt,
		},
	})
	return err
}

// ListByUser returns session summaries for a user, ordered by last activity descending.
func (r *AgentSessionRepo) ListByUser(ctx context.Context, userID bson.ObjectID, limit int) ([]domain.SessionSummary, error) {
	if limit <= 0 {
		limit = 50
	}

	pipeline := bson.A{
		bson.M{"$match": bson.M{"user_id": userID}},
		bson.M{"$sort": bson.M{"last_activity_at": -1}},
		bson.M{"$limit": limit},
		bson.M{"$project": bson.M{
			"_id":              1,
			"title":            1,
			"active_doc_name":  1,
			"message_count":    bson.M{"$size": "$messages"},
			"created_at":       1,
			"last_activity_at": 1,
		}},
	}

	cur, err := r.col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var summaries []domain.SessionSummary
	if err := cur.All(ctx, &summaries); err != nil {
		return nil, err
	}
	return summaries, nil
}

// Delete removes a session by ID and user (safety check).
func (r *AgentSessionRepo) Delete(ctx context.Context, id, userID bson.ObjectID) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id, "user_id": userID})
	return err
}

// DeleteAllByUser removes all sessions for a user.
func (r *AgentSessionRepo) DeleteAllByUser(ctx context.Context, userID bson.ObjectID) error {
	_, err := r.col.DeleteMany(ctx, bson.M{"user_id": userID})
	return err
}

// GetByIDAndUser returns a session owned by the specific user.
func (r *AgentSessionRepo) GetByIDAndUser(ctx context.Context, id, userID bson.ObjectID) (*domain.AgentSession, error) {
	var sess domain.AgentSession
	err := r.col.FindOne(ctx, bson.M{"_id": id, "user_id": userID}).Decode(&sess)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

// FindRecentByUser returns the most recently active session for a user (for auto-resume).
func (r *AgentSessionRepo) FindRecentByUser(ctx context.Context, userID bson.ObjectID) (*domain.AgentSession, error) {
	opts := options.FindOne().SetSort(bson.M{"last_activity_at": -1})
	var sess domain.AgentSession
	err := r.col.FindOne(ctx, bson.M{"user_id": userID}, opts).Decode(&sess)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

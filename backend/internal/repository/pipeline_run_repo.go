package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const pipelineRunCollection = "pipeline_runs"

// PipelineRunRepo handles MongoDB operations for pipeline execution runs.
type PipelineRunRepo struct {
	coll *mongo.Collection
}

// NewPipelineRunRepo creates a new PipelineRunRepo.
func NewPipelineRunRepo(db *mongo.Database) *PipelineRunRepo {
	return &PipelineRunRepo{coll: db.Collection(pipelineRunCollection)}
}

// Create inserts a new pipeline run.
func (r *PipelineRunRepo) Create(ctx context.Context, run *domain.PipelineRun) (*domain.PipelineRun, error) {
	run.CreatedAt = time.Now()
	result, err := r.coll.InsertOne(ctx, run)
	if err != nil {
		return nil, err
	}
	run.ID = result.InsertedID.(bson.ObjectID)
	return run, nil
}

// GetByID returns a single pipeline run.
func (r *PipelineRunRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.PipelineRun, error) {
	var run domain.PipelineRun
	err := r.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&run)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &run, nil
}

// ListByPipeline returns all runs for a given pipeline, sorted by creation date descending.
func (r *PipelineRunRepo) ListByPipeline(ctx context.Context, pipelineID bson.ObjectID) ([]domain.PipelineRun, error) {
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := r.coll.Find(ctx, bson.M{"pipeline_id": pipelineID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var runs []domain.PipelineRun
	if err := cursor.All(ctx, &runs); err != nil {
		return nil, err
	}
	if runs == nil {
		runs = []domain.PipelineRun{}
	}
	return runs, nil
}

// UpdateStatus updates the run status and optionally sets the end time.
func (r *PipelineRunRepo) UpdateStatus(ctx context.Context, id bson.ObjectID, status domain.PipelineRunStatus, output map[string]any) error {
	set := bson.M{"status": status}
	if status == domain.RunStatusCompleted || status == domain.RunStatusFailed || status == domain.RunStatusCancelled {
		now := time.Now()
		set["ended_at"] = now
	}
	if output != nil {
		set["output"] = output
	}
	_, err := r.coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": set})
	return err
}

// UpdateNodeRun updates a specific node run result within a pipeline run.
func (r *PipelineRunRepo) UpdateNodeRun(ctx context.Context, runID bson.ObjectID, nodeRun domain.NodeRunResult) error {
	// Try to update existing node run first
	filter := bson.M{"_id": runID, "node_runs.node_id": nodeRun.NodeID}
	update := bson.M{"$set": bson.M{"node_runs.$": nodeRun}}

	result, err := r.coll.UpdateOne(ctx, filter, update)
	if err != nil {
		return err
	}

	// If no match, push a new node run entry
	if result.ModifiedCount == 0 {
		_, err = r.coll.UpdateOne(ctx,
			bson.M{"_id": runID},
			bson.M{"$push": bson.M{"node_runs": nodeRun}},
		)
		return err
	}
	return nil
}

// UpdateNodeRunStatus updates the status of a specific node run within a pipeline run.
func (r *PipelineRunRepo) UpdateNodeRunStatus(ctx context.Context, runID bson.ObjectID, nodeID string, status domain.NodeRunStatus) error {
	now := time.Now()
	filter := bson.M{"_id": runID, "node_runs.node_id": nodeID}
	update := bson.M{"$set": bson.M{
		"node_runs.$.status":   string(status),
		"node_runs.$.ended_at": now,
	}}
	_, err := r.coll.UpdateOne(ctx, filter, update)
	return err
}

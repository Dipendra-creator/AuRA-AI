package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const pipelineCollection = "pipelines"

// PipelineRepo handles MongoDB operations for pipelines.
type PipelineRepo struct {
	coll *mongo.Collection
}

// NewPipelineRepo creates a new PipelineRepo.
func NewPipelineRepo(db *mongo.Database) *PipelineRepo {
	return &PipelineRepo{coll: db.Collection(pipelineCollection)}
}

// List returns all pipelines sorted by creation date.
func (r *PipelineRepo) List(ctx context.Context) ([]domain.Pipeline, error) {
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := r.coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var pipelines []domain.Pipeline
	if err := cursor.All(ctx, &pipelines); err != nil {
		return nil, err
	}
	if pipelines == nil {
		pipelines = []domain.Pipeline{}
	}
	return pipelines, nil
}

// GetByID returns a single pipeline by its ObjectID.
func (r *PipelineRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.Pipeline, error) {
	var p domain.Pipeline
	err := r.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&p)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// Create inserts a new pipeline and returns it.
func (r *PipelineRepo) Create(ctx context.Context, input domain.CreatePipelineInput) (*domain.Pipeline, error) {
	now := time.Now()
	nodes := input.Nodes
	if nodes == nil {
		nodes = []domain.PipelineNode{}
	}
	edges := input.Edges
	if edges == nil {
		edges = []domain.PipelineEdge{}
	}
	p := domain.Pipeline{
		Name:        input.Name,
		Description: input.Description,
		Status:      "operational",
		Latency:     "0ms",
		Workspace:   input.Workspace,
		Version:     "1.0.0",
		Nodes:       nodes,
		Edges:       edges,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	result, err := r.coll.InsertOne(ctx, p)
	if err != nil {
		return nil, err
	}
	p.ID = result.InsertedID.(bson.ObjectID)
	return &p, nil
}

// Update patches a pipeline with the given fields.
func (r *PipelineRepo) Update(ctx context.Context, id bson.ObjectID, input domain.UpdatePipelineInput) (*domain.Pipeline, error) {
	set := bson.M{"updated_at": time.Now()}
	if input.Name != nil {
		set["name"] = *input.Name
	}
	if input.Description != nil {
		set["description"] = *input.Description
	}
	if input.Status != nil {
		set["status"] = *input.Status
	}
	if input.Latency != nil {
		set["latency"] = *input.Latency
	}
	if input.Version != nil {
		set["version"] = *input.Version
	}
	if input.Nodes != nil {
		set["nodes"] = input.Nodes
	}
	if input.Edges != nil {
		set["edges"] = input.Edges
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var p domain.Pipeline
	err := r.coll.FindOneAndUpdate(ctx, bson.M{"_id": id}, bson.M{"$set": set}, opts).Decode(&p)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// Delete removes a pipeline by its ObjectID.
func (r *PipelineRepo) Delete(ctx context.Context, id bson.ObjectID) error {
	_, err := r.coll.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// Count returns the total number of pipelines.
func (r *PipelineRepo) Count(ctx context.Context) (int64, error) {
	return r.coll.CountDocuments(ctx, bson.M{})
}

// CountByStatus returns the count of pipelines with the given status.
func (r *PipelineRepo) CountByStatus(ctx context.Context, status string) (int64, error) {
	return r.coll.CountDocuments(ctx, bson.M{"status": status})
}

// InsertMany bulk-inserts pipelines (used by seeder).
func (r *PipelineRepo) InsertMany(ctx context.Context, pipelines []domain.Pipeline) error {
	ifaces := make([]interface{}, len(pipelines))
	for i, p := range pipelines {
		ifaces[i] = p
	}
	_, err := r.coll.InsertMany(ctx, ifaces)
	return err
}

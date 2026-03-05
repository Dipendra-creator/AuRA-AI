package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const schemaCollection = "extraction_schemas"

// SchemaRepo handles MongoDB operations for extraction schemas.
type SchemaRepo struct {
	coll *mongo.Collection
}

// NewSchemaRepo creates a new SchemaRepo.
func NewSchemaRepo(db *mongo.Database) *SchemaRepo {
	return &SchemaRepo{coll: db.Collection(schemaCollection)}
}

// List returns all extraction schemas sorted by updated_at descending.
func (r *SchemaRepo) List(ctx context.Context) ([]domain.ExtractionSchema, error) {
	opts := options.Find().SetSort(bson.M{"updated_at": -1})
	cursor, err := r.coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var schemas []domain.ExtractionSchema
	if err := cursor.All(ctx, &schemas); err != nil {
		return nil, err
	}
	if schemas == nil {
		schemas = []domain.ExtractionSchema{}
	}
	return schemas, nil
}

// GetByID returns a single extraction schema by its ObjectID.
func (r *SchemaRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.ExtractionSchema, error) {
	var s domain.ExtractionSchema
	err := r.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&s)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

// Create inserts a new extraction schema.
func (r *SchemaRepo) Create(ctx context.Context, s *domain.ExtractionSchema) (*domain.ExtractionSchema, error) {
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now
	if s.Fields == nil {
		s.Fields = []domain.SchemaField{}
	}
	result, err := r.coll.InsertOne(ctx, s)
	if err != nil {
		return nil, err
	}
	s.ID = result.InsertedID.(bson.ObjectID)
	return s, nil
}

// Update patches an existing extraction schema's name and/or fields.
func (r *SchemaRepo) Update(ctx context.Context, id bson.ObjectID, input *domain.UpdateSchemaInput) (*domain.ExtractionSchema, error) {
	set := bson.M{"updated_at": time.Now()}
	if input.Name != nil {
		set["name"] = *input.Name
	}
	if input.Fields != nil {
		set["fields"] = input.Fields
	}

	_, err := r.coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": set})
	if err != nil {
		return nil, err
	}

	return r.GetByID(ctx, id)
}

// Delete removes an extraction schema by its ObjectID.
func (r *SchemaRepo) Delete(ctx context.Context, id bson.ObjectID) error {
	_, err := r.coll.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// Package repository provides MongoDB data access for domain entities.
package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const documentCollection = "documents"

// DocumentRepo handles MongoDB operations for documents.
type DocumentRepo struct {
	coll *mongo.Collection
}

// NewDocumentRepo creates a new DocumentRepo.
func NewDocumentRepo(db *mongo.Database) *DocumentRepo {
	return &DocumentRepo{coll: db.Collection(documentCollection)}
}

// List returns documents matching the given filter with pagination.
func (r *DocumentRepo) List(ctx context.Context, f domain.DocumentFilter) ([]domain.Document, int64, error) {
	filter := bson.M{"deleted_at": bson.M{"$eq": nil}}

	if f.Status != "" {
		filter["status"] = f.Status
	}
	if f.Type != "" {
		filter["type"] = f.Type
	}
	if f.Search != "" {
		filter["name"] = bson.M{"$regex": f.Search, "$options": "i"}
	}

	total, err := r.coll.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	skip := int64((f.Page - 1) * f.Limit)
	sortField := "created_at"
	sortOrder := -1
	if f.Sort != "" {
		if f.Sort[0] == '-' {
			sortField = f.Sort[1:]
		} else {
			sortField = f.Sort
			sortOrder = 1
		}
	}

	opts := options.Find().
		SetSkip(skip).
		SetLimit(int64(f.Limit)).
		SetSort(bson.M{sortField: sortOrder})

	cursor, err := r.coll.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	var docs []domain.Document
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, 0, err
	}

	if docs == nil {
		docs = []domain.Document{}
	}

	return docs, total, nil
}

// GetByID returns a single document by its ObjectID.
func (r *DocumentRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	var doc domain.Document
	err := r.coll.FindOne(ctx, bson.M{"_id": id, "deleted_at": bson.M{"$eq": nil}}).Decode(&doc)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &doc, nil
}

// Create inserts a new document and returns it.
func (r *DocumentRepo) Create(ctx context.Context, input domain.CreateDocumentInput) (*domain.Document, error) {
	now := time.Now()
	doc := domain.Document{
		Name:            input.Name,
		Type:            input.Type,
		MimeType:        input.MimeType,
		Status:          domain.StatusPending,
		Confidence:      0,
		FilePath:        input.FilePath,
		FileSize:        input.FileSize,
		ExtractedFields: []domain.ExtractedField{},
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	result, err := r.coll.InsertOne(ctx, doc)
	if err != nil {
		return nil, err
	}

	doc.ID = result.InsertedID.(bson.ObjectID)
	return &doc, nil
}

// Update patches a document with the given fields.
func (r *DocumentRepo) Update(ctx context.Context, id bson.ObjectID, input domain.UpdateDocumentInput) (*domain.Document, error) {
	set := bson.M{"updated_at": time.Now()}
	if input.Status != nil {
		set["status"] = *input.Status
	}
	if input.ProcessingStep != nil {
		set["processing_step"] = *input.ProcessingStep
	}
	if input.Confidence != nil {
		set["confidence"] = *input.Confidence
	}
	if input.RawText != nil {
		set["raw_text"] = *input.RawText
	}
	if input.ExtractedFields != nil {
		set["extracted_fields"] = input.ExtractedFields
	}

	// Build the update document
	update := bson.M{"$set": set}

	// If AppendFields is provided, use $push + $each to atomically append fields
	if len(input.AppendFields) > 0 {
		update["$push"] = bson.M{
			"extracted_fields": bson.M{
				"$each": input.AppendFields,
			},
		}
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var doc domain.Document
	err := r.coll.FindOneAndUpdate(ctx, bson.M{"_id": id}, update, opts).Decode(&doc)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &doc, nil
}

// SoftDelete sets the deleted_at timestamp on a document.
func (r *DocumentRepo) SoftDelete(ctx context.Context, id bson.ObjectID) error {
	_, err := r.coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"deleted_at": time.Now()}})
	return err
}

// Count returns the total number of non-deleted documents.
func (r *DocumentRepo) Count(ctx context.Context) (int64, error) {
	return r.coll.CountDocuments(ctx, bson.M{"deleted_at": bson.M{"$eq": nil}})
}

// CountByStatus returns the count of documents with the given status.
func (r *DocumentRepo) CountByStatus(ctx context.Context, status domain.DocumentStatus) (int64, error) {
	return r.coll.CountDocuments(ctx, bson.M{"status": status, "deleted_at": bson.M{"$eq": nil}})
}

// AverageConfidence returns the average confidence of processed documents.
func (r *DocumentRepo) AverageConfidence(ctx context.Context) (float64, error) {
	pipeline := bson.A{
		bson.M{"$match": bson.M{"status": "processed", "deleted_at": bson.M{"$eq": nil}}},
		bson.M{"$group": bson.M{"_id": nil, "avg": bson.M{"$avg": "$confidence"}}},
	}
	cursor, err := r.coll.Aggregate(ctx, pipeline)
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)

	var results []struct {
		Avg float64 `bson:"avg"`
	}
	if err := cursor.All(ctx, &results); err != nil {
		return 0, err
	}
	if len(results) == 0 {
		return 0, nil
	}
	return results[0].Avg, nil
}

// Recent returns the N most recently created documents.
func (r *DocumentRepo) Recent(ctx context.Context, limit int) ([]domain.Document, error) {
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetLimit(int64(limit))

	cursor, err := r.coll.Find(ctx, bson.M{"deleted_at": bson.M{"$eq": nil}}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var docs []domain.Document
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	if docs == nil {
		docs = []domain.Document{}
	}
	return docs, nil
}

// InsertMany bulk-inserts documents (used by seeder).
func (r *DocumentRepo) InsertMany(ctx context.Context, docs []domain.Document) error {
	ifaces := make([]interface{}, len(docs))
	for i, d := range docs {
		ifaces[i] = d
	}
	_, err := r.coll.InsertMany(ctx, ifaces)
	return err
}

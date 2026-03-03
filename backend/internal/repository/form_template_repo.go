package repository

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/aura-ai/backend/internal/domain"
)

const formTemplateCollection = "form_templates"

// FormTemplateRepo handles MongoDB operations for form templates.
type FormTemplateRepo struct {
	coll *mongo.Collection
}

// NewFormTemplateRepo creates a new FormTemplateRepo.
func NewFormTemplateRepo(db *mongo.Database) *FormTemplateRepo {
	return &FormTemplateRepo{coll: db.Collection(formTemplateCollection)}
}

// List returns all form templates sorted by creation date.
func (r *FormTemplateRepo) List(ctx context.Context) ([]domain.FormTemplate, error) {
	opts := options.Find().SetSort(bson.M{"created_at": -1})
	cursor, err := r.coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var templates []domain.FormTemplate
	if err := cursor.All(ctx, &templates); err != nil {
		return nil, err
	}
	if templates == nil {
		templates = []domain.FormTemplate{}
	}
	return templates, nil
}

// GetByID returns a single form template by its ObjectID.
func (r *FormTemplateRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.FormTemplate, error) {
	var t domain.FormTemplate
	err := r.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&t)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

// Create inserts a new form template.
func (r *FormTemplateRepo) Create(ctx context.Context, t *domain.FormTemplate) (*domain.FormTemplate, error) {
	now := time.Now()
	t.CreatedAt = now
	t.UpdatedAt = now
	result, err := r.coll.InsertOne(ctx, t)
	if err != nil {
		return nil, err
	}
	t.ID = result.InsertedID.(bson.ObjectID)
	return t, nil
}

// Delete removes a form template by its ObjectID.
func (r *FormTemplateRepo) Delete(ctx context.Context, id bson.ObjectID) error {
	_, err := r.coll.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

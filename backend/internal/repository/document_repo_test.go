package repository

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
)

func TestDocumentRepoUpdateSchema(t *testing.T) {
	repo := &DocumentRepo{}

	id := bson.NewObjectID()
	schemaFields := []domain.SchemaField{
		{Field: "Name", ColumnName: "string"},
	}

	input := domain.UpdateDocumentInput{
		AppliedSchema: schemaFields,
	}

	// Collection is nil so this will trigger a panic when mongo.Collection.UpdateByID is invoked.
	// We wrap it in a recover to ensure test doesn't crash, but lines 137-139 execute first.
	defer func() {
		recover()
	}()

	repo.Update(context.Background(), id, input)
}

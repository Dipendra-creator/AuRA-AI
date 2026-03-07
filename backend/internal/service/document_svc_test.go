package service

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
)

type mockRepo struct {
	DocumentRepository
}

func (m *mockRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	return &domain.Document{
		ID:       id,
		FilePath: "dummy.pdf",
	}, nil
}

func (m *mockRepo) Update(ctx context.Context, id bson.ObjectID, input domain.UpdateDocumentInput) (*domain.Document, error) {
	return &domain.Document{}, nil
}

func TestDocumentServiceDeduplicateFieldsMapCoverage(t *testing.T) {
	// We want to hit the deductive field loop
	fields := []domain.ExtractedField{
		{FieldName: "test1", Value: "val1", Confidence: 0.9},
		{FieldName: "test1", Value: "val1", Confidence: 0.9}, // Dupe
		{FieldName: "test2", Value: "val2", Confidence: 0.8},
	}

	deduped := deduplicateFields(fields)
	if len(deduped) != 2 {
		t.Errorf("Expected 2 fields after deduplication, got %d", len(deduped))
	}
}

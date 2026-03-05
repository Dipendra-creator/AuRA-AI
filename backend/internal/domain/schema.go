package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ExtractionSchema is a named, persisted collection of schema fields
// used to guide AI data extraction on documents.
type ExtractionSchema struct {
	ID        bson.ObjectID `json:"_id"       bson:"_id,omitempty"`
	Name      string        `json:"name"      bson:"name"`
	Fields    []SchemaField `json:"fields"    bson:"fields"`
	CreatedAt time.Time     `json:"createdAt" bson:"created_at"`
	UpdatedAt time.Time     `json:"updatedAt" bson:"updated_at"`
}

// UpdateSchemaInput is the payload for patching an extraction schema.
type UpdateSchemaInput struct {
	Name   *string       `json:"name,omitempty"`
	Fields []SchemaField `json:"fields,omitempty"`
}

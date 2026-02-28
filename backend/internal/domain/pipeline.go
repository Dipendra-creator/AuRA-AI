package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// PipelineNodeType classifies the kind of pipeline node.
type PipelineNodeType string

const (
	NodeTypeProcess PipelineNodeType = "process"
	NodeTypeReview  PipelineNodeType = "review"
	NodeTypeExport  PipelineNodeType = "export"
)

// PipelineNodeConfig holds configuration for a pipeline node.
type PipelineNodeConfig struct {
	StrictJSONSchema bool   `json:"strictJsonSchema" bson:"strict_json_schema"`
	DataTypeMatching bool   `json:"dataTypeMatching" bson:"data_type_matching"`
	HandleNullValues bool   `json:"handleNullValues" bson:"handle_null_values"`
	APIIntegration   string `json:"apiIntegration"   bson:"api_integration"`
	SuccessRedirect  string `json:"successRedirect"  bson:"success_redirect"`
}

// PipelineNode represents a single node in a processing pipeline.
type PipelineNode struct {
	NodeID string             `json:"id"     bson:"node_id"`
	Label  string             `json:"label"  bson:"label"`
	Name   string             `json:"name"   bson:"name"`
	Type   PipelineNodeType   `json:"type"   bson:"type"`
	Icon   string             `json:"icon"   bson:"icon"`
	Config PipelineNodeConfig `json:"config" bson:"config"`
}

// Pipeline is the business entity for document processing pipelines.
type Pipeline struct {
	ID        bson.ObjectID  `json:"_id"       bson:"_id,omitempty"`
	Name      string         `json:"name"      bson:"name"`
	Status    string         `json:"status"    bson:"status"`
	Latency   string         `json:"latency"   bson:"latency"`
	Workspace string         `json:"workspace" bson:"workspace"`
	Version   string         `json:"version"   bson:"version"`
	Nodes     []PipelineNode `json:"nodes"     bson:"nodes"`
	CreatedAt time.Time      `json:"createdAt" bson:"created_at"`
	UpdatedAt time.Time      `json:"updatedAt" bson:"updated_at"`
}

// CreatePipelineInput is the payload for creating a new pipeline.
type CreatePipelineInput struct {
	Name      string         `json:"name"`
	Workspace string         `json:"workspace"`
	Nodes     []PipelineNode `json:"nodes,omitempty"`
}

// UpdatePipelineInput is the payload for patching a pipeline.
type UpdatePipelineInput struct {
	Name    *string        `json:"name,omitempty"`
	Status  *string        `json:"status,omitempty"`
	Latency *string        `json:"latency,omitempty"`
	Version *string        `json:"version,omitempty"`
	Nodes   []PipelineNode `json:"nodes,omitempty"`
}

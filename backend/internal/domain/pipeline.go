package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// PipelineNodeType classifies the kind of pipeline node.
type PipelineNodeType string

const (
	NodeTypeIngest    PipelineNodeType = "ingest"
	NodeTypeAIExtract PipelineNodeType = "ai_extract"
	NodeTypeTransform PipelineNodeType = "transform"
	NodeTypeFormFill  PipelineNodeType = "form_fill"
	NodeTypeCustomAPI PipelineNodeType = "custom_api"
	NodeTypeReview    PipelineNodeType = "review"
	NodeTypeCondition PipelineNodeType = "condition"
	NodeTypeExport    PipelineNodeType = "export"
)

// ValidNodeTypes lists all valid pipeline node types for validation.
var ValidNodeTypes = map[PipelineNodeType]bool{
	NodeTypeIngest:    true,
	NodeTypeAIExtract: true,
	NodeTypeTransform: true,
	NodeTypeFormFill:  true,
	NodeTypeCustomAPI: true,
	NodeTypeReview:    true,
	NodeTypeCondition: true,
	NodeTypeExport:    true,
}

// PipelineEdge connects two nodes in the pipeline DAG.
type PipelineEdge struct {
	ID       string `json:"id"     bson:"id"`
	SourceID string `json:"source" bson:"source"`
	TargetID string `json:"target" bson:"target"`
	Label    string `json:"label"  bson:"label,omitempty"`
}

// NodePosition stores canvas coordinates for React Flow.
type NodePosition struct {
	X float64 `json:"x" bson:"x"`
	Y float64 `json:"y" bson:"y"`
}

// PipelineNode represents a single node in a processing pipeline.
// Config is a flexible map to support per-node-type configuration schemas.
type PipelineNode struct {
	NodeID   string           `json:"id"       bson:"node_id"`
	Label    string           `json:"label"    bson:"label"`
	Name     string           `json:"name"     bson:"name"`
	Type     PipelineNodeType `json:"type"     bson:"type"`
	Icon     string           `json:"icon"     bson:"icon"`
	Position NodePosition     `json:"position" bson:"position"`
	Config   map[string]any   `json:"config"   bson:"config"`
}

// Pipeline is the business entity for document processing pipelines.
type Pipeline struct {
	ID          bson.ObjectID  `json:"_id"         bson:"_id,omitempty"`
	Name        string         `json:"name"        bson:"name"`
	Description string         `json:"description" bson:"description"`
	Status      string         `json:"status"      bson:"status"`
	Latency     string         `json:"latency"     bson:"latency"`
	Workspace   string         `json:"workspace"   bson:"workspace"`
	Version     string         `json:"version"     bson:"version"`
	Nodes       []PipelineNode `json:"nodes"       bson:"nodes"`
	Edges       []PipelineEdge `json:"edges"       bson:"edges"`
	CreatedAt   time.Time      `json:"createdAt"   bson:"created_at"`
	UpdatedAt   time.Time      `json:"updatedAt"   bson:"updated_at"`
}

// CreatePipelineInput is the payload for creating a new pipeline.
type CreatePipelineInput struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Workspace   string         `json:"workspace"`
	Nodes       []PipelineNode `json:"nodes,omitempty"`
	Edges       []PipelineEdge `json:"edges,omitempty"`
}

// UpdatePipelineInput is the payload for patching a pipeline.
type UpdatePipelineInput struct {
	Name        *string        `json:"name,omitempty"`
	Description *string        `json:"description,omitempty"`
	Status      *string        `json:"status,omitempty"`
	Latency     *string        `json:"latency,omitempty"`
	Version     *string        `json:"version,omitempty"`
	Nodes       []PipelineNode `json:"nodes,omitempty"`
	Edges       []PipelineEdge `json:"edges,omitempty"`
}

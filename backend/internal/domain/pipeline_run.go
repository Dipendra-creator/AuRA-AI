package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// PipelineRunStatus tracks the execution state of a pipeline run.
type PipelineRunStatus string

const (
	RunStatusPending   PipelineRunStatus = "pending"
	RunStatusRunning   PipelineRunStatus = "running"
	RunStatusPaused    PipelineRunStatus = "paused"
	RunStatusCompleted PipelineRunStatus = "completed"
	RunStatusFailed    PipelineRunStatus = "failed"
	RunStatusCancelled PipelineRunStatus = "cancelled"
)

// NodeRunStatus tracks the execution state of a single node within a run.
type NodeRunStatus string

const (
	NodeRunPending   NodeRunStatus = "pending"
	NodeRunRunning   NodeRunStatus = "running"
	NodeRunCompleted NodeRunStatus = "completed"
	NodeRunFailed    NodeRunStatus = "failed"
	NodeRunSkipped   NodeRunStatus = "skipped"
	NodeRunWaiting   NodeRunStatus = "waiting_review"
)

// NodeRunResult stores the output of a single node execution.
type NodeRunResult struct {
	NodeID     string         `json:"nodeId"     bson:"node_id"`
	Status     NodeRunStatus  `json:"status"     bson:"status"`
	StartedAt  time.Time      `json:"startedAt"  bson:"started_at"`
	EndedAt    *time.Time     `json:"endedAt"    bson:"ended_at,omitempty"`
	Input      map[string]any `json:"input"      bson:"input,omitempty"`
	Output     map[string]any `json:"output"     bson:"output,omitempty"`
	Error      string         `json:"error"      bson:"error,omitempty"`
	DurationMs int64          `json:"durationMs" bson:"duration_ms"`
}

// PipelineRun is a single execution instance of a pipeline.
type PipelineRun struct {
	ID         bson.ObjectID     `json:"_id"        bson:"_id,omitempty"`
	PipelineID bson.ObjectID     `json:"pipelineId" bson:"pipeline_id"`
	Status     PipelineRunStatus `json:"status"     bson:"status"`
	TriggerBy  string            `json:"triggerBy"   bson:"trigger_by"`
	NodeRuns   []NodeRunResult   `json:"nodeRuns"   bson:"node_runs"`
	Input      map[string]any    `json:"input"      bson:"input,omitempty"`
	Output     map[string]any    `json:"output"     bson:"output,omitempty"`
	StartedAt  time.Time         `json:"startedAt"  bson:"started_at"`
	EndedAt    *time.Time        `json:"endedAt"    bson:"ended_at,omitempty"`
	CreatedAt  time.Time         `json:"createdAt"  bson:"created_at"`
}

// FormTemplate defines a target form structure for the form-fill node.
type FormTemplate struct {
	ID          bson.ObjectID       `json:"_id"         bson:"_id,omitempty"`
	Name        string              `json:"name"        bson:"name"`
	Description string              `json:"description" bson:"description"`
	Fields      []FormTemplateField `json:"fields"      bson:"fields"`
	Version     string              `json:"version"     bson:"version"`
	CreatedAt   time.Time           `json:"createdAt"   bson:"created_at"`
	UpdatedAt   time.Time           `json:"updatedAt"   bson:"updated_at"`
}

// FormTemplateField defines a single field in a form template.
type FormTemplateField struct {
	Key      string `json:"key"      bson:"key"`
	Label    string `json:"label"    bson:"label"`
	Type     string `json:"type"     bson:"type"`
	Required bool   `json:"required" bson:"required"`
	Default  any    `json:"default"  bson:"default,omitempty"`
}

// PipelineEvent represents a WebSocket event during pipeline execution.
type PipelineEvent struct {
	Type       string         `json:"type"`
	PipelineID string         `json:"pipelineId,omitempty"`
	RunID      string         `json:"runId,omitempty"`
	NodeID     string         `json:"nodeId,omitempty"`
	NodeName   string         `json:"nodeName,omitempty"`
	Output     map[string]any `json:"output,omitempty"`
	Fields     []string       `json:"fields,omitempty"`
	Error      string         `json:"error,omitempty"`
	DurationMs int64          `json:"durationMs,omitempty"`
}

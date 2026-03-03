# Pipeline & Workflow Engine — Complete Implementation Plan

> **Project**: Aura AI (`anti-docu-read`)  
> **Author**: Aura Engineering  
> **Date**: 2026-03-03  
> **Status**: Draft — Pending Review

---

## 1. Executive Summary

This document defines the complete plan for turning the **existing mock pipeline UI** into a fully functional **workflow engine** for Aura AI. Users will be able to:

1. **Visually build** multi-step pipelines with a drag-and-drop node editor
2. **Define data transformations** (field mapping, computed fields, schema coercion)
3. **Inject form-filling steps** that auto-populate downstream templates/forms with extracted data
4. **Call custom APIs** at any node to push/pull data from external systems
5. **Export results** in multiple formats (CSV, XLSX, JSON, webhook delivery)
6. **Review & approve** intermediate results before the pipeline continues
7. **Execute pipelines** end-to-end with real-time progress streaming via WebSocket

---

## 2. Current State Analysis

### 2.1 What Exists Today

| Component | Location | Status |
|-----------|----------|--------|
| **Domain Model** | `backend/internal/domain/pipeline.go` | Basic `Pipeline` + `PipelineNode` structs with 3 node types (`process`, `review`, `export`) |
| **CRUD API** | `backend/internal/handler/pipeline_handler.go` | Full REST endpoints: List, Get, Create, Update, Delete |
| **Service Layer** | `backend/internal/service/pipeline_svc.go` | Thin pass-through to repository |
| **Repository** | `backend/internal/repository/pipeline_repo.go` | MongoDB CRUD with `pipelines` collection |
| **Frontend Page** | `src/renderer/src/pages/Workflows.tsx` | Static linear node rendering, config panel with toggles, Save/Deploy wired to API |
| **Mock Data** | `src/renderer/src/data/workflows.mock.json` | 5 hardcoded nodes: Ingest → Extract → Validate → Transform → Export |
| **Design** | `designs/workflow_builder/code.html` | Stitch-exported HTML design reference |
| **Shared Types** | `src/shared/types/document.types.ts` | `PipelineNode`, `PipelineNodeConfig`, `PipelineMetadata` types |

### 2.2 What's Missing

- **No execution engine** — pipelines are data structures only, not executable
- **No node type registry** — only 3 generic types, no specialized behavior
- **No data flow between nodes** — nodes don't pass output to the next node
- **No form-filling node** — no way to map extracted fields to form templates
- **No custom API node** — no HTTP call-out capability
- **No data transformation** — no field mapping, renaming, computed fields
- **No conditional branching** — strictly linear, no if/else or fan-out
- **No visual editor** — nodes are rendered in a flat list, not a draggable DAG canvas
- **No pipeline execution tracking** — no run history, no per-node status
- **No error handling / retry** — no node-level failure recovery

---

## 3. Architecture Overview

### 3.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     ELECTRON RENDERER                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Visual Workflow Builder (React Flow)          │  │
│  │  ┌──────┐   ┌─────────┐   ┌──────┐   ┌──────┐  ┌──────┐ │  │
│  │  │Ingest├──►│Transform├──►│Review├──►│ Fill ├──►│Export│ │  │
│  │  └──────┘   └─────────┘   └──────┘   └──────┘  └──────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         Workflow Data Service (API + WebSocket)            │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTP / WS
┌────────────────────────────┼─────────────────────────────────────┐
│  GO BACKEND                │                                     │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │              Pipeline Router (REST + WS)                   │  │
│  └──────────┬─────────────┬───────────────┬───────────────────┘  │
│             │             │               │                      │
│  ┌──────────▼──┐ ┌────────▼─────┐ ┌──────▼─────────────────┐   │
│  │  Pipeline   │ │  Pipeline    │ │  Pipeline Execution     │   │
│  │  CRUD Svc   │ │  Validator   │ │  Engine (NEW)           │   │
│  └──────────┬──┘ └──────────────┘ └──────┬─────────────────┘   │
│             │                            │                      │
│  ┌──────────▼──────────────┐  ┌──────────▼──────────────────┐   │
│  │  MongoDB (pipelines,    │  │  Node Executor Registry     │   │
│  │  pipeline_runs)         │  │  ┌────────┐ ┌──────────┐    │   │
│  └─────────────────────────┘  │  │Ingest  │ │Transform │    │   │
│                               │  ├────────┤ ├──────────┤    │   │
│                               │  │FormFill│ │CustomAPI │    │   │
│                               │  ├────────┤ ├──────────┤    │   │
│                               │  │Export  │ │Review    │    │   │
│                               │  └────────┘ └──────────┘    │   │
│                               └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow Model

Every node receives a **DataPacket** and produces a **DataPacket**:

```
DataPacket {
  fields: map[string]any      // key-value extracted data
  metadata: {
    documentId: string
    sourceNode: string
    timestamp:  time.Time
  }
  rawText: string              // original document text (passes through)
  errors:  []Error             // accumulated non-fatal errors
}
```

Edges connect node outputs to node inputs. The engine walks the directed acyclic graph (DAG) topologically.

---

## 4. Node Type System

### 4.1 Extended Node Types

| Node Type | ID | Purpose | Icon |
|-----------|-----|---------|------|
| **Ingest** | `ingest` | Accept files (PDF/DOCX/images), run OCR, extract raw text | `upload_file` |
| **AI Extract** | `ai_extract` | Run AI model to extract structured fields from raw text | `auto_awesome` |
| **Transform** | `transform` | Map, rename, compute, filter, or coerce fields | `transform` |
| **Form Fill** | `form_fill` | Map extracted fields into form templates or downstream fields | `edit_note` |
| **Custom API** | `custom_api` | HTTP call to external system (REST / webhook) | `api` |
| **Review** | `review` | Human review gate — pause pipeline until user approves | `verified` |
| **Condition** | `condition` | Branch pipeline based on field values (if/else) | `call_split` |
| **Export** | `export` | Output results (CSV, XLSX, JSON, or webhook) | `output` |

### 4.2 Node Configuration Schemas

Each node type has a **specific config schema** in addition to the common fields:

#### 4.2.1 Ingest Node

```json
{
  "nodeType": "ingest",
  "config": {
    "acceptedFormats": ["pdf", "docx", "jpg", "png"],
    "ocrEnabled": true,
    "ocrEngine": "tesseract",
    "maxFileSizeMB": 50,
    "batchMode": false
  }
}
```

#### 4.2.2 AI Extract Node

```json
{
  "nodeType": "ai_extract",
  "config": {
    "model": "minimax/minimax-m2.5:free",
    "documentType": "auto",
    "confidenceThreshold": 0.7,
    "strictJsonSchema": true,
    "customPrompt": "",
    "fieldsToExtract": ["name", "date", "amount", "vendor"]
  }
}
```

#### 4.2.3 Transform Node

```json
{
  "nodeType": "transform",
  "config": {
    "operations": [
      { "type": "rename", "from": "vendor_name", "to": "company" },
      { "type": "compute", "field": "total_with_tax", "expression": "amount * 1.18" },
      { "type": "format", "field": "date", "format": "YYYY-MM-DD" },
      { "type": "filter", "condition": "confidence > 0.5" },
      { "type": "default", "field": "currency", "value": "USD" },
      { "type": "coerce", "field": "amount", "targetType": "number" }
    ]
  }
}
```

#### 4.2.4 Form Fill Node

```json
{
  "nodeType": "form_fill",
  "config": {
    "templateId": "govt_tax_form_1040",
    "fieldMapping": {
      "form_field_name":       "extracted.name",
      "form_field_date":       "extracted.date",
      "form_field_amount":     "extracted.amount",
      "form_field_address":    "extracted.address"
    },
    "outputFormat": "pdf",
    "autoSubmit": false,
    "validationRules": [
      { "field": "form_field_name", "required": true },
      { "field": "form_field_amount", "min": 0 }
    ]
  }
}
```

#### 4.2.5 Custom API Node

```json
{
  "nodeType": "custom_api",
  "config": {
    "method": "POST",
    "url": "https://api.example.com/submit",
    "headers": {
      "Authorization": "Bearer {{env.API_KEY}}",
      "Content-Type": "application/json"
    },
    "bodyTemplate": {
      "name": "{{fields.name}}",
      "amount": "{{fields.amount}}",
      "date": "{{fields.date}}"
    },
    "responseMapping": {
      "confirmation_id": "response.data.id",
      "status": "response.data.status"
    },
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMs": 1000
    },
    "timeout": 30
  }
}
```

#### 4.2.6 Review Node

```json
{
  "nodeType": "review",
  "config": {
    "autoApproveThreshold": 0.95,
    "reviewerRoles": ["admin", "reviewer"],
    "timeoutHours": 48,
    "showFields": ["name", "date", "amount"],
    "allowEdits": true
  }
}
```

#### 4.2.7 Condition Node

```json
{
  "nodeType": "condition",
  "config": {
    "rules": [
      {
        "id": "high_confidence",
        "condition": "confidence >= 0.9",
        "targetNodeId": "export-node-1"
      },
      {
        "id": "low_confidence",
        "condition": "confidence < 0.9",
        "targetNodeId": "review-node-1"
      }
    ],
    "defaultTargetNodeId": "review-node-1"
  }
}
```

#### 4.2.8 Export Node

```json
{
  "nodeType": "export",
  "config": {
    "format": "csv",
    "destination": "local",
    "s3Bucket": "",
    "webhookUrl": "",
    "includeFields": [],
    "excludeFields": [],
    "filenameTemplate": "export_{{date}}_{{pipeline_name}}"
  }
}
```

---

## 5. Backend Implementation Plan

### 5.1 Updated Domain Models

#### File: `backend/internal/domain/pipeline.go` (MODIFY)

```go
// Extended PipelineNodeType with all supported node types
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

// PipelineEdge connects two nodes in the DAG
type PipelineEdge struct {
    ID       string `json:"id"       bson:"id"`
    SourceID string `json:"source"   bson:"source"`
    TargetID string `json:"target"   bson:"target"`
    Label    string `json:"label"    bson:"label,omitempty"`
}

// PipelineNode with flexible JSON config per node type
type PipelineNode struct {
    NodeID   string            `json:"id"       bson:"node_id"`
    Label    string            `json:"label"    bson:"label"`
    Name     string            `json:"name"     bson:"name"`
    Type     PipelineNodeType  `json:"type"     bson:"type"`
    Icon     string            `json:"icon"     bson:"icon"`
    Position NodePosition      `json:"position" bson:"position"`
    Config   map[string]any    `json:"config"   bson:"config"`
}

// NodePosition stores canvas coordinates for React Flow
type NodePosition struct {
    X float64 `json:"x" bson:"x"`
    Y float64 `json:"y" bson:"y"`
}

// Pipeline with edges and execution metadata
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
```

#### File: `backend/internal/domain/pipeline_run.go` (NEW)

```go
// PipelineRunStatus tracks execution state
type PipelineRunStatus string

const (
    RunStatusPending   PipelineRunStatus = "pending"
    RunStatusRunning   PipelineRunStatus = "running"
    RunStatusPaused    PipelineRunStatus = "paused"    // waiting for review
    RunStatusCompleted PipelineRunStatus = "completed"
    RunStatusFailed    PipelineRunStatus = "failed"
    RunStatusCancelled PipelineRunStatus = "cancelled"
)

// NodeRunStatus tracks per-node execution
type NodeRunStatus string

const (
    NodeRunPending   NodeRunStatus = "pending"
    NodeRunRunning   NodeRunStatus = "running"
    NodeRunCompleted NodeRunStatus = "completed"
    NodeRunFailed    NodeRunStatus = "failed"
    NodeRunSkipped   NodeRunStatus = "skipped"
    NodeRunWaiting   NodeRunStatus = "waiting_review"
)

// NodeRunResult stores the output of a single node execution
type NodeRunResult struct {
    NodeID    string        `json:"nodeId"    bson:"node_id"`
    Status    NodeRunStatus `json:"status"    bson:"status"`
    StartedAt time.Time    `json:"startedAt" bson:"started_at"`
    EndedAt   *time.Time   `json:"endedAt"   bson:"ended_at,omitempty"`
    Input     map[string]any `json:"input"   bson:"input,omitempty"`
    Output    map[string]any `json:"output"  bson:"output,omitempty"`
    Error     string        `json:"error"    bson:"error,omitempty"`
    DurationMs int64       `json:"durationMs" bson:"duration_ms"`
}

// PipelineRun is a single execution instance of a pipeline
type PipelineRun struct {
    ID         bson.ObjectID     `json:"_id"        bson:"_id,omitempty"`
    PipelineID bson.ObjectID     `json:"pipelineId" bson:"pipeline_id"`
    Status     PipelineRunStatus `json:"status"     bson:"status"`
    TriggerBy  string            `json:"triggerBy"  bson:"trigger_by"`
    NodeRuns   []NodeRunResult   `json:"nodeRuns"   bson:"node_runs"`
    Input      map[string]any    `json:"input"      bson:"input,omitempty"`
    Output     map[string]any    `json:"output"     bson:"output,omitempty"`
    StartedAt  time.Time         `json:"startedAt"  bson:"started_at"`
    EndedAt    *time.Time        `json:"endedAt"    bson:"ended_at,omitempty"`
    CreatedAt  time.Time         `json:"createdAt"  bson:"created_at"`
}
```

### 5.2 Pipeline Execution Engine

#### File: `backend/internal/engine/executor.go` (NEW)

The execution engine is the **core addition**. It:

1. Loads the pipeline definition (nodes + edges)
2. Builds a DAG from edges
3. Topologically sorts the DAG
4. Iterates nodes in order, executing each through its registered handler
5. Passes the `DataPacket` from node to node
6. Streams progress events over WebSocket
7. Persists `PipelineRun` results to MongoDB

**Key interface:**

```go
// NodeExecutor is the interface every node type must implement
type NodeExecutor interface {
    // Execute runs the node logic with input data and returns output data
    Execute(ctx context.Context, node domain.PipelineNode, input DataPacket) (DataPacket, error)
    // Validate checks if the node config is valid before execution
    Validate(node domain.PipelineNode) error
}

// DataPacket is the data envelope passed between nodes
type DataPacket struct {
    Fields   map[string]any          `json:"fields"`
    Metadata DataPacketMetadata      `json:"metadata"`
    RawText  string                  `json:"rawText,omitempty"`
    Files    []FileReference         `json:"files,omitempty"`
    Errors   []DataPacketError       `json:"errors,omitempty"`
}
```

#### File: `backend/internal/engine/registry.go` (NEW)

```go
// NodeRegistry maps node types to their executor implementations
type NodeRegistry struct {
    executors map[domain.PipelineNodeType]NodeExecutor
}

func NewNodeRegistry() *NodeRegistry { ... }
func (r *NodeRegistry) Register(nodeType domain.PipelineNodeType, executor NodeExecutor) { ... }
func (r *NodeRegistry) Get(nodeType domain.PipelineNodeType) (NodeExecutor, error) { ... }
```

### 5.3 Node Executor Implementations

Each file in `backend/internal/engine/nodes/`:

| File | Node Type | Description |
|------|-----------|-------------|
| `ingest.go` | `ingest` | Reads uploaded file, runs OCR via existing `ocr` package, produces raw text |
| `ai_extract.go` | `ai_extract` | Calls existing `KiloClient.ExtractFields()`, outputs structured fields |
| `transform.go` | `transform` | Applies rename/compute/format/filter/default/coerce operations |
| `form_fill.go` | `form_fill` | Maps extracted fields to form template, generates filled output |
| `custom_api.go` | `custom_api` | Makes HTTP requests with template interpolation, maps response back |
| `review.go` | `review` | Pauses execution, creates review task, resumes on approval |
| `condition.go` | `condition` | Evaluates rules against fields, selects which edge to follow |
| `export.go` | `export` | Formats output data and delivers to CSV/XLSX/webhook/S3 |

### 5.4 New API Endpoints

Add to `backend/internal/server/router.go`:

```go
// Pipeline Execution
mux.HandleFunc("POST /api/v1/pipelines/{id}/execute", execH.Execute)
mux.HandleFunc("GET /api/v1/pipelines/{id}/runs", execH.ListRuns)
mux.HandleFunc("GET /api/v1/pipelines/{id}/runs/{runId}", execH.GetRun)
mux.HandleFunc("POST /api/v1/pipelines/{id}/runs/{runId}/cancel", execH.CancelRun)

// Review Gate
mux.HandleFunc("POST /api/v1/runs/{runId}/nodes/{nodeId}/approve", reviewH.Approve)
mux.HandleFunc("POST /api/v1/runs/{runId}/nodes/{nodeId}/reject", reviewH.Reject)

// Pipeline Validation
mux.HandleFunc("POST /api/v1/pipelines/{id}/validate", pipeH.Validate)

// Form Templates (for form-fill node)
mux.HandleFunc("GET /api/v1/form-templates", formH.ListTemplates)
mux.HandleFunc("POST /api/v1/form-templates", formH.CreateTemplate)
mux.HandleFunc("GET /api/v1/form-templates/{id}", formH.GetTemplate)
mux.HandleFunc("DELETE /api/v1/form-templates/{id}", formH.DeleteTemplate)

// Custom API Configs (for custom-api node)
mux.HandleFunc("POST /api/v1/pipelines/test-api", apiTestH.TestEndpoint)
```

### 5.5 WebSocket Events for Pipeline Execution

Extend existing WebSocket handler to stream pipeline execution progress:

```json
// Pipeline run started
{ "type": "pipeline:run:start", "pipelineId": "...", "runId": "..." }

// Node execution started
{ "type": "pipeline:node:start", "runId": "...", "nodeId": "...", "nodeName": "..." }

// Node execution completed
{ "type": "pipeline:node:complete", "runId": "...", "nodeId": "...", "output": {...}, "durationMs": 245 }

// Node execution failed
{ "type": "pipeline:node:error", "runId": "...", "nodeId": "...", "error": "..." }

// Node waiting for review
{ "type": "pipeline:node:review", "runId": "...", "nodeId": "...", "fields": [...] }

// Pipeline run completed
{ "type": "pipeline:run:complete", "runId": "...", "output": {...}, "totalDurationMs": 1200 }

// Pipeline run failed
{ "type": "pipeline:run:failed", "runId": "...", "error": "..." }
```

### 5.6 MongoDB Collections

#### `pipelines` (MODIFIED — existing)

Updated schema: adds `edges`, `description`, flexible `config` per node, `position`.

#### `pipeline_runs` (NEW)

```json
{
  "_id": ObjectId,
  "pipeline_id": ObjectId,
  "status": "running | completed | failed | paused | cancelled",
  "trigger_by": "user | schedule | webhook",
  "node_runs": [
    {
      "node_id": "IN-240-A1",
      "status": "completed",
      "started_at": ISODate,
      "ended_at": ISODate,
      "input": {},
      "output": {},
      "duration_ms": 245
    }
  ],
  "input": {},
  "output": {},
  "started_at": ISODate,
  "ended_at": ISODate,
  "created_at": ISODate
}
```

**Indexes:**
- `{ pipeline_id: 1, created_at: -1 }` — list runs by pipeline
- `{ status: 1 }` — filter by active runs

#### `form_templates` (NEW)

```json
{
  "_id": ObjectId,
  "name": "Government Tax Form 1040",
  "description": "US federal income tax return",
  "fields": [
    { "key": "name", "label": "Full Name", "type": "text", "required": true },
    { "key": "ssn", "label": "SSN", "type": "text", "required": true },
    { "key": "income", "label": "Total Income", "type": "number", "required": true }
  ],
  "version": "1.0",
  "created_at": ISODate,
  "updated_at": ISODate
}
```

---

## 6. Frontend Implementation Plan

### 6.1 Visual Workflow Builder with React Flow

**Library**: [React Flow](https://reactflow.dev/) — a mature, well-documented React library for building node-based editors.

**Why React Flow:**
- Custom node components (match our existing design system)
- Built-in drag, zoom, pan, minimap
- Edge connection validation
- Serializable state (nodes + edges JSON maps directly to our domain model)
- Supports handles (input/output ports per node)
- TypeScript-first with excellent types

#### Installation

```bash
npm install @xyflow/react
```

### 6.2 Frontend Component Architecture

```
src/renderer/src/
├── pages/
│   └── Workflows.tsx              (REFACTOR — becomes orchestrator)
├── components/
│   └── workflow/                  (NEW directory)
│       ├── WorkflowCanvas.tsx     — React Flow canvas with custom nodes
│       ├── WorkflowToolbar.tsx    — Top action bar (save, deploy, test, run)
│       ├── WorkflowSidebar.tsx    — Left panel: draggable node palette
│       ├── NodeConfigPanel.tsx    — Right panel: dynamic config editor
│       ├── RunMonitor.tsx         — Run history & real-time execution view
│       ├── nodes/                 — Custom React Flow node components
│       │   ├── IngestNode.tsx
│       │   ├── AIExtractNode.tsx
│       │   ├── TransformNode.tsx
│       │   ├── FormFillNode.tsx
│       │   ├── CustomAPINode.tsx
│       │   ├── ReviewNode.tsx
│       │   ├── ConditionNode.tsx
│       │   └── ExportNode.tsx
│       ├── config-forms/          — Per-node-type configuration forms
│       │   ├── IngestConfigForm.tsx
│       │   ├── TransformConfigForm.tsx
│       │   ├── FormFillConfigForm.tsx
│       │   ├── CustomAPIConfigForm.tsx
│       │   ├── ConditionConfigForm.tsx
│       │   └── ExportConfigForm.tsx
│       └── hooks/
│           ├── useWorkflowState.ts   — React Flow state management
│           ├── usePipelineExecution.ts — WebSocket run monitoring
│           └── useNodeConfigValidation.ts
├── data/
│   └── data-service.ts            (EXTEND — add execution + form template APIs)
└── shared/types/
    └── document.types.ts          (EXTEND — add new node types + edge type)
```

### 6.3 Custom Node Component Design

Each custom node in React Flow will match the existing Aura AI design language (dark glass-panel, cyan/purple/emerald accents):

```tsx
// Example: Custom node component for React Flow
import { Handle, Position, type NodeProps } from '@xyflow/react'

function IngestNode({ data, selected }: NodeProps) {
  return (
    <div className={`workflow-node ${selected ? 'active' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="workflow-node-icon-circle node-label-cyan">
        <UploadIcon size={16} />
      </div>
      <span className="workflow-node-label node-label-cyan">INGEST</span>
      <span className="workflow-node-name">{data.name}</span>
      {/* Status indicator during execution */}
      {data.runStatus && (
        <span className={`node-run-status ${data.runStatus}`} />
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

### 6.4 Node Palette (Drag & Drop)

Left sidebar will show all 8 node types as draggable cards. On drop onto canvas, a new node is created with default config. React Flow's `onDrop` + `onDragOver` handles this natively.

```
┌─────────────────┐
│  NODE LIBRARY   │
├─────────────────┤
│ 📥 Ingest       │  ← drag to canvas
│ 🤖 AI Extract   │
│ 🔄 Transform    │
│ 📝 Form Fill    │
│ 🔌 Custom API   │
│ ✅ Review       │
│ ⑂  Condition    │
│ 📤 Export       │
└─────────────────┘
```

### 6.5 Node Configuration Panel (Right Side)

When a node is selected on the canvas, the right panel renders a **dynamic form** based on the node type. Each node type has its own config form component (listed in §6.2).

Key features:
- **Transform node**: Configurable operation list builder (add/remove/reorder operations)
- **Form Fill node**: Template selector + visual field mapping UI
- **Custom API node**: Method selector, URL input, header editor, body template with `{{field}}` interpolation hints, response mapping builder
- **Condition node**: Rule builder with field selectors, operators, and target node dropdowns

### 6.6 Execution Monitor View

A toggle between **Design** and **Monitor** modes (already exists as a UI element):

- **Design mode**: Full canvas editor with drag-and-drop
- **Monitor mode**: Read-only canvas with live execution status per node
  - Nodes pulse green (running), glow green (completed), glow red (failed), glow amber (waiting review)
  - Side panel shows run history list + selected run details
  - Real-time WebSocket streaming of node progress

---

## 7. Pipeline Execution Flow (End-to-End)

### 7.1 Happy Path

```
User clicks "Run Pipeline"
         │
         ▼
Frontend: POST /api/v1/pipelines/{id}/execute
         │
         ▼
Backend: PipelineExecutionService.Execute()
  1. Load pipeline definition (nodes + edges)
  2. Validate all nodes (config schema checks)
  3. Create PipelineRun record (status: running)
  4. Build DAG from edges, topological sort
  5. Stream WS event: pipeline:run:start
         │
         ▼
  FOR each node in topological order:
    6. Stream WS event: pipeline:node:start
    7. NodeRegistry.Get(node.type) → executor
    8. executor.Execute(ctx, node, inputDataPacket) → outputDataPacket
    9. Persist NodeRunResult to pipeline_run
    10. Stream WS event: pipeline:node:complete
    11. Pass outputDataPacket as input to next node(s)
         │
         ▼
  IF review node encountered:
    12. Stream WS event: pipeline:node:review
    13. Set run status to "paused"
    14. Wait for POST /api/v1/runs/{runId}/nodes/{nodeId}/approve
    15. Resume execution from next node
         │
         ▼
  IF condition node:
    16. Evaluate rules against current DataPacket fields
    17. Select matching edge target
    18. Continue execution along selected branch
         │
         ▼
  All nodes complete:
    19. Set run status to "completed"
    20. Stream WS event: pipeline:run:complete
    21. Persist final output to PipelineRun
```

### 7.2 Error Handling

- **Node execution failure**: Mark node as `failed`, set run to `failed`, stream error event
- **Custom API timeout**: Retry per configured policy, then fail node
- **Review timeout**: Auto-reject after configured hours (optional)
- **Pipeline cancellation**: User sends cancel request, engine context is cancelled

---

## 8. Custom API System (Deep Dive)

The Custom API node is designed for maximum flexibility:

### 8.1 Template Interpolation Engine

All string values in the API config support `{{...}}` template interpolation:

```
{{fields.name}}           → value of extracted field "name"
{{fields.amount}}         → value of extracted field "amount"
{{env.API_KEY}}           → environment variable (server-side)
{{meta.documentId}}       → document ID from DataPacket metadata
{{meta.timestamp}}        → ISO timestamp
{{run.id}}                → current pipeline run ID
{{pipeline.name}}         → pipeline name
```

### 8.2 Response Mapping

After the HTTP call, map response JSON back into the DataPacket:

```json
{
  "responseMapping": {
    "confirmation_id": "response.data.id",
    "filing_status": "response.data.status",
    "receipt_url": "response.data.receiptUrl"
  }
}
```

These mapped fields are added to the DataPacket and available to subsequent nodes.

### 8.3 Security Considerations

- **Secrets**: API keys stored as `env.` references, resolved server-side only
- **URL allowlist**: Optional domain whitelist to prevent SSRF
- **Timeout enforcement**: Max 60s per request
- **Response size limit**: Max 5MB response body

### 8.4 Test Endpoint

`POST /api/v1/pipelines/test-api` allows users to test their API configuration with sample data before deploying:

```json
{
  "method": "POST",
  "url": "https://api.example.com/submit",
  "headers": { "Authorization": "Bearer ..." },
  "body": { "name": "John Doe", "amount": 1500 },
  "timeout": 10
}
```

Returns: status code, response headers, response body preview.

---

## 9. Form Filling System (Deep Dive)

### 9.1 Form Template Management

Users create **form templates** that define the target form structure:

```json
{
  "name": "Tax Filing Form",
  "fields": [
    { "key": "taxpayer_name", "label": "Taxpayer Name", "type": "text", "required": true },
    { "key": "filing_date", "label": "Filing Date", "type": "date", "required": true },
    { "key": "gross_income", "label": "Gross Income", "type": "number", "required": true },
    { "key": "deductions", "label": "Deductions", "type": "number", "required": false, "default": 0 }
  ]
}
```

### 9.2 Field Mapping (Visual UI)

The Form Fill config form provides a **visual mapper**:

```
┌────────────────────────────────────────────────────────┐
│  FIELD MAPPING: Tax Filing Form                        │
├────────────────────────────────────────────────────────┤
│  Extracted Field          →  Form Field                │
│  ─────────────────────────────────────────────         │
│  [name           ▾]      →  [taxpayer_name   ▾]       │
│  [date           ▾]      →  [filing_date     ▾]       │
│  [total_amount   ▾]      →  [gross_income    ▾]       │
│  [-- unmapped --]         →  [deductions      ▾]       │
│                              ↳ default: 0              │
│                                                        │
│  + Add Mapping                                         │
└────────────────────────────────────────────────────────┘
```

### 9.3 Form Fill via Custom API (Filing)

After mapping, the Form Fill node can:

1. **Generate a filled PDF** (using a PDF template engine on the backend)
2. **Submit to an external API** (delegate to a chained Custom API node)
3. **Store as structured data** for downstream review/export

The `autoSubmit` flag in config controls whether the filled form is automatically filed via a linked Custom API node or held for manual submission.

---

## 10. Data Transformation Engine (Deep Dive)

### 10.1 Supported Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `rename` | Rename a field key | `vendor_name` → `company` |
| `compute` | Create a computed field using expressions | `total_with_tax = amount * 1.18` |
| `format` | Format a field value | `date` → `YYYY-MM-DD` |
| `filter` | Remove fields not matching a condition | `confidence > 0.5` |
| `default` | Set a default value if field is missing/null | `currency` → `USD` |
| `coerce` | Type coercion | `amount` (string) → `amount` (number) |
| `split` | Split a field into multiple | `full_name` → `first_name`, `last_name` |
| `concat` | Concatenate fields | `first_name` + `last_name` → `full_name` |
| `lookup` | Replace value from a lookup table | `country_code` → `country_name` |
| `regex` | Extract via regex | `\d+\.\d{2}` from text → `amount` |

### 10.2 Expression Engine

For `compute` operations, use a lightweight expression evaluator (no full scripting):

```
amount * 1.18
price * quantity
confidence >= 0.9 ? "high" : "low"
```

Backend implementation: use Go's `govaluate` package for safe expression evaluation.

---

## 11. Shared Types Updates

#### File: `src/shared/types/document.types.ts` (MODIFY)

```typescript
// Extended node types
export type PipelineNodeType =
  | 'ingest'
  | 'ai_extract'
  | 'transform'
  | 'form_fill'
  | 'custom_api'
  | 'review'
  | 'condition'
  | 'export'

// Node config is now a flexible record
export interface PipelineNodeConfig {
  [key: string]: unknown
}

// Added position for React Flow
export interface NodePosition {
  readonly x: number
  readonly y: number
}

// Updated PipelineNode
export interface PipelineNode {
  readonly id: string
  readonly label: string
  readonly name: string
  readonly type: PipelineNodeType
  readonly icon: string
  readonly position: NodePosition
  readonly config: PipelineNodeConfig
}

// NEW: Pipeline Edge
export interface PipelineEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly label?: string
}

// Updated PipelineMetadata
export interface PipelineMetadata {
  readonly id?: string
  readonly name: string
  readonly description: string
  readonly status: string
  readonly latency: string
  readonly workspace: string
  readonly version: string
}

// NEW: Pipeline Run types
export type PipelineRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type NodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_review'

export interface NodeRunResult {
  readonly nodeId: string
  readonly status: NodeRunStatus
  readonly startedAt: string
  readonly endedAt?: string
  readonly output?: Record<string, unknown>
  readonly error?: string
  readonly durationMs: number
}

export interface PipelineRun {
  readonly _id: string
  readonly pipelineId: string
  readonly status: PipelineRunStatus
  readonly triggerBy: string
  readonly nodeRuns: readonly NodeRunResult[]
  readonly startedAt: string
  readonly endedAt?: string
}
```

---

## 12. Phased Delivery Roadmap

### Phase 1: Foundation (Week 1–2)

- [ ] Extend domain models (`PipelineEdge`, `NodePosition`, flexible config)
- [ ] Integrate React Flow into `Workflows.tsx`
- [ ] Implement drag-and-drop node palette
- [ ] Implement node config panel with dynamic forms
- [ ] Migrate existing mock data to new schema
- [ ] Update pipeline CRUD API to handle edges + positions

### Phase 2: Execution Engine (Week 3–4)

- [ ] Build `engine/executor.go` with DAG walker
- [ ] Implement `NodeExecutor` interface + registry
- [ ] Build Ingest node executor (wraps existing OCR)
- [ ] Build AI Extract node executor (wraps existing `KiloClient`)
- [ ] Build Export node executor (wraps existing export handler)
- [ ] Create `pipeline_runs` collection + repository
- [ ] Add execution API endpoints
- [ ] Wire WebSocket for real-time run progress

### Phase 3: Transform & Form Fill (Week 5–6)

- [ ] Build Transform node executor (rename, compute, format, filter, coerce)
- [ ] Build expression evaluator (`govaluate` integration)
- [ ] Build Form Fill node executor
- [ ] Create form template CRUD (API + MongoDB collection)
- [ ] Build frontend visual field mapper component
- [ ] Build Transform operation list builder UI

### Phase 4: Custom API & Condition (Week 7–8)

- [ ] Build Custom API node executor (HTTP client + template interpolation)
- [ ] Build Condition node executor (rule evaluation + branch selection)
- [ ] Add API test endpoint
- [ ] Build Custom API config form with header/body editors
- [ ] Build Condition rule builder UI
- [ ] Add retry/timeout policies

### Phase 5: Monitor & Polish (Week 9–10)

- [ ] Build Monitor mode with live node status visualization
- [ ] Build run history list + run detail view
- [ ] Add Review node with human approval flow
- [ ] Pipeline validation (pre-execution checks)
- [ ] Error recovery + cancel support
- [ ] Performance optimization (batch inserts, connection pooling)
- [ ] End-to-end testing

---

## 13. File Change Summary

### Backend — New Files

| File | Purpose |
|------|---------|
| `backend/internal/domain/pipeline_run.go` | Run tracking domain model |
| `backend/internal/engine/executor.go` | DAG execution engine |
| `backend/internal/engine/registry.go` | Node type registry |
| `backend/internal/engine/data_packet.go` | DataPacket definition |
| `backend/internal/engine/nodes/ingest.go` | Ingest node executor |
| `backend/internal/engine/nodes/ai_extract.go` | AI extraction executor |
| `backend/internal/engine/nodes/transform.go` | Transform executor |
| `backend/internal/engine/nodes/form_fill.go` | Form fill executor |
| `backend/internal/engine/nodes/custom_api.go` | HTTP call-out executor |
| `backend/internal/engine/nodes/review.go` | Review gate executor |
| `backend/internal/engine/nodes/condition.go` | Conditional branching executor |
| `backend/internal/engine/nodes/export.go` | Export executor |
| `backend/internal/repository/pipeline_run_repo.go` | Run persistence |
| `backend/internal/repository/form_template_repo.go` | Form template CRUD |
| `backend/internal/service/pipeline_exec_svc.go` | Execution orchestration service |
| `backend/internal/handler/execution_handler.go` | Execution API handler |
| `backend/internal/handler/review_handler.go` | Review approval handler |
| `backend/internal/handler/form_template_handler.go` | Form template handler |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/internal/domain/pipeline.go` | Add edges, position, flexible config |
| `backend/internal/server/router.go` | Register new endpoints |
| `backend/cmd/server/main.go` | Wire engine + new services |

### Frontend — New Files

| File | Purpose |
|------|---------|
| `src/renderer/src/components/workflow/WorkflowCanvas.tsx` | React Flow canvas |
| `src/renderer/src/components/workflow/WorkflowToolbar.tsx` | Top action bar |
| `src/renderer/src/components/workflow/WorkflowSidebar.tsx` | Node palette |
| `src/renderer/src/components/workflow/NodeConfigPanel.tsx` | Dynamic config editor |
| `src/renderer/src/components/workflow/RunMonitor.tsx` | Execution monitor |
| `src/renderer/src/components/workflow/nodes/*.tsx` | 8 custom node components |
| `src/renderer/src/components/workflow/config-forms/*.tsx` | 6 config form components |
| `src/renderer/src/components/workflow/hooks/*.ts` | 3 custom hooks |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `src/renderer/src/pages/Workflows.tsx` | Refactor to use React Flow components |
| `src/renderer/src/data/data-service.ts` | Add execution/form-template APIs |
| `src/shared/types/document.types.ts` | Extended types for new node system |

---

## 14. Migration Strategy

### 14.1 Backward Compatibility

The existing `PipelineNodeConfig` struct (with `strictJsonSchema`, `dataTypeMatching`, etc.) will be preserved during migration. Old pipelines with the rigid config will continue to work:

1. Add an `edges` field to existing pipelines (auto-generate linear edges from node order)
2. Add `position` to nodes (auto-layout in a line: x = index * 250, y = 300)
3. Convert old config struct to `map[string]any` format (one-time migration script)

### 14.2 Data Migration Script

Create `backend/seed/migrate_pipelines.go` to:

1. Read all existing pipelines
2. Generate edges from sequential node order
3. Generate positions for linear layout
4. Convert typed config to map format
5. Update documents in MongoDB

---

## 15. Testing Strategy

### 15.1 Backend

- **Unit tests**: Each `NodeExecutor` implementation tested in isolation
- **Integration tests**: Full pipeline execution with test MongoDB
- **API tests**: All new endpoints tested with httptest

### 15.2 Frontend

- **Component tests**: Each custom node and config form tested
- **Integration tests**: React Flow canvas interaction tests
- **E2E**: Full pipeline build → save → execute flow via Electron

### 15.3 Smoke Tests

- Create a pipeline: Ingest → AI Extract → Transform → Form Fill → Custom API → Export
- Execute with a sample PDF document
- Verify each node processes correctly
- Verify WebSocket events stream in real-time
- Verify final output is correct

---

## 16. Dependencies

### Backend

| Package | Purpose |
|---------|---------|
| `github.com/Knetic/govaluate` | Expression evaluation for Transform node |
| (existing) `go.mongodb.org/mongo-driver/v2` | MongoDB operations |
| (existing) Kilo AI client | AI field extraction |
| (existing) Tesseract OCR | Document text extraction |

### Frontend

| Package | Purpose |
|---------|---------|
| `@xyflow/react` | React Flow visual editor |
| (existing) `react-router-dom` | Routing |
| (existing) `zod` | Validation |

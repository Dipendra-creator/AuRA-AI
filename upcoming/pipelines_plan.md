# 🚀 Aura AI — Pipelines: Architecture & Implementation Plan

> **Date**: 2026-03-14  
> **Status**: Planning  
> **Owner**: Aura AI Team

---

## 1. What Are Pipelines?

Pipelines (called "Workflows" in the UI) allow users to build **visual, DAG-based document processing workflows**. A user drags nodes onto a canvas, connects them with edges, saves the graph, and then hits "Run". The system executes the nodes in topological order, passing a structured `DataPacket` between them.

---

## 2. Current State (What Exists vs. What's Dummy)

### ✅ Already Real / Functional
| Layer | What works |
|-------|-----------|
| **Frontend UI** | `Workflows.tsx` — full dashboard list + React Flow canvas editor |
| **Frontend Components** | `WorkflowCanvas`, `WorkflowNode`, `NodeConfigPanel`, `ExecutionLogPanel`, `WorkflowSidebar` |
| **Shared Types** | All pipeline/node/run types in `src/shared/types/document.types.ts` |
| **Data Service** | All API calls in `data-service.ts` (CRUD, execute, runs, cancel) |
| **Go Backend — Domain** | `pipeline.go`, `pipeline_run.go` — all entities defined |
| **Go Backend — Engine** | `executor.go` — full DAG traversal, Kahn's topological sort, progress events |
| **Go Backend — Nodes** | All 8 node type files exist in `engine/nodes/` |
| **Go Backend — HTTP API** | Full REST routes in `execution_handler.go` + `pipeline_handler.go` |
| **Go Backend — WebSocket** | `ws_handler.go` exists for real-time streaming |

### ❌ Currently Dummy / Incomplete
| Gap | Location | Severity |
|-----|----------|----------|
| `review` node blocks silently | `nodes/review.go` — sets status `waiting_review` but nothing unblocks it | 🔴 High |
| `condition` node doesn't fork DAG | `nodes/condition.go` — `executor.go` executes ALL nodes, not the conditional branch | 🔴 High |
| `form_fill` only maps fields in-memory | No PDF/DOCX writing; `nodes/form_fill.go` stores values in `DataPacket` only | 🟡 Medium |
| `ai_extract` needs `KILO_API_KEY` | Falls through gracefully if env var missing; works when key is set | 🟡 Medium |
| `export` only does CSV | `nodes/export.go` — XLSX/PDF output is not implemented | 🟡 Medium |
| WebSocket not used by frontend | `ws-client.ts` exists but `Workflows.tsx` polls REST instead of using WS | 🟡 Medium |
| `NodeConfigPanel` config not persisted to node | Config is edited in-panel but `handleSave` re-saves the whole canvas; config changes need to flow through `WorkflowCanvas → onSave` | 🟠 Low-Med |
| No retry/backoff on `custom_api` | `nodes/custom_api.go` — single HTTP call, no retry | 🟢 Low |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                               │
│                                                                 │
│  Workflows.tsx                                                  │
│    ├── Dashboard View (pipeline cards + run history)            │
│    └── Editor View                                              │
│          ├── WorkflowCanvas (React Flow)                        │
│          │     ├── WorkflowNode × N                             │
│          │     └── WorkflowSidebar (drag-and-drop palette)      │
│          ├── NodeConfigPanel (right-side drawer)                │
│          └── ExecutionLogPanel (bottom drawer)                  │
│                                                                 │
│  data/data-service.ts  ──────────────────────────────────────┐  │
│  data/ws-client.ts    (WebSocket for real-time events)       │  │
└──────────────────────────────────────────────────────────────┼──┘
                                                               │
                          HTTP REST / WebSocket                │
                                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Go Backend  (backend/)                                         │
│                                                                 │
│  handler/                                                       │
│    ├── pipeline_handler.go   (CRUD: list/get/create/update/del) │
│    ├── execution_handler.go  (execute/runs/cancel/validate)     │
│    └── ws_handler.go         (WebSocket streaming)              │
│                                                                 │
│  service/                                                       │
│    ├── pipeline_svc.go       (CRUD business logic)              │
│    └── pipeline_exec_svc.go  (orchestrates execution)           │
│                                                                 │
│  engine/                                                        │
│    ├── executor.go           (DAG walk, topo sort, run record)  │
│    ├── registry.go           (node type → executor mapping)     │
│    ├── data_packet.go        (DataPacket: fields, files, text)  │
│    └── nodes/                                                   │
│          ├── doc_select.go   ✅ Fetches docs from MongoDB        │
│          ├── ai_extract.go   ✅ Calls Kilo API (needs env key)   │
│          ├── transform.go    ✅ JS-expression field transforms    │
│          ├── condition.go    ❌ Branches not wired to executor   │
│          ├── form_fill.go    ❌ In-memory only, no PDF write     │
│          ├── custom_api.go   ✅ HTTP with no retry               │
│          ├── review.go       ❌ Halts but nothing resumes it     │
│          └── export.go       ❌ CSV only                         │
│                                                                 │
│  repository/                                                    │
│    ├── pipeline_repo.go      (MongoDB CRUD for pipelines)       │
│    └── pipeline_run_repo.go  (MongoDB CRUD for runs)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Node Types Deep Dive

Each node receives a `DataPacket` (fields map, raw text, file references, errors) and returns a modified `DataPacket`.

| Node Type | Config Keys | Input Expects | Output Produces |
|-----------|-------------|---------------|-----------------|
| `doc_select` | `documentIds[]`, `includeRawText`, `includeExtractedFields` | Initial packet | Loads doc text + fields from MongoDB |
| `ai_extract` | `prompt`, `confidenceThreshold` | RawText | Adds AI-extracted fields |
| `transform` | `transformations[]` (`{sourceField, targetField, expression}`) | Any fields | Renames/maps/computes fields |
| `condition` | `field`, `operator`, `value`, `trueEdgeLabel`, `falseEdgeLabel` | Any fields | Should route to true/false branch |
| `form_fill` | `fieldMapping{}`, `validationRules[]` | Any fields | Maps extracted → form fields |
| `custom_api` | `url`, `method`, `headers{}`, `bodyTemplate` | Any fields | Calls external HTTP API, merges response |
| `review` | *(none)* | Any fields | Pauses run, waits for human approval |
| `export` | `format` (`csv`\|`xlsx`), `filename`, `fields[]` | Any fields | Produces file artifact |

---

## 5. Data Flow: End-to-End Execution

```
User clicks "Run" in WorkflowCanvas
    │
    ▼
handleExecute() in Workflows.tsx
    │  POST /api/v1/pipelines/{id}/execute
    ▼
ExecutionHandler.Execute() [Go]
    │
    ▼
PipelineExecService.Execute()
    │  Fetches pipeline from MongoDB
    ▼
PipelineExecutor.Execute()
    │  1. validatePipeline() — checks all node types are registered
    │  2. topologicalSort() — Kahn's BFS algorithm
    │  3. For each node in order:
    │       a. resolveNodeInput() — merge parent outputs
    │       b. registry.Get(node.Type) → NodeExecutor
    │       c. executor.Execute(ctx, node, input)
    │       d. runRepo.UpdateNodeRun() — persist result
    │       e. sendEvent() → progressCh
    │  4. runRepo.UpdateStatus(completed/failed)
    │
    ▼
HTTP response: PipelineRun JSON
    │
    ▼
Workflows.tsx receives run
    │  If terminal status: done
    │  If running: startPolling(1s interval → GET /runs/{id})
    ▼
ExecutionLogPanel shows per-node results
```

---

## 6. Phased Implementation Plan

### Phase 1 — Make Execution Real (Priority: HIGH) 🔴

**Goal**: Fix the two broken node types that make execution meaningfully work.

#### 1a. Fix `condition` node branching in executor
- **File**: `backend/internal/engine/executor.go`
- **Problem**: `topologicalSort` returns **all** nodes; `condition` evaluates a predicate but the executor still runs every node after it regardless of the branch.
- **Fix**: After a `condition` node executes, read its output field `condition_result` (true/false). Determine which outgoing edge to follow. Mark nodes on the non-taken branch as `skipped` in the run record.
- **New field in `DataPacket`**: `SkippedNodes []string`

#### 1b. Fix `review` node — human-in-the-loop approval
- **File**: `backend/internal/engine/nodes/review.go`
- **Problem**: Node sets `NodeRun.Status = waiting_review` but the executor has no mechanism to pause and resume.
- **Fix**:
  - The `review` node executor writes `waiting_review` to its run record and **returns a special sentinel error** (`ErrWaitingReview`).
  - `executor.go` catches `ErrWaitingReview`: saves partial run, **returns a run in `paused` status** instead of `failed`.
  - Frontend: detect `paused` status in polling, show "Waiting for Review" badge + Approve/Reject buttons.
  - Frontend calls `POST /runs/{runId}/nodes/{nodeId}/approve` or `.../reject`.
  - Backend `review_handler.go` (already exists) updates the node run status and **resumes execution** from that node forward.

---

### Phase 2 — Improve Node Quality (Priority: MEDIUM) 🟡

#### 2a. `export` node — add XLSX support
- **File**: `backend/internal/engine/nodes/export.go`
- **Dependency**: Add `github.com/xuri/excelize/v2` to `go.mod`
- **Change**: Switch on `format` config value; write XLSX via excelize if `xlsx`, CSV otherwise.

#### 2b. `form_fill` node — write output to file
- **File**: `backend/internal/engine/nodes/form_fill.go`
- **Change**: After mapping fields, produce a JSON artifact file at `uploads/form_results_{runId}.json`. Add `FileReference` to the output `DataPacket`.

#### 2c. `custom_api` node — add retry with exponential backoff
- **File**: `backend/internal/engine/nodes/custom_api.go`
- **Change**: Add config key `retryCount` (default 0); implement simple retry loop with 1s, 2s, 4s delays.

---

### Phase 3 — Real-Time Streaming (Priority: MEDIUM) 🟡

**Goal**: Replace polling with WebSocket events.

#### 3a. Connect frontend WebSocket client to pipeline events
- **File**: `src/renderer/src/data/ws-client.ts` (already has `wsClient`)
- **File**: `src/renderer/src/pages/Workflows.tsx`
- **Change**: In `handleExecute`, after starting the run, subscribe to `wsClient.subscribePipelineRun(runId, onEvent)` instead of `startPolling()`.
- **Backend**: `ws_handler.go` already broadcasts `PipelineEvent` — verify it sends events for pipeline runs (may need to wire `progressCh` to WS broadcast).

---

### Phase 4 — Frontend UX Improvements (Priority: LOW) 🟢

#### 4a. NodeConfigPanel config persistence
- Ensure node config changes in `NodeConfigPanel` are flushed back through the React Flow node data model and trigger an auto-save.

#### 4b. Add "Documents" picker to `doc_select` config panel
- In `NodeConfigPanel`, when `node.type === 'doc_select'`, render a searchable list of user's documents to pick from (call `GET /documents`), rather than requiring manual ID entry.

#### 4c. `condition` node visual branching in canvas
- When a condition node is in the graph, visually label outgoing edges "✓ True" and "✗ False" in `WorkflowCanvas`.

---

## 7. MongoDB Collections (Already Exist)

| Collection | Purpose |
|------------|---------|
| `pipelines` | Pipeline definitions (name, nodes[], edges[]) |
| `pipeline_runs` | Run records (status, nodeRuns[], input, output) |

No new collections needed for Phase 1–3.

---

## 8. IPC Contracts (No Changes Needed)

Electron IPC is **not used** for pipeline execution — it goes directly Go HTTP API → renderer via `fetch`. No IPC contract changes needed.

---

## 9. File Change Summary

### Go Backend

| File | Action | Phase |
|------|--------|-------|
| `backend/internal/engine/executor.go` | Modify — condition branching + `ErrWaitingReview` | 1 |
| `backend/internal/engine/nodes/review.go` | Modify — return sentinel error | 1 |
| `backend/internal/engine/nodes/condition.go` | Modify — populate `condition_result` + skipped nodes | 1 |
| `backend/internal/handler/review_handler.go` | Modify — approve/reject resumes execution | 1 |
| `backend/internal/engine/nodes/export.go` | Modify — add XLSX | 2 |
| `backend/internal/engine/nodes/form_fill.go` | Modify — write JSON artifact | 2 |
| `backend/internal/engine/nodes/custom_api.go` | Modify — retry logic | 2 |

### Frontend (TypeScript/React)

| File | Action | Phase |
|------|--------|-------|
| `src/renderer/src/pages/Workflows.tsx` | Modify — WS instead of polling + review UI | 1, 3 |
| `src/renderer/src/components/workflow/NodeConfigPanel.tsx` | Modify — doc picker for `doc_select`, edge labels for `condition` | 4 |
| `src/renderer/src/data/ws-client.ts` | Modify — add pipeline run subscription method | 3 |
| `src/shared/types/document.types.ts` | Modify — add `paused` status, `skippedNodes` | 1 |

---

## 10. Verification Plan

### Automated Tests (Existing)
- `backend/internal/engine/nodes/doc_select_test.go` — Run with `cd backend && go test ./internal/engine/nodes/... -v`
- `backend/internal/handler/ws_handler_test.go` — Run with `cd backend && go test ./internal/handler/... -v`
- `backend/internal/handler/export_handler_test.go` — Run with `cd backend && go test ./internal/handler/... -v`

### Compile Check
```bash
cd backend && go build ./...
cd backend && go vet ./...
```

### Manual E2E Test (Per Phase)

**Phase 1 — condition branching**:
1. `cd backend && make run` (start Go server)
2. `npm run dev` (start Electron)
3. Create a pipeline with: `doc_select → ai_extract → condition (field: extraction_complete, op: equals, value: true) → export`
4. Run the pipeline; verify in ExecutionLogPanel that only the correct branch executed (skipped nodes show `skipped` status)

**Phase 1 — review node**:
1. Create pipeline with `doc_select → review → export`
2. Run it; verify run goes to `paused` state
3. Click "Approve" in the UI
4. Verify pipeline resumes and `export` node completes

**Phase 2 — XLSX export**:
1. Create pipeline with `doc_select → export (format: xlsx)`
2. Run it; check `backend/uploads/` for a valid `.xlsx` file

**Phase 3 — WebSocket**:
1. Open browser devtools Network tab
2. Run a pipeline and confirm a WebSocket connection is established (no polling GETs)

---

## 11. Design References

- `designs/workflow_builder/screen.png` — Visual reference for the canvas layout
- `designs/workflow_builder/code.html` — HTML mockup for node styling

All changes must comply with `/.antigravity/rules.md`.

---

## 12. Next Upcoming Task — Templates Marketplace ("Tamplets")

> **Date**: 2026-03-17  
> **Status**: Planned  
> **Owner**: Aura AI Team  
> **Objective**: Build a **Templates Marketplace** page that shows default workflow templates for every team in an organization. Clicking a template should import it into Pipelines so users can run/edit immediately.

---

## 13. Product Scope

### In Scope (v1)
- New **Templates** page (sidebar item currently labeled `Templates` / page id `ai-models`)
- Curated default templates by team/domain (Finance, Legal, HR, Healthcare, Government, E-Commerce, General)
- Search + category filters
- Template card preview with mini workflow DAG
- "Use Template" action that creates a real pipeline via existing API
- Redirect user to Workflows page after successful import

### Out of Scope (v1)
- User-created custom template publishing
- Template version upgrades/migrations
- Rating/review marketplace mechanics
- Org-private RBAC-based template catalogs

---

## 14. Functional Requirements

1. User opens **Templates** page.
2. User sees default template catalog grouped by team categories.
3. User can search templates by name/description.
4. User clicks a template card to open details drawer.
5. User can optionally set quick config (e.g., workflow name, export format, webhook URL).
6. User clicks **Use This Template**.
7. App generates a pipeline payload from template definition.
8. App calls existing `POST /api/v1/pipelines`.
9. New pipeline appears in Workflows and is ready to execute.

---

## 15. Technical Design

### 15.1 Data Strategy
- Use **frontend static seeded template registry** for v1.
- Keep backend unchanged for browsing.
- Use current pipeline create endpoint for import.

### 15.2 Core Interfaces
- `PipelineTemplate`
- `TemplateCategory`
- `QuickConfigField`
- `buildPipelineFromTemplate(template, quickConfig)`

### 15.3 Import Behavior
- Deep clone `defaultPipeline` from selected template.
- Apply quick-config values to mapped node config keys.
- Generate unique workflow name if collision occurs (`(2)`, `(3)`, ...).
- Submit to create pipeline API.

---

## 16. Implementation Phases

### Phase A — Foundations (High)
- Add template type definitions and registry data file
- Seed initial catalog (minimum 12 high-value templates)
- Implement template-to-pipeline transformer utility

### Phase B — Templates Page UI (High)
- Build `Templates.tsx` page with:
    - Header + search
    - Category tabs
    - Responsive template grid
- Implement template cards with metadata and mini DAG strip

### Phase C — Preview + Quick Config (High)
- Add right-side preview drawer
- Render quick-config dynamic form based on `QuickConfigField[]`
- Add loading and error states for "Use Template"

### Phase D — Import + Navigation (High)
- Wire create pipeline call to existing data service
- On success: show toast + navigate to Workflows page
- Ensure imported pipeline opens with correct nodes/edges/config

### Phase E — UX Polish (Medium)
- Empty state for no search results
- Offline/disabled create state
- Duplicate naming safeguards
- Subtle visual polish aligned with Aura dark-glass style

---

## 17. File Change Plan

### New Files
- `src/renderer/src/pages/Templates.tsx`
- `src/renderer/src/data/pipeline-templates.ts`
- `src/renderer/src/components/templates/TemplateGrid.tsx`
- `src/renderer/src/components/templates/TemplateCard.tsx`
- `src/renderer/src/components/templates/TemplatePreviewDrawer.tsx`
- `src/renderer/src/components/templates/MiniPipelinePreview.tsx`
- `src/renderer/src/components/templates/QuickConfigForm.tsx`

### Modified Files
- `src/renderer/src/App.tsx` (route `ai-models` to templates page)
- `src/renderer/src/data/data-service.ts` (reuse/create pipeline API call path if needed)

### Backend Changes
- **No backend changes required for v1**

---

## 18. Acceptance Criteria

- [ ] Templates page loads and displays default catalog
- [ ] Category filter + search work correctly
- [ ] Template detail drawer opens with workflow preview
- [ ] Quick-config values are applied to imported pipeline
- [ ] Clicking "Use This Template" creates pipeline successfully
- [ ] User is redirected to Workflows and can run imported pipeline
- [ ] API failure shows recoverable error state (retry without data loss)
- [ ] Duplicate workflow names are handled gracefully

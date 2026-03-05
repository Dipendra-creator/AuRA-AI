package engine

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// ProgressEvent is sent through the progress channel during execution.
type ProgressEvent struct {
	Event domain.PipelineEvent
}

// PipelineExecutor orchestrates the execution of a pipeline DAG.
type PipelineExecutor struct {
	registry *NodeRegistry
	runRepo  *repository.PipelineRunRepo
}

// NewPipelineExecutor creates a new PipelineExecutor.
func NewPipelineExecutor(registry *NodeRegistry, runRepo *repository.PipelineRunRepo) *PipelineExecutor {
	return &PipelineExecutor{
		registry: registry,
		runRepo:  runRepo,
	}
}

// Execute runs a pipeline end-to-end: validates, creates a run record,
// walks the DAG in topological order, and streams progress events.
func (e *PipelineExecutor) Execute(
	ctx context.Context,
	pipeline *domain.Pipeline,
	input DataPacket,
	progressCh chan<- domain.PipelineEvent,
) (*domain.PipelineRun, error) {
	defer close(progressCh)

	// Validate all nodes before execution
	if err := e.validatePipeline(pipeline); err != nil {
		return nil, fmt.Errorf("pipeline validation failed: %w", err)
	}

	// Build the DAG and get topological order
	order, err := e.topologicalSort(pipeline)
	if err != nil {
		return nil, fmt.Errorf("DAG sort failed: %w", err)
	}

	// Create a run record
	now := time.Now()
	run := &domain.PipelineRun{
		PipelineID: pipeline.ID,
		Status:     domain.RunStatusRunning,
		TriggerBy:  "user",
		NodeRuns:   []domain.NodeRunResult{},
		Input:      input.Fields,
		StartedAt:  now,
	}
	run, err = e.runRepo.Create(ctx, run)
	if err != nil {
		return nil, fmt.Errorf("failed to create pipeline run: %w", err)
	}

	runIDHex := run.ID.Hex()
	pipelineIDHex := pipeline.ID.Hex()

	// Stream: run started
	e.sendEvent(progressCh, domain.PipelineEvent{
		Type:       "pipeline:run:start",
		PipelineID: pipelineIDHex,
		RunID:      runIDHex,
	})

	// Build node lookup
	nodeMap := make(map[string]domain.PipelineNode, len(pipeline.Nodes))
	for _, n := range pipeline.Nodes {
		nodeMap[n.NodeID] = n
	}

	// Execute nodes in topological order
	nodeOutputs := make(map[string]DataPacket)
	var lastOutput DataPacket = input

	for _, nodeID := range order {
		select {
		case <-ctx.Done():
			_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusCancelled, nil)
			e.sendEvent(progressCh, domain.PipelineEvent{
				Type:  "pipeline:run:cancelled",
				RunID: runIDHex,
				Error: "pipeline execution cancelled",
			})
			run.Status = domain.RunStatusCancelled
			return run, ctx.Err()
		default:
		}

		node, ok := nodeMap[nodeID]
		if !ok {
			continue
		}

		// Determine input: merge outputs from all parent nodes, or use the last output
		nodeInput := e.resolveNodeInput(node, pipeline.Edges, nodeOutputs, lastOutput)

		// Get executor for this node type
		executor, err := e.registry.Get(node.Type)
		if err != nil {
			e.handleNodeFailure(ctx, run, node, err, progressCh, runIDHex)
			run.Status = domain.RunStatusFailed
			return run, err
		}

		// Stream: node started
		e.sendEvent(progressCh, domain.PipelineEvent{
			Type:     "pipeline:node:start",
			RunID:    runIDHex,
			NodeID:   node.NodeID,
			NodeName: node.Name,
		})

		// Execute the node
		nodeStart := time.Now()
		nodeResult := domain.NodeRunResult{
			NodeID:    node.NodeID,
			Status:    domain.NodeRunRunning,
			StartedAt: nodeStart,
		}

		output, execErr := executor.Execute(ctx, node, nodeInput)
		nodeEnd := time.Now()
		duration := nodeEnd.Sub(nodeStart).Milliseconds()
		nodeResult.EndedAt = &nodeEnd
		nodeResult.DurationMs = duration

		if execErr != nil {
			nodeResult.Status = domain.NodeRunFailed
			nodeResult.Error = execErr.Error()
			_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
			run.NodeRuns = append(run.NodeRuns, nodeResult)

			e.sendEvent(progressCh, domain.PipelineEvent{
				Type:   "pipeline:node:error",
				RunID:  runIDHex,
				NodeID: node.NodeID,
				Error:  execErr.Error(),
			})

			_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusFailed, nil)
			e.sendEvent(progressCh, domain.PipelineEvent{
				Type:  "pipeline:run:failed",
				RunID: runIDHex,
				Error: fmt.Sprintf("node %s failed: %s", node.Name, execErr.Error()),
			})
			run.Status = domain.RunStatusFailed
			return run, execErr
		}

		// Node succeeded
		nodeResult.Status = domain.NodeRunCompleted
		nodeResult.Output = output.Fields
		_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
		run.NodeRuns = append(run.NodeRuns, nodeResult)

		nodeOutputs[node.NodeID] = output
		lastOutput = output

		slog.Info("node executed",
			"node", node.Name,
			"type", node.Type,
			"durationMs", duration,
		)

		e.sendEvent(progressCh, domain.PipelineEvent{
			Type:       "pipeline:node:complete",
			RunID:      runIDHex,
			NodeID:     node.NodeID,
			Output:     output.Fields,
			DurationMs: duration,
		})
	}

	// All nodes complete
	totalDuration := time.Since(now).Milliseconds()
	_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusCompleted, lastOutput.Fields)

	e.sendEvent(progressCh, domain.PipelineEvent{
		Type:       "pipeline:run:complete",
		RunID:      runIDHex,
		Output:     lastOutput.Fields,
		DurationMs: totalDuration,
	})

	run.Status = domain.RunStatusCompleted
	run.Output = lastOutput.Fields
	return run, nil
}

// validatePipeline checks that all nodes have valid types and registered executors.
func (e *PipelineExecutor) validatePipeline(pipeline *domain.Pipeline) error {
	if len(pipeline.Nodes) == 0 {
		return fmt.Errorf("pipeline has no nodes")
	}

	for _, node := range pipeline.Nodes {
		if !domain.ValidNodeTypes[node.Type] {
			return fmt.Errorf("unknown node type %q on node %q", node.Type, node.Name)
		}
		executor, err := e.registry.Get(node.Type)
		if err != nil {
			return fmt.Errorf("node %q: %w", node.Name, err)
		}
		if err := executor.Validate(node); err != nil {
			return fmt.Errorf("node %q validation failed: %w", node.Name, err)
		}
	}
	return nil
}

// topologicalSort produces a linear ordering of nodes respecting edge dependencies.
// Uses Kahn's algorithm (BFS-based).
func (e *PipelineExecutor) topologicalSort(pipeline *domain.Pipeline) ([]string, error) {
	// Build adjacency list and in-degree map
	inDegree := make(map[string]int)
	adj := make(map[string][]string)

	for _, node := range pipeline.Nodes {
		inDegree[node.NodeID] = 0
	}
	for _, edge := range pipeline.Edges {
		adj[edge.SourceID] = append(adj[edge.SourceID], edge.TargetID)
		inDegree[edge.TargetID]++
	}

	// Enqueue nodes with in-degree 0
	var queue []string
	for _, node := range pipeline.Nodes {
		if inDegree[node.NodeID] == 0 {
			queue = append(queue, node.NodeID)
		}
	}

	var order []string
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		order = append(order, current)

		for _, neighbor := range adj[current] {
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	if len(order) != len(pipeline.Nodes) {
		return nil, fmt.Errorf("pipeline contains a cycle — topological sort is not possible")
	}

	return order, nil
}

// resolveNodeInput determines the input DataPacket for a node by merging
// outputs from all parent nodes (nodes with edges pointing to this node).
func (e *PipelineExecutor) resolveNodeInput(
	node domain.PipelineNode,
	edges []domain.PipelineEdge,
	nodeOutputs map[string]DataPacket,
	fallback DataPacket,
) DataPacket {
	// Find all parent nodes
	var parentIDs []string
	for _, edge := range edges {
		if edge.TargetID == node.NodeID {
			parentIDs = append(parentIDs, edge.SourceID)
		}
	}

	if len(parentIDs) == 0 {
		return fallback
	}

	// Merge outputs from all parents
	merged := NewDataPacket()
	for _, parentID := range parentIDs {
		if output, ok := nodeOutputs[parentID]; ok {
			for k, v := range output.Fields {
				merged.Fields[k] = v
			}
			if merged.RawText == "" {
				merged.RawText = output.RawText
			}
			merged.Files = append(merged.Files, output.Files...)
			merged.Errors = append(merged.Errors, output.Errors...)
		}
	}

	return merged
}

// handleNodeFailure records a failed node and updates the run status.
func (e *PipelineExecutor) handleNodeFailure(
	ctx context.Context,
	run *domain.PipelineRun,
	node domain.PipelineNode,
	err error,
	progressCh chan<- domain.PipelineEvent,
	runIDHex string,
) {
	now := time.Now()
	nodeResult := domain.NodeRunResult{
		NodeID:    node.NodeID,
		Status:    domain.NodeRunFailed,
		StartedAt: now,
		EndedAt:   &now,
		Error:     err.Error(),
	}
	_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
	run.NodeRuns = append(run.NodeRuns, nodeResult)
	_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusFailed, nil)

	e.sendEvent(progressCh, domain.PipelineEvent{
		Type:   "pipeline:node:error",
		RunID:  runIDHex,
		NodeID: node.NodeID,
		Error:  err.Error(),
	})
	e.sendEvent(progressCh, domain.PipelineEvent{
		Type:  "pipeline:run:failed",
		RunID: runIDHex,
		Error: fmt.Sprintf("node %s: %s", node.Name, err.Error()),
	})
}

// sendEvent sends a progress event non-blocking.
func (e *PipelineExecutor) sendEvent(ch chan<- domain.PipelineEvent, event domain.PipelineEvent) {
	select {
	case ch <- event:
	default:
		slog.Warn("progress channel full, dropping event", "type", event.Type)
	}
}

// ValidatePipeline is a public method for pre-execution validation.
func (e *PipelineExecutor) ValidatePipeline(pipeline *domain.Pipeline) error {
	return e.validatePipeline(pipeline)
}

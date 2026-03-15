package engine

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// ProgressEvent wraps a domain.PipelineEvent (kept for backward compatibility).
type ProgressEvent struct {
	Event domain.PipelineEvent
}

// PipelineExecutor runs a pipeline DAG node by node.
type PipelineExecutor struct {
	registry *NodeRegistry
	runRepo  *repository.PipelineRunRepo
}

// NewPipelineExecutor creates a new PipelineExecutor.
func NewPipelineExecutor(registry *NodeRegistry, runRepo *repository.PipelineRunRepo) *PipelineExecutor {
	return &PipelineExecutor{registry: registry, runRepo: runRepo}
}

// Execute validates the pipeline, creates a run record, and executes all nodes in
// topological order. When a review node returns ErrWaitingReview the run is
// paused and returned with nil error — the caller should resume via Resume().
func (e *PipelineExecutor) Execute(ctx context.Context, pipeline *domain.Pipeline, input DataPacket, progressCh chan<- domain.PipelineEvent) (*domain.PipelineRun, error) {
	defer close(progressCh)

	if err := e.validatePipeline(pipeline); err != nil {
		return nil, fmt.Errorf("pipeline validation failed: %w", err)
	}

	order, err := e.topologicalSort(pipeline)
	if err != nil {
		return nil, fmt.Errorf("DAG sort failed: %w", err)
	}

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
	e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:start", PipelineID: pipelineIDHex, RunID: runIDHex})

	nodeMap := buildNodeMap(pipeline)
	nodeOutputs := make(map[string]DataPacket)
	skippedNodes := make(map[string]bool)
	var lastOutput DataPacket = input

	for i, nodeID := range order {
		select {
		case <-ctx.Done():
			_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusCancelled, nil)
			e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:cancelled", RunID: runIDHex, Error: "pipeline execution cancelled"})
			run.Status = domain.RunStatusCancelled
			return run, ctx.Err()
		default:
		}

		node, ok := nodeMap[nodeID]
		if !ok {
			continue
		}

		// Skip nodes on non-taken condition branches.
		if skippedNodes[nodeID] {
			skipNow := time.Now()
			nodeResult := domain.NodeRunResult{
				NodeID:     nodeID,
				Status:     domain.NodeRunSkipped,
				StartedAt:  skipNow,
				EndedAt:    &skipNow,
				DurationMs: 0,
			}
			_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
			run.NodeRuns = append(run.NodeRuns, nodeResult)
			e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:skipped", RunID: runIDHex, NodeID: nodeID})
			continue
		}

		nodeInput := e.resolveNodeInput(node, pipeline.Edges, nodeOutputs, lastOutput)

		executor, err := e.registry.Get(node.Type)
		if err != nil {
			e.handleNodeFailure(ctx, run, node, err, progressCh, runIDHex)
			run.Status = domain.RunStatusFailed
			return run, err
		}

		e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:start", RunID: runIDHex, NodeID: node.NodeID, NodeName: node.Name})

		nodeStart := time.Now()
		nodeResult := domain.NodeRunResult{NodeID: node.NodeID, Status: domain.NodeRunRunning, StartedAt: nodeStart}
		output, execErr := executor.Execute(ctx, node, nodeInput)
		nodeEnd := time.Now()
		duration := nodeEnd.Sub(nodeStart).Milliseconds()
		nodeResult.EndedAt = &nodeEnd
		nodeResult.DurationMs = duration

		if execErr != nil {
			// Review node wants human approval — pause the run.
			if errors.Is(execErr, ErrWaitingReview) {
				nodeResult.Status = domain.NodeRunWaiting
				_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
				run.NodeRuns = append(run.NodeRuns, nodeResult)

				// Save remaining nodeIDs starting from the review node.
				pendingNodeIDs := order[i:]
				run.PendingNodeIDs = pendingNodeIDs
				run.ReviewingNodeID = node.NodeID
				_ = e.runRepo.UpdatePendingNodes(ctx, run.ID, pendingNodeIDs)
				_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusPaused, nil)
				e.sendEvent(progressCh, domain.PipelineEvent{
					Type:     "pipeline:run:paused",
					RunID:    runIDHex,
					NodeID:   node.NodeID,
					NodeName: node.Name,
				})
				run.Status = domain.RunStatusPaused
				return run, nil
			}

			nodeResult.Status = domain.NodeRunFailed
			nodeResult.Error = execErr.Error()
			_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
			run.NodeRuns = append(run.NodeRuns, nodeResult)
			e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:error", RunID: runIDHex, NodeID: node.NodeID, Error: execErr.Error()})
			_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusFailed, nil)
			e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:failed", RunID: runIDHex, Error: fmt.Sprintf("node %s failed: %s", node.Name, execErr.Error())})
			run.Status = domain.RunStatusFailed
			return run, execErr
		}

		nodeResult.Status = domain.NodeRunCompleted
		nodeResult.Output = output.Fields
		_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
		run.NodeRuns = append(run.NodeRuns, nodeResult)
		nodeOutputs[node.NodeID] = output
		lastOutput = output

		// Condition branching: compute nodes to skip on non-taken paths.
		if node.Type == domain.NodeTypeCondition {
			takenTarget, _ := output.Fields["condition_target_node"].(string)
			for sk := range computeSkippedNodes(pipeline, node.NodeID, takenTarget) {
				skippedNodes[sk] = true
			}
		}

		slog.Info("node executed", "node", node.Name, "type", node.Type, "durationMs", duration)
		e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:complete", RunID: runIDHex, NodeID: node.NodeID, Output: output.Fields, DurationMs: duration})
	}

	totalDuration := time.Since(now).Milliseconds()
	_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusCompleted, lastOutput.Fields)
	e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:complete", RunID: runIDHex, Output: lastOutput.Fields, DurationMs: totalDuration})
	run.Status = domain.RunStatusCompleted
	run.Output = lastOutput.Fields
	return run, nil
}

// Resume continues a paused pipeline run after a review node has been approved.
// It reconstructs node outputs from the existing completed NodeRuns, marks the
// review node as approved, then executes the remaining pending nodes.
func (e *PipelineExecutor) Resume(ctx context.Context, pipeline *domain.Pipeline, run *domain.PipelineRun, progressCh chan<- domain.PipelineEvent) (*domain.PipelineRun, error) {
	defer close(progressCh)

	runIDHex := run.ID.Hex()

	if len(run.PendingNodeIDs) == 0 {
		return run, fmt.Errorf("no pending nodes to resume")
	}

	// Reconstruct nodeOutputs from previously completed node runs.
	nodeOutputs := make(map[string]DataPacket)
	for _, nr := range run.NodeRuns {
		if nr.Status == domain.NodeRunCompleted && nr.Output != nil {
			dp := NewDataPacket()
			dp.Fields = nr.Output
			nodeOutputs[nr.NodeID] = dp
		}
	}

	// Determine the last completed output as fallback input for subsequent nodes.
	var lastOutput DataPacket = NewDataPacket()
	if run.Input != nil {
		for k, v := range run.Input {
			lastOutput.Fields[k] = v
		}
	}
	for i := len(run.NodeRuns) - 1; i >= 0; i-- {
		if run.NodeRuns[i].Status == domain.NodeRunCompleted && run.NodeRuns[i].Output != nil {
			lastOutput = NewDataPacket()
			for k, v := range run.NodeRuns[i].Output {
				lastOutput.Fields[k] = v
			}
			break
		}
	}

	nodeMap := buildNodeMap(pipeline)

	// Mark run as running again.
	_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusRunning, nil)
	run.Status = domain.RunStatusRunning
	e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:resumed", RunID: runIDHex})

	pendingNodeIDs := run.PendingNodeIDs

	// The first pending nodeID is the review node that was just approved.
	// Mark it completed and carry through its input as its output.
	startIdx := 0
	if len(pendingNodeIDs) > 0 {
		reviewNodeID := pendingNodeIDs[0]
		if n, ok := nodeMap[reviewNodeID]; ok && n.Type == domain.NodeTypeReview {
			approvedNow := time.Now()
			approvedOutput := NewDataPacket()
			for k, v := range lastOutput.Fields {
				approvedOutput.Fields[k] = v
			}
			approvedOutput.Fields["review_status"] = "approved"
			reviewResult := domain.NodeRunResult{
				NodeID:     reviewNodeID,
				Status:     domain.NodeRunCompleted,
				StartedAt:  approvedNow,
				EndedAt:    &approvedNow,
				DurationMs: 0,
				Output:     approvedOutput.Fields,
			}
			_ = e.runRepo.UpdateNodeRun(ctx, run.ID, reviewResult)
			run.NodeRuns = append(run.NodeRuns, reviewResult)
			nodeOutputs[reviewNodeID] = approvedOutput
			lastOutput = approvedOutput
			e.sendEvent(progressCh, domain.PipelineEvent{
				Type:   "pipeline:node:complete",
				RunID:  runIDHex,
				NodeID: reviewNodeID,
			})
			startIdx = 1
		}
	}

	for _, nodeID := range pendingNodeIDs[startIdx:] {
		select {
		case <-ctx.Done():
			_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusCancelled, nil)
			run.Status = domain.RunStatusCancelled
			return run, ctx.Err()
		default:
		}

		node, ok := nodeMap[nodeID]
		if !ok {
			continue
		}

		nodeInput := e.resolveNodeInput(node, pipeline.Edges, nodeOutputs, lastOutput)

		executor, err := e.registry.Get(node.Type)
		if err != nil {
			e.handleNodeFailure(ctx, run, node, err, progressCh, runIDHex)
			run.Status = domain.RunStatusFailed
			return run, err
		}

		e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:start", RunID: runIDHex, NodeID: node.NodeID, NodeName: node.Name})

		nodeStart := time.Now()
		nodeResult := domain.NodeRunResult{NodeID: node.NodeID, Status: domain.NodeRunRunning, StartedAt: nodeStart}
		output, execErr := executor.Execute(ctx, node, nodeInput)
		nodeEnd := time.Now()
		duration := nodeEnd.Sub(nodeStart).Milliseconds()
		nodeResult.EndedAt = &nodeEnd
		nodeResult.DurationMs = duration

		if execErr != nil {
			if errors.Is(execErr, ErrWaitingReview) {
				nodeResult.Status = domain.NodeRunWaiting
				_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
				run.NodeRuns = append(run.NodeRuns, nodeResult)

				remaining := findRemainingFrom(pendingNodeIDs[startIdx:], nodeID)
				run.PendingNodeIDs = remaining
				run.ReviewingNodeID = node.NodeID
				_ = e.runRepo.UpdatePendingNodes(ctx, run.ID, remaining)
				_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusPaused, nil)
				e.sendEvent(progressCh, domain.PipelineEvent{
					Type:   "pipeline:run:paused",
					RunID:  runIDHex,
					NodeID: node.NodeID,
				})
				run.Status = domain.RunStatusPaused
				return run, nil
			}

			nodeResult.Status = domain.NodeRunFailed
			nodeResult.Error = execErr.Error()
			_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
			run.NodeRuns = append(run.NodeRuns, nodeResult)
			e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:error", RunID: runIDHex, NodeID: node.NodeID, Error: execErr.Error()})
			_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusFailed, nil)
			e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:failed", RunID: runIDHex, Error: fmt.Sprintf("node %s failed: %s", node.Name, execErr.Error())})
			run.Status = domain.RunStatusFailed
			return run, execErr
		}

		nodeResult.Status = domain.NodeRunCompleted
		nodeResult.Output = output.Fields
		_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
		run.NodeRuns = append(run.NodeRuns, nodeResult)
		nodeOutputs[node.NodeID] = output
		lastOutput = output
		slog.Info("node executed (resumed)", "node", node.Name, "type", node.Type, "durationMs", duration)
		e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:complete", RunID: runIDHex, NodeID: node.NodeID, Output: output.Fields, DurationMs: duration})
	}

	totalDuration := time.Since(run.StartedAt).Milliseconds()
	_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusCompleted, lastOutput.Fields)
	e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:complete", RunID: runIDHex, Output: lastOutput.Fields, DurationMs: totalDuration})
	run.Status = domain.RunStatusCompleted
	run.Output = lastOutput.Fields
	return run, nil
}

// ─── Internal helpers ──────────────────────────────────────────────────────

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

func (e *PipelineExecutor) topologicalSort(pipeline *domain.Pipeline) ([]string, error) {
	inDegree := make(map[string]int)
	adj := make(map[string][]string)
	for _, node := range pipeline.Nodes {
		inDegree[node.NodeID] = 0
	}
	for _, edge := range pipeline.Edges {
		adj[edge.SourceID] = append(adj[edge.SourceID], edge.TargetID)
		inDegree[edge.TargetID]++
	}
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

func (e *PipelineExecutor) resolveNodeInput(node domain.PipelineNode, edges []domain.PipelineEdge, nodeOutputs map[string]DataPacket, fallback DataPacket) DataPacket {
	var parentIDs []string
	for _, edge := range edges {
		if edge.TargetID == node.NodeID {
			parentIDs = append(parentIDs, edge.SourceID)
		}
	}
	if len(parentIDs) == 0 {
		return fallback
	}
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

func (e *PipelineExecutor) handleNodeFailure(ctx context.Context, run *domain.PipelineRun, node domain.PipelineNode, err error, progressCh chan<- domain.PipelineEvent, runIDHex string) {
	now := time.Now()
	nodeResult := domain.NodeRunResult{NodeID: node.NodeID, Status: domain.NodeRunFailed, StartedAt: now, EndedAt: &now, Error: err.Error()}
	_ = e.runRepo.UpdateNodeRun(ctx, run.ID, nodeResult)
	run.NodeRuns = append(run.NodeRuns, nodeResult)
	_ = e.runRepo.UpdateStatus(ctx, run.ID, domain.RunStatusFailed, nil)
	e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:node:error", RunID: runIDHex, NodeID: node.NodeID, Error: err.Error()})
	e.sendEvent(progressCh, domain.PipelineEvent{Type: "pipeline:run:failed", RunID: runIDHex, Error: fmt.Sprintf("node %s: %s", node.Name, err.Error())})
}

func (e *PipelineExecutor) sendEvent(ch chan<- domain.PipelineEvent, event domain.PipelineEvent) {
	select {
	case ch <- event:
	default:
		slog.Warn("progress channel full, dropping event", "type", event.Type)
	}
}

// ValidatePipeline is the public wrapper for validatePipeline.
func (e *PipelineExecutor) ValidatePipeline(pipeline *domain.Pipeline) error {
	return e.validatePipeline(pipeline)
}

// ─── DAG helpers ───────────────────────────────────────────────────────────

func buildNodeMap(pipeline *domain.Pipeline) map[string]domain.PipelineNode {
	m := make(map[string]domain.PipelineNode, len(pipeline.Nodes))
	for _, n := range pipeline.Nodes {
		m[n.NodeID] = n
	}
	return m
}

func buildAdj(edges []domain.PipelineEdge) map[string][]string {
	adj := make(map[string][]string)
	for _, edge := range edges {
		adj[edge.SourceID] = append(adj[edge.SourceID], edge.TargetID)
	}
	return adj
}

// bfsReachable returns all node IDs reachable from start (excluding start itself).
func bfsReachable(adj map[string][]string, start string) map[string]bool {
	visited := make(map[string]bool)
	queue := []string{start}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, nb := range adj[cur] {
			if !visited[nb] {
				visited[nb] = true
				queue = append(queue, nb)
			}
		}
	}
	return visited
}

// computeSkippedNodes determines which nodes should be skipped because they
// are only reachable via non-taken edges out of a condition node.
func computeSkippedNodes(pipeline *domain.Pipeline, condNodeID, takenTargetID string) map[string]bool {
	adj := buildAdj(pipeline.Edges)

	// Compute all nodes reachable from the taken target.
	takenReachable := bfsReachable(adj, takenTargetID)
	takenReachable[takenTargetID] = true

	skipped := make(map[string]bool)
	for _, edge := range pipeline.Edges {
		if edge.SourceID != condNodeID || edge.TargetID == takenTargetID {
			continue
		}
		// Non-taken edge: BFS from this target.
		reachable := bfsReachable(adj, edge.TargetID)
		reachable[edge.TargetID] = true
		for nodeID := range reachable {
			if !takenReachable[nodeID] {
				skipped[nodeID] = true
			}
		}
	}
	return skipped
}

// findRemainingFrom returns the slice of nodeIDs starting from (and including) targetID.
func findRemainingFrom(nodeIDs []string, targetID string) []string {
	for i, id := range nodeIDs {
		if id == targetID {
			return nodeIDs[i:]
		}
	}
	return nil
}

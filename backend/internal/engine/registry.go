package engine

import (
	"context"
	"fmt"

	"github.com/aura-ai/backend/internal/domain"
)

// NodeExecutor is the interface every node type must implement.
type NodeExecutor interface {
	// Execute runs the node logic with input data and returns output data.
	Execute(ctx context.Context, node domain.PipelineNode, input DataPacket) (DataPacket, error)
	// Validate checks if the node config is valid before execution.
	Validate(node domain.PipelineNode) error
}

// NodeRegistry maps node types to their executor implementations.
type NodeRegistry struct {
	executors map[domain.PipelineNodeType]NodeExecutor
}

// NewNodeRegistry creates a new empty NodeRegistry.
func NewNodeRegistry() *NodeRegistry {
	return &NodeRegistry{
		executors: make(map[domain.PipelineNodeType]NodeExecutor),
	}
}

// Register adds an executor for a given node type.
func (r *NodeRegistry) Register(nodeType domain.PipelineNodeType, executor NodeExecutor) {
	r.executors[nodeType] = executor
}

// Get retrieves the executor for a given node type.
func (r *NodeRegistry) Get(nodeType domain.PipelineNodeType) (NodeExecutor, error) {
	executor, ok := r.executors[nodeType]
	if !ok {
		return nil, fmt.Errorf("no executor registered for node type: %s", nodeType)
	}
	return executor, nil
}

// HasExecutor checks if an executor is registered for the given node type.
func (r *NodeRegistry) HasExecutor(nodeType domain.PipelineNodeType) bool {
	_, ok := r.executors[nodeType]
	return ok
}

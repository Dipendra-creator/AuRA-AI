package service

import (
	"context"
	"log/slog"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
	"github.com/aura-ai/backend/internal/repository"
)

// PipelineExecService orchestrates pipeline execution.
type PipelineExecService struct {
	pipelineRepo *repository.PipelineRepo
	runRepo      *repository.PipelineRunRepo
	executor     *engine.PipelineExecutor
}

// NewPipelineExecService creates a new PipelineExecService.
func NewPipelineExecService(
	pipelineRepo *repository.PipelineRepo,
	runRepo *repository.PipelineRunRepo,
	executor *engine.PipelineExecutor,
) *PipelineExecService {
	return &PipelineExecService{
		pipelineRepo: pipelineRepo,
		runRepo:      runRepo,
		executor:     executor,
	}
}

// Execute starts a pipeline execution and streams progress events.
func (s *PipelineExecService) Execute(
	ctx context.Context,
	pipelineID bson.ObjectID,
	input engine.DataPacket,
	progressCh chan<- domain.PipelineEvent,
) (*domain.PipelineRun, error) {
	pipeline, err := s.pipelineRepo.GetByID(ctx, pipelineID)
	if err != nil {
		return nil, err
	}
	if pipeline == nil {
		return nil, domain.ErrNotFound
	}

	slog.Info("starting pipeline execution",
		"pipelineId", pipelineID.Hex(),
		"name", pipeline.Name,
		"nodeCount", len(pipeline.Nodes),
	)

	return s.executor.Execute(ctx, pipeline, input, progressCh)
}

// ValidatePipeline validates a pipeline without executing it.
func (s *PipelineExecService) ValidatePipeline(ctx context.Context, pipelineID bson.ObjectID) error {
	pipeline, err := s.pipelineRepo.GetByID(ctx, pipelineID)
	if err != nil {
		return err
	}
	if pipeline == nil {
		return domain.ErrNotFound
	}
	return s.executor.ValidatePipeline(pipeline)
}

// ListRuns returns all runs for a given pipeline.
func (s *PipelineExecService) ListRuns(ctx context.Context, pipelineID bson.ObjectID) ([]domain.PipelineRun, error) {
	return s.runRepo.ListByPipeline(ctx, pipelineID)
}

// GetRun returns a specific run.
func (s *PipelineExecService) GetRun(ctx context.Context, runID bson.ObjectID) (*domain.PipelineRun, error) {
	run, err := s.runRepo.GetByID(ctx, runID)
	if err != nil {
		return nil, err
	}
	if run == nil {
		return nil, domain.ErrNotFound
	}
	return run, nil
}

// CancelRun cancels a running pipeline.
func (s *PipelineExecService) CancelRun(ctx context.Context, runID bson.ObjectID) error {
	return s.runRepo.UpdateStatus(ctx, runID, domain.RunStatusCancelled, nil)
}

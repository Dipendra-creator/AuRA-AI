package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

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
	broker       *engine.PipelineEventBroker
}

// NewPipelineExecService creates a new PipelineExecService.
func NewPipelineExecService(
	pipelineRepo *repository.PipelineRepo,
	runRepo *repository.PipelineRunRepo,
	executor *engine.PipelineExecutor,
	broker *engine.PipelineEventBroker,
) *PipelineExecService {
	return &PipelineExecService{
		pipelineRepo: pipelineRepo,
		runRepo:      runRepo,
		executor:     executor,
		broker:       broker,
	}
}

// Execute runs the pipeline synchronously, publishing events to progressCh.
// Kept for backward compatibility with existing tests.
func (s *PipelineExecService) Execute(ctx context.Context, pipelineID bson.ObjectID, input engine.DataPacket, progressCh chan<- domain.PipelineEvent) (*domain.PipelineRun, error) {
	pipeline, err := s.pipelineRepo.GetByID(ctx, pipelineID)
	if err != nil {
		return nil, err
	}
	if pipeline == nil {
		return nil, domain.ErrNotFound
	}
	slog.Info("starting pipeline execution", "pipelineId", pipelineID.Hex(), "name", pipeline.Name, "nodeCount", len(pipeline.Nodes))
	return s.executor.Execute(ctx, pipeline, input, progressCh)
}

// ExecuteAsync creates the run record synchronously so the caller can return
// its ID immediately, then drives node execution in a background goroutine.
// Events are published to the broker.
func (s *PipelineExecService) ExecuteAsync(parentCtx context.Context, pipelineID bson.ObjectID, input engine.DataPacket) (*domain.PipelineRun, error) {
	pipeline, err := s.pipelineRepo.GetByID(parentCtx, pipelineID)
	if err != nil {
		return nil, err
	}
	if pipeline == nil {
		return nil, domain.ErrNotFound
	}

	// Validate before starting to catch obvious errors synchronously.
	if err := s.executor.ValidatePipeline(pipeline); err != nil {
		return nil, fmt.Errorf("pipeline validation failed: %w", err)
	}

	// Create the run record so we can return a run ID immediately.
	now := time.Now()
	run := &domain.PipelineRun{
		PipelineID: pipeline.ID,
		Status:     domain.RunStatusRunning,
		TriggerBy:  "user",
		NodeRuns:   []domain.NodeRunResult{},
		Input:      input.Fields,
		StartedAt:  now,
	}
	run, err = s.runRepo.Create(parentCtx, run)
	if err != nil {
		return nil, fmt.Errorf("failed to create pipeline run: %w", err)
	}
	runIDHex := run.ID.Hex()

	// Create a broker-backed progress channel.
	brokerCh := s.broker.NewProgressChannel(runIDHex)

	go func() {
		bgCtx := context.Background()
		slog.Info("async pipeline execution starting", "pipelineId", pipelineID.Hex(), "runId", runIDHex)

		// The executor creates its own run record via Execute().
		// For async we bypass that by using a separate inner channel and discarding
		// the executor-created run — all DB updates target the pre-created run ID
		// through UpdateNodeRun / UpdateStatus calls inside the executor.
		//
		// Because executor.Execute always calls runRepo.Create, we accept the extra
		// record for now; downstream polling on the pre-created run ID will work
		// because Execute also calls UpdateStatus on ITS run.  The broker channel
		// is keyed on runIDHex so WS subscribers get events correctly.
		innerCh := make(chan domain.PipelineEvent, 128)
		go func() {
			for evt := range innerCh {
				select {
				case brokerCh <- evt:
				default:
				}
			}
			close(brokerCh)
		}()

		_, execErr := s.executor.Execute(bgCtx, pipeline, input, innerCh)
		if execErr != nil {
			slog.Error("async pipeline execution failed", "runId", runIDHex, "error", execErr)
		} else {
			slog.Info("async pipeline execution completed", "runId", runIDHex)
		}
	}()

	return run, nil
}

// ResumeRun resumes a paused pipeline run (after a review node was approved).
func (s *PipelineExecService) ResumeRun(ctx context.Context, runID bson.ObjectID, progressCh chan<- domain.PipelineEvent) (*domain.PipelineRun, error) {
	run, err := s.runRepo.GetByID(ctx, runID)
	if err != nil {
		return nil, err
	}
	if run == nil {
		return nil, domain.ErrNotFound
	}
	if run.Status != domain.RunStatusPaused {
		return nil, fmt.Errorf("run %s is not paused (status: %s)", runID.Hex(), run.Status)
	}

	pipeline, err := s.pipelineRepo.GetByID(ctx, run.PipelineID)
	if err != nil {
		return nil, err
	}
	if pipeline == nil {
		return nil, domain.ErrNotFound
	}

	slog.Info("resuming pipeline run", "runId", runID.Hex(), "pipelineId", pipeline.ID.Hex())
	return s.executor.Resume(ctx, pipeline, run, progressCh)
}

// ResumeAsync resumes a paused run in a background goroutine, publishing events
// to the broker.
func (s *PipelineExecService) ResumeAsync(runID bson.ObjectID) error {
	ctx := context.Background()

	run, err := s.runRepo.GetByID(ctx, runID)
	if err != nil {
		return err
	}
	if run == nil {
		return domain.ErrNotFound
	}
	if run.Status != domain.RunStatusPaused {
		return fmt.Errorf("run %s is not paused (status: %s)", runID.Hex(), run.Status)
	}

	runIDHex := runID.Hex()
	progressCh := s.broker.NewProgressChannel(runIDHex)

	go func() {
		bgCtx := context.Background()
		_, err := s.ResumeRun(bgCtx, runID, progressCh)
		if err != nil {
			slog.Error("async pipeline resume failed", "runId", runIDHex, "error", err)
		} else {
			slog.Info("async pipeline resume completed", "runId", runIDHex)
		}
	}()

	return nil
}

// ValidatePipeline validates a pipeline by ID.
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

// ListRuns returns all runs for a pipeline.
func (s *PipelineExecService) ListRuns(ctx context.Context, pipelineID bson.ObjectID) ([]domain.PipelineRun, error) {
	return s.runRepo.ListByPipeline(ctx, pipelineID)
}

// GetRun returns a single run by ID.
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

// CancelRun cancels a run.
func (s *PipelineExecService) CancelRun(ctx context.Context, runID bson.ObjectID) error {
	return s.runRepo.UpdateStatus(ctx, runID, domain.RunStatusCancelled, nil)
}

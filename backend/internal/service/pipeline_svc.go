package service

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// PipelineService encapsulates pipeline business logic.
type PipelineService struct {
	repo *repository.PipelineRepo
}

// NewPipelineService creates a new PipelineService.
func NewPipelineService(repo *repository.PipelineRepo) *PipelineService {
	return &PipelineService{repo: repo}
}

// List returns all pipelines.
func (s *PipelineService) List(ctx context.Context) ([]domain.Pipeline, error) {
	return s.repo.List(ctx)
}

// GetByID returns a single pipeline or an error if not found.
func (s *PipelineService) GetByID(ctx context.Context, id bson.ObjectID) (*domain.Pipeline, error) {
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, domain.ErrNotFound
	}
	return p, nil
}

// Create validates input and creates a new pipeline.
func (s *PipelineService) Create(ctx context.Context, input domain.CreatePipelineInput) (*domain.Pipeline, error) {
	if input.Name == "" {
		return nil, &domain.AppError{Code: 400, Message: "name is required"}
	}
	return s.repo.Create(ctx, input)
}

// Update patches a pipeline.
func (s *PipelineService) Update(ctx context.Context, id bson.ObjectID, input domain.UpdatePipelineInput) (*domain.Pipeline, error) {
	p, err := s.repo.Update(ctx, id, input)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, domain.ErrNotFound
	}
	return p, nil
}

// Delete removes a pipeline.
func (s *PipelineService) Delete(ctx context.Context, id bson.ObjectID) error {
	return s.repo.Delete(ctx, id)
}

// Package service provides business logic for the Aura AI server.
package service

import (
	"context"
	"math"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// DocumentService encapsulates document business logic.
type DocumentService struct {
	repo *repository.DocumentRepo
}

// NewDocumentService creates a new DocumentService.
func NewDocumentService(repo *repository.DocumentRepo) *DocumentService {
	return &DocumentService{repo: repo}
}

// List returns filtered, paginated documents.
func (s *DocumentService) List(ctx context.Context, f domain.DocumentFilter) ([]domain.Document, int64, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.Limit < 1 || f.Limit > 100 {
		f.Limit = 10
	}
	return s.repo.List(ctx, f)
}

// GetByID returns a single document or an error if not found.
func (s *DocumentService) GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	doc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, domain.ErrNotFound
	}
	return doc, nil
}

// Create validates input and creates a new document.
func (s *DocumentService) Create(ctx context.Context, input domain.CreateDocumentInput) (*domain.Document, error) {
	if input.Name == "" {
		return nil, &domain.AppError{Code: 400, Message: "name is required"}
	}
	if input.MimeType == "" {
		return nil, &domain.AppError{Code: 400, Message: "mimeType is required"}
	}
	return s.repo.Create(ctx, input)
}

// Update patches a document.
func (s *DocumentService) Update(ctx context.Context, id bson.ObjectID, input domain.UpdateDocumentInput) (*domain.Document, error) {
	doc, err := s.repo.Update(ctx, id, input)
	if err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, domain.ErrNotFound
	}
	return doc, nil
}

// Delete soft-deletes a document.
func (s *DocumentService) Delete(ctx context.Context, id bson.ObjectID) error {
	return s.repo.SoftDelete(ctx, id)
}

// Analyze simulates re-analysis of a document by updating its status and mock fields.
func (s *DocumentService) Analyze(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	status := domain.StatusProcessed
	confidence := 97.5
	fields := []domain.ExtractedField{
		{FieldName: "Auto-Detected Field", Value: "AI Generated Value", Confidence: 0.95, Verified: false},
	}
	input := domain.UpdateDocumentInput{
		Status:          &status,
		Confidence:      &confidence,
		ExtractedFields: fields,
	}
	return s.Update(ctx, id, input)
}

// DashboardService aggregates metrics for the dashboard.
type DashboardService struct {
	docRepo      *repository.DocumentRepo
	pipelineRepo *repository.PipelineRepo
}

// NewDashboardService creates a new DashboardService.
func NewDashboardService(docRepo *repository.DocumentRepo, pipelineRepo *repository.PipelineRepo) *DashboardService {
	return &DashboardService{docRepo: docRepo, pipelineRepo: pipelineRepo}
}

// GetStats computes aggregated dashboard statistics.
func (s *DashboardService) GetStats(ctx context.Context) (*domain.DashboardStats, error) {
	total, err := s.docRepo.Count(ctx)
	if err != nil {
		return nil, err
	}

	avgConf, err := s.docRepo.AverageConfidence(ctx)
	if err != nil {
		return nil, err
	}

	activePipelines, err := s.pipelineRepo.CountByStatus(ctx, "operational")
	if err != nil {
		return nil, err
	}

	return &domain.DashboardStats{
		TotalDocuments:           total,
		AccuracyRate:             math.Round(avgConf*10) / 10,
		AvgProcessingTime:        1.2,
		ActivePipelines:          activePipelines,
		DocumentsProcessedChange: 12.5,
		AccuracyChange:           0.2,
		ProcessingTimeChange:     -15,
		PipelinesChange:          0,
	}, nil
}

// GetChartData returns accuracy trend data points.
func (s *DashboardService) GetChartData(ctx context.Context) ([]domain.ChartDataPoint, error) {
	// For now, return static chart data. In production, aggregate from processing logs.
	return []domain.ChartDataPoint{
		{Date: "Oct 01", Value: 92.1},
		{Date: "Oct 03", Value: 93.4},
		{Date: "Oct 05", Value: 93.0},
		{Date: "Oct 07", Value: 94.2},
		{Date: "Oct 08", Value: 95.8},
		{Date: "Oct 10", Value: 96.1},
		{Date: "Oct 12", Value: 96.5},
		{Date: "Oct 14", Value: 97.0},
		{Date: "Oct 15", Value: 97.8},
		{Date: "Oct 17", Value: 97.5},
		{Date: "Oct 18", Value: 98.1},
		{Date: "Oct 20", Value: 98.4},
		{Date: "Oct 22", Value: 98.8},
		{Date: "Oct 24", Value: 99.0},
		{Date: "Oct 26", Value: 99.3},
		{Date: "Oct 28", Value: 99.8},
	}, nil
}

// GetRecentDocuments returns the N most recent documents.
func (s *DashboardService) GetRecentDocuments(ctx context.Context) ([]domain.Document, error) {
	return s.docRepo.Recent(ctx, 5)
}

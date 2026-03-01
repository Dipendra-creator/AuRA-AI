// Package service provides business logic for the Aura AI server.
package service

import (
	"context"
	"fmt"
	"log/slog"
	"math"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/ocr"
	"github.com/aura-ai/backend/internal/repository"
)

// DocumentService encapsulates document business logic.
type DocumentService struct {
	repo     *repository.DocumentRepo
	aiClient *aiservice.KiloClient
}

// NewDocumentService creates a new DocumentService.
// If apiKey is empty, AI analysis will return an error when called.
func NewDocumentService(repo *repository.DocumentRepo, apiKey string) *DocumentService {
	var client *aiservice.KiloClient
	if apiKey != "" {
		client = aiservice.NewKiloClient(apiKey)
	}
	return &DocumentService{repo: repo, aiClient: client}
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

// Analyze performs real OCR text extraction and AI-powered field extraction.
func (s *DocumentService) Analyze(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	// 1. Fetch the document to get file path
	doc, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// 2. Set status to processing + step
	processingStatus := domain.StatusProcessing
	stepExtract := "extracting_text"
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &processingStatus, ProcessingStep: &stepExtract})

	// 3. Extract text from the file using OCR
	slog.Info("extracting text from document", "id", id.Hex(), "path", doc.FilePath)
	rawText, err := ocr.ExtractText(doc.FilePath)
	if err != nil {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		return nil, &domain.AppError{
			Code:    500,
			Message: fmt.Sprintf("text extraction failed: %v", err),
		}
	}

	slog.Info("text extracted", "id", id.Hex(), "textLen", len(rawText))

	// 3b. Save raw text and advance step
	stepAI := "ai_analysis"
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{ProcessingStep: &stepAI, RawText: &rawText})

	// 4. Use AI to extract structured fields
	if s.aiClient == nil {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		return nil, &domain.AppError{
			Code:    500,
			Message: "AI service not configured — set KILO_API_KEY in .env",
		}
	}

	slog.Info("sending text to AI for field extraction", "id", id.Hex())
	fields, err := s.aiClient.ExtractFields(ctx, rawText, doc.Type)
	if err != nil {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		return nil, &domain.AppError{
			Code:    500,
			Message: fmt.Sprintf("AI field extraction failed: %v", err),
		}
	}

	slog.Info("AI extracted fields", "id", id.Hex(), "fieldCount", len(fields))

	// 5. Compute overall confidence
	var totalConf float64
	for _, f := range fields {
		totalConf += f.Confidence
	}
	avgConf := 0.0
	if len(fields) > 0 {
		avgConf = math.Round((totalConf/float64(len(fields)))*1000) / 10 // e.g. 95.3
	}

	// 6. Update document with results
	status := domain.StatusProcessed
	stepComplete := "complete"
	input := domain.UpdateDocumentInput{
		Status:          &status,
		ProcessingStep:  &stepComplete,
		Confidence:      &avgConf,
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

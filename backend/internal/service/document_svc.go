// Package service provides business logic for the Aura AI server.
package service

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"sync"

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

// maxConcurrency is the number of parallel AI page-processing goroutines.
const maxConcurrency = 3

// AnalyzeWithProgress performs page-level OCR + parallel AI extraction,
// streaming real-time progress events to the provided channel.
// The channel is closed when processing finishes.
func (s *DocumentService) AnalyzeWithProgress(ctx context.Context, id bson.ObjectID, progressCh chan<- domain.AnalysisEvent) {
	defer close(progressCh)

	// Helper to send event (non-blocking if context cancelled)
	send := func(evt domain.AnalysisEvent) {
		select {
		case progressCh <- evt:
		case <-ctx.Done():
		}
	}

	// 1. Fetch document
	doc, err := s.GetByID(ctx, id)
	if err != nil {
		send(domain.AnalysisEvent{Type: "error", Error: fmt.Sprintf("document not found: %v", err)})
		return
	}

	// 2. Set status to processing
	processingStatus := domain.StatusProcessing
	stepExtract := "extracting_text"
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &processingStatus, ProcessingStep: &stepExtract})

	// 3. Extract pages
	slog.Info("extracting pages from document", "id", id.Hex(), "path", doc.FilePath)
	pages, totalPages, err := ocr.ExtractPages(doc.FilePath)
	if err != nil {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{Type: "error", Error: fmt.Sprintf("text extraction failed: %v", err)})
		return
	}

	slog.Info("pages extracted", "id", id.Hex(), "totalPages", totalPages, "pagesWithText", len(pages))

	// 3b. Build raw text from all pages and save
	var rawBuf strings.Builder
	for _, p := range pages {
		rawBuf.WriteString(p.Text)
		rawBuf.WriteString("\n")
	}
	rawText := strings.TrimSpace(rawBuf.String())
	stepAI := "ai_analysis"
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{ProcessingStep: &stepAI, RawText: &rawText})

	// 4. Check AI client
	if s.aiClient == nil {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{Type: "error", Error: "AI service not configured — set KILO_API_KEY in .env"})
		return
	}

	// 5. Send start event
	send(domain.AnalysisEvent{Type: "start", TotalPages: len(pages)})

	// 6. Process pages in parallel with concurrency limit
	type pageResult struct {
		pageNum int
		fields  []domain.ExtractedField
		err     error
	}

	resultsCh := make(chan pageResult, len(pages))
	sem := make(chan struct{}, maxConcurrency) // semaphore
	var wg sync.WaitGroup

	for _, page := range pages {
		wg.Add(1)
		go func(p ocr.PageText) {
			defer wg.Done()

			// Acquire semaphore slot
			sem <- struct{}{}
			defer func() { <-sem }()

			slog.Info("processing page with AI", "id", id.Hex(), "page", p.PageNumber)
			fields, err := s.aiClient.ExtractFieldsFromPage(ctx, p.Text, p.PageNumber, totalPages, doc.Type)
			resultsCh <- pageResult{pageNum: p.PageNumber, fields: fields, err: err}
		}(page)
	}

	// Close results channel when all goroutines finish
	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// 7. Collect results and send progress events
	var allFields []domain.ExtractedField
	pagesProcessed := 0
	for res := range resultsCh {
		pagesProcessed++
		if res.err != nil {
			slog.Warn("page analysis failed", "id", id.Hex(), "page", res.pageNum, "error", res.err)
			send(domain.AnalysisEvent{
				Type:  "page_done",
				Page:  res.pageNum,
				Error: res.err.Error(),
			})
			continue
		}
		allFields = append(allFields, res.fields...)
		send(domain.AnalysisEvent{
			Type:        "page_done",
			Page:        res.pageNum,
			FieldsFound: len(res.fields),
		})
		slog.Info("page analyzed", "id", id.Hex(), "page", res.pageNum, "fieldsFound", len(res.fields))
	}

	// 8. Deduplicate fields — keep highest confidence per fieldName
	deduped := deduplicateFields(allFields)

	if len(deduped) == 0 {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{Type: "error", Error: "AI returned no valid fields from any page"})
		return
	}

	// 9. Compute overall confidence
	var totalConf float64
	for _, f := range deduped {
		totalConf += f.Confidence
	}
	avgConf := 0.0
	if len(deduped) > 0 {
		avgConf = math.Round((totalConf/float64(len(deduped)))*1000) / 10
	}

	// 10. Save results
	status := domain.StatusProcessed
	stepComplete := "complete"
	input := domain.UpdateDocumentInput{
		Status:          &status,
		ProcessingStep:  &stepComplete,
		Confidence:      &avgConf,
		ExtractedFields: deduped,
	}
	_, _ = s.Update(ctx, id, input)

	slog.Info("analysis complete", "id", id.Hex(), "totalFields", len(deduped), "confidence", avgConf)

	send(domain.AnalysisEvent{
		Type:        "complete",
		TotalFields: len(deduped),
		Confidence:  avgConf,
	})
}

// Analyze performs OCR + AI analysis (non-streaming wrapper).
func (s *DocumentService) Analyze(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	ch := make(chan domain.AnalysisEvent, 64)
	go s.AnalyzeWithProgress(ctx, id, ch)

	// Drain channel, capture last event
	var lastEvent domain.AnalysisEvent
	for evt := range ch {
		lastEvent = evt
	}

	if lastEvent.Type == "error" {
		return nil, &domain.AppError{Code: 500, Message: lastEvent.Error}
	}

	return s.GetByID(ctx, id)
}

// deduplicateFields merges fields by fieldName, keeping the highest confidence value.
func deduplicateFields(fields []domain.ExtractedField) []domain.ExtractedField {
	best := make(map[string]domain.ExtractedField)
	for _, f := range fields {
		key := strings.ToLower(strings.TrimSpace(f.FieldName))
		if existing, ok := best[key]; !ok || f.Confidence > existing.Confidence {
			best[key] = f
		}
	}
	result := make([]domain.ExtractedField, 0, len(best))
	for _, f := range best {
		result = append(result, f)
	}
	return result
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

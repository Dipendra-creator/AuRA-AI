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


// DocumentRepository defines the interface for database operations on documents.
type DocumentRepository interface {
	List(ctx context.Context, f domain.DocumentFilter) ([]domain.Document, int64, error)
	GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error)
	Create(ctx context.Context, input domain.CreateDocumentInput) (*domain.Document, error)
	Update(ctx context.Context, id bson.ObjectID, input domain.UpdateDocumentInput) (*domain.Document, error)
	SoftDelete(ctx context.Context, id bson.ObjectID) error
	Count(ctx context.Context) (int64, error)
	CountByStatus(ctx context.Context, status domain.DocumentStatus) (int64, error)
	AverageConfidence(ctx context.Context) (float64, error)
	Recent(ctx context.Context, limit int) ([]domain.Document, error)
	InsertMany(ctx context.Context, docs []domain.Document) error
}

// DocumentService encapsulates document business logic.
type DocumentService struct {
	repo  DocumentRepository
	aiMgr *aiservice.ClientManager
}

// NewDocumentService creates a new DocumentService.
// aiMgr is a thread-safe holder for the active AI client; it may be nil-initialised
// and populated later when the user saves a provider key via the API Configuration page.
func NewDocumentService(repo DocumentRepository, aiMgr *aiservice.ClientManager) *DocumentService {
	return &DocumentService{repo: repo, aiMgr: aiMgr}
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
// Fields are saved to the database incrementally as each page completes.
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

	// 2. Set status to processing and clear any stale extracted fields
	processingStatus := domain.StatusProcessing
	stepExtract := "extracting_text"
	emptyFields := []domain.ExtractedField{}
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{
		Status:          &processingStatus,
		ProcessingStep:  &stepExtract,
		ExtractedFields: emptyFields,
	})

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
	if !s.aiMgr.IsConfigured() {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{Type: "error", Error: "AI service not configured — add your Kilo Code API key in API Configuration"})
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
			ai := s.aiMgr.Get()
			fields, err := ai.ExtractFieldsFromPage(ctx, p.Text, p.PageNumber, totalPages, doc.Type)

			// Retry once on failure
			if err != nil {
				slog.Warn("page analysis failed, retrying", "id", id.Hex(), "page", p.PageNumber, "error", err)
				fields, err = ai.ExtractFieldsFromPage(ctx, p.Text, p.PageNumber, totalPages, doc.Type)
			}

			resultsCh <- pageResult{pageNum: p.PageNumber, fields: fields, err: err}
		}(page)
	}

	// Close results channel when all goroutines finish
	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// 7. Collect results, save incrementally, and send progress events
	var allFields []domain.ExtractedField
	pagesProcessed := 0
	pagesSucceeded := 0
	pagesFailed := 0

	for res := range resultsCh {
		pagesProcessed++
		if res.err != nil {
			pagesFailed++
			slog.Warn("page analysis failed", "id", id.Hex(), "page", res.pageNum, "error", res.err)
			send(domain.AnalysisEvent{
				Type:  "page_done",
				Page:  res.pageNum,
				Error: res.err.Error(),
			})
			continue
		}

		pagesSucceeded++
		allFields = append(allFields, res.fields...)

		// Save fields to DB incrementally using $push
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{
			AppendFields: res.fields,
		})

		send(domain.AnalysisEvent{
			Type:        "page_done",
			Page:        res.pageNum,
			FieldsFound: len(res.fields),
			Fields:      res.fields,
		})
		slog.Info("page analyzed and saved", "id", id.Hex(), "page", res.pageNum, "fieldsFound", len(res.fields))
	}

	// 8. Handle results based on success/failure counts
	if pagesSucceeded == 0 {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{
			Type:        "error",
			Error:       fmt.Sprintf("AI returned no valid fields from any page (%d pages failed)", pagesFailed),
			PagesFailed: pagesFailed,
		})
		return
	}

	// 9. Deduplicate fields and compute overall confidence
	deduped := deduplicateFields(allFields)

	var totalConf float64
	for _, f := range deduped {
		totalConf += f.Confidence
	}
	avgConf := 0.0
	if len(deduped) > 0 {
		avgConf = math.Round((totalConf/float64(len(deduped)))*1000) / 10
	}

	// 10. Save final deduplicated results (replaces the incrementally appended fields)
	status := domain.StatusProcessed
	stepComplete := "complete"
	input := domain.UpdateDocumentInput{
		Status:          &status,
		ProcessingStep:  &stepComplete,
		Confidence:      &avgConf,
		ExtractedFields: deduped,
	}
	_, _ = s.Update(ctx, id, input)

	slog.Info("analysis complete", "id", id.Hex(), "totalFields", len(deduped), "confidence", avgConf,
		"pagesSucceeded", pagesSucceeded, "pagesFailed", pagesFailed)

	send(domain.AnalysisEvent{
		Type:           "complete",
		TotalFields:    len(deduped),
		Confidence:     avgConf,
		PagesSucceeded: pagesSucceeded,
		PagesFailed:    pagesFailed,
	})
}

// AnalyzeWithProgressAndSchema performs page-level OCR + parallel AI extraction
// using a user-defined extraction schema. Fields are extracted according to the
// schema rules instead of the default document-type field guide.
func (s *DocumentService) AnalyzeWithProgressAndSchema(ctx context.Context, id bson.ObjectID, schema []domain.SchemaField, progressCh chan<- domain.AnalysisEvent) {
	defer close(progressCh)

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

	// 2. Set status to processing and clear stale fields
	processingStatus := domain.StatusProcessing
	stepExtract := "extracting_text"
	emptyFields := []domain.ExtractedField{}
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{
		Status:          &processingStatus,
		ProcessingStep:  &stepExtract,
		ExtractedFields: emptyFields,
	})

	// 3. Extract pages
	slog.Info("extracting pages (schema mode)", "id", id.Hex(), "path", doc.FilePath, "schemaFields", len(schema))
	pages, _, err := ocr.ExtractPages(doc.FilePath)
	if err != nil {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{Type: "error", Error: fmt.Sprintf("text extraction failed: %v", err)})
		return
	}

	// 3b. Build raw text
	var rawBuf strings.Builder
	for _, p := range pages {
		rawBuf.WriteString(p.Text)
		rawBuf.WriteString("\n")
	}
	rawText := strings.TrimSpace(rawBuf.String())
	stepAI := "ai_analysis"
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{ProcessingStep: &stepAI, RawText: &rawText})

	// 4. Check AI client
	if !s.aiMgr.IsConfigured() {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{Type: "error", Error: "AI service not configured — add your Kilo Code API key in API Configuration"})
		return
	}

	// 5. Send start event
	send(domain.AnalysisEvent{Type: "start", TotalPages: len(pages)})

	// 6. Process pages in parallel with schema-aware extraction
	type pageResult struct {
		pageNum int
		fields  []domain.ExtractedField
		err     error
	}

	resultsCh := make(chan pageResult, len(pages))
	sem := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup

	for _, page := range pages {
		wg.Add(1)
		go func(p ocr.PageText) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			slog.Info("processing page with AI (schema mode)", "id", id.Hex(), "page", p.PageNumber)
			ai := s.aiMgr.Get()
			fields, err := ai.ExtractFieldsFromPageWithSchema(ctx, p.Text, p.PageNumber, len(pages), schema)

			if err != nil {
				slog.Warn("schema page analysis failed, retrying", "id", id.Hex(), "page", p.PageNumber, "error", err)
				fields, err = ai.ExtractFieldsFromPageWithSchema(ctx, p.Text, p.PageNumber, len(pages), schema)
			}

			resultsCh <- pageResult{pageNum: p.PageNumber, fields: fields, err: err}
		}(page)
	}

	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// 7. Collect results
	var allFields []domain.ExtractedField
	pagesProcessed := 0
	pagesSucceeded := 0
	pagesFailed := 0

	for res := range resultsCh {
		pagesProcessed++
		if res.err != nil {
			pagesFailed++
			slog.Warn("schema page analysis failed", "id", id.Hex(), "page", res.pageNum, "error", res.err)
			send(domain.AnalysisEvent{
				Type:  "page_done",
				Page:  res.pageNum,
				Error: res.err.Error(),
			})
			continue
		}

		pagesSucceeded++
		allFields = append(allFields, res.fields...)

		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{
			AppendFields: res.fields,
		})

		send(domain.AnalysisEvent{
			Type:        "page_done",
			Page:        res.pageNum,
			FieldsFound: len(res.fields),
			Fields:      res.fields,
		})
	}

	// 8. Handle results
	if pagesSucceeded == 0 {
		errStatus := domain.StatusError
		stepFailed := "failed"
		_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{Status: &errStatus, ProcessingStep: &stepFailed})
		send(domain.AnalysisEvent{
			Type:        "error",
			Error:       fmt.Sprintf("AI returned no valid fields from any page (%d pages failed)", pagesFailed),
			PagesFailed: pagesFailed,
		})
		return
	}

	// 9. Deduplicate and compute confidence
	deduped := deduplicateFields(allFields)
	var totalConf float64
	for _, f := range deduped {
		totalConf += f.Confidence
	}
	avgConf := 0.0
	if len(deduped) > 0 {
		avgConf = math.Round((totalConf/float64(len(deduped)))*1000) / 10
	}

	// 10. Save final results with applied schema
	status := domain.StatusProcessed
	stepComplete := "complete"
	_, _ = s.Update(ctx, id, domain.UpdateDocumentInput{
		Status:          &status,
		ProcessingStep:  &stepComplete,
		Confidence:      &avgConf,
		ExtractedFields: deduped,
		AppliedSchema:   schema,
	})

	slog.Info("schema analysis complete", "id", id.Hex(), "totalFields", len(deduped), "confidence", avgConf)
	send(domain.AnalysisEvent{
		Type:           "complete",
		TotalFields:    len(deduped),
		Confidence:     avgConf,
		PagesSucceeded: pagesSucceeded,
		PagesFailed:    pagesFailed,
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

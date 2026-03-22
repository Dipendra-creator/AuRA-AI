package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/service"
)

type mockDocumentRepo struct {
	GetByIDFunc func(ctx context.Context, id bson.ObjectID) (*domain.Document, error)
}

func (m *mockDocumentRepo) List(ctx context.Context, f domain.DocumentFilter) ([]domain.Document, int64, error) {
	return nil, 0, nil
}
func (m *mockDocumentRepo) GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
	return m.GetByIDFunc(ctx, id)
}
func (m *mockDocumentRepo) Create(ctx context.Context, input domain.CreateDocumentInput) (*domain.Document, error) {
	return nil, nil
}
func (m *mockDocumentRepo) Update(ctx context.Context, id bson.ObjectID, input domain.UpdateDocumentInput) (*domain.Document, error) {
	return nil, nil
}
func (m *mockDocumentRepo) SoftDelete(ctx context.Context, id bson.ObjectID) error { return nil }
func (m *mockDocumentRepo) Count(ctx context.Context) (int64, error)               { return 0, nil }
func (m *mockDocumentRepo) CountByStatus(ctx context.Context, status domain.DocumentStatus) (int64, error) {
	return 0, nil
}
func (m *mockDocumentRepo) AverageConfidence(ctx context.Context) (float64, error) {
	return 0, nil
}
func (m *mockDocumentRepo) Recent(ctx context.Context, limit int) ([]domain.Document, error) {
	return nil, nil
}
func (m *mockDocumentRepo) InsertMany(ctx context.Context, docs []domain.Document) error { return nil }

func TestExportXLSX(t *testing.T) {
	h := NewExportHandler(service.NewDocumentService(&mockDocumentRepo{}, nil))
	doc := &domain.Document{
		Name: "testexcel",
		ExtractedFields: []domain.ExtractedField{
			{FieldName: "Total", Value: "100", Confidence: 0.9},
		},
	}

	rr := httptest.NewRecorder()
	h.exportExcel(rr, doc)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 OK exporting excel, got %d", rr.Code)
	}

	// Test schema path
	doc.AppliedSchema = []domain.SchemaField{
		{Field: "Total", ColumnName: "invoice_total"},
	}
	rr = httptest.NewRecorder()
	h.exportExcel(rr, doc)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 OK exporting schema excel, got %d", rr.Code)
	}
}

func TestExportCSV(t *testing.T) {
	h := NewExportHandler(service.NewDocumentService(&mockDocumentRepo{}, nil)) // service not needed for internal methods
	doc := &domain.Document{
		Name: "testdoc",
		ExtractedFields: []domain.ExtractedField{
			{FieldName: "Total", Value: "100", Confidence: 0.9},
		},
	}

	rr := httptest.NewRecorder()
	h.exportCSV(rr, doc)

	res := rr.Body.String()
	if !strings.Contains(res, "Field Name,Value") {
		t.Errorf("Expected legacy headers, got: %s", res)
	}
	if !strings.Contains(res, "Total,100,90.0%,No") {
		t.Errorf("Expected legacy row data, got: %s", res)
	}

	// Test schema path
	doc.AppliedSchema = []domain.SchemaField{
		{Field: "Total", ColumnName: "invoice_total"},
	}
	rr = httptest.NewRecorder()
	h.exportCSV(rr, doc)

	res = rr.Body.String()
	if !strings.Contains(res, "invoice_total") {
		t.Errorf("Expected schema headers, got: %s", res)
	}
	if !strings.Contains(res, "100,90.0%") {
		t.Errorf("Expected schema row data, got: %s", res)
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"my invoice.pdf", "my_invoice"},
		{"a/real\\bad\"name'", "a_real_badname"},
		{"MY FILE.PDF", "MY_FILE"},
	}

	for _, tt := range tests {
		got := sanitizeFilename(tt.input)
		if got != tt.expected {
			t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestBuildFieldIndex(t *testing.T) {
	fields := []domain.ExtractedField{
		{FieldName: " Invoice Total "},
		{FieldName: "Tax "},
	}

	idx := buildFieldIndex(fields)
	if _, ok := idx["invoice total"]; !ok {
		t.Errorf("Failed to build/find index for normalized string")
	}
	if _, ok := idx["tax"]; !ok {
		t.Errorf("Failed to build/find index for tax")
	}
}

func TestExport(t *testing.T) {
	docID := bson.NewObjectID()
	docHex := docID.Hex()

	mockRepo := &mockDocumentRepo{
		GetByIDFunc: func(ctx context.Context, id bson.ObjectID) (*domain.Document, error) {
			if id == docID {
				return &domain.Document{
					ID:   id,
					Name: "TestDoc",
					ExtractedFields: []domain.ExtractedField{
						{FieldName: "Field1", Value: "Value1", Confidence: 0.99},
					},
				}, nil
			}
			return nil, domain.ErrNotFound
		},
	}
	svc := service.NewDocumentService(mockRepo, nil)
	h := NewExportHandler(svc)

	const (
		exportBasePath = "/api/v1/documents/"
		exportSuffix   = "/export"
	)

	tests := []struct {
		name         string
		method       string
		path         string
		body         string
		expectedCode int
	}{
		{"Invalid ID", "POST", exportBasePath + "invalid-id" + exportSuffix, `{"format":"csv"}`, http.StatusBadRequest},
		{"Invalid Body", "POST", exportBasePath + docHex + exportSuffix, `{"format":}`, http.StatusBadRequest},
		{"Invalid Format", "POST", exportBasePath + docHex + exportSuffix, `{"format":"xml"}`, http.StatusBadRequest},
		{"Document Not Found", "POST", exportBasePath + bson.NewObjectID().Hex() + exportSuffix, `{"format":"csv"}`, http.StatusNotFound},
		{"Valid CSV Export", "POST", exportBasePath + docHex + exportSuffix, `{"format":"csv"}`, http.StatusOK},
		{"Valid Excel Export", "POST", exportBasePath + docHex + exportSuffix, `{"format":"xlsx"}`, http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			h.Export(rr, req)

			if rr.Code != tt.expectedCode {
				t.Errorf("Handler returned wrong status code: got %v want %v", rr.Code, tt.expectedCode)
			}
		})
	}
}

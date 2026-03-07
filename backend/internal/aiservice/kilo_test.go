package aiservice

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aura-ai/backend/internal/domain"
)

func TestExtractAndUnmarshalJSON(t *testing.T) {
	// Case 1: Valid clean JSON
	cleanJSON := `[{"fieldName":"Name","value":"John Doe","confidence":0.95}]`
	fields, err := extractAndUnmarshalJSON(cleanJSON)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fields) != 1 || fields[0].FieldName != "Name" {
		t.Errorf("unexpected fields parsed from clean JSON")
	}

	// Case 2: JSON wrapped in markdown and text
	dirtyJSON := "Here is the extracted data:\n```json\n[\n  {\"fieldName\": \"Total\", \"value\": \"100.00\", \"confidence\": 0.99}\n]\n```\nHope this helps!"
	fields, err = extractAndUnmarshalJSON(dirtyJSON)
	if err != nil {
		t.Fatalf("expected no error for dirty JSON, got %v", err)
	}
	if len(fields) != 1 || fields[0].FieldName != "Total" {
		t.Errorf("unexpected fields parsed from dirty JSON")
	}

	// Case 3: Invalid JSON
	invalidJSON := `[{"fieldName":"Fail", ...`
	_, err = extractAndUnmarshalJSON(invalidJSON)
	if err == nil {
		t.Errorf("expected error for invalid JSON")
	}
}

func TestMapToDomainFields(t *testing.T) {
	raw := []extractedFieldJSON{
		{FieldName: "Valid", Value: "Data", Confidence: 0.8},
		{FieldName: "", Value: "EmptyName", Confidence: 0.9},
		{FieldName: "EmptyVal", Value: "", Confidence: 0.9},
		{FieldName: "HighConf", Value: "Data", Confidence: 1.5},
		{FieldName: "LowConf", Value: "Data", Confidence: -0.5},
	}

	mapped := mapToDomainFields(raw)

	if len(mapped) != 3 {
		t.Fatalf("expected 3 valid fields, got %d", len(mapped))
	}

	if mapped[0].FieldName != "Valid" || mapped[0].Confidence != 0.8 {
		t.Errorf("unexpected mapping for first valid field")
	}

	// High confidence bounded to 1.0
	if mapped[1].FieldName != "HighConf" || mapped[1].Confidence != 1.0 {
		t.Errorf("expected confidence to be bounded to 1.0, got %f", mapped[1].Confidence)
	}

	// Low confidence bounded to 0.0
	if mapped[2].FieldName != "LowConf" || mapped[2].Confidence != 0.0 {
		t.Errorf("expected confidence to be bounded to 0.0, got %f", mapped[2].Confidence)
	}
}

func TestTruncate(t *testing.T) {
	str := "Hello World"

	if truncate(str, 100) != "Hello World" {
		t.Errorf("expected no truncation")
	}
	if truncate(str, 5) != "Hello..." {
		t.Errorf("expected truncation")
	}
}

func TestParseExtractedFields(t *testing.T) {
	// Case 1: valid response stripped by parseExtractedFields' trim logic
	resp := "```json\n[{\"fieldName\":\"Test\",\"value\":\"Val\",\"confidence\":0.9}]\n```"
	fields, err := parseExtractedFields(resp)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fields) != 1 || fields[0].FieldName != "Test" {
		t.Errorf("unexpected field parsed")
	}

	// Case 2: Empty resulting fields
	respEmpty := "```json\n[]\n```"
	_, err = parseExtractedFields(respEmpty)
	if err == nil {
		t.Errorf("expected error for empty valid fields")
	}
}

func TestDocumentTypeFieldGuide(t *testing.T) {
	if !strings.Contains(documentTypeFieldGuide(domain.TypeInvoice), "INVOICE FIELDS") {
		t.Errorf("missing INVOICE FIELDS in guide")
	}
	if !strings.Contains(documentTypeFieldGuide(domain.TypeContract), "CONTRACT FIELDS") {
		t.Errorf("missing CONTRACT FIELDS in guide")
	}
	if !strings.Contains(documentTypeFieldGuide(domain.TypeReceipt), "RECEIPT FIELDS") {
		t.Errorf("missing RECEIPT FIELDS in guide")
	}
	if !strings.Contains(documentTypeFieldGuide(domain.TypeExpense), "EXPENSE REPORT FIELDS") {
		t.Errorf("missing EXPENSE REPORT FIELDS in guide")
	}
	if !strings.Contains(documentTypeFieldGuide("unknown"), "GENERAL DOCUMENT FIELDS") {
		t.Errorf("missing EXPECTED default GENERAL DOCUMENT FIELDS in guide")
	}
}

func TestBuildExtractionPrompt(t *testing.T) {
	prompt := buildExtractionPrompt("Some long text that goes on for a bit", domain.TypeInvoice)
	if !strings.Contains(prompt, "INVOICE FIELDS") {
		t.Errorf("expected prompt to contain invoice guide")
	}
	if !strings.Contains(prompt, "Some long text") {
		t.Errorf("expected prompt to contain document text")
	}

	// test truncation logic
	longText := strings.Repeat("A", 35000)
	prompt2 := buildExtractionPrompt(longText, domain.TypeInvoice)
	if !strings.Contains(prompt2, "... [text truncated]") {
		t.Errorf("expected truncated text suffix")
	}
}

func TestBuildPageExtractionPrompt(t *testing.T) {
	prompt := buildPageExtractionPrompt("Page 2 text", 2, 5, domain.TypeInvoice)
	if !strings.Contains(prompt, "page 2 of 5") {
		t.Errorf("expected proper page context")
	}
	if !strings.Contains(prompt, "Page 2 text") {
		t.Errorf("expected actual page text")
	}
}

func TestBuildSchemaFieldGuide(t *testing.T) {
	schema := []domain.SchemaField{
		{Field: "Invoice Number", ColumnName: "invoice_num", Rules: []string{"Must be numeric"}},
	}
	guide := buildSchemaFieldGuide(schema)
	if !strings.Contains(guide, "Field: \"Invoice Number\"") {
		t.Errorf("missing field in guide")
	}
	if !strings.Contains(guide, "Must be numeric") {
		t.Errorf("missing rule in guide")
	}
}

func TestExtractFieldsErrors(t *testing.T) {
	client := NewKiloClient("test-key")

	// Empty text test
	_, err := client.ExtractFields(context.Background(), "   ", domain.TypeInvoice)
	if err == nil {
		t.Errorf("expected error for empty doc string")
	}

	// HTTP error simulation
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Internal Server Error"))
	}))
	defer server.Close()

	// temporarily patch the URL or round tripper in a real test environment,
	// but here we can just test if the context fails

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err = client.ExtractFields(ctx, "Test Content", domain.TypeInvoice)
	if err == nil {
		t.Errorf("expected error for cancelled context")
	}

	_, err = client.ExtractFieldsFromPage(ctx, "Test Page 1", 1, 10, domain.TypeInvoice)
	if err == nil {
		t.Errorf("expected error for cancelled context in ExtractFieldsFromPage")
	}

	_, err = client.ExtractFieldsFromPageWithSchema(ctx, "Test Page 1", 1, 10, []domain.SchemaField{})
	if err == nil {
		t.Errorf("expected error for cancelled context in ExtractFieldsFromPageWithSchema")
	}

	_, err = client.ExtractFieldsFromPageWithSchema(context.Background(), "  ", 1, 10, []domain.SchemaField{})
	if err == nil {
		t.Errorf("expected error for empty text in ExtractFieldsFromPageWithSchema")
	}

	_, err = client.ExtractFieldsFromPage(context.Background(), "  ", 1, 10, domain.TypeInvoice)
	if err == nil {
		t.Errorf("expected error for empty text in ExtractFieldsFromPage")
	}
}

func TestBuildSchemaPageExtractionPrompt(t *testing.T) {
	schema := []domain.SchemaField{
		{Field: "Invoice Number", ColumnName: "invoice_num", Rules: []string{"Must be numeric"}},
	}
	prompt := buildSchemaPageExtractionPrompt("Page 2 text", 2, 5, schema)

	if !strings.Contains(prompt, "page 2 of 5") {
		t.Errorf("expected proper page context")
	}
	if !strings.Contains(prompt, "Page 2 text") {
		t.Errorf("expected actual page text")
	}
	if !strings.Contains(prompt, "Invoice Number") {
		t.Errorf("expected schema field in prompt")
	}

	// test truncation logic
	longText := strings.Repeat("A", 35000)
	prompt2 := buildSchemaPageExtractionPrompt(longText, 2, 5, schema)
	if !strings.Contains(prompt2, "... [text truncated]") {
		t.Errorf("expected truncated text suffix")
	}
}

func TestExtractFieldsSuccess(t *testing.T) {
	// Create a mock server that returns a valid JSON response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		resp := chatResponse{
			Choices: []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			}{
				{
					Message: struct {
						Content string `json:"content"`
					}{
						Content: `[{"fieldName":"Name","value":"John Doe"}]`,
					},
				},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Patch kilo client to use the local server instead
	client := NewKiloClient("test-key")

	// Create a custom transport to route kiloBaseURL to our local server
	client.httpClient.Transport = &rewriteTransport{targetURL: server.URL}

	ctx := context.Background()

	// Test ExtractFields
	fields, err := client.ExtractFields(ctx, "Test Content", domain.TypeInvoice)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fields) != 1 || fields[0].FieldName != "Name" {
		t.Errorf("unexpected field parsed: %+v", fields)
	}

	// Test ExtractFieldsFromPage
	fields, err = client.ExtractFieldsFromPage(ctx, "Test Content", 1, 1, domain.TypeInvoice)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fields) != 1 || fields[0].FieldName != "Name" {
		t.Errorf("unexpected field parsed: %+v", fields)
	}

	// Test ExtractFieldsFromPageWithSchema
	fields, err = client.ExtractFieldsFromPageWithSchema(ctx, "Test Content", 1, 1, []domain.SchemaField{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(fields) != 1 || fields[0].FieldName != "Name" {
		t.Errorf("unexpected field parsed: %+v", fields)
	}
}

// rewriteTransport overrides the host to route to our httptest server.
type rewriteTransport struct {
	targetURL string
}

func (t *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Rewrite the request URL to point to our test server
	// We preserve the rest of the request, essentially acting as a proxy
	mockReq := req.Clone(req.Context())

	// Replace https://api.kilo.ai with our server URL
	testURL := t.targetURL + mockReq.URL.Path
	newReq, _ := http.NewRequestWithContext(req.Context(), req.Method, testURL, req.Body)
	mockReq.URL = newReq.URL

	return http.DefaultTransport.RoundTrip(mockReq)
}

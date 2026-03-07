package nodes

import (
	"context"
	"testing"

	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/engine"
)

const errExpectedNoError = "expected no error, got %v"

func TestDocSelectExecutorValidate(t *testing.T) {
	e := &DocSelectExecutor{}

	// Test case 1: No documentIds
	node1 := domain.PipelineNode{Config: map[string]any{}}
	if err := e.Validate(node1); err != nil {
		t.Errorf(errExpectedNoError, err)
	}

	// Test case 2: documentIds is nil
	node2 := domain.PipelineNode{Config: map[string]any{"documentIds": nil}}
	if err := e.Validate(node2); err != nil {
		t.Errorf(errExpectedNoError, err)
	}

	// Test case 3: String array
	node3 := domain.PipelineNode{Config: map[string]any{"documentIds": []string{"id1", "id2"}}}
	if err := e.Validate(node3); err != nil {
		t.Errorf(errExpectedNoError, err)
	}

	// Test case 4: Any array
	node4 := domain.PipelineNode{Config: map[string]any{"documentIds": []any{"id1", 123}}}
	if err := e.Validate(node4); err != nil {
		t.Errorf(errExpectedNoError, err)
	}

	// Test case 5: Single string
	node5 := domain.PipelineNode{Config: map[string]any{"documentIds": "id1"}}
	if err := e.Validate(node5); err != nil {
		t.Errorf(errExpectedNoError, err)
	}

	// Test case 6: Unknown type
	node6 := domain.PipelineNode{Config: map[string]any{"documentIds": 123}}
	if err := e.Validate(node6); err != nil {
		t.Errorf(errExpectedNoError, err)
	}
}

func TestExtractStringSlice(t *testing.T) {
	// Case 1: []string
	if res := extractStringSlice([]string{"a", "b"}); len(res) != 2 || res[0] != "a" {
		t.Errorf("unexpected parsing of []string")
	}

	// Case 2: []any
	if res := extractStringSlice([]any{"a", "b", 123}); len(res) != 2 || res[0] != "a" {
		t.Errorf("unexpected parsing of []any")
	}

	// Case 3: invalid type
	if res := extractStringSlice("foo"); res != nil {
		t.Errorf("expected nil for string")
	}
}

func TestGetBoolConfig(t *testing.T) {
	cfg := map[string]any{
		"trueVal":  true,
		"falseVal": false,
		"intVal":   123,
	}

	if !getBoolConfig(cfg, "trueVal", false) {
		t.Errorf("expected true")
	}
	if getBoolConfig(cfg, "falseVal", true) {
		t.Errorf("expected false")
	}
	if !getBoolConfig(cfg, "missingVal", true) {
		t.Errorf("expected fallback true")
	}
	if getBoolConfig(cfg, "intVal", false) {
		t.Errorf("expected fallback false for invalid type")
	}
}

func TestDocSelectExecutorExecute(t *testing.T) {
	e := &DocSelectExecutor{} // docRepo is nil, but that's fine if we don't reach it

	ctx := context.Background()

	t.Run("Empty documentIds", func(t *testing.T) {
		node := domain.PipelineNode{
			NodeID: "node1",
			Name:   "DocSelect",
			Config: map[string]any{},
		}
		input := engine.DataPacket{Fields: map[string]any{}}

		out, err := e.Execute(ctx, node, input)
		if err != nil {
			t.Fatalf(errExpectedNoError, err)
		}

		if out.Fields["documentsSelected"] != 0 {
			t.Errorf("expected 0 docs selected")
		}
	})

	t.Run("Invalid Hex documentIds", func(t *testing.T) {
		node := domain.PipelineNode{
			NodeID: "node2",
			Name:   "DocSelect",
			Config: map[string]any{
				"documentIds": []string{"invalid-hex-id"},
			},
		}
		input := engine.DataPacket{Fields: map[string]any{}}

		out, err := e.Execute(ctx, node, input)
		if err != nil {
			t.Fatalf(errExpectedNoError, err)
		}

		if out.Fields["documentsSelected"] != 0 {
			t.Errorf("expected 0 docs selected because it should fail early")
		}
		if len(out.Errors) == 0 {
			t.Errorf("expected error in output packet from invalid hex id")
		}
	})
}

func TestNewDocSelectExecutor(t *testing.T) {
	e := NewDocSelectExecutor(nil)
	if e == nil {
		t.Errorf("expected a new executor")
	}
}

func TestDocSelectExecutorPopulateDocData(t *testing.T) {
	e := &DocSelectExecutor{}

	doc := &domain.Document{
		Name:     "Test.pdf",
		FilePath: "/docs/test.pdf",
		MimeType: "application/pdf",
		FileSize: 1234,
		RawText:  "Hello world",
		ExtractedFields: []domain.ExtractedField{
			{FieldName: "invoice_number", Value: "INV-123", Confidence: 0.95},
		},
	}

	out := &engine.DataPacket{
		Fields: make(map[string]any),
		Files:  []engine.FileReference{},
	}
	allText := []string{}

	e.populateDocData(doc, "hex-id-123", true, true, out, &allText)

	if len(out.Files) != 1 {
		t.Errorf("expected 1 file ref, got %d", len(out.Files))
	} else {
		if out.Files[0].Path != "/docs/test.pdf" {
			t.Errorf("expected file path /docs/test.pdf")
		}
	}

	if len(allText) != 1 || allText[0] != "Hello world" {
		t.Errorf("expected raw text to be appended")
	}

	if out.Fields["invoice_number"] != "INV-123" {
		t.Errorf("expected invoice_number extracted field")
	}
	if out.Fields["documentId_hex-id-123"] != "hex-id-123" {
		t.Errorf("expected documentId field")
	}

	// Test case without raw text and extracted fields
	out2 := &engine.DataPacket{
		Fields: make(map[string]any),
		Files:  []engine.FileReference{},
	}
	allText2 := []string{}
	e.populateDocData(doc, "hex-id-234", false, false, out2, &allText2)

	if len(allText2) != 0 {
		t.Errorf("expected no raw text")
	}
	if out2.Fields["invoice_number"] != nil {
		t.Errorf("expected no extracted fields")
	}
}

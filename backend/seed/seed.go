// Seed command — populates the Aura AI database with mock data.
//
// Usage: go run seed/seed.go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aura-ai/backend/internal/config"
	"github.com/aura-ai/backend/internal/database"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := database.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Fatalf("failed to connect to MongoDB: %v", err)
	}
	defer db.Disconnect(ctx)

	fmt.Println("🌱 Seeding Aura AI database...")

	// Seed documents
	seedDocuments(ctx, db)

	// Seed pipelines
	seedPipelines(ctx, db)

	// Seed activity events
	seedActivity(ctx, db)

	fmt.Println("✅ Seeding complete!")
	os.Exit(0)
}

func seedDocuments(ctx context.Context, db *database.Client) {
	repo := repository.NewDocumentRepo(db.Database())
	now := time.Now()

	docs := []domain.Document{
		{
			Name: "Invoice_2023_001.pdf", Type: domain.TypeInvoice, MimeType: "application/pdf",
			Status: domain.StatusProcessed, Confidence: 99.8, FilePath: "/documents/Invoice_2023_001.pdf",
			FileSize: 245000, CreatedAt: now.Add(-1 * time.Hour), UpdatedAt: now.Add(-59 * time.Minute),
			ExtractedFields: []domain.ExtractedField{
				{FieldName: "Invoice Number", Value: "INV-2024-0042", Confidence: 0.99, Verified: true},
				{FieldName: "Vendor Name", Value: "Acme Global Solutions Inc.", Confidence: 0.97, Verified: true},
				{FieldName: "Due Date", Value: "Oct 24, 2024", Confidence: 0.88, Verified: false},
				{FieldName: "Tax ID", Value: "77-XXX-91", Confidence: 0.64, Verified: false},
				{FieldName: "Total Amount", Value: "12,450.00", Confidence: 0.99, Verified: true},
			},
		},
		{
			Name: "Agreement_Draft_v4.pdf", Type: domain.TypeContract, MimeType: "application/pdf",
			Status: domain.StatusReviewing, Confidence: 82.4, FilePath: "/documents/Agreement_Draft_v4.pdf",
			FileSize: 890000, CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now.Add(-115 * time.Minute),
			ExtractedFields: []domain.ExtractedField{
				{FieldName: "Party A", Value: "GlobalCorp Industries", Confidence: 0.95, Verified: true},
				{FieldName: "Party B", Value: "Quantum Systems Inc.", Confidence: 0.93, Verified: true},
				{FieldName: "Effective Date", Value: "2023-11-01", Confidence: 0.78, Verified: false},
				{FieldName: "Contract Value", Value: "$250,000.00", Confidence: 0.85, Verified: false},
			},
		},
		{
			Name: "Receipt_Uber_X12.jpg", Type: domain.TypeExpense, MimeType: "image/jpeg",
			Status: domain.StatusProcessed, Confidence: 96.1, FilePath: "/documents/Receipt_Uber_X12.jpg",
			FileSize: 120000, CreatedAt: now.Add(-3 * time.Hour), UpdatedAt: now.Add(-179 * time.Minute),
			ExtractedFields: []domain.ExtractedField{
				{FieldName: "Vendor", Value: "Uber Technologies", Confidence: 0.99, Verified: true},
				{FieldName: "Amount", Value: "$34.50", Confidence: 0.97, Verified: true},
				{FieldName: "Date", Value: "2023-10-23", Confidence: 0.95, Verified: true},
			},
		},
		{
			Name: "Bank_Statement_Oct.pdf", Type: domain.TypeOther, MimeType: "application/pdf",
			Status: domain.StatusProcessing, Confidence: 0, FilePath: "/documents/Bank_Statement_Oct.pdf",
			FileSize: 560000, CreatedAt: now.Add(-4 * time.Hour), UpdatedAt: now.Add(-4 * time.Hour),
			ExtractedFields: []domain.ExtractedField{},
		},
		{
			Name: "Contract_Legal_Draft_V4.docx", Type: domain.TypeContract,
			MimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			Status:   domain.StatusReviewing, Confidence: 82.5, FilePath: "/documents/Contract_Legal_Draft_V4.docx",
			FileSize: 340000, CreatedAt: now.Add(-5 * time.Hour), UpdatedAt: now.Add(-295 * time.Minute),
			ExtractedFields: []domain.ExtractedField{
				{FieldName: "Document Title", Value: "Service Level Agreement", Confidence: 0.91, Verified: true},
				{FieldName: "Renewal Date", Value: "2024-01-15", Confidence: 0.72, Verified: false},
				{FieldName: "Monthly Fee", Value: "$8,500.00", Confidence: 0.88, Verified: false},
			},
		},
		{
			Name: "Invoice_29482_Acme.pdf", Type: domain.TypeInvoice, MimeType: "application/pdf",
			Status: domain.StatusProcessed, Confidence: 99.2, FilePath: "/documents/Invoice_29482_Acme.pdf",
			FileSize: 198000, CreatedAt: now.Add(-24 * time.Hour), UpdatedAt: now.Add(-1435 * time.Minute),
			ExtractedFields: []domain.ExtractedField{
				{FieldName: "Invoice Number", Value: "INV-29482", Confidence: 0.99, Verified: true},
				{FieldName: "Vendor Name", Value: "Acme Corp", Confidence: 0.98, Verified: true},
				{FieldName: "Total Amount", Value: "$5,234.00", Confidence: 1.0, Verified: true},
				{FieldName: "Due Date", Value: "2023-11-15", Confidence: 0.96, Verified: true},
			},
		},
		{
			Name: "Receipt_Starbucks_662.jpg", Type: domain.TypeReceipt, MimeType: "image/jpeg",
			Status: domain.StatusProcessed, Confidence: 98.1, FilePath: "/documents/Receipt_Starbucks_662.jpg",
			FileSize: 85000, CreatedAt: now.Add(-48 * time.Hour), UpdatedAt: now.Add(-2879 * time.Minute),
			ExtractedFields: []domain.ExtractedField{
				{FieldName: "Vendor", Value: "Starbucks", Confidence: 0.99, Verified: true},
				{FieldName: "Amount", Value: "$6.75", Confidence: 0.98, Verified: true},
				{FieldName: "Date", Value: "2023-10-20", Confidence: 0.97, Verified: true},
			},
		},
		{
			Name: "NDA_Quantum_Systems.pdf", Type: domain.TypeContract, MimeType: "application/pdf",
			Status: domain.StatusError, Confidence: 0, FilePath: "/documents/NDA_Quantum_Systems.pdf",
			FileSize: 420000, CreatedAt: now.Add(-72 * time.Hour), UpdatedAt: now.Add(-4318 * time.Minute),
			ExtractedFields: []domain.ExtractedField{},
		},
	}

	if err := repo.InsertMany(ctx, docs); err != nil {
		log.Printf("⚠️  Documents may already be seeded: %v\n", err)
	} else {
		fmt.Printf("   📄 Inserted %d documents\n", len(docs))
	}
}

func seedPipelines(ctx context.Context, db *database.Client) {
	repo := repository.NewPipelineRepo(db.Database())
	now := time.Now()

	pipelines := []domain.Pipeline{
		{
			Name: "DATA PIPELINE V2.4", Description: "Primary document processing pipeline", Status: "operational", Latency: "24ms",
			Workspace: "AURA PRIME", Version: "8.4.2-STABLE",
			CreatedAt: now.Add(-720 * time.Hour), UpdatedAt: now.Add(-1 * time.Hour),
			Nodes: []domain.PipelineNode{
				{NodeID: "IN-240-A1", Label: "DOC SELECT", Name: "Select Documents", Type: domain.NodeTypeDocSelect, Icon: "fileSearch",
					Position: domain.NodePosition{X: 50, Y: 300},
					Config:   map[string]any{"documentIds": []string{}, "includeRawText": true, "includeExtractedFields": true}},
				{NodeID: "EX-240-B2", Label: "AI EXTRACT", Name: "Extract Node", Type: domain.NodeTypeAIExtract, Icon: "auto_awesome",
					Position: domain.NodePosition{X: 300, Y: 300},
					Config:   map[string]any{"confidenceThreshold": 0.7, "strictJsonSchema": true}},
				{NodeID: "VN-240-X9", Label: "REVIEW", Name: "Validate Node", Type: domain.NodeTypeReview, Icon: "verified",
					Position: domain.NodePosition{X: 550, Y: 300},
					Config:   map[string]any{"autoApproveThreshold": 0.95, "allowEdits": true}},
				{NodeID: "TN-240-C3", Label: "TRANSFORM", Name: "Transform Node", Type: domain.NodeTypeTransform, Icon: "transform",
					Position: domain.NodePosition{X: 800, Y: 300},
					Config:   map[string]any{"operations": []map[string]any{{"type": "default", "field": "currency", "value": "USD"}}}},
				{NodeID: "EP-240-D4", Label: "EXPORT", Name: "Export Node", Type: domain.NodeTypeExport, Icon: "output",
					Position: domain.NodePosition{X: 1050, Y: 300},
					Config:   map[string]any{"format": "csv", "destination": "local"}},
			},
			Edges: []domain.PipelineEdge{
				{ID: "e1", SourceID: "IN-240-A1", TargetID: "EX-240-B2"},
				{ID: "e2", SourceID: "EX-240-B2", TargetID: "VN-240-X9"},
				{ID: "e3", SourceID: "VN-240-X9", TargetID: "TN-240-C3"},
				{ID: "e4", SourceID: "TN-240-C3", TargetID: "EP-240-D4"},
			},
		},
	}

	if err := repo.InsertMany(ctx, pipelines); err != nil {
		log.Printf("⚠️  Pipelines may already be seeded: %v\n", err)
	} else {
		fmt.Printf("   🔀 Inserted %d pipelines\n", len(pipelines))
	}
}

func seedActivity(ctx context.Context, db *database.Client) {
	repo := repository.NewActivityRepo(db.Database())
	now := time.Now()

	events := []domain.ActivityEvent{
		{Type: domain.EventProcessed, Title: "Invoice_7892.pdf processed", Source: "Finance Pipeline", Icon: domain.IconCheck, CreatedAt: now.Add(-2 * time.Minute)},
		{Type: domain.EventSystem, Title: "Pipeline Alpha updated", Source: "System", Icon: domain.IconRefresh, CreatedAt: now.Add(-15 * time.Minute)},
		{Type: domain.EventCreated, Title: "New Template Created", Source: "Alex Rivers", Icon: domain.IconPlus, CreatedAt: now.Add(-1 * time.Hour)},
		{Type: domain.EventReview, Title: "Review required: Contract_v2", Source: "Legal Pipeline", Icon: domain.IconWarning, CreatedAt: now.Add(-3 * time.Hour)},
	}

	if err := repo.InsertMany(ctx, events); err != nil {
		log.Printf("⚠️  Activity events may already be seeded: %v\n", err)
	} else {
		fmt.Printf("   📋 Inserted %d activity events\n", len(events))
	}
}

package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// DocumentStatus represents the processing state of a document.
type DocumentStatus string

const (
	StatusPending    DocumentStatus = "pending"
	StatusProcessing DocumentStatus = "processing"
	StatusProcessed  DocumentStatus = "processed"
	StatusReviewing  DocumentStatus = "reviewing"
	StatusError      DocumentStatus = "error"
)

// DocumentType classifies the kind of document.
type DocumentType string

const (
	TypeInvoice  DocumentType = "invoice"
	TypeContract DocumentType = "contract"
	TypeReceipt  DocumentType = "receipt"
	TypeExpense  DocumentType = "expense"
	TypeOther    DocumentType = "other"
)

// ExtractedField represents a single field extracted by AI analysis.
type ExtractedField struct {
	FieldName  string  `json:"fieldName"  bson:"field_name"`
	Value      string  `json:"value"      bson:"value"`
	Confidence float64 `json:"confidence" bson:"confidence"`
	Verified   bool    `json:"verified"   bson:"verified"`
}

// SchemaField represents a user-defined extraction field with rules.
type SchemaField struct {
	Field      string   `json:"field"      bson:"field"`
	ColumnName string   `json:"columnName" bson:"column_name"`
	Rules      []string `json:"rules"      bson:"rules"`
}

// Document is the core business entity for uploaded documents.
type Document struct {
	ID              bson.ObjectID    `json:"_id"             bson:"_id,omitempty"`
	Name            string           `json:"name"            bson:"name"`
	Type            DocumentType     `json:"type"            bson:"type"`
	MimeType        string           `json:"mimeType"        bson:"mime_type"`
	Status          DocumentStatus   `json:"status"          bson:"status"`
	ProcessingStep  string           `json:"processingStep"  bson:"processing_step"`
	Confidence      float64          `json:"confidence"      bson:"confidence"`
	FilePath        string           `json:"filePath"        bson:"file_path"`
	FileSize        int64            `json:"fileSize"        bson:"file_size"`
	RawText         string           `json:"rawText"         bson:"raw_text"`
	ExtractedFields []ExtractedField `json:"extractedFields" bson:"extracted_fields"`
	CreatedAt       time.Time        `json:"createdAt"       bson:"created_at"`
	UpdatedAt       time.Time        `json:"updatedAt"       bson:"updated_at"`
	DeletedAt       *time.Time       `json:"deletedAt,omitempty" bson:"deleted_at,omitempty"`
}

// CreateDocumentInput is the payload for creating a new document.
type CreateDocumentInput struct {
	Name     string       `json:"name"`
	Type     DocumentType `json:"type"`
	MimeType string       `json:"mimeType"`
	FilePath string       `json:"filePath"`
	FileSize int64        `json:"fileSize"`
}

// UpdateDocumentInput is the payload for patching a document.
type UpdateDocumentInput struct {
	Status          *DocumentStatus  `json:"status,omitempty"`
	ProcessingStep  *string          `json:"processingStep,omitempty"`
	Confidence      *float64         `json:"confidence,omitempty"`
	RawText         *string          `json:"rawText,omitempty"`
	ExtractedFields []ExtractedField `json:"extractedFields,omitempty"`
	AppendFields    []ExtractedField `json:"-"` // used internally for $push operations, not exposed via JSON
}

// DashboardStats holds aggregated dashboard metrics.
type DashboardStats struct {
	TotalDocuments           int64   `json:"totalDocuments"`
	AccuracyRate             float64 `json:"accuracyRate"`
	AvgProcessingTime        float64 `json:"avgProcessingTime"`
	ActivePipelines          int64   `json:"activePipelines"`
	DocumentsProcessedChange float64 `json:"documentsProcessedChange"`
	AccuracyChange           float64 `json:"accuracyChange"`
	ProcessingTimeChange     float64 `json:"processingTimeChange"`
	PipelinesChange          float64 `json:"pipelinesChange"`
}

// ChartDataPoint represents a single point on the accuracy chart.
type ChartDataPoint struct {
	Date  string  `json:"date"  bson:"date"`
	Value float64 `json:"value" bson:"value"`
}

// DocumentFilter holds query parameters for filtering documents.
type DocumentFilter struct {
	Status string
	Type   string
	Search string
	Page   int
	Limit  int
	Sort   string
}

// AnalysisEvent represents a real-time progress event during document analysis.
type AnalysisEvent struct {
	Type           string           `json:"type"` // "start", "page_done", "error", "complete"
	TotalPages     int              `json:"totalPages,omitempty"`
	Page           int              `json:"page,omitempty"`
	FieldsFound    int              `json:"fieldsFound,omitempty"`
	TotalFields    int              `json:"totalFields,omitempty"`
	Confidence     float64          `json:"confidence,omitempty"`
	Error          string           `json:"error,omitempty"`
	Fields         []ExtractedField `json:"fields,omitempty"`
	PagesSucceeded int              `json:"pagesSucceeded,omitempty"`
	PagesFailed    int              `json:"pagesFailed,omitempty"`
}

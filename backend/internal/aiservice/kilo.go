// Package aiservice provides AI-powered document analysis via the Kilo API.
package aiservice

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aura-ai/backend/internal/domain"
)

const (
	kiloBaseURL    = "https://api.kilo.ai/api/openrouter/"
	defaultModel   = "minimax/minimax-m2.5:free"
	requestTimeout = 120 * time.Second
)

// KiloClient communicates with the Kilo AI API for document field extraction.
type KiloClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewKiloClient creates a new KiloClient with the given API key.
func NewKiloClient(apiKey string) *KiloClient {
	return &KiloClient{
		apiKey: apiKey,
		model:  defaultModel,
		httpClient: &http.Client{
			Timeout: requestTimeout,
		},
	}
}

// chatRequest is the OpenAI-compatible request format.
type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse is the OpenAI-compatible response format.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// extractedFieldJSON is the JSON shape we ask the AI to produce.
type extractedFieldJSON struct {
	FieldName  string  `json:"fieldName"`
	Value      string  `json:"value"`
	Confidence float64 `json:"confidence"`
}

// ExtractFields sends document text to the AI and returns structured fields.
func (c *KiloClient) ExtractFields(ctx context.Context, documentText string, documentType domain.DocumentType) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(documentText) == "" {
		return nil, fmt.Errorf("document text is empty")
	}

	prompt := buildExtractionPrompt(documentText, documentType)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{
				Role:    "system",
				Content: "You are a document analysis AI. You extract structured data from documents. Always respond with valid JSON only — no markdown, no explanation.",
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := kiloBaseURL + "chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AI API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AI response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AI API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("AI API error: %s", chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("AI returned no choices")
	}

	content := chatResp.Choices[0].Message.Content
	return parseExtractedFields(content)
}

// ExtractFieldsFromPage sends a single page's text to the AI and returns structured fields.
func (c *KiloClient) ExtractFieldsFromPage(ctx context.Context, pageText string, pageNum, totalPages int, documentType domain.DocumentType) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(pageText) == "" {
		return nil, fmt.Errorf("page %d text is empty", pageNum)
	}

	prompt := buildPageExtractionPrompt(pageText, pageNum, totalPages, documentType)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{
				Role:    "system",
				Content: "You are a document analysis AI. You extract structured data from documents. Always respond with valid JSON only — no markdown, no explanation.",
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := kiloBaseURL + "chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AI API request failed for page %d: %w", pageNum, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AI response for page %d: %w", pageNum, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AI API returned status %d for page %d: %s", resp.StatusCode, pageNum, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse AI response for page %d: %w", pageNum, err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("AI API error for page %d: %s", pageNum, chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("AI returned no choices for page %d", pageNum)
	}

	content := chatResp.Choices[0].Message.Content
	return parseExtractedFields(content)
}

// documentTypeFieldGuide returns a comprehensive list of fields to extract for each document type.
func documentTypeFieldGuide(docType domain.DocumentType) string {
	switch docType {
	case domain.TypeInvoice:
		return `INVOICE FIELDS — Extract ALL of the following if present:

IDENTIFICATION: Invoice Number, Purchase Order Number, Reference Number, Account Number, Customer ID, Vendor ID, Tax ID / VAT Number, GSTIN

PARTIES:
- Seller/Vendor: Company Name, Contact Person, Address (Street, City, State, ZIP, Country), Phone, Email, Website, Bank Details (Bank Name, Account Number, IFSC/SWIFT/Routing)
- Buyer/Customer: Company Name, Contact Person, Billing Address, Shipping Address, Phone, Email

DATES: Invoice Date, Due Date, Payment Terms (e.g. Net 30), Delivery Date, Order Date, Ship Date

FINANCIAL SUMMARY: Subtotal, Discount (Amount and Percentage), Tax Rate, Tax Amount, Shipping/Freight Charges, Handling Fees, Total Amount, Currency, Amount Due, Amount Paid, Balance Due

LINE ITEMS — Extract EVERY line item as a separate field named "Line Item N" with the full details:
  Each line item: Description, Quantity, Unit Price, Unit of Measure, Tax, Discount, Line Total, SKU/Item Code, HSN/SAC Code

PAYMENT: Payment Method, Payment Status, Payment Instructions, Bank Transfer Details, Late Payment Penalty

NOTES: Terms and Conditions, Additional Notes, Special Instructions, Warranty Information

METADATA: Page Number (where found), Document Language, Stamp/Seal Information, Signature Present (Yes/No)`

	case domain.TypeContract:
		return `CONTRACT FIELDS — Extract ALL of the following if present:

IDENTIFICATION: Contract Number, Agreement Title, Version/Revision, Reference Number, Case/Matter Number

PARTIES — For EACH party:
  Party Name, Role (e.g. Licensor/Licensee, Employer/Employee, Buyer/Seller), Authorized Representative, Title/Designation, Address, Phone, Email, Registration/Tax ID

DATES: Execution Date, Effective Date, Expiration Date, Renewal Date, Amendment Date, Termination Notice Period

FINANCIAL TERMS: Contract Value/Total Amount, Payment Schedule, Payment Frequency, Currency, Penalties, Late Fee, Security Deposit, Escrow Amount, Milestone Payments

KEY CLAUSES — Summarize each as a field:
  Scope of Work, Deliverables, Performance Metrics, Confidentiality/NDA Terms, Non-Compete Terms, Intellectual Property Rights, Indemnification, Limitation of Liability, Warranty Terms, Insurance Requirements, Termination Conditions, Force Majeure, Dispute Resolution (Arbitration/Jurisdiction), Governing Law

SIGNATURES: Signatory Names, Titles, Signature Dates, Witness Names, Notary Information

METADATA: Number of Pages, Exhibits/Appendices Listed, Amendment History, Document Language`

	case domain.TypeReceipt:
		return `RECEIPT FIELDS — Extract ALL of the following if present:

STORE/MERCHANT: Store Name, Store Number/Branch, Address, Phone, Website, Tax ID/GST Number

TRANSACTION: Receipt Number, Transaction ID, Date, Time, Register/Terminal Number, Cashier/Operator Name

ITEMS — Extract EVERY purchased item as "Item N":
  Item Name/Description, Quantity, Unit Price, Discount, Tax, Item Total, SKU/Barcode, Category

FINANCIAL: Subtotal, Tax Breakdown (by tax type/rate), Total Tax, Discount Total, Grand Total, Currency

PAYMENT: Payment Method (Cash/Card/Digital), Card Type (Visa/MC/etc), Last 4 Digits of Card, Amount Tendered, Change Given, Tip Amount, Authorization Code

LOYALTY/REWARDS: Loyalty Card Number, Points Earned, Points Redeemed, Membership Level

OTHER: Return Policy, Barcode/QR Code Data, Survey URL, Promotional Messages`

	case domain.TypeExpense:
		return `EXPENSE REPORT FIELDS — Extract ALL of the following if present:

IDENTIFICATION: Report Number, Report Title, Period (From-To Dates), Department, Cost Center, Project Code

EMPLOYEE: Employee Name, Employee ID, Title/Position, Department, Manager/Approver Name

EXPENSE ITEMS — Extract EVERY expense as "Expense N":
  Date, Category (Travel/Meals/Lodging/Transport/Supplies/etc), Description, Vendor/Merchant, Location/City, Amount, Currency, Exchange Rate, Receipt Attached (Yes/No)

TRAVEL DETAILS (if applicable): Trip Purpose, Destination, Departure Date, Return Date, Mileage, Per Diem Rate

FINANCIAL: Total Expenses, Advance Received, Amount Due to Employee, Amount Due to Company, Tax Deductible Amount

APPROVALS: Submitted Date, Approved Date, Approver Name, Approval Status, Comments/Notes

POLICY: Policy Violations, Over-Limit Items, Justification Notes`

	default:
		return `GENERAL DOCUMENT FIELDS — Extract ALL information present:

IDENTIFICATION: Document Title, Document Number/ID, Reference Numbers, Version, Date Created, Author

ORGANIZATIONS: All company/organization names, addresses, contact details, registration numbers

PEOPLE: All person names, titles, roles, contact information

DATES: Every date mentioned with context (e.g. "Effective Date: 2024-01-15")

FINANCIAL: All monetary amounts, currencies, calculations, totals, rates, percentages

TABLES: Extract every row of every table as separate fields (e.g. "Table 1 Row N")

LISTS: Extract every numbered or bulleted item

LEGAL/REGULATORY: Any legal references, regulation numbers, compliance statements, license numbers

TECHNICAL: Serial numbers, model numbers, specifications, measurements, codes

METADATA: Document language, page count, headers, footers, watermarks, stamps, signatures

OTHER: Any other structured or semi-structured data visible in the document — leave NOTHING out`
	}
}

// buildExtractionPrompt creates a structured prompt for the AI (full document).
func buildExtractionPrompt(text string, docType domain.DocumentType) string {
	typeHint := string(docType)
	if typeHint == "" || typeHint == "other" {
		typeHint = "general document"
	}

	const maxTextLen = 30000
	if len(text) > maxTextLen {
		text = text[:maxTextLen] + "\n... [text truncated]"
	}

	fieldGuide := documentTypeFieldGuide(docType)

	return fmt.Sprintf(`You are an expert document data extraction AI. Analyze the following %s and extract EVERY piece of structured data.

%s

EXTRACTION RULES:
1. Extract EVERY field you can find — do NOT skip any data.
2. For tables, extract each row as a separate field (e.g. "Line Item 1", "Line Item 2").
3. For addresses, extract both the full combined address AND individual components (Street, City, State, ZIP, Country).
4. If a value appears multiple times, use the most complete/clear instance.
5. Include units and currency symbols in values (e.g. "$1,234.56", "30 days", "5 kg").
6. For dates, preserve the original format found in the document.
7. Set confidence based on text clarity: 0.95+ for clearly printed text, 0.7-0.94 for partially unclear, below 0.7 for guessed/uncertain values.

Return a JSON array of objects. Each object MUST have:
- "fieldName": descriptive name of the field (e.g. "Invoice Number", "Vendor Address", "Line Item 3 Description")
- "value": the extracted value as a string
- "confidence": a float between 0.0 and 1.0

IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation. Extract the MAXIMUM number of fields possible.

Document text:
---
%s
---`, typeHint, fieldGuide, text)
}

// buildPageExtractionPrompt creates a prompt for a single page with context.
func buildPageExtractionPrompt(text string, pageNum, totalPages int, docType domain.DocumentType) string {
	typeHint := string(docType)
	if typeHint == "" || typeHint == "other" {
		typeHint = "general document"
	}

	const maxTextLen = 30000
	if len(text) > maxTextLen {
		text = text[:maxTextLen] + "\n... [text truncated]"
	}

	fieldGuide := documentTypeFieldGuide(docType)

	return fmt.Sprintf(`You are an expert document data extraction AI. Analyze page %d of %d from a %s and extract EVERY piece of structured data found on THIS page.

%s

EXTRACTION RULES:
1. Extract EVERY field visible on this page — do NOT skip any data.
2. For tables, extract each row as a separate field (e.g. "Line Item 1", "Line Item 2").
3. For addresses, extract both the full combined address AND individual components.
4. Include units and currency symbols in values (e.g. "$1,234.56", "30 days").
5. For dates, preserve the original format found in the document.
6. Set confidence based on text clarity: 0.95+ for clearly printed text, 0.7-0.94 for partially unclear, below 0.7 for guessed/uncertain values.
7. If this page contains no meaningful data fields, return an empty JSON array: []
8. Prefix field names with context if needed to avoid ambiguity across pages (e.g. "Seller Phone" vs "Buyer Phone").

Return a JSON array of objects. Each object MUST have:
- "fieldName": descriptive name of the field
- "value": the extracted value as a string
- "confidence": a float between 0.0 and 1.0

IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation. Extract the MAXIMUM number of fields possible from this page.

Page %d text:
---
%s
---`, pageNum, totalPages, typeHint, fieldGuide, pageNum, text)
}

// parseExtractedFields parses the AI's JSON response into domain fields.
func parseExtractedFields(content string) ([]domain.ExtractedField, error) {
	// Clean up common issues: strip markdown fences, trim whitespace
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var rawFields []extractedFieldJSON
	if err := json.Unmarshal([]byte(content), &rawFields); err != nil {
		// Try to find JSON array in the content
		start := strings.Index(content, "[")
		end := strings.LastIndex(content, "]")
		if start >= 0 && end > start {
			if err2 := json.Unmarshal([]byte(content[start:end+1]), &rawFields); err2 != nil {
				return nil, fmt.Errorf("failed to parse AI output as JSON: %w (raw: %s)", err, truncate(content, 200))
			}
		} else {
			return nil, fmt.Errorf("failed to parse AI output as JSON: %w (raw: %s)", err, truncate(content, 200))
		}
	}

	fields := make([]domain.ExtractedField, 0, len(rawFields))
	for _, rf := range rawFields {
		if rf.FieldName == "" || rf.Value == "" {
			continue
		}
		conf := rf.Confidence
		if conf < 0 {
			conf = 0
		}
		if conf > 1 {
			conf = 1
		}
		fields = append(fields, domain.ExtractedField{
			FieldName:  rf.FieldName,
			Value:      rf.Value,
			Confidence: conf,
			Verified:   false,
		})
	}

	if len(fields) == 0 {
		return nil, fmt.Errorf("AI returned no valid fields")
	}

	return fields, nil
}

// truncate shortens a string to maxLen characters.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// ExtractFieldsFromPageWithSchema sends a single page's text to the AI using a user-defined schema.
func (c *KiloClient) ExtractFieldsFromPageWithSchema(ctx context.Context, pageText string, pageNum, totalPages int, schema []domain.SchemaField) ([]domain.ExtractedField, error) {
	if strings.TrimSpace(pageText) == "" {
		return nil, fmt.Errorf("page %d text is empty", pageNum)
	}

	prompt := buildSchemaPageExtractionPrompt(pageText, pageNum, totalPages, schema)

	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{
				Role:    "system",
				Content: "You are a document analysis AI. You extract structured data from documents according to a user-defined schema. Always respond with valid JSON only — no markdown, no explanation.",
			},
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := kiloBaseURL + "chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AI API request failed for page %d: %w", pageNum, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AI response for page %d: %w", pageNum, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AI API returned status %d for page %d: %s", resp.StatusCode, pageNum, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse AI response for page %d: %w", pageNum, err)
	}

	if chatResp.Error != nil {
		return nil, fmt.Errorf("AI API error for page %d: %s", pageNum, chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("AI returned no choices for page %d", pageNum)
	}

	content := chatResp.Choices[0].Message.Content
	return parseExtractedFields(content)
}

// buildSchemaFieldGuide converts user-defined schema fields into an AI extraction guide.
func buildSchemaFieldGuide(schema []domain.SchemaField) string {
	var b strings.Builder
	b.WriteString("CUSTOM EXTRACTION SCHEMA — Extract ONLY the following fields:\n\n")
	for i, sf := range schema {
		b.WriteString(fmt.Sprintf("%d. Field: \"%s\" (output as \"%s\")\n", i+1, sf.Field, sf.ColumnName))
		if len(sf.Rules) > 0 {
			b.WriteString("   Extraction rules:\n")
			for _, rule := range sf.Rules {
				b.WriteString(fmt.Sprintf("   - %s\n", rule))
			}
		}
		b.WriteString("\n")
	}
	return b.String()
}

// buildSchemaPageExtractionPrompt creates a prompt for a single page using a user-defined schema.
func buildSchemaPageExtractionPrompt(text string, pageNum, totalPages int, schema []domain.SchemaField) string {
	const maxTextLen = 30000
	if len(text) > maxTextLen {
		text = text[:maxTextLen] + "\n... [text truncated]"
	}

	fieldGuide := buildSchemaFieldGuide(schema)

	return fmt.Sprintf(`You are an expert document data extraction AI. Analyze page %d of %d and extract data for the user-defined schema fields.

%s
EXTRACTION RULES:
1. Extract ONLY the fields defined in the schema above.
2. Use the "fieldName" from the schema as the field name in your output (use the Field value, not ColumnName).
3. Follow each field's extraction rules carefully to identify the correct values.
4. If a field's value is not found on this page, skip it — do NOT include it in the output.
5. Include units and currency symbols in values (e.g. "$1,234.56", "30 days").
6. For dates, preserve the original format found in the document.
7. Set confidence based on text clarity: 0.95+ for clearly printed text, 0.7-0.94 for partially unclear, below 0.7 for guessed/uncertain values.
8. If this page contains none of the schema fields, return an empty JSON array: []

Return a JSON array of objects. Each object MUST have:
- "fieldName": the field identifier from the schema
- "value": the extracted value as a string
- "confidence": a float between 0.0 and 1.0

IMPORTANT: Return ONLY the JSON array — no markdown fences, no explanation.

Page %d text:
---
%s
---`, pageNum, totalPages, fieldGuide, pageNum, text)
}

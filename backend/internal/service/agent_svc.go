// Package service — AI-powered conversational agent that controls the AuRA
// application, enabling users to interact with documents through natural language.
package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/aura-ai/backend/internal/aiservice"
	"github.com/aura-ai/backend/internal/domain"
	"github.com/aura-ai/backend/internal/repository"
)

// --------------------------------------------------------------------------
// Interfaces
// --------------------------------------------------------------------------

// AgentDocumentSource is the minimal document access the agent needs.
type AgentDocumentSource interface {
	List(ctx context.Context, f domain.DocumentFilter) ([]domain.Document, int64, error)
	GetByID(ctx context.Context, id bson.ObjectID) (*domain.Document, error)
}

// --------------------------------------------------------------------------
// AgentService
// --------------------------------------------------------------------------

// AgentService manages conversational sessions, intent detection, document
// retrieval and AI-powered question-answering.
type AgentService struct {
	docs     AgentDocumentSource
	aiMgr    *aiservice.ClientManager
	sessions *repository.AgentSessionRepo
}

// NewAgentService creates a new agent service.
func NewAgentService(docs AgentDocumentSource, aiMgr *aiservice.ClientManager, sessions *repository.AgentSessionRepo) *AgentService {
	return &AgentService{
		docs:     docs,
		aiMgr:    aiMgr,
		sessions: sessions,
	}
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

// CreateSession creates a brand-new session and returns a greeting message.
func (s *AgentService) CreateSession(ctx context.Context, userID bson.ObjectID) (*domain.AgentChatResponse, error) {
	sess := &domain.AgentSession{
		UserID:   userID,
		Title:    "New conversation",
		Messages: []domain.AgentMessage{},
		Filters:  map[string]string{},
	}

	saved, err := s.sessions.Create(ctx, sess)
	if err != nil {
		return nil, fmt.Errorf("could not create session: %w", err)
	}

	greeting := domain.AgentMessage{
		ID:        newMsgID(),
		Role:      domain.AgentRoleAssistant,
		Content:   "👋 Hello! I'm your **AuRA AI assistant**. I can help you explore, analyze, and understand your documents.\n\nWhat would you like to do?",
		Action:    domain.AgentActionGreeting,
		Timestamp: time.Now(),
		Intent:    "greeting",
	}
	saved.Messages = append(saved.Messages, greeting)
	_ = s.sessions.Update(ctx, saved)

	slog.Info("agent: session created", "sessionId", saved.ID.Hex(), "userId", userID.Hex())
	return &domain.AgentChatResponse{SessionID: saved.ID.Hex(), Message: greeting, Session: saved}, nil
}

// ProcessMessage handles an inbound user message and returns the agent's reply.
func (s *AgentService) ProcessMessage(ctx context.Context, sessionID string, userID bson.ObjectID, req domain.AgentChatRequest) (*domain.AgentChatResponse, error) {
	oid, err := bson.ObjectIDFromHex(sessionID)
	if err != nil {
		return nil, fmt.Errorf("invalid session ID format")
	}

	sess, err := s.sessions.GetByIDAndUser(ctx, oid, userID)
	if err != nil {
		return nil, fmt.Errorf("could not load session: %w", err)
	}
	if sess == nil {
		return nil, &domain.AppError{Code: 404, Message: "session not found"}
	}

	// Record the user turn.
	userMsg := domain.AgentMessage{
		ID:        newMsgID(),
		Role:      domain.AgentRoleUser,
		Content:   req.Message,
		Timestamp: time.Now(),
	}
	if req.DocumentID != "" {
		userMsg.DocumentRef = &domain.DocumentRef{ID: req.DocumentID}
	}
	sess.Messages = append(sess.Messages, userMsg)
	sess.LastActivityAt = time.Now()

	// Update title from first real user message.
	if sess.Title == "New conversation" && req.Message != "" {
		sess.Title = generateTitle(req.Message)
	}

	// --- Document selection via explicit ID ---
	if req.DocumentID != "" {
		reply, handleErr := s.handleDocumentSelection(ctx, sess, req.DocumentID)
		if handleErr != nil {
			resp := s.replyError(sess, handleErr.Error())
			_ = s.sessions.Update(ctx, sess)
			return resp, nil
		}
		_ = s.sessions.Update(ctx, sess)
		return &domain.AgentChatResponse{SessionID: sess.ID.Hex(), Message: *reply, Session: sess}, nil
	}

	// --- Intent detection ---
	intent := detectIntent(req.Message)
	slog.Info("agent: intent detected",
		"sessionId", sess.ID.Hex(),
		"intent", intent,
		"activeDoc", sess.ActiveDocID,
		"message", truncate(req.Message, 120),
	)

	var reply *domain.AgentMessage

	switch intent {
	case "greeting":
		reply = s.buildReply(sess, "Hello again! 😊 How can I help you with your documents today?", domain.AgentActionGreeting, intent)

	case "list_documents":
		reply, err = s.handleListDocuments(ctx, sess)

	case "switch_document":
		sess.ActiveDocID = ""
		sess.ActiveDocName = ""
		reply, err = s.handleListDocuments(ctx, sess)
		if reply != nil {
			reply.Content = "Sure — let's pick a different document.\n\n" + reply.Content
		}

	case "help":
		reply = s.buildReply(sess,
			"Here's what I can do:\n\n"+
				"• **Browse documents** — show your document library\n"+
				"• **Select a document** — click a card or tell me the name\n"+
				"• **Ask questions** — once a document is loaded, ask anything about it\n"+
				"• **Switch documents** — say \"switch document\" at any time\n"+
				"• **Get a summary** — ask for a document summary\n\n"+
				"Try saying **\"show my documents\"** to get started!",
			domain.AgentActionSuggestion, intent)

	case "query":
		if sess.ActiveDocID == "" {
			reply, err = s.handleNoDocumentSelected(ctx, sess)
		} else {
			reply, err = s.handleDocumentQuery(ctx, sess, req.Message)
		}

	default:
		if sess.ActiveDocID != "" {
			reply, err = s.handleDocumentQuery(ctx, sess, req.Message)
		} else {
			reply, err = s.handleGeneralMessage(ctx, sess, req.Message)
		}
	}

	if err != nil {
		resp := s.replyError(sess, err.Error())
		_ = s.sessions.Update(ctx, sess)
		return resp, nil
	}
	if reply == nil {
		reply = s.buildReply(sess, "I'm not sure how to help with that. Try asking me to show your documents or ask a question about a loaded document.", domain.AgentActionSuggestion, "fallback")
	}

	_ = s.sessions.Update(ctx, sess)
	return &domain.AgentChatResponse{SessionID: sess.ID.Hex(), Message: *reply, Session: sess}, nil
}

// GetSession returns the full session state.
func (s *AgentService) GetSession(ctx context.Context, sessionID string, userID bson.ObjectID) (*domain.AgentSession, error) {
	oid, err := bson.ObjectIDFromHex(sessionID)
	if err != nil {
		return nil, fmt.Errorf("invalid session ID")
	}
	return s.sessions.GetByIDAndUser(ctx, oid, userID)
}

// ListSessions returns session summaries for the sidebar.
func (s *AgentService) ListSessions(ctx context.Context, userID bson.ObjectID) ([]domain.SessionSummary, error) {
	return s.sessions.ListByUser(ctx, userID, 50)
}

// DeleteSession removes a session.
func (s *AgentService) DeleteSession(ctx context.Context, sessionID string, userID bson.ObjectID) error {
	oid, err := bson.ObjectIDFromHex(sessionID)
	if err != nil {
		return fmt.Errorf("invalid session ID")
	}
	slog.Info("agent: session deleted", "sessionId", sessionID)
	return s.sessions.Delete(ctx, oid, userID)
}

// --------------------------------------------------------------------------
// Intent handlers
// --------------------------------------------------------------------------

func (s *AgentService) handleListDocuments(ctx context.Context, sess *domain.AgentSession) (*domain.AgentMessage, error) {
	docs, total, err := s.docs.List(ctx, domain.DocumentFilter{Page: 1, Limit: 20, Sort: "-updated_at"})
	if err != nil {
		return nil, fmt.Errorf("could not load documents: %w", err)
	}

	if total == 0 {
		msg := s.buildReply(sess,
			"You don't have any documents yet. Upload a document first, and then come back to explore it with me!",
			domain.AgentActionSuggestion, "list_documents")
		return msg, nil
	}

	briefs := make([]domain.DocumentBrief, len(docs))
	for i, d := range docs {
		briefs[i] = domain.DocumentBrief{
			ID:         d.ID.Hex(),
			Name:       d.Name,
			Type:       string(d.Type),
			Status:     string(d.Status),
			FileSize:   d.FileSize,
			UpdatedAt:  d.UpdatedAt.Format(time.RFC3339),
			FieldCount: len(d.ExtractedFields),
		}
	}

	msg := &domain.AgentMessage{
		ID:        newMsgID(),
		Role:      domain.AgentRoleAssistant,
		Content:   fmt.Sprintf("Here are your documents (%d total). Click one to start exploring:", total),
		Action:    domain.AgentActionListDocuments,
		Documents: briefs,
		Intent:    "list_documents",
		Timestamp: time.Now(),
	}
	sess.Messages = append(sess.Messages, *msg)
	return msg, nil
}

func (s *AgentService) handleDocumentSelection(ctx context.Context, sess *domain.AgentSession, docID string) (*domain.AgentMessage, error) {
	oid, err := bson.ObjectIDFromHex(docID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID format")
	}

	doc, err := s.docs.GetByID(ctx, oid)
	if err != nil {
		altReply, _ := s.handleListDocuments(ctx, sess)
		if altReply != nil {
			altReply.Content = "I couldn't find that document — it may have been deleted.\n\n" + altReply.Content
			altReply.Action = domain.AgentActionError
		}
		return altReply, nil
	}

	sess.ActiveDocID = docID
	sess.ActiveDocName = doc.Name

	statusEmoji := statusToEmoji(doc.Status)
	fieldInfo := "No fields extracted yet."
	if len(doc.ExtractedFields) > 0 {
		fieldInfo = fmt.Sprintf("%d fields extracted (avg confidence %.0f%%).", len(doc.ExtractedFields), avgConfidence(doc.ExtractedFields)*100)
	}

	content := fmt.Sprintf(
		"📄 **%s** is now loaded into our conversation.\n\n"+
			"- **Type:** %s\n"+
			"- **Status:** %s %s\n"+
			"- **Size:** %s\n"+
			"- **Fields:** %s\n\n"+
			"What would you like to know? For example:\n"+
			"• \"Summarize this document\"\n"+
			"• \"What fields were extracted?\"\n"+
			"• \"Find the total amount\"",
		doc.Name, doc.Type, statusEmoji, doc.Status, formatBytes(doc.FileSize), fieldInfo,
	)

	msg := &domain.AgentMessage{
		ID:          newMsgID(),
		Role:        domain.AgentRoleAssistant,
		Content:     content,
		Action:      domain.AgentActionDocumentLoaded,
		DocumentRef: &domain.DocumentRef{ID: docID, Name: doc.Name},
		Intent:      "select_document",
		Timestamp:   time.Now(),
	}
	sess.Messages = append(sess.Messages, *msg)

	slog.Info("agent: document selected", "sessionId", sess.ID.Hex(), "docId", docID, "docName", doc.Name)
	return msg, nil
}

func (s *AgentService) handleDocumentQuery(ctx context.Context, sess *domain.AgentSession, question string) (*domain.AgentMessage, error) {
	client := s.aiMgr.Get()
	if client == nil {
		msg := s.buildReply(sess,
			"⚠️ No AI provider is configured. Please go to **API Configuration** in the sidebar and set up a provider first.",
			domain.AgentActionError, "no_provider")
		return msg, nil
	}

	oid, err := bson.ObjectIDFromHex(sess.ActiveDocID)
	if err != nil {
		sess.ActiveDocID = ""
		sess.ActiveDocName = ""
		return nil, fmt.Errorf("the active document reference is invalid — please select a document again")
	}

	doc, err := s.docs.GetByID(ctx, oid)
	if err != nil {
		sess.ActiveDocID = ""
		sess.ActiveDocName = ""
		return nil, fmt.Errorf("the document appears to have been deleted — please select another one")
	}

	prompt := buildDocumentQueryPrompt(doc, question, sess.Messages)

	messages := []aiservice.ConversationMessage{
		{
			Role: "system",
			Content: "You are AuRA, a helpful AI document assistant. " +
				"Answer the user's question based on the document content and extracted data provided. " +
				"Be concise, cite specific field names and values when relevant. " +
				"If the information is not available in the document, say so clearly. " +
				"Respond in plain text with markdown formatting — NOT raw JSON.",
		},
		{Role: "user", Content: prompt},
	}

	answer, err := client.ChatConversation(ctx, messages)
	if err != nil {
		errMsg := err.Error()
		slog.Error("agent: AI query failed", "error", errMsg, "sessionId", sess.ID.Hex())

		userMsg := "I encountered an error while analyzing the document."
		if strings.Contains(errMsg, "401") || strings.Contains(errMsg, "Unauthorized") || strings.Contains(errMsg, "unauthorized") {
			userMsg = "⚠️ Your AI provider API key appears to be invalid or expired. Please go to **API Configuration** and update your credentials."
		} else if strings.Contains(errMsg, "429") || strings.Contains(errMsg, "rate") {
			userMsg = "⚠️ Rate limit reached. Please wait a moment and try again."
		} else if strings.Contains(errMsg, "timeout") || strings.Contains(errMsg, "deadline") {
			userMsg = "⚠️ The request timed out. The document might be too large — try asking about a specific section."
		}

		msg := s.buildReply(sess, userMsg, domain.AgentActionError, "ai_error")
		return msg, nil
	}

	excerpts := findRelevantExcerpts(doc.ExtractedFields, question)

	msg := &domain.AgentMessage{
		ID:          newMsgID(),
		Role:        domain.AgentRoleAssistant,
		Content:     answer,
		Action:      domain.AgentActionAnswer,
		Excerpts:    excerpts,
		DocumentRef: &domain.DocumentRef{ID: sess.ActiveDocID, Name: sess.ActiveDocName},
		Intent:      "query",
		Timestamp:   time.Now(),
	}
	sess.Messages = append(sess.Messages, *msg)

	slog.Info("agent: query answered",
		"sessionId", sess.ID.Hex(),
		"docId", sess.ActiveDocID,
		"question", truncate(question, 80),
		"excerptCount", len(excerpts),
	)
	return msg, nil
}

func (s *AgentService) handleNoDocumentSelected(ctx context.Context, sess *domain.AgentSession) (*domain.AgentMessage, error) {
	listReply, err := s.handleListDocuments(ctx, sess)
	if err != nil {
		return nil, err
	}
	listReply.Content = "I'd love to help — but I need a document to work with first.\n\nPlease select one from the list below:\n\n" + listReply.Content
	return listReply, nil
}

func (s *AgentService) handleGeneralMessage(ctx context.Context, sess *domain.AgentSession, message string) (*domain.AgentMessage, error) {
	client := s.aiMgr.Get()
	if client == nil {
		msg := s.buildReply(sess,
			"I can help you explore your documents! Try saying **\"show my documents\"** to get started, or say **\"help\"** for a list of things I can do.",
			domain.AgentActionSuggestion, "general")
		return msg, nil
	}

	messages := []aiservice.ConversationMessage{
		{
			Role: "system",
			Content: "You are AuRA, an AI assistant for the AuRA document automation platform. " +
				"The user hasn't selected a document yet. Help them understand what you can do: " +
				"browse documents, analyze extracted fields, answer questions about document contents, " +
				"and more. Be brief and friendly. Respond with markdown formatting — NOT raw JSON.",
		},
		{Role: "user", Content: message},
	}

	answer, err := client.ChatConversation(ctx, messages)
	if err != nil {
		msg := s.buildReply(sess,
			"I can help you explore your documents! Try saying **\"show my documents\"** to browse your library.",
			domain.AgentActionSuggestion, "general")
		return msg, nil
	}

	msg := s.buildReply(sess, answer, domain.AgentActionSuggestion, "general")
	return msg, nil
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

func (s *AgentService) buildReply(sess *domain.AgentSession, content string, action domain.AgentActionType, intent string) *domain.AgentMessage {
	msg := &domain.AgentMessage{
		ID:        newMsgID(),
		Role:      domain.AgentRoleAssistant,
		Content:   content,
		Action:    action,
		Intent:    intent,
		Timestamp: time.Now(),
	}
	if sess.ActiveDocID != "" {
		msg.DocumentRef = &domain.DocumentRef{ID: sess.ActiveDocID, Name: sess.ActiveDocName}
	}
	sess.Messages = append(sess.Messages, *msg)
	return msg
}

func (s *AgentService) replyError(sess *domain.AgentSession, errMsg string) *domain.AgentChatResponse {
	msg := s.buildReply(sess, "⚠️ "+errMsg, domain.AgentActionError, "error")
	return &domain.AgentChatResponse{SessionID: sess.ID.Hex(), Message: *msg, Session: sess}
}

// --------------------------------------------------------------------------
// Intent detection
// --------------------------------------------------------------------------

func detectIntent(message string) string {
	lower := strings.ToLower(strings.TrimSpace(message))

	greetings := []string{"hello", "hi", "hey", "good morning", "good afternoon", "good evening", "howdy", "hi there", "hey there"}
	for _, g := range greetings {
		if lower == g || strings.HasPrefix(lower, g+" ") && len(lower) < 40 {
			return "greeting"
		}
	}

	if lower == "help" || lower == "?" || strings.Contains(lower, "what can you do") || strings.Contains(lower, "how do i") {
		return "help"
	}

	listPatterns := []string{
		"list", "show", "browse", "see my doc", "what document", "which document",
		"available document", "my document", "all document", "documents list",
		"show me", "get documents", "view documents", "open documents",
	}
	for _, p := range listPatterns {
		if strings.Contains(lower, p) {
			return "list_documents"
		}
	}

	switchPatterns := []string{
		"switch doc", "change doc", "another doc", "different doc",
		"go back to list", "back to documents", "pick a different", "select another",
		"new document", "switch to",
	}
	for _, p := range switchPatterns {
		if strings.Contains(lower, p) {
			return "switch_document"
		}
	}

	return "query"
}

// --------------------------------------------------------------------------
// Prompt construction
// --------------------------------------------------------------------------

func buildDocumentQueryPrompt(doc *domain.Document, question string, history []domain.AgentMessage) string {
	var sb strings.Builder

	sb.WriteString("## Document Information\n")
	sb.WriteString(fmt.Sprintf("- Name: %s\n", doc.Name))
	sb.WriteString(fmt.Sprintf("- Type: %s\n", doc.Type))
	sb.WriteString(fmt.Sprintf("- Status: %s\n", doc.Status))
	sb.WriteString(fmt.Sprintf("- Size: %s\n", formatBytes(doc.FileSize)))
	sb.WriteString("\n")

	if len(doc.ExtractedFields) > 0 {
		sb.WriteString("## Extracted Fields\n")
		for _, f := range doc.ExtractedFields {
			sb.WriteString(fmt.Sprintf("- **%s**: %s (confidence: %.0f%%)\n", f.FieldName, f.Value, f.Confidence*100))
		}
		sb.WriteString("\n")
	}

	if doc.RawText != "" {
		text := doc.RawText
		if len(text) > 15000 {
			text = text[:15000] + "\n... [text truncated for brevity]"
		}
		sb.WriteString("## Full Document Text\n")
		sb.WriteString(text)
		sb.WriteString("\n\n")
	}

	if len(history) > 2 {
		sb.WriteString("## Recent Conversation\n")
		start := len(history) - 6
		if start < 0 {
			start = 0
		}
		for _, m := range history[start:] {
			switch m.Role {
			case domain.AgentRoleUser:
				sb.WriteString(fmt.Sprintf("User: %s\n", m.Content))
			case domain.AgentRoleAssistant:
				sb.WriteString(fmt.Sprintf("Assistant: %s\n", truncate(m.Content, 200)))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("## Current Question\n")
	sb.WriteString(question)

	return sb.String()
}

func findRelevantExcerpts(fields []domain.ExtractedField, question string) []domain.FieldExcerpt {
	if len(fields) == 0 {
		return nil
	}

	lower := strings.ToLower(question)
	var relevant []domain.FieldExcerpt

	for _, f := range fields {
		nameLower := strings.ToLower(f.FieldName)
		valueLower := strings.ToLower(f.Value)
		if strings.Contains(lower, nameLower) || strings.Contains(nameLower, significantWord(lower)) || strings.Contains(lower, valueLower) {
			relevant = append(relevant, domain.FieldExcerpt{
				FieldName:  f.FieldName,
				Value:      f.Value,
				Confidence: f.Confidence,
			})
		}
	}

	if len(relevant) == 0 && len(fields) > 0 {
		limit := 5
		if len(fields) < limit {
			limit = len(fields)
		}
		for i := 0; i < limit; i++ {
			relevant = append(relevant, domain.FieldExcerpt{
				FieldName:  fields[i].FieldName,
				Value:      fields[i].Value,
				Confidence: fields[i].Confidence,
			})
		}
	}

	return relevant
}

func significantWord(query string) string {
	words := strings.Fields(query)
	best := ""
	stopWords := map[string]bool{
		"the": true, "a": true, "an": true, "is": true, "are": true,
		"what": true, "which": true, "where": true, "how": true, "when": true,
		"show": true, "me": true, "find": true, "get": true, "tell": true,
		"this": true, "that": true, "from": true, "for": true, "in": true,
		"of": true, "to": true, "and": true, "or": true, "my": true, "i": true,
	}
	for _, w := range words {
		w = strings.ToLower(w)
		if !stopWords[w] && len(w) > len(best) {
			best = w
		}
	}
	return best
}

func generateTitle(message string) string {
	title := strings.TrimSpace(message)
	title = strings.ReplaceAll(title, "**", "")
	title = strings.ReplaceAll(title, "*", "")
	if len(title) > 50 {
		if idx := strings.LastIndex(title[:50], " "); idx > 20 {
			title = title[:idx] + "…"
		} else {
			title = title[:50] + "…"
		}
	}
	return title
}

// --------------------------------------------------------------------------
// Utility helpers
// --------------------------------------------------------------------------

func newMsgID() string {
	return bson.NewObjectID().Hex()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func statusToEmoji(s domain.DocumentStatus) string {
	switch s {
	case domain.StatusPending:
		return "⏳"
	case domain.StatusProcessing:
		return "⚙️"
	case domain.StatusProcessed:
		return "✅"
	case domain.StatusReviewing:
		return "👁️"
	case domain.StatusError:
		return "❌"
	default:
		return "📄"
	}
}

func avgConfidence(fields []domain.ExtractedField) float64 {
	if len(fields) == 0 {
		return 0
	}
	var sum float64
	for _, f := range fields {
		sum += f.Confidence
	}
	return sum / float64(len(fields))
}

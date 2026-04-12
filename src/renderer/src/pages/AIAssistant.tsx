/**
 * AIAssistant — Full-page ChatGPT-style conversational AI interface.
 *
 * Layout:
 * ┌──────────────┬──────────────────────────────────────┐
 * │ Chat History  │          Message Area                │
 * │ (sidebar)     │                                      │
 * │               │  ┌──────────────────────────────┐   │
 * │ + New Chat    │  │  Messages scroll area         │   │
 * │               │  │                               │   │
 * │ Today         │  │                               │   │
 * │  ▸ Chat 1     │  │                               │   │
 * │  ▸ Chat 2     │  │                               │   │
 * │               │  │                               │   │
 * │ Yesterday     │  │                               │   │
 * │  ▸ Chat 3     │  └──────────────────────────────┘   │
 * │               │                                      │
 * │               │  ┌──────────────────────────────┐   │
 * │               │  │  Input bar                    │   │
 * │               │  └──────────────────────────────┘   │
 * └──────────────┴──────────────────────────────────────┘
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactElement,
  type KeyboardEvent,
  type FormEvent
} from 'react'
import type {
  AgentMessage,
  SessionSummary,
  DocumentBrief,
  FieldExcerpt,
  DocumentRef
} from '../../../shared/types/agent.types'
import {
  createAgentSession,
  listAgentSessions,
  sendAgentMessage,
  getAgentSession,
  deleteAgentSession
} from '../data/agent-api'
import {
  Plus,
  Send,
  FileText,
  Sparkles,
  Trash2,
  MessageSquare,
  Clock
} from '../components/Icons'

// ── Quick action chips ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: '📋 Browse documents', message: 'Show my documents' },
  { label: '❓ What can you do?', message: 'help' },
  { label: '📤 Upload a document', message: 'How do I upload a document?' }
]

// ── Main Page Component ──────────────────────────────────────────────────────

export function AIAssistant(): ReactElement {
  // Session list state
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeDocument, setActiveDocument] = useState<DocumentRef | null>(null)
  const [input, setInput] = useState('')

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const loadingRef = useRef(false)

  // ── Load session list on mount ──────────────────────────────────────────
  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const list = await listAgentSessions()
      setSessions(list)
    } catch (err) {
      console.error('[AI] Failed to load sessions:', err)
    }
  }, [])

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // ── Focus input ────────────────────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus()
  }, [activeSessionId])

  // ── Sync active doc from session ───────────────────────────────────────
  const syncSessionState = useCallback(
    (session?: { activeDocumentId?: string; activeDocumentName?: string }) => {
      if (session?.activeDocumentId && session?.activeDocumentName) {
        setActiveDocument({ id: session.activeDocumentId, name: session.activeDocumentName })
      } else if (session && !session.activeDocumentId) {
        setActiveDocument(null)
      }
    },
    []
  )

  // ── Create new chat ────────────────────────────────────────────────────
  const createNewChat = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    try {
      const resp = await createAgentSession()
      if (resp.session?.messages) {
        setMessages(resp.session.messages)
      } else {
        setMessages([resp.message])
      }
      setActiveSessionId(resp.sessionId)
      setActiveDocument(null)
      setInput('')
      await loadSessions()
    } catch (err) {
      console.error('[AI] Failed to create session:', err)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [loadSessions])

  // ── Load existing session ──────────────────────────────────────────────
  const loadSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return
      setIsLoading(true)
      try {
        const session = await getAgentSession(sessionId)
        setMessages(session.messages)
        setActiveSessionId(session.id)
        syncSessionState(session)
        setInput('')
      } catch (err) {
        console.error('[AI] Failed to load session:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [activeSessionId, syncSessionState]
  )

  // ── Delete session ─────────────────────────────────────────────────────
  const handleDeleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await deleteAgentSession(sessionId)
        if (sessionId === activeSessionId) {
          setActiveSessionId(null)
          setMessages([])
          setActiveDocument(null)
        }
        await loadSessions()
      } catch (err) {
        console.error('[AI] Failed to delete session:', err)
      }
    },
    [activeSessionId, loadSessions]
  )

  // ── Send message ───────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim()
      if (!msg || isLoading) return

      // If no active session, create one first
      let sid = activeSessionId
      if (!sid) {
        try {
          const resp = await createAgentSession()
          sid = resp.sessionId
          setActiveSessionId(sid)
          if (resp.session?.messages) {
            setMessages(resp.session.messages)
          }
          await loadSessions()
        } catch {
          return
        }
      }

      // Optimistic user bubble
      const userMsg: AgentMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: msg,
        timestamp: new Date().toISOString()
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setIsLoading(true)

      try {
        const resp = await sendAgentMessage(sid!, msg)
        setMessages((prev) => [...prev, resp.message])
        syncSessionState(resp.session)
        await loadSessions() // Refresh sidebar titles
      } catch (err) {
        console.error('[AI] Send failed:', err)
        setMessages((prev) => [
          ...prev,
          {
            id: 'error-' + Date.now(),
            role: 'assistant',
            content: '⚠️ Something went wrong. Please check your connection and try again.',
            action: 'error',
            timestamp: new Date().toISOString()
          }
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [input, isLoading, activeSessionId, syncSessionState, loadSessions]
  )

  // ── Select document ────────────────────────────────────────────────────
  const selectDocument = useCallback(
    async (docId: string, docName: string) => {
      if (!activeSessionId || isLoading) return

      const userMsg: AgentMessage = {
        id: 'user-' + Date.now(),
        role: 'user',
        content: `Selected document: ${docName}`,
        timestamp: new Date().toISOString(),
        documentRef: { id: docId, name: docName }
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)

      try {
        const resp = await sendAgentMessage(
          activeSessionId,
          `I want to explore "${docName}"`,
          docId
        )
        setMessages((prev) => [...prev, resp.message])
        syncSessionState(resp.session)
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: 'error-' + Date.now(),
            role: 'assistant',
            content: '⚠️ Failed to load the document. Please try again.',
            action: 'error',
            timestamp: new Date().toISOString()
          }
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [activeSessionId, isLoading, syncSessionState]
  )

  // ── Keyboard handling ──────────────────────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    handleSend()
  }

  // ── Group sessions by date ─────────────────────────────────────────────
  const groupedSessions = groupSessionsByDate(sessions)

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="ai-page">
      {/* ─── History Sidebar ──────────────────────────────────── */}
      <aside className={`ai-history ${sidebarCollapsed ? 'ai-history--collapsed' : ''}`}>
        <div className="ai-history-header">
          <button className="ai-new-chat-btn" onClick={createNewChat}>
            <Plus size={16} />
            <span>New chat</span>
          </button>
          <button
            className="ai-collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3h12v1.5H2V3zm0 4h12v1.5H2V7zm0 4h8v1.5H2V11z" />
            </svg>
          </button>
        </div>

        <div className="ai-history-list">
          {groupedSessions.map((group) => (
            <div key={group.label} className="ai-history-group">
              <p className="ai-history-group-label">{group.label}</p>
              {group.sessions.map((s) => (
                <button
                  key={s.id}
                  className={`ai-history-item ${activeSessionId === s.id ? 'ai-history-item--active' : ''}`}
                  onClick={() => loadSession(s.id)}
                >
                  <MessageSquare size={14} />
                  <span className="ai-history-item-title">{s.title || 'New conversation'}</span>
                  <button
                    className="ai-history-item-delete"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    title="Delete chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
              ))}
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="ai-history-empty">
              <Clock size={20} />
              <p>No conversations yet</p>
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main Chat Area ───────────────────────────────────── */}
      <div className="ai-chat-main">
        {/* Active document indicator */}
        {activeDocument && (
          <div className="ai-doc-indicator">
            <FileText size={14} />
            <span>{activeDocument.name}</span>
          </div>
        )}

        {/* Messages or empty state */}
        {messages.length === 0 && !activeSessionId ? (
          <div className="ai-empty-state">
            <div className="ai-empty-icon">
              <Sparkles size={40} />
            </div>
            <h2>AuRA AI Assistant</h2>
            <p>Explore, analyze, and understand your documents with AI.</p>
            <div className="ai-empty-actions">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  className="ai-empty-action-btn"
                  onClick={() => handleSend(qa.message)}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-messages">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onSelectDocument={selectDocument}
                onQuickAction={(text) => handleSend(text)}
              />
            ))}

            {isLoading && (
              <div className="ai-msg ai-msg--assistant">
                <div className="ai-msg-avatar">
                  <Sparkles size={16} />
                </div>
                <div className="ai-msg-content">
                  <div className="ai-typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input bar */}
        <form className="ai-input-bar" onSubmit={handleSubmit}>
          <div className="ai-input-wrapper">
            <textarea
              ref={inputRef}
              className="ai-input"
              placeholder={
                activeDocument
                  ? `Ask about ${activeDocument.name}…`
                  : 'Message AuRA AI…'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              autoComplete="off"
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="ai-input-hint">
            AuRA AI can make mistakes. Verify important information.
          </p>
        </form>
      </div>
    </div>
  )
}

// ── Message Bubble ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: AgentMessage
  onSelectDocument: (id: string, name: string) => Promise<void>
  onQuickAction: (text: string) => void
}

function MessageBubble({
  message,
  onSelectDocument,
  onQuickAction
}: MessageBubbleProps): ReactElement {
  const isUser = message.role === 'user'

  return (
    <div className={`ai-msg ai-msg--${message.role}`}>
      {!isUser && (
        <div className="ai-msg-avatar">
          <Sparkles size={16} />
        </div>
      )}
      <div className="ai-msg-content">
        {/* Text */}
        <div className={`ai-msg-text ${message.action === 'error' ? 'ai-msg-text--error' : ''}`}>
          {renderContent(message.content)}
        </div>

        {/* Document cards */}
        {message.documents && message.documents.length > 0 && (
          <div className="ai-doc-grid">
            {message.documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onSelect={() => onSelectDocument(doc.id, doc.name)}
              />
            ))}
          </div>
        )}

        {/* Field excerpts */}
        {message.excerpts && message.excerpts.length > 0 && (
          <div className="ai-excerpts">
            <p className="ai-excerpts-label">📊 Supporting data</p>
            {message.excerpts.map((ex, i) => (
              <ExcerptCard key={i} excerpt={ex} />
            ))}
          </div>
        )}

        {/* Quick actions after greeting */}
        {message.action === 'greeting' && message.role === 'assistant' && (
          <div className="ai-chips">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                className="ai-chip"
                onClick={() => onQuickAction(qa.message)}
              >
                {qa.label}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="ai-msg-time">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  )
}

// ── Document Card ────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onSelect
}: {
  doc: DocumentBrief
  onSelect: () => void
}): ReactElement {
  const statusColors: Record<string, string> = {
    processed: 'var(--color-accent-emerald)',
    processing: 'var(--color-primary)',
    pending: 'var(--color-accent-amber)',
    error: 'var(--color-accent-red)',
    reviewing: 'var(--color-accent-purple)'
  }

  return (
    <button className="ai-doc-card" onClick={onSelect}>
      <div className="ai-doc-card-icon">
        <FileText size={18} />
      </div>
      <div className="ai-doc-card-info">
        <span className="ai-doc-card-name">{doc.name}</span>
        <span className="ai-doc-card-meta">
          <span
            className="ai-doc-card-status"
            style={{ color: statusColors[doc.status] || 'var(--color-text-muted)' }}
          >
            {doc.status}
          </span>
          {' · '}
          {formatFileSize(doc.fileSize)}
          {doc.fieldCount > 0 && ` · ${doc.fieldCount} fields`}
        </span>
      </div>
      <span className="ai-doc-card-arrow">→</span>
    </button>
  )
}

// ── Excerpt Card ─────────────────────────────────────────────────────────────

function ExcerptCard({ excerpt }: { excerpt: FieldExcerpt }): ReactElement {
  const pct = Math.round(excerpt.confidence * 100)
  return (
    <div className="ai-excerpt-card">
      <span className="ai-excerpt-name">{excerpt.fieldName}</span>
      <span className="ai-excerpt-value">{excerpt.value}</span>
      <span
        className="ai-excerpt-conf"
        style={{
          color:
            pct >= 80
              ? 'var(--color-accent-emerald)'
              : pct >= 50
                ? 'var(--color-accent-amber)'
                : 'var(--color-accent-red)'
        }}
      >
        {pct}%
      </span>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderContent(text: string): ReactElement {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        const lines = part.split('\n')
        return lines.map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </span>
        ))
      })}
    </>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface SessionGroup {
  label: string
  sessions: SessionSummary[]
}

function groupSessionsByDate(sessions: SessionSummary[]): SessionGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const groups: Record<string, SessionSummary[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    'This Month': [],
    Older: []
  }

  for (const s of sessions) {
    const d = new Date(s.lastActivityAt)
    if (d >= today) {
      groups['Today'].push(s)
    } else if (d >= yesterday) {
      groups['Yesterday'].push(s)
    } else if (d >= weekAgo) {
      groups['This Week'].push(s)
    } else if (d >= monthAgo) {
      groups['This Month'].push(s)
    } else {
      groups['Older'].push(s)
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, sessions: items }))
}

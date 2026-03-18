/**
 * API Configuration Page — lets users configure the Kilo Code AI provider.
 * Stores the API key securely on the backend (AES-256-GCM encrypted at rest).
 * The active key is used by all document analysis and pipeline AI nodes.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { getAIProvider, saveAIProvider, deleteAIProvider, testAIProvider, updateAIProviderModel } from '../data/api-client'
import type { AIProvider, ProviderTestResult } from '../../../shared/types/ai-provider.types'

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: '14px',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box' as const
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 18px',
  background: 'rgba(33,213,237,0.12)',
  border: '1px solid rgba(33,213,237,0.2)',
  borderRadius: '8px',
  color: '#21d5ed',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 180ms ease-out'
}

const btnDanger: React.CSSProperties = {
  padding: '8px 18px',
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.15)',
  borderRadius: '8px',
  color: '#f87171',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 180ms ease-out'
}

const btnDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: 'rgba(33,213,237,0.03)',
  color: '#475569',
  cursor: 'default'
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ configured }: { configured: boolean }): ReactElement {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: 500,
      background: configured ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.1)',
      border: configured ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(100,116,139,0.2)',
      color: configured ? '#10b981' : '#64748b'
    }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: configured ? '#10b981' : '#64748b'
      }} />
      {configured ? 'Connected' : 'Not configured'}
    </span>
  )
}

// ── Test result pill ───────────────────────────────────────────────────────────

function TestResultBadge({ result }: { result: ProviderTestResult }): ReactElement {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: 500,
      background: result.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
      border: result.success ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
      color: result.success ? '#10b981' : '#ef4444'
    }}>
      {result.success ? `✓ ${result.latencyMs}ms` : `✗ Failed`}
      {!result.success && (
        <span style={{ color: '#94a3b8', fontWeight: 400 }}>— {result.message}</span>
      )}
    </span>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function APIConfig(): ReactElement {
  const [provider, setProvider] = useState<AIProvider | null>(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('minimax/minimax-m2.5:free')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Test state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)

  // Model-only update state (when already configured)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelMsg, setModelMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Delete state
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadProvider = useCallback(async () => {
    setLoading(true)
    try {
      const p = await getAIProvider()
      setProvider(p)
      if (p?.model) setModel(p.model)
    } catch {
      // Backend unreachable — show empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProvider() }, [loadProvider])

  const handleSave = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setSaveMsg({ type: 'error', text: 'API key is required.' })
      return
    }
    setSaving(true)
    setSaveMsg(null)
    setTestResult(null)
    try {
      const saved = await saveAIProvider({ apiKey: apiKey.trim(), model })
      setProvider(saved)
      setApiKey('')
      setSaveMsg({ type: 'success', text: 'Kilo Code API key saved. All AI operations now use this key.' })
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }, [apiKey, model])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAIProvider()
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : 'Connection failed',
        testedAt: new Date().toISOString()
      })
    } finally {
      setTesting(false)
    }
  }, [])

  const handleModelUpdate = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setModelSaving(true)
    setModelMsg(null)
    try {
      const saved = await updateAIProviderModel(model)
      setProvider(saved)
      setModelMsg({ type: 'success', text: 'Model updated.' })
    } catch (err) {
      setModelMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update model.' })
    } finally {
      setModelSaving(false)
    }
  }, [model])

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteAIProvider()
      setProvider(null)
      setTestResult(null)
      setSaveMsg(null)
      setConfirmDelete(false)
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove key.' })
    } finally {
      setDeleting(false)
    }
  }, [confirmDelete])

  const isConfigured = provider !== null

  return (
    <>
      {/* Header */}
      <header className="page-header">
        <div>
          <h2>API Configuration</h2>
          <p>Connect Aura AI to your Kilo Code account. All document analysis and pipeline AI nodes use this key.</p>
        </div>
      </header>

      {/* Kilo Code card */}
      <div className="settings-section">
        <h3>Kilo Code</h3>
        <div className="settings-card glass-panel">

          {/* Provider header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '20px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(33,213,237,0.15) 0%, rgba(139,92,246,0.15) 100%)',
              border: '1px solid rgba(33,213,237,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', flexShrink: 0
            }}>
              ⚡
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', color: '#f1f5f9' }}>Kilo Code</p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                OpenRouter via <code style={{ color: '#94a3b8', fontSize: '11px' }}>api.kilo.ai</code> · Default model: minimax-m2.5:free
              </p>
            </div>
            {!loading && <StatusBadge configured={isConfigured} />}
          </div>

          {/* Current key info */}
          {isConfigured && (
            <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px' }}>
              <div className="settings-row" style={{ marginBottom: '6px' }}>
                <span className="settings-label">API Key</span>
                <span className="settings-value" style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
                  ••••••••••••{provider!.apiKeyPreview ?? '••••'}
                </span>
              </div>
              <div className="settings-row" style={{ marginBottom: '6px' }}>
                <span className="settings-label">Model</span>
                <span className="settings-value">{provider!.model ?? 'minimax/minimax-m2.5:free'}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Base URL</span>
                <span className="settings-value" style={{ fontSize: '12px', color: '#64748b' }}>{provider!.baseUrl}</span>
              </div>
            </div>
          )}

          {/* Test connection */}
          {isConfigured && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <button
                onClick={handleTest}
                disabled={testing}
                style={testing ? btnDisabled : btnPrimary}
              >
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult && <TestResultBadge result={testResult} />}
            </div>
          )}

          {/* Model selector — shown as its own section when already configured */}
          {isConfigured && (
            <form onSubmit={handleModelUpdate} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>Model</label>
                <select
                  value={model}
                  onChange={(e) => { setModel(e.target.value); setModelMsg(null) }}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="minimax/minimax-m2.5:free">MiniMax M2.5 (free) — recommended</option>
                  <option value="nvidia/nemotron-3-super-120b-a12b:free">NVIDIA Nemotron 3 Super 120B (free)</option>
                  <option value="kilo-auto/free">Kilo Auto (free)</option>
                  <option value="x-ai/grok-code-fast-1:optimized:free">Grok Code Fast 1 (optimized, free)</option>
                  <option value="arcee-ai/trinity-large-preview:free">Arcee AI Trinity Large Preview (free)</option>
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="submit"
                    disabled={modelSaving || model === provider?.model}
                    style={modelSaving || model === provider?.model ? btnDisabled : btnPrimary}
                  >
                    {modelSaving ? 'Saving…' : 'Update Model'}
                  </button>
                  {modelMsg && (
                    <p style={{ margin: 0, fontSize: '12px', color: modelMsg.type === 'success' ? '#10b981' : '#f87171' }}>
                      {modelMsg.text}
                    </p>
                  )}
                </div>
              </div>
            </form>
          )}

          {/* API key form */}
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>
                {isConfigured ? 'Replace API Key' : 'API Key'}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={inputStyle}
                placeholder={isConfigured ? 'Enter new key to replace existing' : 'sk-...'}
                autoComplete="off"
                spellCheck={false}
              />
              {!isConfigured && (
                <>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginTop: '4px' }}>Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="minimax/minimax-m2.5:free">MiniMax M2.5 (free) — recommended</option>
                    <option value="nvidia/nemotron-3-super-120b-a12b:free">NVIDIA Nemotron 3 Super 120B (free)</option>
                    <option value="kilo-auto/free">Kilo Auto (free)</option>
                    <option value="x-ai/grok-code-fast-1:optimized:free">Grok Code Fast 1 (optimized, free)</option>
                    <option value="arcee-ai/trinity-large-preview:free">Arcee AI Trinity Large Preview (free)</option>
                  </select>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={saving || !apiKey.trim()}
                  style={saving || !apiKey.trim() ? btnDisabled : btnPrimary}
                >
                  {saving ? 'Saving…' : isConfigured ? 'Update Key' : 'Save Key'}
                </button>
                {saveMsg && (
                  <p style={{ margin: 0, fontSize: '12px', color: saveMsg.type === 'success' ? '#10b981' : '#f87171' }}>
                    {saveMsg.text}
                  </p>
                )}
              </div>
            </div>
          </form>

          {/* Remove */}
          {isConfigured && (
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={deleting ? btnDisabled : btnDanger}
                >
                  {deleting ? 'Removing…' : confirmDelete ? 'Confirm Remove' : 'Remove Key'}
                </button>
                {confirmDelete && !deleting && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ ...btnPrimary, color: '#94a3b8', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    Cancel
                  </button>
                )}
                {confirmDelete && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>
                    This will disconnect all AI features until a new key is added.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info panel */}
      <div className="settings-section">
        <h3>How it works</h3>
        <div className="settings-card glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              Your API key is encrypted with AES-256-GCM before being stored in the database. The full key is never returned to the browser after saving — only a masked preview.
            </p>
            <p style={{ margin: 0 }}>
              All document analysis (Extract Fields) and pipeline AI nodes use the key configured here. Changes take effect immediately without a server restart.
            </p>
            <p style={{ margin: 0 }}>
              Get a free Kilo Code API key at <span style={{ color: '#21d5ed' }}>kilo.ai</span>. The default model (<code style={{ color: '#94a3b8' }}>minimax/minimax-m2.5:free</code>) has no usage costs.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

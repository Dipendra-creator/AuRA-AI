/**
 * API Configuration Page — multi-provider AI configuration.
 * Supports Kilo Code and GitHub Copilot (GitHub Models API).
 * Stores API keys securely on the backend (AES-256-GCM encrypted at rest).
 * The active provider is used by all document analysis and pipeline AI nodes.
 */

import { useState, useEffect, useCallback, type ReactElement } from 'react'
import {
  listAIProviders,
  saveAIProvider,
  deleteAIProvider,
  testAIProvider,
  updateAIProviderModel,
  activateAIProvider
} from '../data/api-client'
import { useAIProvider } from '../contexts/AIProviderContext'
import type { AIProvider, ProviderTestResult, ProviderType, ProviderInfo } from '../../../shared/types/ai-provider.types'

// ── Provider registry ──────────────────────────────────────────────────────────

const PROVIDERS: ProviderInfo[] = [
  {
    type: 'kilo_code',
    name: 'Kilo Code',
    description: 'OpenRouter via api.kilo.ai — many free models available',
    icon: '⚡',
    defaultModel: 'minimax/minimax-m2.5:free',
    models: [
      { value: 'minimax/minimax-m2.5:free', label: 'MiniMax M2.5 (free) — recommended' },
      { value: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'NVIDIA Nemotron 3 Super 120B (free)' },
      { value: 'kilo-auto/free', label: 'Kilo Auto (free)' },
      { value: 'x-ai/grok-code-fast-1:optimized:free', label: 'Grok Code Fast 1 (free)' },
      { value: 'arcee-ai/trinity-large-preview:free', label: 'Arcee AI Trinity Large Preview (free)' }
    ],
    apiKeyPlaceholder: 'sk-...',
    helpUrl: 'https://kilo.ai',
    helpText: 'Get a free API key at kilo.ai'
  },
  {
    type: 'github_copilot',
    name: 'GitHub Copilot',
    description: 'GitHub Models API — powered by OpenAI, xAI, DeepSeek, and more',
    icon: '🐙',
    defaultModel: 'gpt-4o-mini',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini — fast & affordable' },
      { value: 'gpt-4o', label: 'GPT-4o — multimodal' },
      { value: 'gpt-5-nano', label: 'GPT-5 Nano — fastest, low latency' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini — lightweight, cost-sensitive' },
      { value: 'gpt-5', label: 'GPT-5 — logic-heavy & multi-step tasks' },
      { value: 'o4-mini', label: 'o4-mini — fast reasoning' },
      { value: 'o3-mini', label: 'o3-mini — cost-efficient reasoning' },
      { value: 'o3', label: 'o3 — advanced reasoning' },
      { value: 'DeepSeek-R1', label: 'DeepSeek R1 — open-weight reasoning' },
      { value: 'Grok-3-Mini', label: 'xAI Grok 3 Mini — fast reasoning' },
      { value: 'Grok-3', label: 'xAI Grok 3 — advanced reasoning' },
      { value: 'Phi-4-reasoning', label: 'Phi-4 Reasoning — Microsoft' },
      { value: 'Phi-4-mini-reasoning', label: 'Phi-4 Mini Reasoning — lightweight' }
    ],
    apiKeyPlaceholder: 'ghp_... or github_pat_...',
    helpUrl: 'https://github.com/settings/tokens',
    helpText: 'Use a GitHub Personal Access Token with models:read scope'
  }
]

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

function StatusBadge({ configured, active }: { configured: boolean; active: boolean }): ReactElement {
  if (!configured) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
        background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: '#64748b'
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} />
        Not configured
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
      background: active ? 'rgba(16,185,129,0.08)' : 'rgba(234,179,8,0.08)',
      border: active ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(234,179,8,0.2)',
      color: active ? '#10b981' : '#eab308'
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? '#10b981' : '#eab308' }} />
      {active ? 'Active' : 'Connected'}
    </span>
  )
}

// ── Test result pill ───────────────────────────────────────────────────────────

function TestResultBadge({ result }: { result: ProviderTestResult }): ReactElement {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
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

// ── Provider Card Component ────────────────────────────────────────────────────

interface ProviderCardProps {
  info: ProviderInfo
  provider: AIProvider | null
  onRefresh: () => void
}

function ProviderCard({ info, provider, onRefresh }: ProviderCardProps): ReactElement {
  const isConfigured = provider !== null
  const isActive = provider?.isActive ?? false

  // Form state
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(provider?.model ?? info.defaultModel)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Test state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)

  // Model-only update state
  const [modelSaving, setModelSaving] = useState(false)
  const [modelMsg, setModelMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Delete state
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Activate state
  const [activating, setActivating] = useState(false)

  // Sync model when provider changes
  useEffect(() => {
    if (provider?.model) setModel(provider.model)
  }, [provider?.model])

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
      await saveAIProvider({ providerType: info.type, apiKey: apiKey.trim(), model })
      setApiKey('')
      setSaveMsg({ type: 'success', text: `${info.name} configured and set as active provider.` })
      onRefresh()
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }, [apiKey, model, info.type, info.name, onRefresh])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAIProvider(info.type)
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false, latencyMs: 0,
        message: err instanceof Error ? err.message : 'Connection failed',
        testedAt: new Date().toISOString()
      })
    } finally {
      setTesting(false)
    }
  }, [info.type])

  const handleModelUpdate = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setModelSaving(true)
    setModelMsg(null)
    try {
      await updateAIProviderModel(info.type, model)
      setModelMsg({ type: 'success', text: 'Model updated.' })
      onRefresh()
    } catch (err) {
      setModelMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update model.' })
    } finally {
      setModelSaving(false)
    }
  }, [model, info.type, onRefresh])

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteAIProvider(info.type)
      setTestResult(null)
      setSaveMsg(null)
      setConfirmDelete(false)
      onRefresh()
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove key.' })
    } finally {
      setDeleting(false)
    }
  }, [confirmDelete, info.type, onRefresh])

  const handleActivate = useCallback(async () => {
    setActivating(true)
    try {
      await activateAIProvider(info.type)
      onRefresh()
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to activate.' })
    } finally {
      setActivating(false)
    }
  }, [info.type, onRefresh])

  return (
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
          {info.icon}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', color: '#f1f5f9' }}>{info.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{info.description}</p>
        </div>
        <StatusBadge configured={isConfigured} active={isActive} />
      </div>

      {/* Current config info */}
      {isConfigured && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px',
          background: isActive ? 'rgba(16,185,129,0.05)' : 'rgba(234,179,8,0.05)',
          border: isActive ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(234,179,8,0.15)',
          borderRadius: '8px'
        }}>
          <div className="settings-row" style={{ marginBottom: '6px' }}>
            <span className="settings-label">API Key</span>
            <span className="settings-value" style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
              ••••••••••••{provider!.apiKeyPreview ?? '••••'}
            </span>
          </div>
          <div className="settings-row" style={{ marginBottom: '6px' }}>
            <span className="settings-label">Model</span>
            <span className="settings-value">{provider!.model ?? info.defaultModel}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Base URL</span>
            <span className="settings-value" style={{ fontSize: '12px', color: '#64748b' }}>{provider!.baseUrl}</span>
          </div>
        </div>
      )}

      {/* Activate button (when configured but not active) */}
      {isConfigured && !isActive && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={handleActivate}
            disabled={activating}
            style={activating ? btnDisabled : {
              ...btnPrimary,
              background: 'rgba(234,179,8,0.12)',
              border: '1px solid rgba(234,179,8,0.25)',
              color: '#eab308'
            }}
          >
            {activating ? 'Activating…' : 'Set as Active Provider'}
          </button>
        </div>
      )}

      {/* Test connection */}
      {isConfigured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button onClick={handleTest} disabled={testing} style={testing ? btnDisabled : btnPrimary}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult && <TestResultBadge result={testResult} />}
        </div>
      )}

      {/* Model selector — shown when already configured */}
      {isConfigured && (
        <form onSubmit={handleModelUpdate} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>Model</label>
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); setModelMsg(null) }}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {info.models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
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
            placeholder={isConfigured ? 'Enter new key to replace existing' : info.apiKeyPlaceholder}
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
                {info.models.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
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
          {!isConfigured && (
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              {info.helpText} — <a href={info.helpUrl} target="_blank" rel="noreferrer" style={{ color: '#21d5ed', textDecoration: 'none' }}>{info.helpUrl.replace('https://', '')}</a>
            </p>
          )}
        </div>
      </form>

      {/* Remove */}
      {isConfigured && (
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleDelete} disabled={deleting} style={deleting ? btnDisabled : btnDanger}>
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
                This will remove this provider. {isActive ? 'AI features will use another configured provider, or stop working.' : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function APIConfig(): ReactElement {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const { refresh: refreshGlobalContext } = useAIProvider()

  const loadProviders = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listAIProviders()
      setProviders(list)
    } catch {
      // Backend unreachable — show empty state
    } finally {
      setLoading(false)
    }
    // Also refresh the global context so all consuming pages see the update
    refreshGlobalContext()
  }, [refreshGlobalContext])

  useEffect(() => { loadProviders() }, [loadProviders])

  const activeProvider = providers.find((p) => p.isActive)

  return (
    <>
      {/* Header */}
      <header className="page-header">
        <div>
          <h2>API Configuration</h2>
          <p>
            Configure AI providers for document analysis and pipeline nodes.
            {activeProvider ? (
              <> Active provider: <strong style={{ color: '#10b981' }}>
                {PROVIDERS.find((p) => p.type === activeProvider.type)?.name ?? activeProvider.type}
              </strong></>
            ) : (
              <> No provider is active — configure one below to enable AI features.</>
            )}
          </p>
        </div>
      </header>

      {/* Provider cards */}
      {PROVIDERS.map((info) => {
        const provider = providers.find((p) => p.type === info.type) ?? null
        return (
          <div className="settings-section" key={info.type}>
            <h3>{info.name}</h3>
            {loading ? (
              <div className="settings-card glass-panel" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                Loading…
              </div>
            ) : (
              <ProviderCard info={info} provider={provider} onRefresh={loadProviders} />
            )}
          </div>
        )
      })}

      {/* Info panel */}
      <div className="settings-section">
        <h3>How it works</h3>
        <div className="settings-card glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              Your API keys are encrypted with AES-256-GCM before being stored. The full key is never returned to the browser after saving — only a masked preview.
            </p>
            <p style={{ margin: 0 }}>
              You can configure multiple providers but only one can be <strong style={{ color: '#f1f5f9' }}>active</strong> at a time. All document analysis and pipeline AI nodes use the active provider.
            </p>
            <p style={{ margin: 0 }}>
              Changes take effect immediately without a server restart. Use the "Test Connection" button to verify connectivity.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

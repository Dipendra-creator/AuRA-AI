/**
 * WebSocket Client — Singleton manager for persistent WebSocket connection.
 *
 * Manages a single WebSocket connection to the Go backend for real-time
 * document analysis streaming. Replaces the SSE-based approach.
 *
 * Features:
 * - Auto-connect on first use
 * - Exponential backoff reconnection (max 5 retries)
 * - Connection state tracking
 * - Heartbeat ping/pong (30s interval, 5s timeout)
 * - One active analysis at a time
 */

import type { AnalysisEvent } from './api-client'
import type { SchemaField } from '../../../shared/types/document.types'

const WS_URL = 'ws://localhost:8080/api/v1/ws'

type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'

/** Inbound message from server */
interface WSInbound {
  readonly type: string
  readonly totalPages?: number
  readonly page?: number
  readonly fieldsFound?: number
  readonly totalFields?: number
  readonly confidence?: number
  readonly error?: string
  readonly fields?: readonly {
    fieldName: string
    value: string
    confidence: number
    verified: boolean
  }[]
  readonly pagesSucceeded?: number
  readonly pagesFailed?: number
}

/** Active analysis subscription */
interface AnalysisSubscription {
  readonly onEvent: (event: AnalysisEvent) => void
  readonly onDone?: () => void
  readonly onError?: (err: Error) => void
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'DISCONNECTED'
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 5
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private activeSubscription: AnalysisSubscription | null = null
  private connectPromise: Promise<void> | null = null

  /** Establishes connection if not already connected. */
  async connect(): Promise<void> {
    if (this.state === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    // If already connecting, return the existing promise
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.state = 'CONNECTING'
      console.log('[WS] Connecting to', WS_URL)

      try {
        this.ws = new WebSocket(WS_URL)
      } catch (err) {
        this.state = 'DISCONNECTED'
        this.connectPromise = null
        reject(err)
        return
      }

      this.ws.onopen = () => {
        console.log('[WS] Connected')
        this.state = 'CONNECTED'
        this.reconnectAttempts = 0
        this.connectPromise = null
        this.startHeartbeat()
        resolve()
      }

      this.ws.onclose = (event) => {
        console.log('[WS] Connection closed', event.code, event.reason)
        this.state = 'DISCONNECTED'
        this.connectPromise = null
        this.stopHeartbeat()

        // Notify active subscription of disconnect
        if (this.activeSubscription?.onError) {
          this.activeSubscription.onError(new Error('WebSocket connection closed'))
          this.activeSubscription = null
        }

        // Auto-reconnect if it wasn't a clean close
        if (event.code !== 1000) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (event) => {
        console.error('[WS] Connection error', event)
        this.state = 'DISCONNECTED'
        this.connectPromise = null
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string)
      }
    })

    return this.connectPromise
  }

  /** Cleanly closes the connection. */
  disconnect(): void {
    this.stopHeartbeat()
    this.clearReconnectTimer()
    this.activeSubscription = null
    this.connectPromise = null

    if (this.ws) {
      this.ws.onclose = null // Prevent auto-reconnect on intentional close
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.state = 'DISCONNECTED'
    console.log('[WS] Disconnected')
  }

  /** Returns whether the connection is currently active. */
  isConnected(): boolean {
    return this.state === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Triggers document analysis over the WebSocket.
   * Returns a cleanup function to cancel the subscription.
   * Optionally accepts a custom schema for targeted extraction.
   */
  analyzeDocument(
    documentId: string,
    onEvent: (event: AnalysisEvent) => void,
    onDone?: () => void,
    onError?: (err: Error) => void,
    schema?: readonly SchemaField[]
  ): () => void {
    // Set up subscription BEFORE connecting (events may arrive fast)
    this.activeSubscription = { onEvent, onDone, onError }

    // Connect if needed, then send the analyze command
    this.connect()
      .then(() => {
        const msg: Record<string, unknown> = { action: 'analyze', documentId }
        if (schema && schema.length > 0) {
          msg.schema = schema
        }
        this.send(msg)
      })
      .catch((err) => {
        onError?.(err instanceof Error ? err : new Error(String(err)))
        this.activeSubscription = null
      })

    // Return cleanup function
    return () => {
      this.activeSubscription = null
    }
  }

  // ── Private Methods ──────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let data: WSInbound
    try {
      data = JSON.parse(raw) as WSInbound
    } catch {
      console.warn('[WS] Failed to parse message:', raw)
      return
    }

    // Handle pong (heartbeat response)
    if (data.type === 'pong') {
      this.clearPongTimer()
      return
    }

    // Route to active subscription
    if (!this.activeSubscription) {
      return
    }

    const event = data as AnalysisEvent
    this.activeSubscription.onEvent(event)

    // Terminal events
    if (event.type === 'complete' || event.type === 'error') {
      const sub = this.activeSubscription
      this.activeSubscription = null
      sub.onDone?.()
    }
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return

      this.send({ action: 'ping' })

      // Expect pong within 5 seconds
      this.pongTimer = setTimeout(() => {
        console.warn('[WS] Pong timeout — reconnecting')
        this.ws?.close(4000, 'Pong timeout')
      }, 5000)
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.clearPongTimer()
  }

  private clearPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached')
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    console.log(
      `[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    )

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[WS] Reconnection failed:', err)
      })
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectAttempts = 0
  }
}

/** Singleton WebSocket client instance */
export const wsClient = new WebSocketClient()

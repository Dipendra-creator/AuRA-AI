/**
 * BackendService — manages the lifecycle of the embedded Go API server.
 *
 * In dev mode  : spawns backend/bin/aura-api-darwin-arm64 (or amd64).
 * In production: spawns the universal binary at process.resourcesPath/bin/aura-api.
 *
 * The service:
 *   1. Determines the correct binary path for the current platform/arch.
 *   2. Spawns the process with a safe environment.
 *   3. Polls the /health endpoint until the server is ready (max 15 s).
 *   4. Provides stopBackend() for clean shutdown.
 */

import { spawn, ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_PORT = process.env['BACKEND_PORT'] ?? '8080'
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`
const HEALTH_POLL_INTERVAL_MS = 300
const HEALTH_TIMEOUT_MS = 15_000

// ─── State ────────────────────────────────────────────────────────────────────

let backendProcess: ChildProcess | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the Go binary path.
 *
 * Dev layout:
 *   <repo>/backend/bin/aura-api-darwin-{arch}
 *
 * Packaged layout (.app bundle):
 *   Contents/Resources/bin/aura-api   (universal fat binary)
 */
function resolveBinaryPath(): string {
  if (is.dev) {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const isWin = process.platform === 'win32'
    const osString = isWin ? 'windows' : 'darwin'
    const ext = isWin ? '.exe' : ''
    const devBin = join(app.getAppPath(), '../../backend/bin', `aura-api-${osString}-${arch}${ext}`)
    if (existsSync(devBin)) return devBin
    // Fallback: universal binary in dev if the arch-specific one isn't built yet
    const devUniversal = join(app.getAppPath(), '../../backend/bin', 'aura-api-darwin-universal')
    if (existsSync(devUniversal)) return devUniversal
    throw new Error(
      `[BackendService] Dev binary not found. Run:\n  cd backend && make build-mac-${arch}`
    )
  }

  // Production: universal binary packaged via extraResources
  const exeName = process.platform === 'win32' ? 'aura-api.exe' : 'aura-api'
  const prodBin = join(process.resourcesPath, 'bin', exeName)
  if (!existsSync(prodBin)) {
    throw new Error(
      `[BackendService] Packaged binary missing at ${prodBin}. ` +
        `Ensure extraResources is configured in electron-builder.yml.`
    )
  }
  return prodBin
}

/**
 * Polls the health endpoint until the backend is ready or times out.
 */
async function waitForBackend(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1_000) })
      if (res.ok) return
    } catch {
      // Backend not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
  }

  throw new Error(
    `[BackendService] Backend did not become healthy within ${timeoutMs / 1_000}s. ` +
      `Check that MongoDB is running and MONGO_URI is correct.`
  )
}

/**
 * Builds the environment variables passed to the Go process.
 * Merges inherited env with sane production defaults.
 */
function buildEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: BACKEND_PORT,
    MONGO_URI: process.env['MONGO_URI'] ?? 'mongodb://127.0.0.1:27017',
    MONGO_DB: process.env['MONGO_DB'] ?? 'AuraAI',
    LOG_LEVEL: is.dev ? 'debug' : 'info',
    CORS_ORIGINS: `http://localhost:${BACKEND_PORT}`,
    REQUEST_TIMEOUT: '30s',
    // KILO_API_KEY must be set by the user via preferences / env
    KILO_API_KEY: process.env['KILO_API_KEY'] ?? '',
    TESSERACT_PATH: process.env['TESSERACT_PATH'] ?? 'tesseract'
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Starts the Go backend and waits for it to be healthy.
 *
 * @throws if the binary is missing or the server doesn't become healthy in time.
 */
export async function startBackend(): Promise<void> {
  if (backendProcess) {
    console.warn('[BackendService] Backend is already running (pid=%d)', backendProcess.pid)
    return
  }

  const binaryPath = resolveBinaryPath()
  console.info('[BackendService] Starting backend:', binaryPath)

  // Ensure the binary is executable (important after extraResources copy)
  await chmod(binaryPath, 0o755)

  backendProcess = spawn(binaryPath, [], {
    env: buildEnv(),
    stdio: ['ignore', 'pipe', 'pipe']
  })

  backendProcess.stdout?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((line) => console.log('[backend]', line))
  })

  backendProcess.stderr?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((line) => console.error('[backend:err]', line))
  })

  backendProcess.on('exit', (code, signal) => {
    console.warn('[BackendService] Backend exited (code=%d, signal=%s)', code, signal)
    backendProcess = null
  })

  backendProcess.on('error', (err) => {
    console.error('[BackendService] Spawn error:', err.message)
    backendProcess = null
  })

  // Wait for the HTTP server to accept connections
  await waitForBackend(HEALTH_TIMEOUT_MS)
  console.info('[BackendService] Backend is healthy on port %s', BACKEND_PORT)
}

/**
 * Gracefully stops the Go backend (SIGTERM → SIGKILL after 3 s).
 */
export function stopBackend(): void {
  if (!backendProcess) return

  console.info('[BackendService] Stopping backend (pid=%d)…', backendProcess.pid)
  backendProcess.kill('SIGTERM')

  const killTimer = setTimeout(() => {
    if (backendProcess) {
      console.warn('[BackendService] Backend did not exit in time — sending SIGKILL')
      backendProcess.kill('SIGKILL')
    }
  }, 3_000)

  backendProcess.once('exit', () => clearTimeout(killTimer))
}

/** Returns the port the backend is (or will be) listening on. */
export function getBackendPort(): string {
  return BACKEND_PORT
}

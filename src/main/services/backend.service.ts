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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_PORT = process.env['BACKEND_PORT'] ?? '8080'
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`
const HEALTH_POLL_INTERVAL_MS = 300
const HEALTH_TIMEOUT_MS = 15_000

// ─── State ────────────────────────────────────────────────────────────────────

let backendProcess: ChildProcess | null = null

type RuntimeSecrets = {
  jwtSecret: string
  encryptionKeyHex: string
  githubClientId: string
  githubClientSecret: string
  githubCallbackUrl: string
  kiloApiKey: string
}

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
  const runtimeCfg = loadOrCreateRuntimeConfig()

  // Ensure Homebrew bin dirs are in PATH so Go backend can find
  // tesseract, pdftoppm, mongod etc. even when Electron doesn't
  // inherit the user's full shell environment.
  const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/homebrew/sbin', '/usr/local/sbin']
  const currentPath = process.env['PATH'] ?? '/usr/bin:/bin:/usr/sbin:/sbin'
  const combinedPath = [...extraPaths, ...currentPath.split(':')].filter(
    (v, i, a) => a.indexOf(v) === i
  ).join(':')

  return {
    ...process.env,
    PATH: combinedPath,
    PORT: BACKEND_PORT,
    MONGO_URI: process.env['MONGO_URI'] ?? 'mongodb://127.0.0.1:27017',
    MONGO_DB: process.env['MONGO_DB'] ?? 'aura_ai',
    LOG_LEVEL: is.dev ? 'debug' : 'info',
    CORS_ORIGINS: `http://localhost:5173,http://localhost:${BACKEND_PORT}`,
    REQUEST_TIMEOUT: '30s',
    JWT_SECRET: process.env['JWT_SECRET'] ?? runtimeCfg.jwtSecret,
    ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'] ?? runtimeCfg.encryptionKeyHex,

    // ── GitHub OAuth ──────────────────────────────────────────────────────
    GITHUB_CLIENT_ID: process.env['GITHUB_CLIENT_ID'] ?? runtimeCfg.githubClientId,
    GITHUB_CLIENT_SECRET: process.env['GITHUB_CLIENT_SECRET'] ?? runtimeCfg.githubClientSecret,
    GITHUB_CALLBACK_URL:
      process.env['GITHUB_CALLBACK_URL'] ??
      (runtimeCfg.githubCallbackUrl ||
        `http://localhost:${BACKEND_PORT}/api/v1/auth/github/callback`),

    // ── AI API Keys ───────────────────────────────────────────────────────
    KILO_API_KEY: process.env['KILO_API_KEY'] ?? runtimeCfg.kiloApiKey,

    // ── OCR ───────────────────────────────────────────────────────────────
    TESSERACT_PATH: process.env['TESSERACT_PATH'] ?? resolveTesseractPath()
  }
}

/**
 * Resolves the tesseract binary path, checking Homebrew locations explicitly
 * in case the packaged Electron app doesn't inherit the user's PATH.
 */
function resolveTesseractPath(): string {
  const candidates = [
    '/opt/homebrew/bin/tesseract',
    '/usr/local/bin/tesseract'
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return 'tesseract' // fallback to system PATH lookup
}

/**
 * Loads persisted runtime config from userData, or creates it on first run.
 *
 * On first launch the function seeds GitHub OAuth credentials from the
 * backend/.env file (dev) so they survive into the packaged app's config
 * directory. Subsequent launches just read the persisted file.
 */
function loadOrCreateRuntimeConfig(): RuntimeSecrets {
  const dir = join(app.getPath('userData'), 'runtime')
  const file = join(dir, 'backend-config.json')

  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RuntimeSecrets>
      if (parsed.jwtSecret && parsed.encryptionKeyHex && parsed.encryptionKeyHex.length === 64) {
        return {
          jwtSecret: parsed.jwtSecret,
          encryptionKeyHex: parsed.encryptionKeyHex,
          githubClientId: parsed.githubClientId ?? '',
          githubClientSecret: parsed.githubClientSecret ?? '',
          githubCallbackUrl: parsed.githubCallbackUrl ?? '',
          kiloApiKey: parsed.kiloApiKey ?? ''
        }
      }
    }
  } catch {
    // Fall through to regeneration below.
  }

  // Seed values from the backend .env (dev) or from process.env (CI)
  const seed = readDotEnvSeed()

  mkdirSync(dir, { recursive: true })

  const generated: RuntimeSecrets = {
    jwtSecret: seed.JWT_SECRET || randomBytes(48).toString('hex'),
    encryptionKeyHex: seed.ENCRYPTION_KEY || randomBytes(32).toString('hex'),
    githubClientId: seed.GITHUB_CLIENT_ID || '',
    githubClientSecret: seed.GITHUB_CLIENT_SECRET || '',
    githubCallbackUrl:
      seed.GITHUB_CALLBACK_URL || `http://localhost:${BACKEND_PORT}/api/v1/auth/github/callback`,
    kiloApiKey: seed.KILO_API_KEY || ''
  }

  writeFileSync(file, JSON.stringify(generated, null, 2), 'utf8')
  console.info('[BackendService] Runtime config created at', file)
  return generated
}

/**
 * Best-effort parse of backend/.env to seed initial config values.
 * Only used during first-run config generation.
 */
function readDotEnvSeed(): Record<string, string> {
  const candidates = [
    // Dev: repo-relative path
    join(app.getAppPath(), '../../backend/.env'),
    // Packaged: alongside the binary
    join(process.resourcesPath ?? '', '.env')
  ]
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      const lines = readFileSync(p, 'utf8').split('\n')
      const env: Record<string, string> = {}
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx < 1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        let val = trimmed.slice(eqIdx + 1).trim()
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        // Ignore inline comments
        const commentIdx = val.indexOf(' #')
        if (commentIdx > 0) val = val.slice(0, commentIdx).trim()
        env[key] = val
      }
      console.info('[BackendService] Seeded config from', p)
      return env
    } catch {
      // try next candidate
    }
  }
  return {}
}

// ─── Port-conflict resolution ─────────────────────────────────────────────────

/**
 * Checks if a port is in use. If so, kills the occupying process.
 * This prevents stale `go run` or crashed backend instances from blocking
 * the port and causing mysterious 404 responses.
 */
async function ensurePortFree(port: number): Promise<void> {
  const { execSync } = await import('node:child_process')

  if (process.platform === 'win32') {
    // Windows: use netstat + taskkill
    try {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8'
      }).trim()
      if (!out) return
      const pids = new Set(
        out
          .split('\n')
          .map((line) => parseInt(line.trim().split(/\s+/).pop() ?? '', 10))
          .filter((n) => !isNaN(n) && n > 0)
      )
      for (const pid of pids) {
        console.warn('[BackendService] Killing stale process on port %d (pid=%d)', port, pid)
        try {
          execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' })
        } catch { /* already gone */ }
      }
      await new Promise((r) => setTimeout(r, 1_000))
    } catch {
      // port is free or netstat unavailable
    }
    return
  }

  // macOS / Linux: use lsof
  try {
    // lsof returns lines like: "server  12345 user  9u  IPv6 ... TCP *:8080 (LISTEN)"
    const out = execSync(`lsof -i :${port} -P -n -t 2>/dev/null`, { encoding: 'utf8' }).trim()
    if (!out) return // port is free

    const pids = out
      .split('\n')
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)

    for (const pid of pids) {
      console.warn('[BackendService] Killing stale process on port %d (pid=%d)', port, pid)
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // process already gone
      }
    }

    // Wait briefly for the port to be released
    await new Promise((r) => setTimeout(r, 1_000))

    // Verify port is now free
    try {
      const check = execSync(`lsof -i :${port} -P -n -t 2>/dev/null`, { encoding: 'utf8' }).trim()
      if (check) {
        // Force kill remaining
        const remaining = check.split('\n').map((p) => parseInt(p.trim(), 10)).filter(Boolean)
        for (const pid of remaining) {
          try {
            process.kill(pid, 'SIGKILL')
          } catch { /* already gone */ }
        }
        await new Promise((r) => setTimeout(r, 500))
      }
    } catch {
      // lsof returned error → port is free
    }
  } catch {
    // lsof not found or port already free — safe to proceed
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

  // Kill any stale process occupying the backend port
  await ensurePortFree(Number(BACKEND_PORT))

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

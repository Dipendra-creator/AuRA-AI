/**
 * MongoDBManager — manages a local MongoDB instance lifecycle for fully-local
 * desktop distribution. In production packaging this allows the app to start
 * its own `mongod` process when Docker is not available.
 *
 * Strategy (checked in order on each platform):
 *   1. Check if a MongoDB instance is already reachable on the configured port.
 *      If yes → use it (user runs their own, or Docker, etc.)
 *   2. Look for a bundled `mongod` binary in extraResources.
 *      Spawn it against a data directory inside `userData`.
 *   3. If nothing works → the backend will start in degraded mode
 *      and the UI should prompt the user.
 *
 * The module exports `ensureMongoDB()` and `stopManagedMongo()`.
 */

import { spawn, ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONGO_PORT = 27017
const HEALTH_TIMEOUT_MS = 10_000
const HEALTH_POLL_INTERVAL_MS = 500

// ─── State ────────────────────────────────────────────────────────────────────

let mongoProcess: ChildProcess | null = null

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Check if MongoDB is already accepting connections on the default port.
 */
async function isMongoRunning(): Promise<boolean> {
  try {
    // We try a raw TCP connect by hitting the port; a minimal HTTP
    // request to the wire protocol port will fail with a parse error
    // but the connection itself will succeed → server is up.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2_000)
    await fetch(`http://127.0.0.1:${MONGO_PORT}`, { signal: controller.signal }).catch(() => {})
    clearTimeout(timer)

    // Alternative: use the MongoDB driver ping. But that pulls in the
    // whole driver just for a health-check. Instead do a simple TCP probe.
    const net = await import('node:net')
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: MONGO_PORT })
      socket.setTimeout(2_000)
      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
      socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
      })
    })
  } catch {
    return false
  }
}

/**
 * Resolves a `mongod` binary path, checking bundled → Homebrew → system PATH.
 *
 * In production the Go binary is spawned from the Electron main process which
 * may not inherit the user's full shell PATH. We explicitly check Homebrew's
 * known install locations so the postinstall-installed mongod is always found.
 */
function resolveMongodBinary(): string | null {
  // Bundled mongod in extraResources (Windows + future macOS/Linux bundles)
  if (!is.dev) {
    const candidates = [
      join(process.resourcesPath, 'bin', 'mongod'),
      join(process.resourcesPath, 'bin', 'mongod.exe')
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
  }

  // Well-known Homebrew mongod paths (Apple Silicon → /opt/homebrew, Intel → /usr/local)
  const brewPaths = [
    '/opt/homebrew/bin/mongod',
    '/usr/local/bin/mongod',
    '/opt/homebrew/opt/mongodb-community@7.0/bin/mongod',
    '/usr/local/opt/mongodb-community@7.0/bin/mongod',
    '/opt/homebrew/opt/mongodb-community/bin/mongod',
    '/usr/local/opt/mongodb-community/bin/mongod'
  ]
  for (const p of brewPaths) {
    if (existsSync(p)) {
      console.info('[MongoManager] Found mongod at Homebrew path:', p)
      return p
    }
  }

  // Fallback: system PATH (works in dev when user's shell has mongod)
  try {
    const { execSync } = require('node:child_process')
    const systemPath = execSync('command -v mongod', { encoding: 'utf8' }).trim()
    if (systemPath) return systemPath
  } catch {
    // not on PATH
  }

  return null
}

/**
 * Wait until mongod is accepting connections.
 */
async function waitForMongo(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isMongoRunning()) return true
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
  }
  return false
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Try to start MongoDB via `brew services start`. This is the cleanest path
 * on macOS since the PKG postinstall already installed it via Homebrew.
 */
async function tryBrewServicesStart(): Promise<boolean> {
  const brewPaths = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
  let brewBin: string | null = null
  for (const p of brewPaths) {
    if (existsSync(p)) {
      brewBin = p
      break
    }
  }
  if (!brewBin) return false

  try {
    const { execSync } = require('node:child_process')
    console.info('[MongoManager] Attempting: brew services start mongodb-community@7.0')
    execSync(`${brewBin} services start mongodb-community@7.0`, {
      encoding: 'utf8',
      timeout: 10_000
    })

    // Wait for it to come up
    const ready = await waitForMongo(HEALTH_TIMEOUT_MS)
    return ready
  } catch (err) {
    console.warn('[MongoManager] brew services start failed:', err)
    return false
  }
}

export type MongoStatus = 'external' | 'managed' | 'unavailable'

/**
 * Ensures a MongoDB instance is available. Returns the connection status.
 *
 * Strategy:
 *   1. Check if already running externally (user/Docker/brew service).
 *   2. Try `brew services start mongodb-community@7.0` (installed by PKG postinstall).
 *   3. Spawn mongod directly from a known binary path.
 *   4. Give up gracefully → backend starts in degraded mode.
 */
export async function ensureMongoDB(): Promise<MongoStatus> {
  // 1) Already running externally (user's own, Docker, brew service, etc.)
  if (await isMongoRunning()) {
    console.info('[MongoManager] External MongoDB detected on port', MONGO_PORT)
    return 'external'
  }

  // 2) Try starting via brew services (postinstall installed it)
  if (await tryBrewServicesStart()) {
    console.info('[MongoManager] MongoDB started via brew services')
    return 'external'
  }

  // 3) Try spawning mongod directly
  const mongodBin = resolveMongodBinary()
  if (!mongodBin) {
    console.warn('[MongoManager] No mongod binary found — MongoDB unavailable')
    return 'unavailable'
  }

  const dbPath = join(app.getPath('userData'), 'mongodb-data')
  mkdirSync(dbPath, { recursive: true })

  console.info('[MongoManager] Starting managed mongod:', mongodBin)
  console.info('[MongoManager] Data dir:', dbPath)

  mongoProcess = spawn(mongodBin, ['--dbpath', dbPath, '--port', String(MONGO_PORT), '--quiet'], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  mongoProcess.stdout?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((l) => console.log('[mongod]', l))
  })

  mongoProcess.stderr?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((l) => console.error('[mongod:err]', l))
  })

  mongoProcess.on('exit', (code, signal) => {
    console.warn('[MongoManager] mongod exited (code=%d, signal=%s)', code, signal)
    mongoProcess = null
  })

  const ready = await waitForMongo(HEALTH_TIMEOUT_MS)
  if (ready) {
    console.info('[MongoManager] Managed MongoDB is healthy')
    return 'managed'
  }

  console.error('[MongoManager] Managed MongoDB did not start in time')
  stopManagedMongo()
  return 'unavailable'
}

/**
 * Stops the managed mongod process (if we started one).
 */
export function stopManagedMongo(): void {
  if (!mongoProcess) return
  console.info('[MongoManager] Stopping managed mongod (pid=%d)', mongoProcess.pid)
  mongoProcess.kill('SIGTERM')
  const killTimer = setTimeout(() => {
    if (mongoProcess) {
      mongoProcess.kill('SIGKILL')
    }
  }, 5_000)
  mongoProcess.once('exit', () => clearTimeout(killTimer))
}

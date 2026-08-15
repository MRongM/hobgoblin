import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

type StartupLogPayload = Record<string, unknown>

export interface StartupDiagnostics {
  readonly logPath: string
  log(event: string, payload?: StartupLogPayload): void
}

const SECRET_KEY_PATTERN = /secret|token|password|credential/i

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]'
  if (Array.isArray(value)) return value.map((entry) => redactObject(entry))
  if (value && typeof value === 'object') return redactObject(value)
  return value
}

function redactObject(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    redactValue(key, entry),
  ])
  return Object.fromEntries(entries)
}

export function formatStartupLogLine(event: string, payload: StartupLogPayload = {}): string {
  const timestamp = new Date().toISOString()
  const safePayload = redactObject(payload)
  return `${timestamp} [${event}] ${JSON.stringify(safePayload)}\n`
}

export function createStartupDiagnostics(logPath: string): StartupDiagnostics {
  return {
    logPath,
    log(event, payload = {}) {
      try {
        mkdirSync(path.dirname(logPath), { recursive: true })
        appendFileSync(logPath, formatStartupLogLine(event, payload), 'utf8')
      } catch (error) {
        console.warn('[startup] failed to write diagnostics', error)
      }
    },
  }
}

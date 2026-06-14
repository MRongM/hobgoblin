export type PortForwardSessionStatus = 'starting' | 'active' | 'failed' | 'stopped'

export interface PortForwardStartRequest {
  repoId: string
  localBindHost: string
  localPort: number | null
  remoteHost: string
  remotePort: number
}

export interface PortForwardSessionSnapshot {
  id: string
  repoId: string
  localBindHost: string
  requestedLocalPort: number | null
  actualLocalPort: number | null
  remoteHost: string
  remotePort: number
  status: PortForwardSessionStatus
  localUrl: string | null
  message?: string
  createdAt: string
  updatedAt: string
}

export type PortForwardStartResult =
  | { ok: true; session: PortForwardSessionSnapshot }
  | { ok: false; message: string; detail?: string; session?: PortForwardSessionSnapshot }

export type PortForwardListResult =
  | { ok: true; sessions: PortForwardSessionSnapshot[] }
  | { ok: false; message: string }

export type PortForwardStopResult =
  | { ok: true; session: PortForwardSessionSnapshot }
  | { ok: false; message: string }

export type PortForwardStopForRepoResult =
  | { ok: true; stopped: PortForwardSessionSnapshot[] }
  | { ok: false; message: string }

export type PortForwardStartRequestResult =
  | { ok: true; request: PortForwardStartRequest }
  | { ok: false; message: string }

export function normalizePortForwardStartRequest(value: unknown): PortForwardStartRequestResult {
  if (!isRecord(value)) return { ok: false, message: 'error.invalid-arguments' }
  const repoId = typeof value.repoId === 'string' ? value.repoId.trim() : ''
  if (!repoId) return { ok: false, message: 'error.invalid-arguments' }

  const localBindHost = validatePortForwardHost(
    typeof value.localBindHost === 'string' && value.localBindHost.trim() ? value.localBindHost : '127.0.0.1',
  )
  if (!localBindHost.ok) return localBindHost

  const remoteHost = validatePortForwardHost(
    typeof value.remoteHost === 'string' && value.remoteHost.trim() ? value.remoteHost : '127.0.0.1',
  )
  if (!remoteHost.ok) return remoteHost

  const remotePort = normalizeRequiredPort(value.remotePort)
  if (remotePort === null) return { ok: false, message: 'error.invalid-port' }

  const localPort = normalizeOptionalPort(value.localPort)
  if (localPort === undefined) return { ok: false, message: 'error.invalid-port' }

  return {
    ok: true,
    request: {
      repoId,
      localBindHost: localBindHost.host,
      localPort,
      remoteHost: remoteHost.host,
      remotePort,
    },
  }
}

export function validatePortForwardHost(value: string): { ok: true; host: string } | { ok: false; message: string } {
  const host = value.trim()
  if (!host || host.includes(':') || /[\s\0-\x1f\x7f]/.test(host)) return { ok: false, message: 'error.invalid-host' }
  return { ok: true, host }
}

export function isLoopbackBindHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  return value === 'localhost' || value === '127.0.0.1'
}

export function formatPortForwardLocalUrl(localBindHost: string, actualLocalPort: number): string {
  const browserHost = localBindHost === '0.0.0.0' ? '127.0.0.1' : localBindHost
  return `http://${browserHost}:${actualLocalPort}`
}

function normalizeRequiredPort(value: unknown): number | null {
  const port = normalizePortNumber(value)
  return port ?? null
}

function normalizeOptionalPort(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  return normalizePortNumber(value) ?? undefined
}

function normalizePortNumber(value: unknown): number | null {
  const port = typeof value === 'string' ? Number(value.trim()) : value
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

import { reserveAvailablePort } from '#/system/port-allocation.ts'
import { startSshLocalPortForward, type SshLocalPortForwardHandle } from '#/system/ssh/port-forward.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import {
  formatPortForwardLocalUrl,
  normalizePortForwardStartRequest,
  type PortForwardActivateResult,
  type PortForwardDeleteResult,
  type PortForwardListResult,
  type PortForwardSessionSnapshot,
  type PortForwardStartResult,
  type PortForwardStopForRepoResult,
  type PortForwardStopResult,
} from '#/shared/port-forwarding.ts'
import {
  isRemoteRepoId,
  parseRemoteRepoId,
  type RemoteConnectionInput,
  type ResolvedRemoteTarget,
} from '#/shared/remote-repo.ts'

interface RuntimeSession {
  snapshot: PortForwardSessionSnapshot
  handle: SshLocalPortForwardHandle | null
  stoppedByUser: boolean
}

interface ManagerDeps {
  resolveRemoteTarget: (input: RemoteConnectionInput, signal?: AbortSignal) => Promise<ResolvedRemoteTarget>
  reservePort: (host: string, preferredPort: number) => Promise<number>
  startForward: typeof startSshLocalPortForward
  now: () => Date
  id: () => string
}

export interface PortForwardingManager {
  list(repoId: string): Promise<PortForwardListResult>
  start(input: unknown, signal?: AbortSignal): Promise<PortForwardStartResult>
  stop(id: string): Promise<PortForwardStopResult>
  stopForRepo(repoId: string): Promise<PortForwardStopForRepoResult>
  delete(id: string): Promise<PortForwardDeleteResult>
  activate(id: string, signal?: AbortSignal): Promise<PortForwardActivateResult>
  shutdown(): void
}

export function createPortForwardingManagerForTest(deps: ManagerDeps): PortForwardingManager {
  return createPortForwardingManager(deps)
}

const defaultManager = createPortForwardingManager({
  resolveRemoteTarget: resolveSshRemoteTarget,
  reservePort: reserveAvailablePort,
  startForward: startSshLocalPortForward,
  now: () => new Date(),
  id: createSessionId,
})

export async function listPortForwardSessions(repoId: string): Promise<PortForwardListResult> {
  return await defaultManager.list(repoId)
}

export async function startPortForwardSession(input: unknown, signal?: AbortSignal): Promise<PortForwardStartResult> {
  return await defaultManager.start(input, signal)
}

export async function stopPortForwardSession(id: string): Promise<PortForwardStopResult> {
  return await defaultManager.stop(id)
}

export async function stopPortForwardSessionsForRepo(repoId: string): Promise<PortForwardStopForRepoResult> {
  return await defaultManager.stopForRepo(repoId)
}

export async function deletePortForwardSession(id: string): Promise<PortForwardDeleteResult> {
  return await defaultManager.delete(id)
}

export async function activatePortForwardSession(id: string, signal?: AbortSignal): Promise<PortForwardActivateResult> {
  return await defaultManager.activate(id, signal)
}

export function shutdownPortForwarding(): void {
  defaultManager.shutdown()
}

function createPortForwardingManager(deps: ManagerDeps): PortForwardingManager {
  const sessions = new Map<string, RuntimeSession>()

  function stamp(
    session: PortForwardSessionSnapshot,
    patch: Partial<PortForwardSessionSnapshot>,
  ): PortForwardSessionSnapshot {
    return { ...session, ...patch, updatedAt: deps.now().toISOString() }
  }

  function setSession(session: RuntimeSession, patch: Partial<PortForwardSessionSnapshot>): RuntimeSession {
    session.snapshot = stamp(session.snapshot, patch)
    sessions.set(session.snapshot.id, session)
    return session
  }

  async function resolveAlias(repoId: string, signal?: AbortSignal) {
    if (!isRemoteRepoId(repoId)) return null
    const ref = parseRemoteRepoId(repoId)
    if (!ref) return null
    try {
      return await deps.resolveRemoteTarget(ref, signal)
    } catch {
      throw new Error('error.ssh-config-changed')
    }
  }

  async function startForwardForSession(
    session: RuntimeSession,
    request: {
      localBindHost: string
      localPort: number | null
      remoteHost: string
      remotePort: number
    },
    resolved: ResolvedRemoteTarget,
  ): Promise<PortForwardStartResult> {
    const preferredPort = request.localPort ?? request.remotePort
    try {
      const actualLocalPort = await deps.reservePort(request.localBindHost, preferredPort)
      const handle = await deps.startForward({
        alias: resolved.target.alias,
        localBindHost: request.localBindHost,
        localPort: actualLocalPort,
        remoteHost: request.remoteHost,
        remotePort: request.remotePort,
      })
      session.handle = handle
      handle.onExit((exit) => {
        if (session.handle !== handle || session.snapshot.status === 'stopped') return
        setSession(session, {
          status: session.stoppedByUser ? 'stopped' : 'failed',
          message: session.stoppedByUser ? undefined : safeDetail(exit.stderr),
        })
      })
      setSession(session, {
        status: 'active',
        actualLocalPort,
        localUrl: formatPortForwardLocalUrl(request.localBindHost, actualLocalPort),
      })
      return { ok: true, session: session.snapshot }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'error.port-forward-start-failed'
      setSession(session, { status: 'failed', message: safeDetail(detail) })
      return {
        ok: false,
        message: 'error.port-forward-start-failed',
        detail: safeDetail(detail),
        session: session.snapshot,
      }
    }
  }

  return {
    async list(repoId) {
      return {
        ok: true,
        sessions: Array.from(sessions.values())
          .filter((session) => session.snapshot.repoId === repoId)
          .map((session) => session.snapshot),
      }
    },

    async start(input, signal) {
      const normalized = normalizePortForwardStartRequest(input)
      if (!normalized.ok) return normalized
      const request = normalized.request
      let resolved: ResolvedRemoteTarget | null
      try {
        resolved = await resolveAlias(request.repoId, signal)
      } catch {
        return { ok: false, message: 'error.ssh-config-changed' }
      }
      if (!resolved) return { ok: false, message: 'error.invalid-arguments' }

      const createdAt = deps.now().toISOString()
      const id = deps.id()
      const session: RuntimeSession = {
        handle: null,
        stoppedByUser: false,
        snapshot: {
          id,
          repoId: request.repoId,
          localBindHost: request.localBindHost,
          requestedLocalPort: request.localPort,
          actualLocalPort: null,
          remoteHost: request.remoteHost,
          remotePort: request.remotePort,
          status: 'starting',
          localUrl: null,
          createdAt,
          updatedAt: createdAt,
        },
      }
      sessions.set(id, session)

      return await startForwardForSession(session, request, resolved)
    },

    async stop(id) {
      const session = sessions.get(id)
      if (!session) return { ok: false, message: 'error.port-forward-not-found' }
      session.stoppedByUser = true
      session.handle?.stop()
      setSession(session, { status: 'stopped' })
      return { ok: true, session: session.snapshot }
    },

    async stopForRepo(repoId) {
      const stopped: PortForwardSessionSnapshot[] = []
      for (const session of sessions.values()) {
        if (session.snapshot.repoId !== repoId) continue
        session.stoppedByUser = true
        session.handle?.stop()
        setSession(session, { status: 'stopped' })
        stopped.push(session.snapshot)
      }
      return { ok: true, stopped }
    },

    async delete(id) {
      const session = sessions.get(id)
      if (!session) return { ok: false, message: 'error.port-forward-not-found' }
      if (session.snapshot.status === 'active' || session.snapshot.status === 'starting') {
        return { ok: false, message: 'error.port-forward-delete-active' }
      }
      sessions.delete(id)
      return { ok: true, deletedId: id }
    },

    async activate(id, signal) {
      const session = sessions.get(id)
      if (!session) return { ok: false, message: 'error.port-forward-not-found' }
      if (session.snapshot.status === 'active' || session.snapshot.status === 'starting') {
        return { ok: false, message: 'error.port-forward-already-active' }
      }
      let resolved: ResolvedRemoteTarget | null
      try {
        resolved = await resolveAlias(session.snapshot.repoId, signal)
      } catch {
        return { ok: false, message: 'error.ssh-config-changed', session: session.snapshot }
      }
      if (!resolved) return { ok: false, message: 'error.invalid-arguments', session: session.snapshot }

      session.stoppedByUser = false
      session.handle = null
      setSession(session, {
        status: 'starting',
        actualLocalPort: null,
        localUrl: null,
        message: undefined,
      })
      return await startForwardForSession(
        session,
        {
          localBindHost: session.snapshot.localBindHost,
          localPort: session.snapshot.requestedLocalPort,
          remoteHost: session.snapshot.remoteHost,
          remotePort: session.snapshot.remotePort,
        },
        resolved,
      )
    },

    shutdown() {
      for (const session of sessions.values()) {
        session.stoppedByUser = true
        session.handle?.stop()
        setSession(session, { status: 'stopped' })
      }
    },
  }
}

function createSessionId(): string {
  return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function safeDetail(value: string): string {
  return value.trim().split(/\r?\n/).filter(Boolean).slice(-3).join('\n').slice(0, 1000)
}

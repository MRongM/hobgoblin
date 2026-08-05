import { Hono } from 'hono'
import {
  cleanupAssociatedTmuxSessions,
  closeHostTmuxSessions,
  openHostTmuxSession,
  previewAssociatedTmuxSessions,
  previewHostTmuxSessions,
} from '#/server/modules/tmux-cleanup.ts'
import type { HostTmuxOpenInput, TmuxHostSessionIdentity } from '#/shared/tmux-cleanup.ts'

export function createTmuxCleanupRoutes(): Hono {
  const app = new Hono()

  app.post('/preview', async (c) => {
    const body = await c.req.json().catch(() => null)
    const input = targetInput(body)
    return c.json(await jsonOr(() => previewAssociatedTmuxSessions(input, undefined, c.req.raw.signal), 'preview'))
  })

  app.post('/execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    const target = targetInput(body)
    const approvedSessionNames = Array.isArray(body?.approvedSessionNames) ? body.approvedSessionNames : []
    return c.json(
      await jsonOr(
        () => cleanupAssociatedTmuxSessions({ ...target, approvedSessionNames }, undefined, c.req.raw.signal),
        'execute',
      ),
    )
  })

  app.post('/host-preview', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(
      await jsonOr(() => previewHostTmuxSessions(hostTargetInput(body), undefined, c.req.raw.signal), 'host-preview'),
    )
  })

  app.post('/host-execute', async (c) => {
    const body = await c.req.json().catch(() => null)
    const approvedSessions = sessionIdentityInputs(body)
    if (!approvedSessions) return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    return c.json(
      await jsonOr(
        () => closeHostTmuxSessions({ ...hostTargetInput(body), approvedSessions }, undefined, c.req.raw.signal),
        'host-execute',
      ),
    )
  })

  app.post('/host-open', async (c) => {
    const body = await c.req.json().catch(() => null)
    const input = hostOpenInput(body)
    if (!input) return c.json({ ok: false as const, message: 'error.invalid-arguments' })
    return c.json(await jsonOr(() => openHostTmuxSession(input, undefined, c.req.raw.signal), 'host-open'))
  })

  return app
}

function hostTargetInput(body: unknown): { projectRoot: string } {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return { projectRoot: typeof input.projectRoot === 'string' ? input.projectRoot : '' }
}

function sessionIdentityInputs(body: unknown): TmuxHostSessionIdentity[] | null {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (!Array.isArray(input.approvedSessions)) return null
  const identities: TmuxHostSessionIdentity[] = []
  for (const candidate of input.approvedSessions) {
    const identity = sessionIdentityInput(candidate)
    if (!identity) return null
    identities.push(identity)
  }
  return identities
}

function hostOpenInput(body: unknown): HostTmuxOpenInput | null {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const session = sessionIdentityInput(input.session)
  return typeof input.projectRoot === 'string' && session ? { projectRoot: input.projectRoot, session } : null
}

function sessionIdentityInput(candidate: unknown): TmuxHostSessionIdentity | null {
  if (!candidate || typeof candidate !== 'object') return null
  const identity = candidate as Record<string, unknown>
  if (typeof identity.sessionName !== 'string') return null
  if (identity.kind === 'default' && identity.serverName === undefined) {
    return { kind: 'default', sessionName: identity.sessionName }
  }
  if (identity.kind === 'hobgoblin' && (identity.serverName === undefined || typeof identity.serverName === 'string')) {
    return {
      kind: 'hobgoblin',
      sessionName: identity.sessionName,
      ...(identity.serverName === undefined ? {} : { serverName: identity.serverName }),
    }
  }
  return null
}

function targetInput(body: unknown): { projectRoot: string; itemPath: string } {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    projectRoot: typeof input.projectRoot === 'string' ? input.projectRoot : '',
    itemPath: typeof input.itemPath === 'string' ? input.itemPath : '',
  }
}

async function jsonOr<T>(run: () => Promise<T>, label: string): Promise<T | { ok: false; message: string }> {
  try {
    return await run()
  } catch (error) {
    console.warn(`[server][tmux-cleanup] ${label} failed`, error)
    return { ok: false, message: 'error.tmux-command-failed' }
  }
}

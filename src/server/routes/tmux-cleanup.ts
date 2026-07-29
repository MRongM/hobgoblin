import { Hono } from 'hono'
import {
  cleanupAssociatedTmuxSessions,
  closeHostTmuxSessions,
  previewAssociatedTmuxSessions,
  previewHostTmuxSessions,
} from '#/server/modules/tmux-cleanup.ts'

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
    return c.json(
      await jsonOr(
        () =>
          closeHostTmuxSessions(
            { ...hostTargetInput(body), approvedSessions: sessionIdentityInputs(body) },
            undefined,
            c.req.raw.signal,
          ),
        'host-execute',
      ),
    )
  })

  return app
}

function hostTargetInput(body: unknown): { projectRoot: string } {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return { projectRoot: typeof input.projectRoot === 'string' ? input.projectRoot : '' }
}

function sessionIdentityInputs(body: unknown): Array<{ sessionName: string; serverName?: string }> {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (!Array.isArray(input.approvedSessions)) return []
  return input.approvedSessions.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const identity = candidate as Record<string, unknown>
    if (
      typeof identity.sessionName !== 'string' ||
      (identity.serverName !== undefined && typeof identity.serverName !== 'string')
    ) {
      return []
    }
    return [
      {
        sessionName: identity.sessionName,
        ...(identity.serverName === undefined ? {} : { serverName: identity.serverName }),
      },
    ]
  })
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

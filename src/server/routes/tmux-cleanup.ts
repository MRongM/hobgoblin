import { Hono } from 'hono'
import { cleanupAssociatedTmuxSessions, previewAssociatedTmuxSessions } from '#/server/modules/tmux-cleanup.ts'

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
    const approvedSessionIds = Array.isArray(body?.approvedSessionIds) ? body.approvedSessionIds : []
    return c.json(
      await jsonOr(
        () => cleanupAssociatedTmuxSessions({ ...target, approvedSessionIds }, undefined, c.req.raw.signal),
        'execute',
      ),
    )
  })

  return app
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

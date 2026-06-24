import { Hono } from 'hono'
import {
  activatePortForwardSession,
  deletePortForwardSession,
  listPortForwardSessions,
  startPortForwardSession,
  stopPortForwardSession,
  stopPortForwardSessionsForRepo,
} from '#/server/modules/port-forwarding.ts'

export function createPortForwardingRoutes() {
  const app = new Hono()
  async function jsonOr<T>(run: () => Promise<T>, fallback: T, label: string) {
    try {
      return await run()
    } catch (err) {
      console.warn(`[server][port-forwarding] ${label} failed`, err)
      return fallback
    }
  }

  app.post('/list', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    return c.json(
      await jsonOr(
        () => listPortForwardSessions(repoId),
        { ok: false, message: 'error.invalid-arguments' },
        'list',
      ),
    )
  })

  app.post('/start', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(
      await jsonOr(
        () => startPortForwardSession(body, c.req.raw.signal),
        { ok: false, message: 'error.port-forward-start-failed' },
        'start',
      ),
    )
  })

  app.post('/stop', async (c) => {
    const body = await c.req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    return c.json(
      await jsonOr(
        () => stopPortForwardSession(id),
        { ok: false, message: 'error.port-forward-not-found' },
        'stop',
      ),
    )
  })

  app.post('/stop-for-repo', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    return c.json(
      await jsonOr(
        () => stopPortForwardSessionsForRepo(repoId),
        { ok: false, message: 'error.invalid-arguments' },
        'stop-for-repo',
      ),
    )
  })

  app.post('/delete', async (c) => {
    const body = await c.req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    return c.json(
      await jsonOr(
        () => deletePortForwardSession(id),
        { ok: false, message: 'error.port-forward-not-found' },
        'delete',
      ),
    )
  })

  app.post('/activate', async (c) => {
    const body = await c.req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    return c.json(
      await jsonOr(
        () => activatePortForwardSession(id, c.req.raw.signal),
        { ok: false, message: 'error.port-forward-not-found' },
        'activate',
      ),
    )
  })

  return app
}

import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'
import { createInternalAuthMiddleware } from '#/server/common/auth.ts'

describe('server capability middleware', () => {
  test('accepts the Electron internal capability without consulting Web sessions', async () => {
    const validateWebSession = vi.fn(async () => false)
    const app = protectedApp(validateWebSession)

    const response = await app.request('/protected', {
      headers: { 'x-goblin-internal-secret': 'electron-secret' },
    })

    expect(response.status).toBe(200)
    expect(validateWebSession).not.toHaveBeenCalled()
  })

  test('accepts a valid Web capability from the existing capability header', async () => {
    const validateWebSession = vi.fn(async (token: string) => token === 'web-token')
    const app = protectedApp(validateWebSession)

    const response = await app.request('/protected', {
      headers: { 'x-goblin-internal-secret': 'web-token' },
    })

    expect(response.status).toBe(200)
    expect(validateWebSession).toHaveBeenCalledWith('web-token')
  })

  test('rejects Cookie-only and invalid capability requests', async () => {
    const app = protectedApp(async () => false)

    expect((await app.request('/protected', { headers: { cookie: 'goblin_web_session=web-token' } })).status).toBe(401)
    expect((await app.request('/protected', { headers: { 'x-goblin-internal-secret': 'invalid-token' } })).status).toBe(
      401,
    )
  })
})

function protectedApp(validateWebSession: (token: string) => Promise<boolean>): Hono {
  const app = new Hono()
  app.use('/protected', createInternalAuthMiddleware('electron-secret', { validateWebSession }))
  app.get('/protected', (c) => c.json({ ok: true }))
  return app
}

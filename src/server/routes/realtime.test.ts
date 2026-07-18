import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'

vi.mock('@hono/node-server', () => ({
  upgradeWebSocket: () => (c: { json(value: unknown): Response }) => c.json({ upgraded: true }),
}))

describe('realtime capability boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  test('accepts the Electron internal capability on both realtime channels', async () => {
    const { createRealtimeRoutes } = await import('#/server/routes/realtime.ts')
    const validateWebSession = vi.fn(async () => false)
    const app = createRealtimeRoutes({
      internalSecret: 'electron-secret',
      validateWebSession,
      terminalHost: terminalHostStub,
    })

    expect((await app.request('/invalidation?token=electron-secret')).status).toBe(200)
    expect(
      (await app.request('/terminal?token=electron-secret&clientId=client_test&attachmentId=attachment_test')).status,
    ).toBe(200)
    expect(validateWebSession).not.toHaveBeenCalled()
  })

  test('accepts valid Web capabilities and rejects invalid ones', async () => {
    const { createRealtimeRoutes } = await import('#/server/routes/realtime.ts')
    const validateWebSession = vi.fn(async (token: string) => token === 'web-token')
    const app = createRealtimeRoutes({
      internalSecret: 'electron-secret',
      validateWebSession,
      terminalHost: terminalHostStub,
    })

    expect((await app.request('/invalidation?token=web-token')).status).toBe(200)
    expect(
      (await app.request('/terminal?token=web-token&clientId=client_test&attachmentId=attachment_test')).status,
    ).toBe(200)
    expect((await app.request('/invalidation?token=invalid-token')).status).toBe(401)
    expect((await app.request('/terminal?clientId=client_test&attachmentId=attachment_test')).status).toBe(401)
  })
})

const terminalHostStub = {
  isValidClientId: (value: unknown): value is string => typeof value === 'string' && value.startsWith('client_'),
} as ServerTerminalHost

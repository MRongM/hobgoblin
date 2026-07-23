import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendTest: vi.fn(),
  sendBell: vi.fn(),
  sendCompletion: vi.fn(),
}))

vi.mock('#/server/modules/telegram-notification-write-paths.ts', () => ({
  sendConfiguredTelegramTestNotification: mocks.sendTest,
  sendConfiguredTelegramBellNotification: mocks.sendBell,
  sendConfiguredTelegramOutputCompletionNotification: mocks.sendCompletion,
}))

describe('Telegram notification routes', () => {
  beforeEach(() => vi.clearAllMocks())

  test('forwards language and structured bell context to write paths', async () => {
    mocks.sendTest.mockResolvedValue({ ok: true })
    mocks.sendBell.mockResolvedValue({ ok: true })
    const { createTelegramNotificationRoutes } = await import('#/server/routes/telegram-notifications.ts')
    const readTerminalOutputExcerpt = vi.fn()
    const app = createTelegramNotificationRoutes({ readTerminalOutputExcerpt })

    const testResponse = await app.request('http://127.0.0.1:32100/test', {
      method: 'POST',
      headers: { 'accept-language': 'zh-CN' },
    })
    expect(await testResponse.json()).toEqual({ ok: true })
    expect(mocks.sendTest).toHaveBeenCalledWith({ acceptLanguage: 'zh-CN' })

    const context = {
      terminalKey: 'terminal-1',
      project: 'api',
      contextKind: 'directory',
      context: 'api',
      directory: '~/src/api',
      terminalIndex: 1,
    }
    const bellResponse = await app.request('http://127.0.0.1:32100/bell', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': 'en-US' },
      body: JSON.stringify(context),
    })
    expect(await bellResponse.json()).toEqual({ ok: true })
    expect(mocks.sendBell).toHaveBeenCalledWith(context, {
      acceptLanguage: 'en-US',
      readTerminalOutputExcerpt,
    })
  })

  test('forwards output completion context to the dedicated write path', async () => {
    mocks.sendCompletion.mockResolvedValue({ ok: true })
    const { createTelegramNotificationRoutes } = await import('#/server/routes/telegram-notifications.ts')
    const readTerminalOutputExcerpt = vi.fn()
    const readTerminalScreenSnapshot = vi.fn()
    const app = createTelegramNotificationRoutes({ readTerminalOutputExcerpt, readTerminalScreenSnapshot })
    const context = {
      terminalKey: 'terminal-1',
      project: 'api',
      contextKind: 'directory',
      context: 'api',
      directory: '~/src/api',
      terminalIndex: 1,
      sessionId: 'session-1',
      finalOutputSeq: 42,
      activityDurationMs: 10_000,
    }

    const response = await app.request('http://127.0.0.1:32100/output-completion', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': 'zh-CN' },
      body: JSON.stringify(context),
    })

    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.sendCompletion).toHaveBeenCalledWith(context, {
      acceptLanguage: 'zh-CN',
      readTerminalOutputExcerpt,
      readTerminalScreenSnapshot,
    })
  })
})

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsPrefs } from '#/shared/settings-defaults.ts'
import type {
  TelegramBellNotificationContext,
  TelegramOutputCompletionNotificationContext,
} from '#/shared/telegram-notifications.ts'
import {
  formatTelegramBellMessage,
  resetTelegramNotificationWritePathsForTests,
  sendConfiguredTelegramBellNotification,
  sendConfiguredTelegramOutputCompletionNotification,
  sendConfiguredTelegramTestNotification,
} from '#/server/modules/telegram-notification-write-paths.ts'

function context(overrides: Partial<TelegramBellNotificationContext> = {}): TelegramBellNotificationContext {
  return {
    terminalKey: 'terminal-key',
    project: 'api',
    contextKind: 'worktree',
    context: 'feature/login',
    directory: '~/src/api-feature-login',
    branch: 'feature/login',
    terminalIndex: 2,
    terminalTitle: 'bun run test',
    ...overrides,
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    getSettingsPrefs: vi.fn(async () => ({
      ...defaultSettingsPrefs(),
      lang: 'zh' as const,
      terminalNotificationsEnabled: true,
      gitNetworkProxyEnabled: true,
      gitNetworkProxyUrl: 'socks5://127.0.0.1:1080',
    })),
    getTelegramConfig: vi.fn(async () => ({
      enabled: true,
      botToken: '123456:test-token',
      chatId: '-100123',
      bellEnabled: true,
      outputCompletionEnabled: true,
      includeTerminalOutput: true,
      outputTailLength: 400,
    })),
    sendMessage: vi.fn(
      async (_input: { botToken: string; chatId: string; text: string; proxyUrl?: string }) => ({ ok: true as const }),
    ),
    warn: vi.fn(),
    now: vi.fn(() => 10_000),
    ...overrides,
  }
}

describe('Telegram notification write paths', () => {
  beforeEach(() => resetTelegramNotificationWritePathsForTests())

  test('formats localized worktree context and omits an absent workspace branch', () => {
    expect(formatTelegramBellMessage(context(), 'zh')).toBe(
      [
        '🔔 Hobgoblin 未读终端提醒',
        '项目：api',
        '上下文：工作树 feature/login',
        '目录：~/src/api-feature-login',
        '分支：feature/login',
        '终端：#2',
        '标题：bun run test',
      ].join('\n'),
    )
    expect(
      formatTelegramBellMessage(context({ contextKind: 'workspace', context: 'platform', branch: undefined }), 'en'),
    ).toBe(
      [
        '🔔 Hobgoblin unread terminal bell',
        'Project: api',
        'Context: Workspace platform',
        'Directory: ~/src/api-feature-login',
        'Terminal: #2',
        'Title: bun run test',
      ].join('\n'),
    )
  })

  test('does not send when either authoritative notification switch is off', async () => {
    const masterOff = dependencies({
      getSettingsPrefs: vi.fn(async () => ({
        ...defaultSettingsPrefs(),
        terminalNotificationsEnabled: false,
      })),
    })
    await expect(sendConfiguredTelegramBellNotification(context(), masterOff)).resolves.toEqual({ ok: true })
    expect(masterOff.sendMessage).not.toHaveBeenCalled()

    const telegramOff = dependencies({
      getTelegramConfig: vi.fn(async () => ({ enabled: false, botToken: 'token', chatId: '1' })),
    })
    await expect(sendConfiguredTelegramBellNotification(context(), telegramOff)).resolves.toEqual({ ok: true })
    expect(telegramOff.sendMessage).not.toHaveBeenCalled()
  })

  test('forwards the enabled proxy and only logs a safe failure code', async () => {
    const deps = dependencies({
      sendMessage: vi.fn(async () => ({ ok: false as const, error: { code: 'network-failed' as const } })),
    })

    await expect(sendConfiguredTelegramBellNotification(context(), deps)).resolves.toEqual({
      ok: false,
      error: { code: 'network-failed' },
    })
    expect(deps.sendMessage).toHaveBeenCalledWith({
      botToken: '123456:test-token',
      chatId: '-100123',
      text: expect.stringContaining('项目：api'),
      proxyUrl: 'socks5://127.0.0.1:1080',
    })
    expect(deps.warn).toHaveBeenCalledWith('network-failed')
    expect(JSON.stringify(deps.warn.mock.calls)).not.toContain('test-token')
  })

  test('deduplicates the same terminal across renderers for five seconds', async () => {
    let now = 10_000
    const deps = dependencies({ now: vi.fn(() => now) })

    await sendConfiguredTelegramBellNotification(context(), deps)
    now = 12_000
    await sendConfiguredTelegramBellNotification(context(), deps)
    now = 16_000
    await sendConfiguredTelegramBellNotification(context(), deps)

    expect(deps.sendMessage).toHaveBeenCalledTimes(2)
  })

  test('deduplicates concurrent completion delivery by server session and final sequence', async () => {
    const deps = dependencies()
    const completion: TelegramOutputCompletionNotificationContext = {
      ...context({ outputTail: 'tests passed' }),
      sessionId: 'session-1',
      finalOutputSeq: 42,
    }

    await Promise.all([
      sendConfiguredTelegramOutputCompletionNotification(completion, deps),
      sendConfiguredTelegramOutputCompletionNotification(completion, deps),
    ])
    await sendConfiguredTelegramOutputCompletionNotification({ ...completion, finalOutputSeq: 43 }, deps)

    expect(deps.sendMessage).toHaveBeenCalledTimes(2)
    expect(deps.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('终端运行结束') }),
    )
  })

  test('applies the authoritative output length and rejects payloads above the transport maximum', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => ({
        enabled: true,
        botToken: '123456:test-token',
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        includeTerminalOutput: true,
        outputTailLength: 3,
      })),
    })

    await expect(
      sendConfiguredTelegramBellNotification(context({ outputTail: 'abc🙂de' }), deps),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringMatching(/🙂de$/u) }),
    )
    expect(deps.sendMessage.mock.calls[0]?.[0].text).not.toContain('abc🙂de')

    await expect(
      sendConfiguredTelegramOutputCompletionNotification(
        {
          ...context({ outputTail: 'abc🙂de' }),
          sessionId: 'session-authoritative-limit',
          finalOutputSeq: 1,
        },
        deps,
      ),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage.mock.calls[1]?.[0].text).toMatch(/🙂de$/u)
    expect(deps.sendMessage.mock.calls[1]?.[0].text).not.toContain('abc🙂de')

    await expect(
      sendConfiguredTelegramBellNotification(context({ terminalKey: 'another', outputTail: 'x'.repeat(4097) }), deps),
    ).resolves.toEqual({ ok: false, error: { code: 'invalid-input' } })
  })

  test('normalizes consecutive terminal whitespace before enforcing the configured length', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => ({
        enabled: true,
        botToken: '123456:test-token',
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        includeTerminalOutput: true,
        outputTailLength: 7,
      })),
    })

    await expect(
      sendConfiguredTelegramBellNotification(
        context({ outputTail: `old${' '.repeat(4_096)}\t\r\n new end` }),
        deps,
      ),
    ).resolves.toEqual({ ok: true })

    expect(deps.sendMessage.mock.calls[0]?.[0].text).toMatch(/new end$/u)
  })

  test('fits terminal output into the complete 4096-character Telegram message budget', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => ({
        enabled: true,
        botToken: '123456:test-token',
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        includeTerminalOutput: true,
        outputTailLength: 4096,
      })),
    })

    await sendConfiguredTelegramBellNotification(
      context({
        project: 'p'.repeat(300),
        context: 'c'.repeat(300),
        directory: 'd'.repeat(300),
        branch: 'b'.repeat(300),
        terminalTitle: 't'.repeat(300),
        outputTail: 'z'.repeat(4096),
      }),
      deps,
    )

    const text = deps.sendMessage.mock.calls[0]?.[0].text
    expect(Array.from(text)).toHaveLength(4096)
    expect(text).toMatch(/z+$/u)
  })

  test('accepts the NUL-delimited terminal keys used by live terminal sessions', async () => {
    const deps = dependencies()
    await expect(
      sendConfiguredTelegramBellNotification(context({ terminalKey: '/repo\0/worktree\0terminal-1' }), deps),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage).toHaveBeenCalledTimes(1)
  })

  test('rejects malformed or oversized structured context before sending', async () => {
    const deps = dependencies()
    await expect(sendConfiguredTelegramBellNotification(context({ project: 'x'.repeat(301) }), deps)).resolves.toEqual({
      ok: false,
      error: { code: 'invalid-input' },
    })
    await expect(sendConfiguredTelegramBellNotification(context({ terminalIndex: 0 }), deps)).resolves.toEqual({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(deps.sendMessage).not.toHaveBeenCalled()
  })

  test('sends a localized test message with saved credentials regardless of delivery toggle', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => ({ enabled: false, botToken: 'token', chatId: '@channel_name' })),
    })
    await expect(sendConfiguredTelegramTestNotification({ acceptLanguage: 'zh-CN', ...deps })).resolves.toEqual({
      ok: true,
    })
    expect(deps.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        botToken: 'token',
        chatId: '@channel_name',
        text: expect.stringContaining('Telegram 测试通知'),
      }),
    )
  })

  test('returns configuration-incomplete when saved credentials are unavailable', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => ({ enabled: true, botToken: '', chatId: '' })),
    })
    await expect(sendConfiguredTelegramTestNotification(deps)).resolves.toEqual({
      ok: false,
      error: { code: 'configuration-incomplete' },
    })
  })
})

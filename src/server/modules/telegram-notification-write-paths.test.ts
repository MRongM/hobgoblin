import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsPrefs } from '#/shared/settings-defaults.ts'
import type {
  TelegramBellNotificationContext,
  TelegramOutputCompletionNotificationContext,
} from '#/shared/telegram-notifications.ts'
import {
  formatTelegramBellMessage,
  formatTelegramBellPhotoCaption,
  formatTelegramOutputCompletionMessage,
  formatTelegramPhotoCaption,
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

function completionContext(
  overrides: Partial<TelegramOutputCompletionNotificationContext> = {},
): TelegramOutputCompletionNotificationContext {
  return {
    ...context(),
    sessionId: 'session-1',
    finalOutputSeq: 42,
    activityDurationMs: 10_000,
    ...overrides,
  }
}

function telegramConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    botToken: '123456:test-token',
    chatId: '-100123',
    proxyEnabled: true,
    bellEnabled: true,
    outputCompletionEnabled: true,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: true,
    outputTailLength: 400,
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
    getTelegramConfig: vi.fn(async () => telegramConfig()),
    sendMessage: vi.fn(async (_input: { botToken: string; chatId: string; text: string; proxyUrl?: string }) => ({
      ok: true as const,
    })),
    sendPhoto: vi.fn(
      async (_input: { botToken: string; chatId: string; caption: string; photo: Buffer; proxyUrl?: string }) => ({
        ok: true as const,
      }),
    ),
    warn: vi.fn(),
    now: vi.fn(() => 10_000),
    ...overrides,
  }
}

describe('Telegram notification write paths', () => {
  beforeEach(() => resetTelegramNotificationWritePathsForTests())

  test('formats localized key-value metadata for bells and completion captions', () => {
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
    expect(formatTelegramPhotoCaption(context(), 'zh')).toContain('终端：#2')
    expect(formatTelegramBellPhotoCaption(context(), 'zh')).toMatch(/^🔔 Hobgoblin 未读终端提醒/u)
  })

  test('ignores legacy terminal output characters when formatting Telegram text', () => {
    const legacyContext = {
      ...context({ context: 'api-feature-login', branch: 'feature/login' }),
      outputTail: 'tests passed',
    }

    expect(
      formatTelegramBellMessage(legacyContext, 'zh'),
    ).toBe(
      [
        '🔔 Hobgoblin 未读终端提醒',
        '项目：api',
        '上下文：工作树 api-feature-login',
        '目录：~/src/api-feature-login',
        '分支：feature/login',
        '终端：#2',
        '标题：bun run test',
      ].join('\n'),
    )
  })

  test('bounds photo captions to the Telegram caption limit', () => {
    const caption = formatTelegramPhotoCaption(
      context({
        project: '项'.repeat(300),
        context: '上下文'.repeat(100),
        directory: `/${'目录'.repeat(150)}`,
        branch: '分支'.repeat(150),
        terminalTitle: '终端'.repeat(150),
      }),
      'zh',
    )

    expect(Array.from(caption)).toHaveLength(1_024)
    expect(caption).toMatch(/^\u2705 Hobgoblin 终端暂无新输出/u)
    expect(caption).not.toContain('── 终端输出 ──')
  })

  test('describes idle terminal output without claiming that the process completed', () => {
    expect(formatTelegramOutputCompletionMessage(context(), 'zh').split('\n')[0]).toBe('✅ Hobgoblin 终端暂无新输出')
    expect(formatTelegramOutputCompletionMessage(context(), 'en').split('\n')[0]).toBe(
      '✅ Hobgoblin terminal has no new output',
    )
    expect(formatTelegramOutputCompletionMessage(context(), 'ja').split('\n')[0]).toBe(
      '✅ Hobgoblin ターミナルに新しい出力なし',
    )
    expect(formatTelegramOutputCompletionMessage(context(), 'ko').split('\n')[0]).toBe(
      '✅ Hobgoblin 터미널 새 출력 없음',
    )
  })

  test('sends a bounded terminal screen image for unread bell notifications', async () => {
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const snapshot = {
      sessionId: 'session-bell-photo',
      lines: ['tests passed'],
      columns: 80,
      rows: 24,
      sequence: 42,
    }
    const readTerminalScreenSnapshot = vi.fn(async () => snapshot)
    const renderTerminalScreenImage = vi.fn(async () => photo)
    const deps = dependencies({ readTerminalScreenSnapshot, renderTerminalScreenImage })

    await expect(
      sendConfiguredTelegramBellNotification(
        context({ terminalKey: 'bell-photo', sessionId: 'session-bell-photo' }),
        deps,
      ),
    ).resolves.toEqual({ ok: true })

    expect(readTerminalScreenSnapshot).toHaveBeenCalledWith({
      sessionId: 'session-bell-photo',
      maxColumns: 140,
      maxRows: 40,
    })
    expect(renderTerminalScreenImage).toHaveBeenCalledWith(snapshot)
    expect(deps.sendPhoto).toHaveBeenCalledWith({
      botToken: '123456:test-token',
      chatId: '-100123',
      caption: expect.stringContaining('未读终端提醒'),
      photo,
      proxyUrl: 'socks5://127.0.0.1:1080',
    })
    expect(deps.sendMessage).not.toHaveBeenCalled()
  })

  test('sends a bounded terminal screen image for completion notifications', async () => {
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const snapshot = {
      sessionId: 'session-photo',
      lines: ['tests passed'],
      columns: 80,
      rows: 24,
      sequence: 42,
    }
    const readTerminalScreenSnapshot = vi.fn(async () => snapshot)
    const renderTerminalScreenImage = vi.fn(async () => photo)
    const deps = dependencies({ readTerminalScreenSnapshot, renderTerminalScreenImage })

    await expect(
      sendConfiguredTelegramOutputCompletionNotification(
        completionContext({ terminalKey: 'completion-photo', sessionId: 'session-photo' }),
        deps,
      ),
    ).resolves.toEqual({ ok: true })

    expect(readTerminalScreenSnapshot).toHaveBeenCalledWith({
      sessionId: 'session-photo',
      maxColumns: 140,
      maxRows: 40,
    })
    expect(renderTerminalScreenImage).toHaveBeenCalledWith(snapshot)
    expect(deps.sendPhoto).toHaveBeenCalledWith({
      botToken: '123456:test-token',
      chatId: '-100123',
      caption: expect.stringContaining('终端暂无新输出'),
      photo,
      proxyUrl: 'socks5://127.0.0.1:1080',
    })
    expect(deps.sendMessage).not.toHaveBeenCalled()
  })

  test('does not read or render a terminal screen when output inclusion is disabled', async () => {
    const readTerminalScreenSnapshot = vi.fn()
    const renderTerminalScreenImage = vi.fn()
    const deps = dependencies({
      readTerminalScreenSnapshot,
      renderTerminalScreenImage,
      getTelegramConfig: vi.fn(async () => telegramConfig({ includeTerminalOutput: false })),
    })

    await sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-no-photo', sessionId: 'session-no-photo' }),
      deps,
    )
    await sendConfiguredTelegramBellNotification(
      context({ terminalKey: 'bell-no-photo', sessionId: 'session-bell-no-photo' }),
      deps,
    )

    expect(readTerminalScreenSnapshot).not.toHaveBeenCalled()
    expect(renderTerminalScreenImage).not.toHaveBeenCalled()
    expect(deps.sendPhoto).not.toHaveBeenCalled()
    expect(deps.sendMessage).toHaveBeenCalledTimes(2)
  })

  test('falls back to metadata only when terminal screen rendering fails', async () => {
    const readTerminalScreenSnapshot = vi.fn(async () => ({
      sessionId: 'session-render-failure',
      lines: ['tests passed'],
      columns: 80,
      rows: 24,
      sequence: 42,
    }))
    const renderTerminalScreenImage = vi.fn(async () => {
      throw new Error('render failed')
    })
    const deps = dependencies({ readTerminalScreenSnapshot, renderTerminalScreenImage })

    await sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-render-failure', sessionId: 'session-render-failure' }),
      deps,
    )
    await sendConfiguredTelegramBellNotification(
      context({ terminalKey: 'bell-render-failure', sessionId: 'session-bell-render-failure' }),
      deps,
    )

    expect(deps.sendPhoto).not.toHaveBeenCalled()
    expect(deps.sendMessage).toHaveBeenCalledTimes(2)
    expect(deps.sendMessage.mock.calls.map((call) => call[0].text)).toEqual([
      expect.stringContaining('终端暂无新输出'),
      expect.stringContaining('未读终端提醒'),
    ])
  })

  test('does not retry an ambiguous photo delivery as text', async () => {
    const deps = dependencies({
      readTerminalScreenSnapshot: vi.fn(async () => ({
        sessionId: 'session-photo-failure',
        lines: ['tests passed'],
        columns: 80,
        rows: 24,
        sequence: 42,
      })),
      renderTerminalScreenImage: vi.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
      sendPhoto: vi.fn(async () => ({ ok: false as const, error: { code: 'network-failed' as const } })),
    })

    await expect(
      sendConfiguredTelegramOutputCompletionNotification(
        completionContext({ terminalKey: 'completion-photo-failure', sessionId: 'session-photo-failure' }),
        deps,
      ),
    ).resolves.toEqual({ ok: false, error: { code: 'network-failed' } })

    expect(deps.sendMessage).not.toHaveBeenCalled()
    expect(deps.warn).toHaveBeenCalledWith('network-failed')
  })

  test('serializes terminal screen rendering and photo delivery across notification types', async () => {
    let releaseFirstRender: (() => void) | undefined
    const firstRenderGate = new Promise<void>((resolve) => {
      releaseFirstRender = resolve
    })
    let renderCount = 0
    const renderTerminalScreenImage = vi.fn(async () => {
      renderCount += 1
      if (renderCount === 1) await firstRenderGate
      return Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    })
    const deps = dependencies({
      readTerminalScreenSnapshot: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
        sessionId,
        lines: ['tests passed'],
        columns: 80,
        rows: 24,
        sequence: 42,
      })),
      renderTerminalScreenImage,
    })

    const first = sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-queue-1', sessionId: 'session-queue-1' }),
      deps,
    )
    const second = sendConfiguredTelegramBellNotification(
      context({ terminalKey: 'bell-queue-2', sessionId: 'session-queue-2' }),
      deps,
    )

    await vi.waitFor(() => expect(renderTerminalScreenImage).toHaveBeenCalledTimes(1))
    expect(deps.sendPhoto).not.toHaveBeenCalled()
    releaseFirstRender?.()
    await Promise.all([first, second])

    expect(renderTerminalScreenImage).toHaveBeenCalledTimes(2)
    expect(deps.sendPhoto).toHaveBeenCalledTimes(2)
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

  test('connects directly when the Telegram proxy preference is off', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => telegramConfig({ proxyEnabled: false })),
    })

    await expect(sendConfiguredTelegramBellNotification(context(), deps)).resolves.toEqual({ ok: true })
    expect(deps.sendMessage).toHaveBeenCalledWith({
      botToken: '123456:test-token',
      chatId: '-100123',
      text: expect.stringContaining('项目：api'),
    })
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
      ...context(),
      sessionId: 'session-1',
      finalOutputSeq: 42,
      activityDurationMs: 10_000,
    }

    await Promise.all([
      sendConfiguredTelegramOutputCompletionNotification(completion, deps),
      sendConfiguredTelegramOutputCompletionNotification(completion, deps),
    ])
    await sendConfiguredTelegramOutputCompletionNotification({ ...completion, finalOutputSeq: 43 }, deps)

    expect(deps.sendMessage).toHaveBeenCalledTimes(2)
    expect(deps.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('终端暂无新输出') }),
    )
  })

  test('gates completion duration before claiming the idempotency key', async () => {
    const deps = dependencies()

    await expect(
      sendConfiguredTelegramOutputCompletionNotification(completionContext({ activityDurationMs: 9_999 }), deps),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage).not.toHaveBeenCalled()

    await expect(
      sendConfiguredTelegramOutputCompletionNotification(completionContext({ activityDurationMs: 10_000 }), deps),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage).toHaveBeenCalledTimes(1)
  })

  test.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid activity duration %p',
    async (activityDurationMs) => {
      const deps = dependencies()
      await expect(
        sendConfiguredTelegramOutputCompletionNotification(completionContext({ activityDurationMs }), deps),
      ).resolves.toEqual({ ok: false, error: { code: 'invalid-input' } })
      expect(deps.sendMessage).not.toHaveBeenCalled()
    },
  )

  test('does not apply the completion duration threshold to Telegram bells', async () => {
    const deps = dependencies({
      getTelegramConfig: vi.fn(async () => telegramConfig({ outputCompletionMinimumActivitySeconds: 3_600 })),
    })

    await sendConfiguredTelegramBellNotification(context({ terminalKey: 'bell-not-duration-gated' }), deps)

    expect(deps.sendMessage).toHaveBeenCalledTimes(1)
  })

  test('ignores renderer-supplied terminal output characters for bell and completion text', async () => {
    const readTerminalScreenSnapshot = vi.fn(async () => null)
    const deps = dependencies({ readTerminalScreenSnapshot })
    const maliciousBell = {
      ...context({ terminalKey: 'bell-with-screen' }),
      sessionId: 'session-bell',
      outputTail: 'renderer supplied text',
    } as unknown as TelegramBellNotificationContext

    await sendConfiguredTelegramBellNotification(maliciousBell, deps)
    await sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-with-screen', sessionId: 'session-completion' }),
      deps,
    )

    for (const call of deps.sendMessage.mock.calls) {
      expect(call[0].text).not.toContain('renderer supplied text')
      expect(call[0].text).toContain('项目：api')
    }
  })

  test('falls back to metadata when the terminal screen is unavailable', async () => {
    const deps = dependencies()

    await sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-missing-screen', sessionId: 'missing-session' }),
      deps,
    )

    expect(deps.sendMessage).toHaveBeenCalledTimes(1)
    expect(deps.sendMessage.mock.calls[0]?.[0].text).toContain('项目：api')
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

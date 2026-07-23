import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultSettingsPrefs } from '#/shared/settings-defaults.ts'
import type {
  TelegramBellNotificationContext,
  TelegramOutputCompletionNotificationContext,
} from '#/shared/telegram-notifications.ts'
import {
  formatTelegramBellMessage,
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

  test('formats a compact summary and omits a branch duplicated by the context', () => {
    expect(formatTelegramBellMessage(context(), 'zh')).toBe(
      [
        '🔔 Hobgoblin 未读终端提醒',
        '',
        'api · 工作树 feature/login · #2',
        '🖥 bun run test',
        '📁 ~/src/api-feature-login',
      ].join('\n'),
    )
    expect(
      formatTelegramBellMessage(context({ contextKind: 'workspace', context: 'platform', branch: undefined }), 'en'),
    ).toBe(
      [
        '🔔 Hobgoblin unread terminal bell',
        '',
        'api · Workspace platform · #2',
        '🖥 bun run test',
        '📁 ~/src/api-feature-login',
      ].join('\n'),
    )
  })

  test('keeps a distinct branch and appends terminal output without a separator title', () => {
    expect(
      formatTelegramBellMessage(
        {
          ...context({ context: 'api-feature-login', branch: 'feature/login' }),
          outputTail: 'tests passed',
        },
        'zh',
      ),
    ).toBe(
      [
        '🔔 Hobgoblin 未读终端提醒',
        '',
        'api · 工作树 api-feature-login · #2',
        '🖥 bun run test',
        '📁 ~/src/api-feature-login',
        '🌿 feature/login',
        '',
        'tests passed',
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
    const readTerminalOutputExcerpt = vi.fn()
    const deps = dependencies({ readTerminalScreenSnapshot, renderTerminalScreenImage, readTerminalOutputExcerpt })

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
    expect(readTerminalOutputExcerpt).not.toHaveBeenCalled()
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

    expect(readTerminalScreenSnapshot).not.toHaveBeenCalled()
    expect(renderTerminalScreenImage).not.toHaveBeenCalled()
    expect(deps.sendPhoto).not.toHaveBeenCalled()
    expect(deps.sendMessage).toHaveBeenCalledTimes(1)
  })

  test('falls back to the text excerpt when terminal screen rendering fails', async () => {
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
    const readTerminalOutputExcerpt = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      sessionId,
      output: 'text fallback',
      sequence: 42,
    }))
    const deps = dependencies({ readTerminalScreenSnapshot, renderTerminalScreenImage, readTerminalOutputExcerpt })

    await sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-render-failure', sessionId: 'session-render-failure' }),
      deps,
    )

    expect(deps.sendPhoto).not.toHaveBeenCalled()
    expect(deps.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringMatching(/\n\ntext fallback$/u) }),
    )
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

  test('serializes terminal screen rendering and photo delivery', async () => {
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
    const second = sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-queue-2', sessionId: 'session-queue-2', finalOutputSeq: 43 }),
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
      text: expect.stringContaining('api · 工作树 feature/login · #2'),
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

  test('uses the canonical server screen for bell and completion excerpts', async () => {
    const readTerminalOutputExcerpt = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      sessionId,
      output: 'build passed [hobgoblin0:node* "done workspace"]',
      sequence: 42,
    }))
    const deps = dependencies({ readTerminalOutputExcerpt })
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

    expect(readTerminalOutputExcerpt).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-bell',
      maxCharacters: 400,
    })
    expect(readTerminalOutputExcerpt).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-completion',
      maxCharacters: 400,
    })
    for (const call of deps.sendMessage.mock.calls) {
      expect(call[0].text).toContain('build passed [hobgoblin0:node* "done workspace"]')
      expect(call[0].text).not.toContain('renderer supplied text')
    }
  })

  test('does not read terminal text when output inclusion is disabled', async () => {
    const readTerminalOutputExcerpt = vi.fn()
    const deps = dependencies({
      readTerminalOutputExcerpt,
      getTelegramConfig: vi.fn(async () => telegramConfig({ includeTerminalOutput: false })),
    })

    await sendConfiguredTelegramBellNotification(
      {
        ...context({ terminalKey: 'bell-without-output' }),
        sessionId: 'session-bell',
      } as TelegramBellNotificationContext,
      deps,
    )

    expect(readTerminalOutputExcerpt).not.toHaveBeenCalled()
    expect(deps.sendMessage.mock.calls[0]?.[0].text).not.toContain('── 终端输出 ──')
  })

  test('falls back to metadata when the terminal screen is unavailable', async () => {
    const readTerminalOutputExcerpt = vi.fn(async () => null)
    const deps = dependencies({ readTerminalOutputExcerpt })

    await sendConfiguredTelegramOutputCompletionNotification(
      completionContext({ terminalKey: 'completion-missing-screen', sessionId: 'missing-session' }),
      deps,
    )

    expect(readTerminalOutputExcerpt).toHaveBeenCalledTimes(1)
    expect(deps.sendMessage).toHaveBeenCalledTimes(1)
    expect(deps.sendMessage.mock.calls[0]?.[0].text).not.toContain('── 终端输出 ──')
  })

  test('applies the authoritative output length and ignores legacy Renderer output payloads', async () => {
    const deps = dependencies({
      readTerminalOutputExcerpt: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
        sessionId,
        output: 'abc🙂de',
        sequence: 1,
      })),
      getTelegramConfig: vi.fn(async () => ({
        enabled: true,
        botToken: '123456:test-token',
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        outputCompletionMinimumActivitySeconds: 10,
        includeTerminalOutput: true,
        outputTailLength: 3,
      })),
    })

    await expect(
      sendConfiguredTelegramBellNotification(context({ sessionId: 'session-bell-limit' }), deps),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringMatching(/🙂de$/u) }))
    expect(deps.sendMessage.mock.calls[0]?.[0].text).not.toContain('abc🙂de')

    await expect(
      sendConfiguredTelegramOutputCompletionNotification(
        {
          ...context(),
          sessionId: 'session-authoritative-limit',
          finalOutputSeq: 1,
          activityDurationMs: 10_000,
        },
        deps,
      ),
    ).resolves.toEqual({ ok: true })
    expect(deps.sendMessage.mock.calls[1]?.[0].text).toMatch(/🙂de$/u)
    expect(deps.sendMessage.mock.calls[1]?.[0].text).not.toContain('abc🙂de')

    await expect(
      sendConfiguredTelegramBellNotification(
        {
          ...context({ terminalKey: 'another' }),
          outputTail: 'x'.repeat(4097),
        } as unknown as TelegramBellNotificationContext,
        deps,
      ),
    ).resolves.toEqual({ ok: true })
  })

  test('normalizes consecutive terminal whitespace before enforcing the configured length', async () => {
    const deps = dependencies({
      readTerminalOutputExcerpt: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
        sessionId,
        output: `old${' '.repeat(4_096)}\t\r\n new end`,
        sequence: 1,
      })),
      getTelegramConfig: vi.fn(async () => ({
        enabled: true,
        botToken: '123456:test-token',
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        outputCompletionMinimumActivitySeconds: 10,
        includeTerminalOutput: true,
        outputTailLength: 7,
      })),
    })

    await expect(
      sendConfiguredTelegramBellNotification(context({ sessionId: 'session-whitespace' }), deps),
    ).resolves.toEqual({ ok: true })

    expect(deps.sendMessage.mock.calls[0]?.[0].text).toMatch(/new end$/u)
  })

  test('preserves native visible terminal text without redaction', async () => {
    const outputTail = 'token=example-token\turl=https://example.test/path\nuser@example.test <raw>&value'
    const deps = dependencies({
      readTerminalOutputExcerpt: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
        sessionId,
        output: outputTail,
        sequence: 1,
      })),
    })

    await expect(
      sendConfiguredTelegramBellNotification(
        context({ terminalKey: 'native-text', sessionId: 'session-native-text' }),
        deps,
      ),
    ).resolves.toEqual({ ok: true })

    expect(deps.sendMessage.mock.calls[0]?.[0].text).toContain(
      'token=example-token url=https://example.test/path user@example.test <raw>&value',
    )
  })

  test('fits terminal output into the complete 4096-character Telegram message budget', async () => {
    const deps = dependencies({
      readTerminalOutputExcerpt: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
        sessionId,
        output: 'z'.repeat(4096),
        sequence: 1,
      })),
      getTelegramConfig: vi.fn(async () => ({
        enabled: true,
        botToken: '123456:test-token',
        chatId: '-100123',
        bellEnabled: true,
        outputCompletionEnabled: true,
        outputCompletionMinimumActivitySeconds: 10,
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
        sessionId: 'session-message-budget',
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

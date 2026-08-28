import { describe, expect, test, vi } from 'vitest'
import { runTelegramTerminalInputReceiverEpoch } from '#/server/modules/telegram-terminal-input-polling.ts'

const NOW_SECONDS = 2_000_000_000

function config() {
  return {
    enabled: true,
    terminalInputEnabled: true,
    botToken: '123456:test-token',
    chatId: '-100123',
    proxyUrl: 'http://127.0.0.1:7890',
    terminalInputAllowedUserIds: ['123'],
    terminalInputPollingTimeoutSeconds: 25,
    lang: 'zh' as const,
  }
}

function update(updateId: number, text = '@hobgoblin_bot continue') {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 100,
      date: NOW_SECONDS,
      chat: { id: -100123, type: 'supergroup' },
      from: { id: 123, is_bot: false },
      text,
      entities: [{ type: 'mention', offset: 0, length: 14 }],
    },
  }
}

function success<T>(result: T) {
  return { ok: true as const, result }
}

describe('runTelegramTerminalInputReceiverEpoch', () => {
  test('discards startup backlog, claims ordered updates once, and stops on authentication failure', async () => {
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce(success([update(10, '@hobgoblin_bot old')]))
      .mockResolvedValueOnce(success([]))
      .mockResolvedValueOnce(
        success([
          update(12, '@hobgoblin_bot second'),
          { update_id: 11, message: { message_id: 111, date: NOW_SECONDS, chat: { id: -999, type: 'group' } } },
          update(12, '@hobgoblin_bot duplicate'),
        ]),
      )
      .mockResolvedValueOnce({ ok: false, error: { code: 'authentication-failed' } })
    const submitTerminalInput = vi.fn().mockResolvedValue({ ok: true, terminal: { index: 2 } })
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    const statuses: unknown[] = []

    await runTelegramTerminalInputReceiverEpoch(config(), {
      getBotIdentity: vi.fn().mockResolvedValue(success({ id: 1, username: 'hobgoblin_bot' })),
      getWebhookInfo: vi.fn().mockResolvedValue(success({ url: '' })),
      getChat: vi.fn().mockResolvedValue(success({ id: '-100123', type: 'supergroup' })),
      getUpdates,
      sendMessage,
      submitTerminalInput,
      nowSeconds: () => NOW_SECONDS,
      onStatusChange: (status) => statuses.push(status),
    })

    expect(getUpdates.mock.calls.map(([input]) => input.offset)).toEqual([undefined, 11, 11, 13])
    expect(getUpdates.mock.calls.map(([input]) => input.timeoutSeconds)).toEqual([0, 0, 25, 25])
    expect(submitTerminalInput).toHaveBeenCalledTimes(1)
    expect(submitTerminalInput).toHaveBeenCalledWith('second')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '-100123',
        replyToMessageId: 112,
        text: expect.stringContaining('#2'),
      }),
    )
    expect(statuses).toEqual([
      { status: 'starting' },
      { status: 'running', botUsername: 'hobgoblin_bot' },
      { status: 'error', errorCode: 'authentication-failed' },
    ])
  })

  test('stops on a webhook conflict without deleting it or polling', async () => {
    const getUpdates = vi.fn()
    const statuses: unknown[] = []

    await runTelegramTerminalInputReceiverEpoch(config(), {
      getBotIdentity: vi.fn().mockResolvedValue(success({ id: 1, username: 'hobgoblin_bot' })),
      getWebhookInfo: vi.fn().mockResolvedValue(success({ url: 'https://example.test/hook' })),
      getChat: vi.fn(),
      getUpdates,
      sendMessage: vi.fn(),
      submitTerminalInput: vi.fn(),
      onStatusChange: (status) => statuses.push(status),
    })

    expect(getUpdates).not.toHaveBeenCalled()
    expect(statuses).toEqual([{ status: 'starting' }, { status: 'error', errorCode: 'webhook-conflict' }])
  })

  test('retries a network failure with system-owned exponential delay and retains the offset', async () => {
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce(success([]))
      .mockResolvedValueOnce({ ok: false, error: { code: 'network-failed' } })
      .mockResolvedValueOnce(success([update(20)]))
      .mockResolvedValueOnce({ ok: false, error: { code: 'authentication-failed' } })
    const sleep = vi.fn().mockResolvedValue(undefined)
    const submitTerminalInput = vi.fn().mockResolvedValue({ ok: false, code: 'no-target' })
    const statuses: unknown[] = []

    await runTelegramTerminalInputReceiverEpoch(config(), {
      getBotIdentity: vi.fn().mockResolvedValue(success({ id: 1, username: 'hobgoblin_bot' })),
      getWebhookInfo: vi.fn().mockResolvedValue(success({ url: '' })),
      getChat: vi.fn().mockResolvedValue(success({ id: '-100123', type: 'group' })),
      getUpdates,
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      submitTerminalInput,
      sleep,
      random: () => 0.5,
      nowSeconds: () => NOW_SECONDS,
      onStatusChange: (status) => statuses.push(status),
    })

    expect(sleep).toHaveBeenCalledWith(1_000, expect.any(AbortSignal))
    expect(getUpdates.mock.calls.map(([input]) => input.offset)).toEqual([undefined, undefined, undefined, 21])
    expect(statuses).toContainEqual({ status: 'retrying', errorCode: 'network-failed', botUsername: 'hobgoblin_bot' })
    expect(submitTerminalInput).toHaveBeenCalledTimes(1)
  })

  test('retries temporary initialization failures before polling', async () => {
    const getBotIdentity = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'network-failed' } })
      .mockResolvedValueOnce(success({ id: 1, username: 'hobgoblin_bot' }))
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce(success([]))
      .mockResolvedValueOnce({ ok: false, error: { code: 'authentication-failed' } })
    const sleep = vi.fn().mockResolvedValue(undefined)
    const statuses: unknown[] = []

    await runTelegramTerminalInputReceiverEpoch(config(), {
      getBotIdentity,
      getWebhookInfo: vi.fn().mockResolvedValue(success({ url: '' })),
      getChat: vi.fn().mockResolvedValue(success({ id: '-100123', type: 'group' })),
      getUpdates,
      sendMessage: vi.fn(),
      submitTerminalInput: vi.fn(),
      sleep,
      random: () => 0.5,
      onStatusChange: (status) => statuses.push(status),
    })

    expect(getBotIdentity).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1_000, expect.any(AbortSignal))
    expect(statuses).toContainEqual({ status: 'retrying', errorCode: 'network-failed' })
    expect(statuses.at(-1)).toEqual({ status: 'error', errorCode: 'authentication-failed' })
  })

  test('respects Telegram retry_after and cancellation during a pending retry', async () => {
    const controller = new AbortController()
    const getBotIdentity = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'rate-limited', retryAfterSeconds: 8 },
    })
    const sleep = vi.fn(async (_milliseconds: number, _signal: AbortSignal) => {
      controller.abort()
    })

    await runTelegramTerminalInputReceiverEpoch(
      config(),
      {
        getBotIdentity,
        getWebhookInfo: vi.fn(),
        getChat: vi.fn(),
        getUpdates: vi.fn(),
        sendMessage: vi.fn(),
        submitTerminalInput: vi.fn(),
        sleep,
      },
      controller.signal,
    )

    expect(getBotIdentity).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(8_000, controller.signal)
  })
})

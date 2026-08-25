import { describe, expect, test, vi } from 'vitest'
import { createServerSettingsState } from '#/server/modules/settings-state.ts'
import { createTelegramTerminalInputRuntime } from '#/server/modules/telegram-terminal-input-runtime.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'

function telegramConfig() {
  return {
    enabled: true,
    terminalInputEnabled: true,
    botToken: '123456:test-token',
    botTokenConfigured: true,
    chatId: '-100123',
    proxyEnabled: true,
    bellEnabled: false,
    outputCompletionEnabled: false,
    outputCompletionMinimumActivitySeconds: 10,
    includeTerminalOutput: false,
    outputTailLength: 400,
    terminalInputAllowedUserIds: ['123'],
    terminalInputPollingTimeoutSeconds: 25,
    terminalInputRuntime: { status: 'stopped' as const },
  }
}

describe('Telegram terminal input server runtime', () => {
  test('keeps one receiver epoch, restarts changed config, and stops immediately when disabled', async () => {
    let config = telegramConfig()
    const runReceiverEpoch = vi.fn(async (_config, dependencies, signal: AbortSignal) => {
      dependencies.onStatusChange?.({ status: 'starting' })
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    })
    const submitTelegramInput = vi.fn(async () => ({ ok: true as const, terminal: { index: 1 } }))
    const settingsState = createServerSettingsState()
    const publishInvalidation = vi.fn()
    const runtime = createTelegramTerminalInputRuntime({
      terminalHost: { submitTelegramInput } as unknown as ServerTerminalHost,
      settingsState,
      getTelegramConfig: async () => config,
      getSettingsPrefs: async () => ({ gitNetworkProxyUrl: 'http://127.0.0.1:7890', lang: 'zh' }),
      runReceiverEpoch,
      publishInvalidation,
    })

    await runtime.reconcile()
    expect(runReceiverEpoch).toHaveBeenCalledTimes(1)
    expect(runReceiverEpoch.mock.calls[0]?.[0]).toMatchObject({ proxyUrl: 'http://127.0.0.1:7890', lang: 'zh' })
    await runReceiverEpoch.mock.calls[0]?.[1].submitTerminalInput('continue')
    expect(submitTelegramInput).toHaveBeenCalledWith('continue')
    expect(settingsState.telegramTerminalInputRuntime).toEqual({ status: 'starting' })

    await runtime.reconcile()
    expect(runReceiverEpoch).toHaveBeenCalledTimes(1)

    config = { ...config, terminalInputPollingTimeoutSeconds: 30 }
    await runtime.reconcile()
    expect(runReceiverEpoch).toHaveBeenCalledTimes(2)
    expect(runReceiverEpoch.mock.calls[0]?.[2].aborted).toBe(true)

    config = { ...config, enabled: false }
    await runtime.reconcile()
    expect(runReceiverEpoch.mock.calls[1]?.[2].aborted).toBe(true)
    expect(settingsState.telegramTerminalInputRuntime).toEqual({ status: 'stopped' })
    expect(publishInvalidation).toHaveBeenCalledWith(['settings-snapshot'])

    runtime.shutdown()
  })
})

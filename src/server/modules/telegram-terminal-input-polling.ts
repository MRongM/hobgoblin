import {
  getTelegramBotIdentity,
  getTelegramChat,
  getTelegramUpdates,
  getTelegramWebhookInfo,
  sendTelegramMessage,
  type TelegramBotApiErrorCode,
  type TelegramBotApiResult,
} from '#/server/modules/telegram-bot-api-source.ts'
import {
  parseTelegramTerminalInputUpdate,
  type TelegramTerminalInputParseResult,
  type TelegramTerminalInputRuntimeSnapshot,
  type TelegramTerminalInputSubmissionResult,
} from '#/shared/telegram-terminal-input.ts'
import { DICTS } from '#/shared/i18n/dictionaries.ts'
import type { Lang } from '#/shared/settings.ts'

export interface TelegramTerminalInputReceiverConfig {
  enabled: boolean
  terminalInputEnabled: boolean
  botToken: string
  chatId: string
  proxyUrl?: string
  terminalInputAllowedUserIds: string[]
  terminalInputPollingTimeoutSeconds: number
  lang: Lang
}

type GetUpdates = typeof getTelegramUpdates
type SendMessage = typeof sendTelegramMessage

export interface TelegramTerminalInputReceiverDependencies {
  getBotIdentity?: typeof getTelegramBotIdentity
  getWebhookInfo?: typeof getTelegramWebhookInfo
  getChat?: typeof getTelegramChat
  getUpdates?: GetUpdates
  sendMessage?: SendMessage
  submitTerminalInput: (text: string) => Promise<TelegramTerminalInputSubmissionResult>
  onStatusChange?: (status: TelegramTerminalInputRuntimeSnapshot) => void
  nowSeconds?: () => number
  random?: () => number
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  warn?: (code: string) => void
}

type ReceiverDependencies = Required<
  Pick<
    TelegramTerminalInputReceiverDependencies,
    | 'getBotIdentity'
    | 'getWebhookInfo'
    | 'getChat'
    | 'getUpdates'
    | 'sendMessage'
    | 'onStatusChange'
    | 'nowSeconds'
    | 'random'
    | 'sleep'
    | 'warn'
  >
> &
  Pick<TelegramTerminalInputReceiverDependencies, 'submitTerminalInput'>

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(finish, milliseconds)
    const onAbort = (): void => finish()
    function finish(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function receiverDependencies(options: TelegramTerminalInputReceiverDependencies): ReceiverDependencies {
  let lastStatusKey = ''
  const publishStatus = options.onStatusChange ?? (() => undefined)
  return {
    getBotIdentity: options.getBotIdentity ?? getTelegramBotIdentity,
    getWebhookInfo: options.getWebhookInfo ?? getTelegramWebhookInfo,
    getChat: options.getChat ?? getTelegramChat,
    getUpdates: options.getUpdates ?? getTelegramUpdates,
    sendMessage: options.sendMessage ?? sendTelegramMessage,
    submitTerminalInput: options.submitTerminalInput,
    onStatusChange(status) {
      const key = JSON.stringify(status)
      if (key === lastStatusKey) return
      lastStatusKey = key
      publishStatus(status)
    },
    nowSeconds: options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000)),
    random: options.random ?? Math.random,
    sleep: options.sleep ?? abortableSleep,
    warn: options.warn ?? (() => undefined),
  }
}

function updateId(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as { update_id?: unknown }).update_id
  return typeof id === 'number' && Number.isSafeInteger(id) && id >= 0 ? id : null
}

function sortedUpdates(values: unknown[]): unknown[] {
  return values
    .map((value) => ({ value, id: updateId(value) }))
    .filter((item): item is { value: unknown; id: number } => item.id !== null)
    .sort((left, right) => left.id - right.id)
    .map((item) => item.value)
}

function runtimeErrorCode(code: TelegramBotApiErrorCode): TelegramTerminalInputRuntimeSnapshot['errorCode'] {
  if (code === 'authentication-failed') return 'authentication-failed'
  if (code === 'network-failed' || code === 'rate-limited') return 'network-failed'
  return 'telegram-rejected'
}

function outcomeText(
  lang: Lang,
  parsed: Exclude<TelegramTerminalInputParseResult, { kind: 'ignored' }>,
  result?: TelegramTerminalInputSubmissionResult,
): string {
  const dict = DICTS[lang]
  if (parsed.kind === 'rejected') {
    if (parsed.reason === 'unauthorized-sender') return dict['telegram.terminal-input.reply.unauthorized']
    if (parsed.reason === 'expired') return dict['telegram.terminal-input.reply.expired']
    return dict['telegram.terminal-input.reply.invalid']
  }
  if (!result || (!result.ok && result.code === 'write-failed')) {
    return dict['telegram.terminal-input.reply.write-failed']
  }
  if (!result.ok && result.code === 'no-target') return dict['telegram.terminal-input.reply.no-target']
  if (!result.ok) return dict['telegram.terminal-input.reply.target-lost']
  return `${dict['telegram.terminal-input.reply.success']} #${result.terminal.index}.`
}

async function sendOutcomeReply(
  config: TelegramTerminalInputReceiverConfig,
  parsed: Exclude<TelegramTerminalInputParseResult, { kind: 'ignored' }>,
  result: TelegramTerminalInputSubmissionResult | undefined,
  dependencies: ReceiverDependencies,
  signal: AbortSignal,
): Promise<void> {
  const reply = await dependencies.sendMessage({
    botToken: config.botToken,
    chatId: parsed.chatId,
    text: outcomeText(config.lang, parsed, result),
    replyToMessageId: parsed.messageId,
    ...(parsed.messageThreadId === undefined ? {} : { messageThreadId: parsed.messageThreadId }),
    ...(config.proxyUrl ? { proxyUrl: config.proxyUrl } : {}),
    signal,
  })
  if (!reply.ok && !signal.aborted) dependencies.warn(reply.error.code)
}

function retryDelayMilliseconds(attempt: number, random: () => number): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
  return Math.round(base * (0.75 + random() * 0.5))
}

async function pollWithRetry(
  input: Parameters<GetUpdates>[0],
  dependencies: ReceiverDependencies,
  signal: AbortSignal,
  botUsername?: string,
): Promise<TelegramBotApiResult<unknown[]> | null> {
  return await requestWithRetry(() => dependencies.getUpdates({ ...input, signal }), dependencies, signal, botUsername)
}

async function requestWithRetry<T>(
  request: () => Promise<TelegramBotApiResult<T>>,
  dependencies: ReceiverDependencies,
  signal: AbortSignal,
  botUsername?: string,
): Promise<TelegramBotApiResult<T> | null> {
  let attempt = 0
  while (!signal.aborted) {
    const result = await request()
    if (signal.aborted) return null
    if (result.ok) return result
    if (result.error.code !== 'network-failed' && result.error.code !== 'rate-limited') return result
    dependencies.onStatusChange({
      status: 'retrying',
      errorCode: 'network-failed',
      ...(botUsername ? { botUsername } : {}),
    })
    const delay =
      result.error.code === 'rate-limited' && result.error.retryAfterSeconds
        ? result.error.retryAfterSeconds * 1_000
        : retryDelayMilliseconds(attempt, dependencies.random)
    attempt += 1
    await dependencies.sleep(delay, signal)
  }
  return null
}

function failStatus(
  result: Exclude<TelegramBotApiResult<unknown>, { ok: true }>,
  dependencies: ReceiverDependencies,
): void {
  dependencies.onStatusChange({ status: 'error', errorCode: runtimeErrorCode(result.error.code) })
}

export async function runTelegramTerminalInputReceiverEpoch(
  config: TelegramTerminalInputReceiverConfig,
  options: TelegramTerminalInputReceiverDependencies,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  const dependencies = receiverDependencies(options)
  if (
    !config.enabled ||
    !config.terminalInputEnabled ||
    !config.botToken ||
    !config.chatId ||
    config.terminalInputAllowedUserIds.length === 0
  ) {
    dependencies.onStatusChange({ status: 'error', errorCode: 'configuration-incomplete' })
    return
  }

  dependencies.onStatusChange({ status: 'starting' })
  const common = {
    botToken: config.botToken,
    ...(config.proxyUrl ? { proxyUrl: config.proxyUrl } : {}),
    signal,
  }
  const identity = await requestWithRetry(() => dependencies.getBotIdentity(common), dependencies, signal)
  if (!identity) return
  if (!identity.ok) {
    failStatus(identity, dependencies)
    return
  }
  const webhook = await requestWithRetry(
    () => dependencies.getWebhookInfo(common),
    dependencies,
    signal,
    identity.result.username,
  )
  if (!webhook) return
  if (!webhook.ok) {
    failStatus(webhook, dependencies)
    return
  }
  if (webhook.result.url) {
    dependencies.onStatusChange({ status: 'error', errorCode: 'webhook-conflict' })
    return
  }
  const chat = await requestWithRetry(
    () => dependencies.getChat({ ...common, chatId: config.chatId }),
    dependencies,
    signal,
    identity.result.username,
  )
  if (!chat) return
  if (!chat.ok) {
    const errorCode = chat.error.code === 'authentication-failed' ? 'authentication-failed' : 'invalid-chat'
    dependencies.onStatusChange({ status: 'error', errorCode })
    return
  }
  if (chat.result.id !== config.chatId || (chat.result.type !== 'group' && chat.result.type !== 'supergroup')) {
    dependencies.onStatusChange({ status: 'error', errorCode: 'invalid-chat' })
    return
  }

  let offset: number | undefined
  while (!signal.aborted) {
    const backlog = await pollWithRetry(
      {
        ...common,
        offset,
        timeoutSeconds: 0,
      },
      dependencies,
      signal,
    )
    if (!backlog) return
    if (!backlog.ok) {
      failStatus(backlog, dependencies)
      return
    }
    const backlogUpdates = sortedUpdates(backlog.result)
    if (backlogUpdates.length === 0) break
    const highestId = updateId(backlogUpdates.at(-1))
    if (highestId !== null) offset = highestId + 1
  }

  const receiverReadyAtSeconds = dependencies.nowSeconds()
  dependencies.onStatusChange({ status: 'running', botUsername: identity.result.username })
  while (!signal.aborted) {
    const polled = await pollWithRetry(
      {
        ...common,
        offset,
        timeoutSeconds: config.terminalInputPollingTimeoutSeconds,
      },
      dependencies,
      signal,
      identity.result.username,
    )
    if (!polled) return
    if (!polled.ok) {
      failStatus(polled, dependencies)
      return
    }
    dependencies.onStatusChange({ status: 'running', botUsername: identity.result.username })
    for (const rawUpdate of sortedUpdates(polled.result)) {
      if (signal.aborted) return
      const id = updateId(rawUpdate)
      if (id === null || (offset !== undefined && id < offset)) continue
      offset = id + 1
      const parsed = parseTelegramTerminalInputUpdate(rawUpdate, {
        botUsername: identity.result.username,
        chatId: config.chatId,
        allowedUserIds: config.terminalInputAllowedUserIds,
        receiverReadyAtSeconds,
        nowSeconds: dependencies.nowSeconds(),
      })
      if (parsed.kind === 'ignored') continue
      let submission: TelegramTerminalInputSubmissionResult | undefined
      if (parsed.kind === 'accepted') {
        try {
          submission = await dependencies.submitTerminalInput(parsed.text)
        } catch {
          submission = { ok: false, code: 'write-failed' }
        }
      }
      await sendOutcomeReply(config, parsed, submission, dependencies, signal)
    }
  }
}

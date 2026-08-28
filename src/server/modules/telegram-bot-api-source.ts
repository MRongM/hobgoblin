import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import https from 'node:https'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { ProxyAgent } from 'proxy-agent'
import type { SettingsPrefs } from '#/shared/rpc.ts'
import {
  TELEGRAM_PHOTO_CAPTION_MAX_LENGTH,
  TELEGRAM_PHOTO_MAX_BYTES,
  type TelegramNotificationErrorCode,
  type TelegramNotificationResult,
} from '#/shared/telegram-notifications.ts'

const TELEGRAM_HOST = 'api.telegram.org'
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000
const TELEGRAM_RESPONSE_MAX_BYTES = 64 * 1024
const TELEGRAM_UPDATES_RESPONSE_MAX_BYTES = 1024 * 1024

type HttpsRequest = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest

export type TelegramBotApiErrorCode =
  | 'authentication-failed'
  | 'target-rejected'
  | 'network-failed'
  | 'telegram-rejected'
  | 'rate-limited'

export type TelegramBotApiResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: TelegramBotApiErrorCode; retryAfterSeconds?: number } }

export interface TelegramBotIdentity {
  id: number
  username: string
}

export interface TelegramWebhookInfo {
  url: string
}

export interface TelegramChat {
  id: string
  type: string
}

type TelegramRequestDependencies = { request?: HttpsRequest }

function botApiFailure<T>(code: TelegramBotApiErrorCode, retryAfterSeconds?: number): TelegramBotApiResult<T> {
  return {
    ok: false,
    error: {
      code,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  }
}

function notificationFailure(code: TelegramNotificationErrorCode): TelegramNotificationResult {
  return { ok: false, error: { code } }
}

function statusErrorCode(statusCode: number, payload: unknown): TelegramBotApiErrorCode {
  const errorCode =
    payload && typeof payload === 'object' && typeof (payload as { error_code?: unknown }).error_code === 'number'
      ? (payload as { error_code: number }).error_code
      : statusCode
  if (errorCode === 401) return 'authentication-failed'
  if (errorCode === 429) return 'rate-limited'
  if (errorCode === 400 || errorCode === 403) return 'target-rejected'
  return 'telegram-rejected'
}

function retryAfterSeconds(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const parameters = (payload as { parameters?: unknown }).parameters
  if (!parameters || typeof parameters !== 'object') return undefined
  const value = (parameters as { retry_after?: unknown }).retry_after
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

export function telegramProxyUrlFromPrefs(
  prefs: Pick<SettingsPrefs, 'gitNetworkProxyUrl'>,
  proxyEnabled = true,
): string | undefined {
  if (!proxyEnabled) return undefined
  const proxyUrl = prefs.gitNetworkProxyUrl.trim()
  if (!proxyUrl) return undefined
  try {
    const protocol = new URL(proxyUrl).protocol
    return protocol === 'http:' || protocol === 'https:' || protocol === 'socks5:' ? proxyUrl : undefined
  } catch {
    return undefined
  }
}

async function requestTelegramBotApi<T>(
  input: {
    botToken: string
    method: string
    contentType: string
    chunks: Buffer[]
    proxyUrl?: string
    timeoutMs?: number
    responseMaxBytes?: number
    signal?: AbortSignal
    projectResult: (value: unknown) => T | null
  },
  dependencies: TelegramRequestDependencies,
): Promise<TelegramBotApiResult<T>> {
  const proxyAgent = input.proxyUrl
    ? new ProxyAgent({
        getProxyForUrl: () => input.proxyUrl ?? '',
      })
    : undefined

  return await new Promise<TelegramBotApiResult<T>>((resolve) => {
    let settled = false
    let request: ClientRequest | null = null
    const onAbort = (): void => {
      request?.destroy()
      finish(botApiFailure('network-failed'))
    }
    const finish = (result: TelegramBotApiResult<T>): void => {
      if (settled) return
      settled = true
      input.signal?.removeEventListener('abort', onAbort)
      proxyAgent?.destroy()
      resolve(result)
    }

    if (input.signal?.aborted) {
      finish(botApiFailure('network-failed'))
      return
    }

    request = (dependencies.request ?? https.request)(
      {
        protocol: 'https:',
        hostname: TELEGRAM_HOST,
        port: 443,
        method: 'POST',
        path: `/bot${input.botToken}/${input.method}`,
        agent: proxyAgent,
        headers: {
          'content-type': input.contentType,
          'content-length': input.chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        let responseBytes = 0
        response.on('data', (chunk: Buffer | string) => {
          if (settled) return
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          responseBytes += buffer.byteLength
          if (responseBytes > (input.responseMaxBytes ?? TELEGRAM_RESPONSE_MAX_BYTES)) {
            response.destroy()
            finish(botApiFailure('telegram-rejected'))
            return
          }
          chunks.push(buffer)
        })
        response.on('error', () => finish(botApiFailure('network-failed')))
        response.on('end', () => {
          if (settled) return
          let payload: unknown
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          } catch {
            finish(botApiFailure('telegram-rejected'))
            return
          }
          const statusCode = response.statusCode ?? 0
          if (
            statusCode < 200 ||
            statusCode >= 300 ||
            !payload ||
            typeof payload !== 'object' ||
            (payload as { ok?: unknown }).ok !== true
          ) {
            finish(botApiFailure(statusErrorCode(statusCode, payload), retryAfterSeconds(payload)))
            return
          }
          const projected = input.projectResult((payload as { result?: unknown }).result)
          finish(projected === null ? botApiFailure('telegram-rejected') : { ok: true, result: projected })
        })
      },
    )

    input.signal?.addEventListener('abort', onAbort, { once: true })
    request.on('error', () => finish(botApiFailure('network-failed')))
    request.setTimeout(input.timeoutMs ?? TELEGRAM_REQUEST_TIMEOUT_MS, () => {
      request?.destroy()
      finish(botApiFailure('network-failed'))
    })
    for (const chunk of input.chunks) request.write(chunk)
    request.end()
  })
}

function jsonRequest<T>(
  input: {
    botToken: string
    method: string
    body?: Record<string, unknown>
    proxyUrl?: string
    timeoutMs?: number
    responseMaxBytes?: number
    signal?: AbortSignal
    projectResult: (value: unknown) => T | null
  },
  dependencies: TelegramRequestDependencies,
): Promise<TelegramBotApiResult<T>> {
  const chunk = Buffer.from(JSON.stringify(input.body ?? {}))
  return requestTelegramBotApi(
    {
      ...input,
      contentType: 'application/json',
      chunks: [chunk],
    },
    dependencies,
  )
}

export async function getTelegramBotIdentity(
  input: { botToken: string; proxyUrl?: string; signal?: AbortSignal },
  dependencies: TelegramRequestDependencies = {},
): Promise<TelegramBotApiResult<TelegramBotIdentity>> {
  return await jsonRequest(
    {
      ...input,
      method: 'getMe',
      projectResult(value) {
        if (!value || typeof value !== 'object') return null
        const id = (value as { id?: unknown }).id
        const isBot = (value as { is_bot?: unknown }).is_bot
        const username = (value as { username?: unknown }).username
        return typeof id === 'number' &&
          Number.isSafeInteger(id) &&
          isBot === true &&
          typeof username === 'string' &&
          username
          ? { id, username }
          : null
      },
    },
    dependencies,
  )
}

export async function getTelegramWebhookInfo(
  input: { botToken: string; proxyUrl?: string; signal?: AbortSignal },
  dependencies: TelegramRequestDependencies = {},
): Promise<TelegramBotApiResult<TelegramWebhookInfo>> {
  return await jsonRequest(
    {
      ...input,
      method: 'getWebhookInfo',
      projectResult(value) {
        if (!value || typeof value !== 'object') return null
        const url = (value as { url?: unknown }).url
        return typeof url === 'string' ? { url } : null
      },
    },
    dependencies,
  )
}

export async function getTelegramChat(
  input: { botToken: string; chatId: string; proxyUrl?: string; signal?: AbortSignal },
  dependencies: TelegramRequestDependencies = {},
): Promise<TelegramBotApiResult<TelegramChat>> {
  return await jsonRequest(
    {
      ...input,
      method: 'getChat',
      body: { chat_id: input.chatId },
      projectResult(value) {
        if (!value || typeof value !== 'object') return null
        const id = (value as { id?: unknown }).id
        const type = (value as { type?: unknown }).type
        const normalizedId =
          typeof id === 'number' && Number.isSafeInteger(id)
            ? String(id)
            : typeof id === 'string' && /^-?\d+$/u.test(id)
              ? id
              : null
        return normalizedId && typeof type === 'string' ? { id: normalizedId, type } : null
      },
    },
    dependencies,
  )
}

export async function getTelegramUpdates(
  input: {
    botToken: string
    offset?: number
    timeoutSeconds: number
    proxyUrl?: string
    signal?: AbortSignal
  },
  dependencies: TelegramRequestDependencies = {},
): Promise<TelegramBotApiResult<unknown[]>> {
  return await jsonRequest(
    {
      ...input,
      method: 'getUpdates',
      body: {
        ...(input.offset === undefined ? {} : { offset: input.offset }),
        timeout: input.timeoutSeconds,
        allowed_updates: ['message'],
      },
      timeoutMs: (input.timeoutSeconds + 10) * 1_000,
      responseMaxBytes: TELEGRAM_UPDATES_RESPONSE_MAX_BYTES,
      projectResult: (value) => (Array.isArray(value) ? value : null),
    },
    dependencies,
  )
}

export async function sendTelegramMessage(
  input: {
    botToken: string
    chatId: string
    text: string
    proxyUrl?: string
    replyToMessageId?: number
    messageThreadId?: number
    signal?: AbortSignal
  },
  dependencies: TelegramRequestDependencies = {},
): Promise<TelegramNotificationResult> {
  const result = await jsonRequest(
    {
      ...input,
      method: 'sendMessage',
      body: {
        chat_id: input.chatId,
        text: input.text,
        ...(input.replyToMessageId === undefined ? {} : { reply_parameters: { message_id: input.replyToMessageId } }),
        ...(input.messageThreadId === undefined ? {} : { message_thread_id: input.messageThreadId }),
      },
      projectResult: () => true,
    },
    dependencies,
  )
  if (result.ok) return { ok: true }
  const code: TelegramNotificationErrorCode =
    result.error.code === 'rate-limited' ? 'telegram-rejected' : result.error.code
  return notificationFailure(code)
}

export async function sendTelegramPhoto(
  input: { botToken: string; chatId: string; caption: string; photo: Buffer; proxyUrl?: string },
  dependencies: TelegramRequestDependencies = {},
): Promise<TelegramNotificationResult> {
  if (
    Array.from(input.caption).length > TELEGRAM_PHOTO_CAPTION_MAX_LENGTH ||
    input.photo.byteLength < 1 ||
    input.photo.byteLength > TELEGRAM_PHOTO_MAX_BYTES
  ) {
    return notificationFailure('invalid-input')
  }
  const boundary = `hobgoblin-${randomUUID()}`
  const chunks = [
    multipartField(boundary, 'chat_id', input.chatId),
    multipartField(boundary, 'caption', input.caption),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="terminal.jpg"\r\n` +
        'Content-Type: image/jpeg\r\n\r\n',
    ),
    input.photo,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]
  const result = await requestTelegramBotApi(
    {
      botToken: input.botToken,
      method: 'sendPhoto',
      contentType: `multipart/form-data; boundary=${boundary}`,
      chunks,
      proxyUrl: input.proxyUrl,
      projectResult: () => true,
    },
    dependencies,
  )
  if (result.ok) return { ok: true }
  const code: TelegramNotificationErrorCode =
    result.error.code === 'rate-limited' ? 'telegram-rejected' : result.error.code
  return notificationFailure(code)
}

function multipartField(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
}

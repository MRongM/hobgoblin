import https from 'node:https'
import { randomUUID } from 'node:crypto'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { Buffer } from 'node:buffer'
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

type HttpsRequest = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest

function failure(code: TelegramNotificationErrorCode): TelegramNotificationResult {
  return { ok: false, error: { code } }
}

function errorCodeForHttpStatus(statusCode: number): TelegramNotificationErrorCode {
  if (statusCode === 401) return 'authentication-failed'
  if (statusCode === 400 || statusCode === 403) return 'target-rejected'
  return 'telegram-rejected'
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

export async function sendTelegramMessage(
  input: { botToken: string; chatId: string; text: string; proxyUrl?: string },
  dependencies: { request?: HttpsRequest } = {},
): Promise<TelegramNotificationResult> {
  const body = JSON.stringify({ chat_id: input.chatId, text: input.text })
  return await sendTelegramRequest(
    {
      botToken: input.botToken,
      method: 'sendMessage',
      contentType: 'application/json',
      chunks: [Buffer.from(body)],
      proxyUrl: input.proxyUrl,
    },
    dependencies,
  )
}

export async function sendTelegramPhoto(
  input: { botToken: string; chatId: string; caption: string; photo: Buffer; proxyUrl?: string },
  dependencies: { request?: HttpsRequest } = {},
): Promise<TelegramNotificationResult> {
  if (
    Array.from(input.caption).length > TELEGRAM_PHOTO_CAPTION_MAX_LENGTH ||
    input.photo.byteLength < 1 ||
    input.photo.byteLength > TELEGRAM_PHOTO_MAX_BYTES
  ) {
    return failure('invalid-input')
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
  return await sendTelegramRequest(
    {
      botToken: input.botToken,
      method: 'sendPhoto',
      contentType: `multipart/form-data; boundary=${boundary}`,
      chunks,
      proxyUrl: input.proxyUrl,
    },
    dependencies,
  )
}

function multipartField(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
}

async function sendTelegramRequest(
  input: {
    botToken: string
    method: 'sendMessage' | 'sendPhoto'
    contentType: string
    chunks: Buffer[]
    proxyUrl?: string
  },
  dependencies: { request?: HttpsRequest },
): Promise<TelegramNotificationResult> {
  const proxyAgent = input.proxyUrl
    ? new ProxyAgent({
        getProxyForUrl: () => input.proxyUrl ?? '',
      })
    : undefined

  return await new Promise<TelegramNotificationResult>((resolve) => {
    let settled = false
    const finish = (result: TelegramNotificationResult): void => {
      if (settled) return
      settled = true
      proxyAgent?.destroy()
      resolve(result)
    }

    const request = (dependencies.request ?? https.request)(
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
        const statusCode = response.statusCode ?? 0
        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          finish(failure(errorCodeForHttpStatus(statusCode)))
          return
        }

        const chunks: Buffer[] = []
        let responseBytes = 0
        response.on('data', (chunk: Buffer | string) => {
          if (settled) return
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          responseBytes += buffer.byteLength
          if (responseBytes > TELEGRAM_RESPONSE_MAX_BYTES) {
            response.destroy()
            finish(failure('telegram-rejected'))
            return
          }
          chunks.push(buffer)
        })
        response.on('error', () => finish(failure('network-failed')))
        response.on('end', () => {
          if (settled) return
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { ok?: unknown }
            finish(payload.ok === true ? { ok: true } : failure('telegram-rejected'))
          } catch {
            finish(failure('telegram-rejected'))
          }
        })
      },
    )

    request.on('error', () => finish(failure('network-failed')))
    request.setTimeout(TELEGRAM_REQUEST_TIMEOUT_MS, () => {
      request.destroy()
      finish(failure('network-failed'))
    })
    for (const chunk of input.chunks) request.write(chunk)
    request.end()
  })
}

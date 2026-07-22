import https from 'node:https'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { Buffer } from 'node:buffer'
import { ProxyAgent } from 'proxy-agent'
import type { SettingsPrefs } from '#/shared/rpc.ts'
import type { TelegramNotificationErrorCode, TelegramNotificationResult } from '#/shared/telegram-notifications.ts'

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
  prefs: Pick<SettingsPrefs, 'gitNetworkProxyEnabled' | 'gitNetworkProxyUrl'>,
): string | undefined {
  if (!prefs.gitNetworkProxyEnabled) return undefined
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
        path: `/bot${input.botToken}/sendMessage`,
        agent: proxyAgent,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
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
    request.write(body)
    request.end()
  })
}

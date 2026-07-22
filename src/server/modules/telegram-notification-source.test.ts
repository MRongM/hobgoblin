import { EventEmitter } from 'node:events'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { PassThrough } from 'node:stream'
import { describe, expect, test } from 'vitest'
import { ProxyAgent } from 'proxy-agent'
import { sendTelegramMessage, telegramProxyUrlFromPrefs } from '#/server/modules/telegram-notification-source.ts'

interface RequestFixture {
  request: (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest
  options?: RequestOptions
  body: string
  timeoutMs?: number
  destroyed: boolean
}

function createRequestFixture(
  input: {
    statusCode?: number
    responseBody?: string
    error?: Error
    timeout?: boolean
  } = {},
): RequestFixture {
  const fixture: RequestFixture = {
    body: '',
    destroyed: false,
    request(options, callback) {
      fixture.options = options
      const request = new EventEmitter() as ClientRequest
      request.write = ((chunk: string | Uint8Array) => {
        fixture.body += chunk.toString()
        return true
      }) as ClientRequest['write']
      request.end = (() => {
        queueMicrotask(() => {
          if (input.error) {
            request.emit('error', input.error)
            return
          }
          if (input.timeout) return
          const responseStream = Object.assign(new PassThrough(), { statusCode: input.statusCode ?? 200 })
          callback(responseStream as unknown as IncomingMessage)
          responseStream.end(input.responseBody ?? JSON.stringify({ ok: true, result: {} }))
        })
        return request
      }) as ClientRequest['end']
      request.setTimeout = ((timeoutMs: number, onTimeout?: () => void) => {
        fixture.timeoutMs = timeoutMs
        if (input.timeout && onTimeout) queueMicrotask(onTimeout)
        return request
      }) as ClientRequest['setTimeout']
      request.destroy = (() => {
        fixture.destroyed = true
        return request
      }) as ClientRequest['destroy']
      return request
    },
  }
  return fixture
}

describe('sendTelegramMessage', () => {
  test('posts chat_id and plain text without parse mode', async () => {
    const fixture = createRequestFixture()

    await expect(
      sendTelegramMessage(
        { botToken: '123456:test-token', chatId: '-100123', text: 'bell text' },
        { request: fixture.request },
      ),
    ).resolves.toEqual({ ok: true })

    expect(fixture.options).toMatchObject({
      hostname: 'api.telegram.org',
      method: 'POST',
      path: '/bot123456:test-token/sendMessage',
    })
    expect(JSON.parse(fixture.body)).toEqual({ chat_id: '-100123', text: 'bell text' })
    expect(fixture.body).not.toContain('parse_mode')
    expect(fixture.timeoutMs).toBe(15_000)
  })

  test.each([
    [401, 'authentication-failed'],
    [400, 'target-rejected'],
    [403, 'target-rejected'],
    [500, 'telegram-rejected'],
  ] as const)('maps HTTP %i to %s', async (statusCode, code) => {
    const fixture = createRequestFixture({ statusCode, responseBody: '{}' })
    await expect(
      sendTelegramMessage({ botToken: 'token', chatId: '1', text: 'test' }, { request: fixture.request }),
    ).resolves.toEqual({ ok: false, error: { code } })
  })

  test.each([
    [{ error: new Error('socket failed') }, 'network-failed'],
    [{ timeout: true }, 'network-failed'],
    [{ responseBody: '{not-json' }, 'telegram-rejected'],
    [{ responseBody: JSON.stringify({ ok: false }) }, 'telegram-rejected'],
    [{ responseBody: 'x'.repeat(64 * 1024 + 1) }, 'telegram-rejected'],
  ] as const)('returns a safe failure for malformed or failed transport %#', async (requestInput, code) => {
    const fixture = createRequestFixture(requestInput)
    await expect(
      sendTelegramMessage({ botToken: 'secret-token', chatId: '1', text: 'test' }, { request: fixture.request }),
    ).resolves.toEqual({ ok: false, error: { code } })
  })

  test.each(['http://127.0.0.1:7890', 'https://proxy.example.test:8443', 'socks5://127.0.0.1:1080'])(
    'uses the configured proxy URL %s',
    async (proxyUrl) => {
      const fixture = createRequestFixture()
      await sendTelegramMessage(
        { botToken: 'token', chatId: '1', text: 'test', proxyUrl },
        { request: fixture.request },
      )

      expect(fixture.options?.agent).toBeInstanceOf(ProxyAgent)
      const agent = fixture.options?.agent as ProxyAgent
      expect(await agent.getProxyForUrl('https://api.telegram.org', {} as ClientRequest)).toBe(proxyUrl)
      agent.destroy()
    },
  )
})

describe('telegramProxyUrlFromPrefs', () => {
  test('only returns a configured and enabled supported proxy URL', () => {
    expect(
      telegramProxyUrlFromPrefs({ gitNetworkProxyEnabled: false, gitNetworkProxyUrl: 'http://proxy:7890' }),
    ).toBeUndefined()
    expect(telegramProxyUrlFromPrefs({ gitNetworkProxyEnabled: true, gitNetworkProxyUrl: '' })).toBeUndefined()
    expect(
      telegramProxyUrlFromPrefs({ gitNetworkProxyEnabled: true, gitNetworkProxyUrl: 'socks5://127.0.0.1:1080' }),
    ).toBe('socks5://127.0.0.1:1080')
  })
})

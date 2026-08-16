import { EventEmitter } from 'node:events'
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http'
import { PassThrough } from 'node:stream'
import { describe, expect, test } from 'vitest'
import { ProxyAgent } from 'proxy-agent'
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  telegramProxyUrlFromPrefs,
} from '#/server/modules/telegram-notification-source.ts'

interface RequestFixture {
  request: (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest
  options?: RequestOptions
  body: string
  chunks: Buffer[]
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
    chunks: [],
    destroyed: false,
    request(options, callback) {
      fixture.options = options
      const request = new EventEmitter() as ClientRequest
      request.write = ((chunk: string | Uint8Array) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        fixture.chunks.push(buffer)
        fixture.body += buffer.toString()
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

describe('sendTelegramPhoto', () => {
  test('uploads one in-memory JPEG as multipart data with a caption', async () => {
    const fixture = createRequestFixture()
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])

    await expect(
      sendTelegramPhoto(
        { botToken: '123456:test-token', chatId: '-100123', caption: 'terminal idle', photo },
        { request: fixture.request },
      ),
    ).resolves.toEqual({ ok: true })

    expect(fixture.options).toMatchObject({
      hostname: 'api.telegram.org',
      method: 'POST',
      path: '/bot123456:test-token/sendPhoto',
    })
    expect(fixture.options?.headers).toMatchObject({
      'content-type': expect.stringMatching(/^multipart\/form-data; boundary=/u),
      'content-length': Buffer.concat(fixture.chunks).byteLength,
    })
    const body = Buffer.concat(fixture.chunks)
    expect(body.toString()).toContain('name="chat_id"\r\n\r\n-100123')
    expect(body.toString()).toContain('name="caption"\r\n\r\nterminal idle')
    expect(body.toString()).toContain('name="photo"; filename="terminal.jpg"')
    expect(body.toString()).toContain('Content-Type: image/jpeg')
    expect(body.indexOf(photo)).toBeGreaterThan(0)
    expect(fixture.timeoutMs).toBe(15_000)
  })

  test.each([
    { label: 'oversized caption', invalid: { caption: 'x'.repeat(1_025), photo: Buffer.from([1]) } },
    { label: 'empty photo', invalid: { caption: 'caption', photo: Buffer.alloc(0) } },
    { label: 'oversized photo', invalid: { caption: 'caption', photo: Buffer.alloc(2 * 1024 * 1024 + 1) } },
  ])('rejects $label', async ({ invalid }) => {
    const fixture = createRequestFixture()

    await expect(
      sendTelegramPhoto(
        { botToken: 'token', chatId: '1', caption: invalid.caption, photo: invalid.photo },
        { request: fixture.request },
      ),
    ).resolves.toEqual({ ok: false, error: { code: 'invalid-input' } })
    expect(fixture.options).toBeUndefined()
  })

  test('maps failed photo transport through the shared error lifecycle', async () => {
    const fixture = createRequestFixture({ timeout: true })

    await expect(
      sendTelegramPhoto(
        { botToken: 'token', chatId: '1', caption: 'caption', photo: Buffer.from([1, 2, 3]) },
        { request: fixture.request },
      ),
    ).resolves.toEqual({ ok: false, error: { code: 'network-failed' } })
    expect(fixture.destroyed).toBe(true)
  })
})

describe('telegramProxyUrlFromPrefs', () => {
  test('returns the shared supported proxy URL independently of the Git proxy switch', () => {
    expect(
      telegramProxyUrlFromPrefs({ gitNetworkProxyUrl: 'http://proxy:7890' }),
    ).toBe('http://proxy:7890')
    expect(telegramProxyUrlFromPrefs({ gitNetworkProxyUrl: '' })).toBeUndefined()
    expect(
      telegramProxyUrlFromPrefs({ gitNetworkProxyUrl: 'socks5://127.0.0.1:1080' }),
    ).toBe('socks5://127.0.0.1:1080')
  })
})

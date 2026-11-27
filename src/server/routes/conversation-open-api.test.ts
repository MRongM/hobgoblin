import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createApp } from '#/server/app-factory.ts'
import {
  CONVERSATION_REQUEST_MAX_BYTES,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
} from '#/server/modules/conversation-open-api-model.ts'
import {
  createConversationOpenApiStore,
  type ConversationOpenApiStore,
} from '#/server/modules/conversation-open-api-source.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { createOpenApiKeySource } from '#/server/modules/open-api-key-source.ts'
import type { GeneratedOpenApiKey } from '#/shared/open-api-keys.ts'

const PREFIX = '/api/open/v1'
const CONVERSATIONS = `${PREFIX}/conversations`
const INTERNAL_REPO_PATH = '/api/repo/snapshot'
const INTERNAL_SETTINGS_PATH = '/api/settings/lan'
const TOKEN = 'example-conversation-api-token'
const CONTROL_TOKEN = 'example-terminal-control-token'
const CONTROL_ID = '388a4521-8881-4ae1-abd8-c3f7da925828'
const INTERNAL_SECRET = 'example-internal-secret'
const TERMINAL_ID = 'session_example_01'
const terminalHost = {} as ServerTerminalHost
const appOptions = { version: '1.0.0', startedAt: 1, internalSecret: INTERNAL_SECRET, terminalHost }

describe('conversation OpenAPI', () => {
  let directory: string
  let file: string
  let keyFile: string
  let store: ConversationOpenApiStore
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'conversation-open-api-'))
    file = path.join(directory, 'data', 'conversations.sqlite')
    keyFile = path.join(directory, 'data', 'open-api-key-fixture.json')
    store = createConversationOpenApiStore(file)
    app = createApp({ ...appOptions, conversationOpenApi: { keys: keysWithStartupTokens(TOKEN), store } })
  })

  function keysWithStartupTokens(conversationToken?: string, controlToken?: string) {
    return createOpenApiKeySource({ file: keyFile, internalSecret: INTERNAL_SECRET, conversationToken, controlToken })
  }

  afterEach(() => {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  })

  function request(url: string, method = 'GET', body?: unknown, token = TOKEN) {
    const headers = new Headers({ Authorization: `Bearer ${token}` })
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    return app.request(url, { method, headers, body: JSON.stringify(body) })
  }

  test('serves the OpenAPI contract publicly and isolates credentials', async () => {
    const specResponse = await app.request(`${PREFIX}/openapi.json`)
    expect(specResponse.status).toBe(200)
    const spec = await specResponse.json()
    expect(spec).toMatchObject({
      openapi: '3.1.1',
      servers: [{ url: PREFIX }],
      security: [{ bearerAuth: [] }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    })
    expect(Object.keys(spec.paths)).toEqual([
      '/conversations',
      '/conversations/{conversationId}',
      '/conversations/{conversationId}/messages',
      '/conversations/{conversationId}/messages/{messageId}',
      '/conversations/{conversationId}/control',
      '/conversations/{conversationId}/control/{controlId}/input',
      '/conversations/{conversationId}/control/{controlId}',
    ])
    expect(Object.keys(spec.components.securitySchemes)).toEqual(['bearerAuth'])
    expect(spec.paths['/conversations/{conversationId}/control'].post.security).toBeUndefined()
    const unauthorized = await app.request(CONVERSATIONS, { headers: { 'x-goblin-internal-secret': INTERNAL_SECRET } })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('www-authenticate')).toBe('Bearer')
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')
    expect((await app.request(CONVERSATIONS, { headers: { Authorization: `Bearer ${INTERNAL_SECRET}` } })).status).toBe(
      401,
    )
    expect((await request(INTERNAL_REPO_PATH, 'POST', {})).status).toBe(401)
    expect((await request(`${CONVERSATIONS}/example/control`, 'POST', { terminalSessionId: TERMINAL_ID })).status).toBe(
      503,
    )
    expect((await app.request(INTERNAL_SETTINGS_PATH, { headers: { 'x-goblin-internal-secret': TOKEN } })).status).toBe(
      401,
    )
    expect(existsSync(file)).toBe(false)
    expect((await app.request(`${PREFIX}/unknown`)).status).toBe(404)

    const disabled = createApp(appOptions)
    expect((await disabled.request(`${PREFIX}/openapi.json`)).status).toBe(200)
    expect((await disabled.request(CONVERSATIONS)).status).toBe(503)
    const internalHeaders = { 'x-goblin-internal-secret': INTERNAL_SECRET }
    const legacy = await disabled.request(INTERNAL_SETTINGS_PATH, { headers: internalHeaders })
    const enabled = await app.request(INTERNAL_SETTINGS_PATH, { headers: internalHeaders })
    expect(legacy.status).toBe(200)
    expect(enabled.status).toBe(200)
    expect(await enabled.json()).toEqual(await legacy.json())
  })

  test('uses the legacy terminal control key for both conversations and control', async () => {
    const openApiControl = vi.fn<NonNullable<ServerTerminalHost['openApiControl']>>((_clientId, input) => {
      if (input.action === 'status') return { ok: false, reason: 'session_unavailable' }
      if (input.action === 'acquire') {
        return {
          ok: true,
          action: 'acquire',
          controlId: CONTROL_ID,
          terminalSessionId: input.sessionId,
          expiresAt: '2026-01-01T00:05:00.000Z',
        }
      }
      return { ok: true, action: input.action }
    })
    app = createApp({
      ...appOptions,
      terminalHost: { ...terminalHost, openApiControl },
      conversationOpenApi: { keys: keysWithStartupTokens(TOKEN, CONTROL_TOKEN), store },
    })
    const conversation = store.createConversation({ provider: 'codex', terminalSessionId: TERMINAL_ID })
    const path = `${CONVERSATIONS}/${conversation.id}/control`
    const target = { terminalSessionId: TERMINAL_ID }
    const data = { data: 'Example prompt\r' }
    expect((await request(path, 'POST', target)).status).toBe(401)
    expect((await request(CONVERSATIONS)).status).toBe(401)
    expect((await request(CONVERSATIONS, 'GET', undefined, CONTROL_TOKEN)).status).toBe(200)
    expect((await request(path, 'POST', { terminalSessionId: 'different_terminal_01' }, CONTROL_TOKEN)).status).toBe(
      409,
    )
    expect(openApiControl).not.toHaveBeenCalled()

    const acquired = await request(path, 'POST', target, CONTROL_TOKEN)
    expect(acquired.status).toBe(201)
    expect(acquired.headers.get('Location')).toBe(`${path}/${CONTROL_ID}`)
    expect(await acquired.json()).toMatchObject({ controlId: CONTROL_ID, ...target })
    expect(openApiControl).toHaveBeenLastCalledWith(expect.stringMatching(/^client_/), {
      action: 'acquire',
      conversationId: conversation.id,
      sessionId: TERMINAL_ID,
    })

    expect((await request(`${path}/${CONTROL_ID}/input`, 'POST', data, CONTROL_TOKEN)).status).toBe(202)
    expect(openApiControl).toHaveBeenLastCalledWith(expect.stringMatching(/^client_/), {
      action: 'write',
      conversationId: conversation.id,
      sessionId: TERMINAL_ID,
      controlId: CONTROL_ID,
      ...data,
    })
    expect(store.listMessages(conversation.id)).toEqual([])
    store.deleteConversation(conversation.id)
    expect((await request(`${path}/${CONTROL_ID}/input`, 'POST', data, CONTROL_TOKEN)).status).toBe(404)
    expect((await request(`${path}/${CONTROL_ID}`, 'DELETE', undefined, CONTROL_TOKEN)).status).toBe(204)
    expect(openApiControl).toHaveBeenLastCalledWith(expect.stringMatching(/^client_/), {
      action: 'release',
      conversationId: conversation.id,
      controlId: CONTROL_ID,
    })
  })

  test('allows OpenAPI preflight without changing internal API CORS', async () => {
    const options = {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://client.example',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    }
    const response = await app.request(CONVERSATIONS, options)
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
    const internal = await app.request(INTERNAL_REPO_PATH, options)
    expect(internal.headers.get('access-control-allow-headers')).toBe('Content-Type,x-goblin-internal-secret')
    expect(internal.headers.get('access-control-allow-methods')).toBe('GET,POST,OPTIONS')
  })

  test('persists complete conversations with ordered messages and supports both CRUD resources', async () => {
    const createCodex = await request(CONVERSATIONS, 'POST', { provider: 'codex' })
    expect(createCodex.status).toBe(201)
    const codex = (await createCodex.json()) as ConversationSummary
    const codexPath = `${CONVERSATIONS}/${codex.id}`
    expect(createCodex.headers.get('location')).toBe(codexPath)
    expect(codex).toMatchObject({ provider: 'codex', status: 'ready', terminalSessionId: null, title: null })

    const createClaude = await request(CONVERSATIONS, 'POST', {
      provider: 'claude',
      terminalSessionId: TERMINAL_ID,
      status: 'working',
      title: 'Example conversation',
    })
    expect(createClaude.status).toBe(201)
    const claude = (await createClaude.json()) as ConversationSummary
    const filters = `provider=claude&terminalSessionId=${TERMINAL_ID}&status=working`
    expect(await (await request(`${CONVERSATIONS}?${filters}`)).json()).toEqual({ conversations: [claude] })
    const claudePath = `${CONVERSATIONS}/${claude.id}`
    const claudeReply = await request(`${claudePath}/messages`, 'POST', { role: 'assistant', content: 'Claude reply' })
    expect(claudeReply.status).toBe(201)
    expect(await (await request(claudePath)).json()).toMatchObject({
      messages: [{ role: 'assistant', content: 'Claude reply' }],
    })

    const prompt = '  前导空格\n下一行\u0000\ud800\n'
    const postPrompt = await request(`${codexPath}/messages`, 'POST', { role: 'user', content: prompt })
    expect(postPrompt.status).toBe(201)
    const userMessage = (await postPrompt.json()) as ConversationMessage
    expect(userMessage.content).toBe(prompt)
    const userPath = `${codexPath}/messages/${userMessage.id}`
    expect(postPrompt.headers.get('location')).toBe(userPath)
    const answerContent = '完整回复 😀\n'.repeat(2048)
    const postAnswer = await request(`${codexPath}/messages`, 'POST', { role: 'assistant', content: answerContent })
    expect(postAnswer.status).toBe(201)
    const answer = (await postAnswer.json()) as ConversationMessage
    expect(answer.content).toBe(answerContent)

    store.close()
    store = createConversationOpenApiStore(file)
    app = createApp({ ...appOptions, conversationOpenApi: { keys: keysWithStartupTokens(TOKEN), store } })
    const full = (await (await request(codexPath)).json()) as Conversation
    expect(full.messages).toEqual([userMessage, answer])
    expect(await (await request(`${codexPath}/messages`)).json()).toEqual({ messages: full.messages })
    expect(await (await request(userPath)).json()).toEqual(userMessage)
    expect((await request(`${claudePath}/messages/${userMessage.id}`)).status).toBe(404)

    const editClaude = await request(claudePath, 'PATCH', {
      terminalSessionId: null,
      status: 'ready',
    })
    expect(editClaude.status).toBe(200)
    expect(await editClaude.json()).toMatchObject({ terminalSessionId: null, status: 'ready', title: claude.title })
    expect(await (await request(`${CONVERSATIONS}?${filters}`)).json()).toEqual({ conversations: [] })
    const editPrompt = await request(userPath, 'PATCH', { content: 'Edited text' })
    expect(editPrompt.status).toBe(200)
    expect(await editPrompt.json()).toMatchObject({ id: userMessage.id, role: 'user', content: 'Edited text' })
    const afterEdit = (await (await request(codexPath)).json()) as Conversation
    expect(afterEdit.messages.map((message) => message.id)).toEqual([userMessage.id, answer.id])

    expect((await request(userPath, 'DELETE')).status).toBe(204)
    expect((await request(userPath)).status).toBe(404)
    expect(await (await request(`${codexPath}/messages`)).json()).toEqual({ messages: [answer] })
    expect((await request(codexPath, 'DELETE')).status).toBe(204)
    expect((await request(codexPath)).status).toBe(404)
    expect((await request(`${codexPath}/messages`, 'POST', { role: 'user', content: 'Hello' })).status).toBe(404)
    const inspector = new DatabaseSync(file, { readOnly: true })
    try {
      expect(inspector.prepare('SELECT conversation_id AS id FROM messages').all()).toEqual([{ id: claude.id }])
    } finally {
      inspector.close()
    }
  })

  test('generates one key in authenticated settings for conversation and terminal access', async () => {
    const openApiControl = vi.fn<NonNullable<ServerTerminalHost['openApiControl']>>(() => ({
      ok: false,
      reason: 'session_unavailable',
    }))
    const terminalAppOptions = { ...appOptions, terminalHost: { ...terminalHost, openApiControl } }
    app = createApp({ ...terminalAppOptions, conversationOpenApi: { keys: keysWithStartupTokens(), store } })
    const settingsPath = '/api/settings/open-api-key'
    const settingsHeaders = { 'x-goblin-internal-secret': INTERNAL_SECRET, 'Content-Type': 'application/json' }
    const generate = (replace = false) =>
      app.request(settingsPath, {
        method: 'POST',
        headers: settingsHeaders,
        body: JSON.stringify({ replace }),
      })

    expect((await request(CONVERSATIONS)).status).toBe(503)
    expect((await request(settingsPath)).status).toBe(401)
    expect(await (await app.request(settingsPath, { headers: settingsHeaders })).json()).toEqual({ status: 'unset' })

    const attempts = await Promise.all([generate(), generate()])
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409])
    const issued = attempts.find((response) => response.status === 201)
    expect(issued?.headers.get('Cache-Control')).toBe('no-store')
    const generated = (await issued?.json()) as GeneratedOpenApiKey
    expect(generated.key).toMatch(/^[a-f0-9]{64}$/)
    expect(generated.status).toBe('configured')

    expect((await request(CONVERSATIONS, 'GET', undefined, generated.key)).status).toBe(200)
    expect((await request(settingsPath, 'GET', undefined, generated.key)).status).toBe(401)
    expect((await request(settingsPath, 'POST', { replace: true }, generated.key)).status).toBe(401)
    const record = store.createConversation({ provider: 'codex', terminalSessionId: TERMINAL_ID })
    const control = `${CONVERSATIONS}/${record.id}/control`
    const target = { terminalSessionId: TERMINAL_ID }
    expect((await request(control, 'POST', target, generated.key)).status).toBe(409)
    expect(openApiControl).toHaveBeenCalledTimes(1)

    const rotated = (await (await generate(true)).json()) as GeneratedOpenApiKey
    expect((await request(CONVERSATIONS, 'GET', undefined, generated.key)).status).toBe(401)
    expect((await request(control, 'POST', target, generated.key)).status).toBe(401)
    expect((await request(CONVERSATIONS, 'GET', undefined, rotated.key)).status).toBe(200)
    expect(await (await app.request(settingsPath, { headers: settingsHeaders })).json()).toEqual({
      status: 'configured',
    })
    const stored = readFileSync(keyFile, 'utf8')
    expect(stored).not.toContain(rotated.key)
    expect(Object.keys(JSON.parse(stored))).toEqual(['key'])
    if (process.platform !== 'win32') expect(statSync(keyFile).mode & 0o777).toBe(0o600)

    app = createApp({
      ...terminalAppOptions,
      conversationOpenApi: { keys: keysWithStartupTokens(TOKEN, CONTROL_TOKEN), store },
    })
    expect((await request(CONVERSATIONS, 'GET', undefined, TOKEN)).status).toBe(401)
    expect((await request(CONVERSATIONS, 'GET', undefined, rotated.key)).status).toBe(200)
    expect((await request(control, 'POST', target, rotated.key)).status).toBe(409)
    expect(openApiControl).toHaveBeenCalledTimes(2)
  })

  test('retains a legacy conversation key without granting terminal input', async () => {
    const openApiControl = vi.fn<NonNullable<ServerTerminalHost['openApiControl']>>(() => ({
      ok: false,
      reason: 'session_unavailable',
    }))
    const record = store.createConversation({ provider: 'codex', terminalSessionId: TERMINAL_ID })
    const control = `${CONVERSATIONS}/${record.id}/control`
    mkdirSync(path.dirname(keyFile), { recursive: true })
    writeFileSync(keyFile, JSON.stringify({ conversation: createHash('sha256').update(TOKEN).digest('hex') }))
    app = createApp({
      ...appOptions,
      terminalHost: { ...terminalHost, openApiControl },
      conversationOpenApi: { keys: keysWithStartupTokens(), store },
    })
    expect((await request(CONVERSATIONS)).status).toBe(200)
    expect((await request(control, 'POST', { terminalSessionId: TERMINAL_ID })).status).toBe(503)
    expect(openApiControl).not.toHaveBeenCalled()
    const status = await app.request('/api/settings/open-api-key', {
      headers: { 'x-goblin-internal-secret': INTERNAL_SECRET },
    })
    expect(await status.json()).toEqual({ status: 'legacy' })
  })

  test('rejects invalid fields and oversized or non-JSON writes', async () => {
    expect((await request(CONVERSATIONS, 'POST', { provider: 'other' })).status).toBe(400)
    expect((await request(CONVERSATIONS, 'POST', { provider: 'codex', status: 'offline' })).status).toBe(400)
    expect(
      (await request(CONVERSATIONS, 'POST', { provider: 'codex', terminalSessionId: '../../example' })).status,
    ).toBe(400)
    expect((await request(`${CONVERSATIONS}?provider=unknown`)).status).toBe(400)
    expect((await request(`${CONVERSATIONS}/example`, 'PATCH', {})).status).toBe(400)
    expect((await request(`${CONVERSATIONS}/example`, 'PATCH', { provider: 'claude' })).status).toBe(400)
    expect(
      (await request(`${CONVERSATIONS}/example/messages`, 'POST', { role: 'system', content: 'Example' })).status,
    ).toBe(400)
    expect((await request(CONVERSATIONS, 'POST')).status).toBe(415)

    const malformed = await app.request(CONVERSATIONS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: '{',
    })
    expect(await malformed.json()).toMatchObject({ error: { code: 'invalid_json' } })
    const large = await request(`${CONVERSATIONS}/example/messages`, 'POST', {
      role: 'assistant',
      content: 'a'.repeat(CONVERSATION_REQUEST_MAX_BYTES),
    })
    expect(large.status).toBe(413)
    expect(await large.json()).toMatchObject({ error: { code: 'payload_too_large' } })
    expect(existsSync(file)).toBe(false)
  })
})

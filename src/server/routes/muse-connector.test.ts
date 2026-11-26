import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { createApp } from '#/server/app-factory.ts'
import type { AgentProviderResult } from '#/server/modules/agent-open-api-provider.ts'
import { createAgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { createConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import { createOpenApiKeySource } from '#/server/modules/open-api-key-source.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { TERMINAL_INTERACTIVE_INPUT_IDLE_MS } from '#/server/terminal/terminal-open-api-control.ts'
import {
  attachServerTerminal,
  closeAllServerTerminalSessions,
  closeServerTerminal,
  createServerTerminal,
  getServerTerminalOutputExcerpt,
  handleServerTerminalOpenApiControl,
  listServerTerminalSessions,
  registerTerminalSocket,
  unregisterTerminalSocket,
  writeServerTerminal,
} from '#/server/terminal/terminal.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import type { SpawnTerminalPtyRuntimeInput } from '#/server/terminal/terminal-pty-runtime.ts'

const fixtures = vi.hoisted(() => ({ cwd: '', otherCwd: '' }))
const ptys: Array<{
  startup: SpawnTerminalPtyRuntimeInput
  output?: (data: string) => void
  write: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
}> = []
const token = 'example-muse-key'
const internalSecret = 'example-internal-secret'
const prefix = '/api/open/v1/muse'
type RunProvider = (typeof import('#/server/modules/agent-open-api-provider.ts'))['runAgentProviderTurn']

vi.mock('#/server/modules/settings-source.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/server/modules/settings-source.ts')>()),
  getServerSessionState: async () => ({
    openRepos: [fixtures.cwd, fixtures.otherCwd].map((id) => ({ id, kind: 'local' })),
    activeRepo: fixtures.cwd,
  }),
}))

vi.mock('#/server/terminal/terminal-pty-runtime.ts', () => ({
  spawnTerminalPtyRuntime: (startup: SpawnTerminalPtyRuntimeInput) => {
    const pty: (typeof ptys)[number] = { startup, write: vi.fn(), kill: vi.fn() }
    ptys.push(pty)
    return {
      ok: true,
      runtime: {
        ...pty,
        processName: () => 'codex',
        resize: vi.fn(),
        onData(listener: (data: string) => void) {
          pty.output = listener
          return { dispose: vi.fn() }
        },
        onExit: () => ({ dispose: vi.fn() }),
      },
    }
  },
}))

const cleanups: Array<() => void> = []
afterEach(() => {
  closeAllServerTerminalSessions()
  ptys.length = 0
  for (const cleanup of cleanups.splice(0)) cleanup()
})

async function setup(runProvider: RunProvider = vi.fn()) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'hobgoblin-muse-'))
  fixtures.cwd = temporary
  fixtures.otherCwd = path.join(temporary, 'other')
  const store = createConversationOpenApiStore(path.join(temporary, 'conversations.sqlite'))
  const agents = createAgentOpenApiRuntime(store, runProvider)
  cleanups.push(() => {
    agents.shutdown()
    store.close()
    rmSync(temporary, { recursive: true, force: true })
  })
  const terminalHost = {
    listSessions: listServerTerminalSessions,
    create: createServerTerminal,
    close: closeServerTerminal,
    getOutputExcerpt: getServerTerminalOutputExcerpt,
    openApiControl: handleServerTerminalOpenApiControl,
  } as ServerTerminalHost
  const app = createApp({
    internalSecret,
    startedAt: 1,
    version: '1.0.0',
    terminalHost,
    conversationOpenApi: {
      store,
      agents,
      keys: createOpenApiKeySource({
        file: path.join(temporary, 'muse-auth-fixture.json'),
        internalSecret,
        controlToken: token,
      }),
    },
  })
  const request = (route: string, method = 'GET', body?: object) =>
    app.request(route, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const get = (route: string) => request(route)
  const submit = (route: string, body: object) => request(route, 'POST', body)
  const inventory = await (await get(`${prefix}/workspaces`)).json()
  const [workspace, otherWorkspace] = inventory.workspaces.map(({ id }: { id: string }) => `${prefix}/workspaces/${id}`)
  const createTerminal = async () => {
    const result = await createServerTerminal('client_test', {
      repoRoot: temporary,
      worktreePath: temporary,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      kind: 'additional',
    })
    if (!result.ok) throw new Error('Expected terminal to open')
    const id = result.sessions.find((terminal) => terminal.key === result.key)?.sessionId
    if (!id) throw new Error('Expected terminal in the catalog')
    return id
  }
  return { app, get, submit, request, inventory, workspace, otherWorkspace, createTerminal, agents }
}

const originalTurnId = '05b66225-eed2-4729-85de-52c7a677fc99'
const nextTurnId = '116f5a1e-94c9-4c6a-b332-0b01d671c15c'
const otherTurnId = '34414246-df1e-4362-b108-7ddb90609bc9'
const providerSessionId = '4918b888-3c92-415a-8a79-8169b3864c46'

test('starts an interactive AI session without a mode and requires explicit opt-in for background execution', async () => {
  const runProvider = vi.fn<RunProvider>()
  const { get, submit, workspace } = await setup(runProvider)
  const input = { provider: 'codex', requestId: originalTurnId, prompt: 'Run checks' }
  for (const body of [input, { ...input, mode: 'interactive' }]) {
    const response = await submit(`${workspace}/sessions`, body)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } })
  }
  expect(runProvider).not.toHaveBeenCalled()
  expect(await (await get(`${workspace}/sessions`)).json()).toEqual({ sessions: [], terminals: [] })

  const terminal = await submit(`${workspace}/terminal-sessions`, { provider: input.provider })
  expect(terminal.status).toBe(201)
  expect(ptys[0]!.startup).toMatchObject({ agentProvider: input.provider })
  const location = terminal.headers.get('Location')!
  expect((await submit(`${location}/input`, { requestId: input.requestId, data: `${input.prompt}\r` })).status).toBe(
    202,
  )
  expect(ptys[0]!.write.mock.calls).toEqual([[`${input.prompt}\r`]])
  expect(runProvider).not.toHaveBeenCalled()
})

test('discovers live terminals and completes and resumes a background AI turn with the same API key', async () => {
  const first = Promise.withResolvers<AgentProviderResult>()
  const runProvider = vi
    .fn<RunProvider>()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ok: true, providerSessionId, reply: 'Follow-up complete' })
  const { app, get, submit, inventory, workspace, createTerminal } = await setup(runProvider)
  const terminalId = await createTerminal()
  const emptyTerminalId = await createTerminal()
  const tail = 'x'.repeat(8_192 - 'Running checks'.length) + 'Running checks'
  ptys[0]!.output?.(`older output ${tail}`)

  const contract = await app.request(`${prefix}/openapi.json`)
  expect(contract.status).toBe(200)
  expect(await contract.json()).toMatchObject({
    security: [{ bearerAuth: [] }],
    paths: { '/muse/workspaces/{workspaceId}/sessions': { post: { operationId: 'startHobgoblinAgentSession' } } },
  })
  expect((await app.request(`${prefix}/workspaces`)).status).toBe(401)
  expect(inventory.workspaces[0]).toMatchObject({ active: true, kind: 'local' })
  expect(await (await get(`${workspace}/sessions`)).json()).toMatchObject({
    sessions: [],
    terminals: [
      { id: terminalId, provider: 'codex', phase: 'open' },
      { id: emptyTerminalId, provider: 'codex', phase: 'open' },
    ],
  })
  expect(await (await get(`${workspace}/terminals/${terminalId}`)).json()).toMatchObject({
    excerpt: tail,
  })
  expect(await (await get(`${workspace}/terminals/${emptyTerminalId}`)).json()).toMatchObject({
    phase: 'open',
    excerpt: null,
  })
  expect((await get(`${workspace}/terminals/unknown`)).status).toBe(404)

  const input = { mode: 'background', provider: 'codex', requestId: originalTurnId, prompt: 'Run checks' }
  const start = await submit(`${workspace}/sessions`, input)
  expect(start.status).toBe(202)
  const turnPath = start.headers.get('Location')!
  const session = `${prefix}/sessions/${originalTurnId}`
  expect((await submit(`${workspace}/sessions`, input)).status).toBe(202)
  expect((await submit(`${workspace}/sessions`, { ...input, prompt: 'Different prompt' })).status).toBe(409)
  expect(runProvider).toHaveBeenCalledTimes(1)
  expect(await (await get(turnPath)).json()).toMatchObject({ state: 'working', prompt: input.prompt })
  expect(await (await get(session)).json()).toMatchObject({
    status: 'working',
    messages: [{ role: 'user', content: input.prompt }],
  })
  expect((await submit(`${session}/turns`, { requestId: otherTurnId, prompt: 'Busy' })).status).toBe(409)
  const runningDelete = await app.request(`/api/open/v1/conversations/${originalTurnId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(runningDelete.status).toBe(409)

  first.resolve({ ok: true, providerSessionId, reply: 'Complete reply\n\nSecond paragraph.' })
  await vi.waitFor(async () => expect(await (await get(turnPath)).json()).toMatchObject({ state: 'completed' }))
  const continued = await submit(`${session}/turns`, { requestId: nextTurnId, prompt: 'Now explain the result' })
  expect(continued.status).toBe(202)
  await vi.waitFor(async () =>
    expect(await (await get(continued.headers.get('location')!)).json()).toMatchObject({ state: 'completed' }),
  )
  expect(runProvider).toHaveBeenLastCalledWith(
    expect.objectContaining({ providerSessionId, prompt: 'Now explain the result' }),
  )
  expect(await (await get(session)).json()).toMatchObject({
    status: 'ready',
    messages: [
      { role: 'user', content: input.prompt },
      { role: 'assistant', content: 'Complete reply\n\nSecond paragraph.' },
      { role: 'user', content: 'Now explain the result' },
      { role: 'assistant', content: 'Follow-up complete' },
    ],
  })
})

test('closes only an open terminal in the authorized workspace', async () => {
  const { app, request, get, workspace, otherWorkspace, createTerminal } = await setup()
  const id = await createTerminal()
  const terminal = `${workspace}/terminals/${id}`

  expect((await app.request(terminal, { method: 'DELETE' })).status).toBe(401)
  expect((await request(`${otherWorkspace}/terminals/${id}`, 'DELETE')).status).toBe(404)
  expect(ptys[0]!.kill).not.toHaveBeenCalled()
  expect((await request(terminal, 'DELETE')).status).toBe(204)
  expect(ptys[0]!.kill).toHaveBeenCalledTimes(1)
  expect((await get(terminal)).status).toBe(404)
  expect(await (await get(`${workspace}/sessions`)).json()).toMatchObject({ terminals: [] })
})

test('sends text and Ctrl+C exactly once with a scoped lease and reports the PTY write attempt', async () => {
  const { app, request, get, submit, workspace, otherWorkspace, createTerminal } = await setup()
  const id = await createTerminal()
  const otherId = await createTerminal()
  const terminal = `${workspace}/terminals/${id}`
  ptys[0]!.output?.(`visible ${internalSecret} output`)
  expect(await (await get(terminal)).json()).toMatchObject({ excerpt: 'visible … output' })

  expect((await app.request(`${terminal}/control`, { method: 'POST' })).status).toBe(401)
  expect((await request(`${otherWorkspace}/terminals/${id}/control`, 'POST')).status).toBe(409)
  const acquired = await request(`${terminal}/control`, 'POST')
  expect(acquired.status).toBe(201)
  const { controlId, terminalSessionId, expiresAt } = await acquired.json()
  expect(terminalSessionId).toBe(id)
  expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())
  const control = acquired.headers.get('Location')!
  const input = `${control}/input`
  const text = { requestId: originalTurnId, data: '你好\r' }
  const interrupt = { requestId: nextTurnId, data: '\x03' }

  expect((await app.request(input, { method: 'POST' })).status).toBe(401)
  expect(
    (await app.request(input, { method: 'POST', headers: { Authorization: `Bearer ${internalSecret}` } })).status,
  ).toBe(401)
  expect((await app.request(control, { method: 'DELETE' })).status).toBe(401)
  expect((await submit(`${workspace}/terminals/${otherId}/control/${controlId}/input`, text)).status).toBe(409)
  expect((await submit(`${otherWorkspace}/terminals/${id}/control/${controlId}/input`, text)).status).toBe(409)
  expect(ptys[0]!.write).not.toHaveBeenCalled()
  const retries = await Promise.all([submit(input, text), submit(input, text)])
  for (const response of retries) {
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true, delivery: 'unconfirmed' })
  }
  expect((await submit(input, { ...text, data: 'different' })).status).toBe(409)
  expect((await submit(input, interrupt)).status).toBe(202)
  expect(ptys[0]!.write.mock.calls).toEqual([[text.data], [interrupt.data]])

  ptys[0]!.write.mockImplementationOnce(() => {
    throw new Error('PTY unavailable')
  })
  const failed = { requestId: otherTurnId, data: 'once' }
  for (const response of [await submit(input, failed), await submit(input, failed)]) {
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'input_delivery_unknown' } })
  }
  expect(ptys[0]!.write).toHaveBeenCalledTimes(3)
  expect((await request(control, 'DELETE')).status).toBe(204)
  expect((await submit(input, interrupt)).status).toBe(409)
  expect(ptys[0]!.write).toHaveBeenCalledTimes(3)
})

test('accepts one input request at a time alongside desktop input and remembers its result', async () => {
  const { app, request, submit, workspace, otherWorkspace, createTerminal } = await setup()
  const sessionId = await createTerminal()
  const terminal = `${workspace}/terminals/${sessionId}`
  const input = `${terminal}/input`
  const text = { requestId: originalTurnId, data: '继续检查\r' }
  const interrupt = { requestId: nextTurnId, data: '\x03' }
  const clientId = 'client_test'
  const attachmentId = 'attachment_desktop'
  const socket = { send: vi.fn(), close: vi.fn() }
  registerTerminalSocket(clientId, attachmentId, socket)
  cleanups.push(() => unregisterTerminalSocket(clientId, attachmentId, socket))
  expect(await attachServerTerminal(clientId, { sessionId, attachmentId, cols: 80, rows: 24 })).toMatchObject({
    ok: true,
  })

  expect((await app.request(input, { method: 'POST' })).status).toBe(401)
  expect((await submit(`${otherWorkspace}/terminals/${sessionId}/input`, text)).status).toBe(404)
  let now = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const desktopWrite = (data: string) => writeServerTerminal(clientId, { sessionId, attachmentId, data })

  expect(desktopWrite('desktop\r')).toBe(true)
  now += TERMINAL_INTERACTIVE_INPUT_IDLE_MS - 1
  const busy = await submit(input, text)
  expect(busy.status).toBe(409)
  expect(await busy.json()).toMatchObject({ error: { code: 'interactive_input_active' } })
  expect(ptys[0]!.write.mock.calls).toEqual([['desktop\r']])

  now += 1
  const lease = await request(`${terminal}/control`, 'POST')
  expect(lease.status).toBe(201)
  const leased = await submit(input, text)
  expect(leased.status).toBe(409)
  expect(await leased.json()).toMatchObject({ error: { code: 'control_in_use' } })
  expect((await request(lease.headers.get('Location')!, 'DELETE')).status).toBe(204)

  for (const response of await Promise.all([submit(input, text), submit(input, text)])) {
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true, delivery: 'unconfirmed' })
  }
  expect((await submit(input, interrupt)).status).toBe(202)
  expect(ptys[0]!.write.mock.calls).toEqual([['desktop\r'], [text.data], [interrupt.data]])
  expect(desktopWrite('desktop again\r')).toBe(true)
  expect((await submit(input, text)).status).toBe(202)
  expect((await submit(input, { ...text, data: 'different' })).status).toBe(409)

  now += TERMINAL_INTERACTIVE_INPUT_IDLE_MS
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ptys[0]!.write.mockImplementationOnce(() => {
    throw new Error('PTY unavailable')
  })
  const failedInput = { requestId: otherTurnId, data: 'once\r' }
  for (const response of [await submit(input, failedInput), await submit(input, failedInput)]) {
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'input_delivery_unknown' } })
  }
  expect(ptys[0]!.write.mock.calls).toEqual([
    ['desktop\r'],
    [text.data],
    [interrupt.data],
    ['desktop again\r'],
    [failedInput.data],
  ])
})

test('cancels the specified running turn without accepting a late provider reply', async () => {
  const pending = Promise.withResolvers<AgentProviderResult>()
  const runProvider = vi.fn<RunProvider>().mockReturnValue(pending.promise)
  const { app, request, get, submit, workspace, agents } = await setup(runProvider)
  const started = await submit(`${workspace}/sessions`, {
    mode: 'background',
    requestId: originalTurnId,
    provider: 'codex',
    prompt: 'Run',
  })
  expect(started.status).toBe(202)
  const turn = started.headers.get('Location')!
  const signal = runProvider.mock.calls[0]![0].signal

  expect((await app.request(turn, { method: 'DELETE' })).status).toBe(401)
  expect((await request(`${prefix}/sessions/${nextTurnId}/turns/${originalTurnId}`, 'DELETE')).status).toBe(404)
  expect(signal.aborted).toBe(false)
  for (const response of [await request(turn, 'DELETE'), await request(turn, 'DELETE')]) {
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ state: 'cancelled', finishedAt: expect.any(String) })
  }
  expect(signal.aborted).toBe(true)
  pending.resolve({ ok: true, providerSessionId, reply: 'Late result' })
  await vi.waitFor(() => expect(agents.isWorking(originalTurnId)).toBe(false))
  expect(await (await get(turn)).json()).toMatchObject({ state: 'cancelled' })
  expect(await (await get(`${prefix}/sessions/${originalTurnId}`)).json()).toMatchObject({
    status: 'ready',
    messages: [{ role: 'user', content: 'Run' }],
  })
})

test('closes a background session, cancels its turn and keeps its history readable', async () => {
  const pending = Promise.withResolvers<AgentProviderResult>()
  const runProvider = vi.fn<RunProvider>().mockReturnValue(pending.promise)
  const { app, get, submit, request, workspace, agents } = await setup(runProvider)
  const input = { mode: 'background', requestId: originalTurnId, provider: 'claude', prompt: 'Run' }
  const started = await submit(`${workspace}/sessions`, input)
  expect(started.status).toBe(202)
  const session = `${prefix}/sessions/${originalTurnId}`
  const turn = started.headers.get('Location')!
  expect((await app.request(session, { method: 'DELETE' })).status).toBe(401)
  expect((await request(session, 'DELETE')).status).toBe(204)
  expect((await request(session, 'DELETE')).status).toBe(204)
  expect(runProvider.mock.calls[0]![0].signal.aborted).toBe(true)
  pending.resolve({ ok: true, providerSessionId, reply: 'Late result' })
  await vi.waitFor(() => expect(agents.isWorking(originalTurnId)).toBe(false))
  expect(await (await get(`${workspace}/sessions`)).json()).toMatchObject({ sessions: [] })
  expect(await (await get(session)).json()).toMatchObject({
    status: 'closed',
    messages: [{ role: 'user', content: 'Run' }],
  })
  expect(await (await get(turn)).json()).toMatchObject({ state: 'cancelled' })
  expect((await submit(`${session}/turns`, { requestId: nextTurnId, prompt: 'Continue' })).status).toBe(409)
  expect((await submit(`${workspace}/sessions`, input)).status).toBe(409)
  expect(runProvider).toHaveBeenCalledTimes(1)
})

test.each(['plain-project', '..project'])(
  'keeps Muse terminals inside a plain workspace nested in a Git repository (%s)',
  async (name) => {
    const { get, submit } = await setup()
    const root = realpathSync(fixtures.cwd)
    execFileSync('git', ['init', '--quiet', root])
    const nested = path.join(root, name)
    mkdirSync(nested)
    fixtures.cwd = root
    fixtures.otherCwd = nested

    const { workspaces } = await (await get(`${prefix}/workspaces`)).json()
    const nestedId = workspaces.find((item: { name: string }) => item.name === name).id
    const workspace = `${prefix}/workspaces/${nestedId}`

    expect((await submit(`${workspace}/terminals`, {})).status).toBe(201)
    expect(realpathSync(ptys[0]!.startup.cwd)).toBe(nested)
    expect((await submit(`${workspace}/terminal-sessions`, { provider: 'codex' })).status).toBe(201)
    expect(realpathSync(ptys[1]!.startup.cwd)).toBe(nested)

    const { worktrees } = await (await get(`${workspace}/worktrees`)).json()
    expect(worktrees).toEqual([{ id: expect.any(String), name, branch: null, primary: true }])
    expect((await submit(`${workspace}/terminals`, { worktreeId: worktrees[0].id })).status).toBe(201)
    expect(realpathSync(ptys[2]!.startup.cwd)).toBe(nested)

    const repositoryId = workspaces.find(({ active }: { active: boolean }) => active).id
    const { worktrees: repositoryWorktrees } = await (
      await get(`${prefix}/workspaces/${repositoryId}/worktrees`)
    ).json()
    expect(repositoryWorktrees).toEqual([
      { id: expect.any(String), name: path.basename(root), branch: expect.any(String), primary: true },
    ])
    expect((await submit(`${workspace}/terminals`, { worktreeId: repositoryWorktrees[0].id })).status).toBe(404)
    expect(ptys).toHaveLength(3)
  },
)

test('opens terminals on a known worktree and keeps concurrent creations distinct', async () => {
  const { app, get, submit, workspace, otherWorkspace } = await setup()
  const collection = `${workspace}/terminals`
  expect((await app.request(collection, { method: 'POST' })).status).toBe(401)
  expect((await app.request(collection)).status).toBe(401)
  expect((await submit(collection, { worktreePath: fixtures.cwd })).status).toBe(400)
  expect((await submit(collection, { worktreeId: '0'.repeat(24) })).status).toBe(404)
  expect(ptys).toHaveLength(0)

  const worktrees = await (await get(`${workspace}/worktrees`)).json()
  const worktreeId = worktrees.worktrees[0].id
  const responses = await Promise.all([submit(collection, { worktreeId }), submit(collection, {})])
  const ids: string[] = []
  for (const response of responses) {
    expect(response.status).toBe(201)
    const terminal = await response.json()
    ids.push(terminal.id)
    const location = response.headers.get('Location')!
    expect(location).toBe(`${collection}/${terminal.id}`)
    expect(await (await get(location)).json()).toMatchObject({ id: terminal.id, phase: 'open', excerpt: null })
  }
  expect(new Set(ids).size).toBe(2)
  expect(ptys.map((pty) => pty.startup.cwd)).toEqual([fixtures.cwd, fixtures.cwd])
  expect(await (await get(collection)).json()).toMatchObject({
    terminals: expect.arrayContaining(ids.map((id) => expect.objectContaining({ id }))),
  })
  expect(await (await get(`${otherWorkspace}/terminals`)).json()).toEqual({ terminals: [] })
})

test.each(['codex', 'claude'])(
  'starts, reads, sends input to, and ends a managed %s terminal session',
  async (provider) => {
    const { app, request, get, submit, workspace, otherWorkspace, createTerminal } = await setup()
    const ordinaryId = await createTerminal()
    const collection = `${workspace}/terminal-sessions`
    expect((await app.request(collection, { method: 'POST' })).status).toBe(401)
    expect((await app.request(collection)).status).toBe(401)
    expect((await submit(collection, { provider: 'arbitrary-program' })).status).toBe(400)
    expect(await (await get(collection)).json()).toEqual({ sessions: [] })
    expect((await get(`${collection}/${ordinaryId}`)).status).toBe(404)
    expect((await request(`${collection}/${ordinaryId}`, 'DELETE')).status).toBe(404)

    const started = await submit(collection, { provider })
    expect(started.status).toBe(201)
    const { id } = await started.json()
    const session = started.headers.get('Location')!
    expect(session).toBe(`${collection}/${id}`)
    expect(ptys[1]!.startup).toMatchObject({ agentProvider: provider })
    ptys[1]!.output?.('Ready for a prompt')
    expect((await app.request(session)).status).toBe(401)
    expect(await (await get(session)).json()).toMatchObject({ id, provider, excerpt: 'Ready for a prompt' })
    expect(await (await get(collection)).json()).toMatchObject({ sessions: [{ id, provider }] })
    expect((await request(`${otherWorkspace}/terminal-sessions/${id}`, 'DELETE')).status).toBe(404)
    expect((await app.request(`${session}/control`, { method: 'POST' })).status).toBe(401)
    const directInput = `${session}/input`
    const directPrompt = { requestId: nextTurnId, data: '继续\r' }
    expect((await app.request(directInput, { method: 'POST' })).status).toBe(401)
    expect((await submit(`${collection}/${ordinaryId}/input`, directPrompt)).status).toBe(404)
    expect((await submit(directInput, directPrompt)).status).toBe(202)
    expect((await submit(`${workspace}/terminals/${id}/input`, directPrompt)).status).toBe(202)

    const acquired = await request(`${session}/control`, 'POST')
    expect(acquired.status).toBe(201)
    const { controlId } = await acquired.json()
    const input = `${session}/control/${controlId}/input`
    const prompt = { requestId: originalTurnId, data: '继续检查\r' }
    expect((await app.request(input, { method: 'POST' })).status).toBe(401)
    expect(await (await submit(input, prompt)).json()).toEqual({ accepted: true, delivery: 'unconfirmed' })
    expect((await submit(input, prompt)).status).toBe(202)
    expect(ptys[1]!.write.mock.calls).toEqual([[directPrompt.data], [prompt.data]])
    expect(ptys[0]!.write).not.toHaveBeenCalled()
    expect((await request(acquired.headers.get('Location')!, 'DELETE')).status).toBe(204)

    expect((await app.request(session, { method: 'DELETE' })).status).toBe(401)
    expect((await request(session, 'DELETE')).status).toBe(204)
    expect(ptys[1]!.kill).toHaveBeenCalledTimes(1)
    expect(ptys[0]!.kill).not.toHaveBeenCalled()
    expect((await get(session)).status).toBe(404)
    expect(await (await get(collection)).json()).toEqual({ sessions: [] })
  },
)

test('publishes the terminal and session operations in both OpenAPI documents', async () => {
  const { app } = await setup()
  const terminal = '/muse/workspaces/{workspaceId}/terminals/{terminalId}'
  for (const url of [`${prefix}/openapi.json`, '/api/open/v1/openapi.json']) {
    const contract = await app.request(url)
    expect(contract.status).toBe(200)
    expect(await contract.json()).toMatchObject({
      security: [{ bearerAuth: [] }],
      components: {
        schemas: {
          StartAgentSession: {
            properties: { mode: { const: 'background' } },
            required: expect.arrayContaining(['mode']),
          },
          StartTerminalAgent: { required: ['provider'] },
        },
      },
      paths: {
        '/muse/workspaces/{workspaceId}/sessions': {
          post: {
            operationId: 'startHobgoblinAgentSession',
            description: expect.stringContaining('only when the user explicitly asks for background execution'),
          },
        },
        '/muse/workspaces/{workspaceId}/terminals': {
          get: { operationId: 'listHobgoblinTerminals' },
          post: { operationId: 'createHobgoblinTerminal' },
        },
        '/muse/workspaces/{workspaceId}/terminal-sessions': {
          get: { operationId: 'listHobgoblinTerminalAgentSessions' },
          post: {
            operationId: 'startHobgoblinTerminalAgentSession',
            description: expect.stringContaining('Use this operation by default'),
          },
        },
        '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}': {
          get: { operationId: 'readHobgoblinTerminalAgentSession' },
          delete: { operationId: 'endHobgoblinTerminalAgentSession' },
        },
        '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control': {
          post: { operationId: 'acquireHobgoblinTerminalAgentControl', deprecated: true },
        },
        '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}/input': {
          post: { operationId: 'submitHobgoblinTerminalAgentInput' },
        },
        '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control/{controlId}/input': {
          post: { operationId: 'sendHobgoblinTerminalAgentInput' },
        },
        [terminal]: { delete: { operationId: 'closeHobgoblinTerminal' } },
        [`${terminal}/control`]: { post: { operationId: 'acquireHobgoblinTerminalControl', deprecated: true } },
        [`${terminal}/input`]: {
          post: {
            operationId: 'submitHobgoblinTerminalInput',
            responses: {
              202: {
                content: {
                  'application/json': {
                    schema: {
                      properties: { accepted: { const: true }, delivery: { const: 'unconfirmed' } },
                      required: ['accepted', 'delivery'],
                    },
                  },
                },
              },
            },
          },
        },
        [`${terminal}/control/{controlId}/input`]: {
          post: { operationId: 'sendHobgoblinTerminalInput', deprecated: true },
        },
        [`${terminal}/control/{controlId}`]: { delete: { operationId: 'releaseHobgoblinTerminalControl' } },
        '/muse/sessions/{sessionId}': { delete: { operationId: 'closeHobgoblinAgentSession' } },
        '/muse/sessions/{sessionId}/turns/{requestId}': { delete: { operationId: 'cancelHobgoblinAgentTurn' } },
      },
    })
  }
})

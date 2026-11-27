import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { createApp } from '#/server/app-factory.ts'
import type { AgentProviderResult } from '#/server/modules/agent-open-api-provider.ts'
import { createAgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { registerBranchWorkspaceFolder } from '#/server/modules/branch-workspace-source.ts'
import { createConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import { createOpenApiKeySource } from '#/server/modules/open-api-key-source.ts'
import { workspacePublicId } from '#/server/modules/workspace-public-id.ts'
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
  restartServerTerminal,
  setServerTerminalLifecycleListener,
  unregisterTerminalSocket,
  writeServerTerminal,
} from '#/server/terminal/terminal.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import type { SpawnTerminalPtyRuntimeInput } from '#/server/terminal/terminal-pty-runtime.ts'

const fixtures = vi.hoisted(() => ({ cwd: '', otherCwd: '', processName: 'codex' }))
const ptys: Array<{
  startup: SpawnTerminalPtyRuntimeInput
  output?: (data: string) => void
  exit?: () => void
  write: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  processName: string
}> = []
const token = 'example-open-api-key'
const internalSecret = 'example-internal-secret'
const prefix = '/api/open/v1'
const musePrefix = `${prefix}/muse`
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
    const pty: (typeof ptys)[number] = { startup, write: vi.fn(), kill: vi.fn(), processName: fixtures.processName }
    ptys.push(pty)
    return {
      ok: true,
      runtime: {
        ...pty,
        processName: () => pty.processName,
        resize: vi.fn(),
        onData(listener: (data: string) => void) {
          pty.output = listener
          return { dispose: vi.fn() }
        },
        onExit(listener: () => void) {
          pty.exit = listener
          return { dispose: vi.fn() }
        },
      },
    }
  },
}))

vi.mock('#/system/commit-message-ai.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/system/commit-message-ai.ts')>()),
  resolveProviderExecutable: async () => 'codex',
}))

const cleanups: Array<() => void> = []
afterEach(() => {
  closeAllServerTerminalSessions()
  setServerTerminalLifecycleListener(undefined)
  fixtures.processName = 'codex'
  ptys.length = 0
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllEnvs()
})

async function setup(
  runProvider: RunProvider = vi.fn(),
  codexHistory?: Parameters<typeof createAgentOpenApiRuntime>[2],
  liveCodex?: Parameters<typeof createAgentOpenApiRuntime>[3],
  observeTerminal = false,
) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'hobgoblin-open-api-'))
  fixtures.cwd = temporary
  fixtures.otherCwd = path.join(temporary, 'other')
  const store = createConversationOpenApiStore(path.join(temporary, 'conversations.sqlite'))
  const agents = createAgentOpenApiRuntime(store, runProvider, codexHistory, liveCodex)
  if (observeTerminal) setServerTerminalLifecycleListener(agents.observeTerminal)
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
        file: path.join(temporary, 'open-api-auth-fixture.json'),
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
  return { app, get, submit, request, inventory, workspace, otherWorkspace, createTerminal, agents, store }
}

const originalTurnId = '05b66225-eed2-4729-85de-52c7a677fc99'
const nextTurnId = '116f5a1e-94c9-4c6a-b332-0b01d671c15c'
const otherTurnId = '34414246-df1e-4362-b108-7ddb90609bc9'
const providerSessionId = '4918b888-3c92-415a-8a79-8169b3864c46'

test('makes a selected desktop Codex session readable and resumable from mobile', async () => {
  const provider = vi.fn<RunProvider>().mockResolvedValue({ ok: true, providerSessionId, reply: 'From mobile' })
  const now = Math.floor(Date.now() / 1_000)
  const thread = () => ({
    id: providerSessionId,
    cwd: realpathSync(fixtures.cwd),
    preview: 'Original native session',
    updatedAt: now,
  })
  const turns = [
    { id: 'provider-turn', prompt: 'From terminal', reply: 'Native reply', startedAt: now, completedAt: now },
  ]
  const read = vi.fn(async () => ({
    thread: thread(),
    turns,
  }))
  const { app, workspace, get, submit } = await setup(provider, { list: async () => [thread()], read })
  const location = '?' + new URLSearchParams({ projectRoot: fixtures.cwd, worktreePath: fixtures.cwd })
  const base = '/api/agent-sessions/codex-history'
  const desktop = (route: string, method = 'GET') =>
    app.request(route, { method, headers: { 'x-goblin-internal-secret': internalSecret } })

  expect((await app.request(base + location)).status).toBe(401)
  expect(await (await desktop(base + location)).json()).toMatchObject({
    sessions: [{ id: providerSessionId, title: 'Original native session' }],
  })
  expect(await (await get(workspace + '/sessions')).json()).toMatchObject({ sessions: [] })
  const importRoute = base + '/' + providerSessionId + location
  const result = await desktop(importRoute, 'POST')
  expect(result.status).toBe(200)
  const record = await result.json()
  const session = prefix + '/sessions/' + record.id
  expect((await (await desktop(importRoute, 'POST')).json()).id).toBe(record.id)
  expect(await (await get(workspace + '/sessions')).json()).toMatchObject({ sessions: [{ id: record.id }] })
  expect(await (await get(session)).json()).toMatchObject({
    messages: [
      { role: 'user', content: 'From terminal' },
      { role: 'assistant', content: 'Native reply' },
    ],
  })
  expect(provider).not.toHaveBeenCalled()

  turns.push({
    id: 'provider-turn-2',
    prompt: 'Another native prompt',
    reply: 'Another native reply',
    startedAt: now,
    completedAt: now,
  })
  expect((await (await desktop(importRoute, 'POST')).json()).id).toBe(record.id)
  const synced = await (await get(session)).json()
  expect(synced.messages.map((message: { content: string }) => message.content)).toEqual([
    'From terminal',
    'Native reply',
    'Another native prompt',
    'Another native reply',
  ])

  const followed = await submit(session + '/turns', { requestId: nextTurnId, prompt: 'Continue from app' })
  expect(followed.status).toBe(202)
  await vi.waitFor(() => expect(provider).toHaveBeenCalledWith(expect.objectContaining({ providerSessionId })))
})

test.skipIf(process.platform === 'win32')(
  'syncs a native desktop continuation before releasing mobile sends',
  async () => {
    const provider = vi.fn<RunProvider>().mockResolvedValue({ ok: true, providerSessionId, reply: 'Background reply' })
    const now = Math.floor(Date.now() / 1_000)
    const thread = () => ({ id: providerSessionId, cwd: realpathSync(fixtures.cwd), preview: '', updatedAt: now })
    const turns = [{ id: 'background', prompt: 'From mobile', reply: 'Background reply' }]
    let allowFinalRead = false
    const read = vi.fn(async () => {
      if (turns.length === 3 && !allowFinalRead) throw new Error('Final desktop history is not available yet')
      return { thread: thread(), turns: [...turns] }
    })
    const { app, workspace, get, submit, request, agents } = await setup(provider, { list: async () => [], read })
    expect(
      (
        await submit(workspace + '/sessions', {
          requestId: originalTurnId,
          prompt: 'From mobile',
          mode: 'background',
          provider: 'codex',
        })
      ).status,
    ).toBe(202)
    await vi.waitFor(() => expect(agents.isWorking(originalTurnId)).toBe(false))

    const session = `${prefix}/sessions/${originalTurnId}`
    const resume = `/api/agent-sessions/sessions/${originalTurnId}/terminal`
    const attachmentId = 'attachment_desktop'
    const target = {
      projectRoot: fixtures.cwd,
      repoRoot: fixtures.cwd,
      worktreePath: fixtures.cwd,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      attachmentId,
      cols: 80,
      rows: 24,
    }
    const desktop = (input = target) =>
      app.request(resume, {
        method: 'POST',
        headers: { 'x-goblin-internal-secret': internalSecret, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    expect((await desktop({ ...target, worktreePath: fixtures.otherCwd })).status).toBe(404)
    const [first, second] = await Promise.all([desktop(), desktop()])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const terminal = await first.json()
    expect((await second.json()).sessionId).toBe(terminal.sessionId)
    expect(ptys).toHaveLength(1)
    expect(ptys[0]!.startup).toMatchObject({
      command: 'codex',
      args: ['resume', providerSessionId],
      agentProvider: 'codex',
    })
    const terminalClientId = 'client_' + createHash('sha256').update(internalSecret).digest('hex').slice(0, 32)
    expect(
      await restartServerTerminal(terminalClientId, {
        sessionId: terminal.sessionId,
        cols: 80,
        rows: 24,
        attachmentId,
      }),
    ).toEqual({ ok: false, message: 'error.unavailable' })
    expect(await (await get(session + '/status')).json()).toMatchObject({ terminalActive: true })
    const send = () => submit(session + '/turns', { requestId: nextTurnId, prompt: 'After desktop' })
    expect((await send()).status).toBe(409)
    expect(await (await send()).json()).toMatchObject({ error: { code: 'desktop_terminal_active' } })
    expect((await request(`${prefix}/conversations/${originalTurnId}`, 'DELETE')).status).toBe(409)
    expect(provider).toHaveBeenCalledTimes(1)

    turns.push({ id: 'native-first', prompt: 'From desktop', reply: 'Desktop reply' })
    await vi.waitFor(
      async () => {
        expect(await (await get(session)).json()).toMatchObject({
          terminalActive: true,
          messages: [
            { content: 'From mobile' },
            { content: 'Background reply' },
            { content: 'From desktop' },
            { content: 'Desktop reply' },
          ],
        })
      },
      { timeout: 5_000 },
    )
    const readsBeforeExit = read.mock.calls.length
    turns.push({ id: 'native-final', prompt: 'Last desktop prompt', reply: 'Last desktop reply' })
    ptys[0]!.exit!()
    await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(readsBeforeExit), { timeout: 5_000 })
    expect((await send()).status).toBe(409)
    allowFinalRead = true
    await vi.waitFor(
      async () => {
        expect(await (await get(session + '/status')).json()).toMatchObject({ terminalActive: false })
      },
      { timeout: 5_000 },
    )
    const history = await (await get(session)).json()
    expect(history.messages.map(({ content }: { content: string }) => content)).toEqual([
      'From mobile',
      'Background reply',
      'From desktop',
      'Desktop reply',
      'Last desktop prompt',
      'Last desktop reply',
    ])
    expect(ptys).toHaveLength(1)
    expect((await send()).status).toBe(202)
    expect(provider).toHaveBeenLastCalledWith(expect.objectContaining({ providerSessionId, prompt: 'After desktop' }))
  },
  16_000,
)

test.skipIf(process.platform === 'win32')('reads the exact native Codex thread when opening a session', async () => {
  const updatedAt = Math.floor(Date.now() / 1_000)
  const thread = () => ({ id: providerSessionId, cwd: realpathSync(fixtures.cwd), preview: '', updatedAt })
  const history = [{ id: 'first-desktop-turn', prompt: 'First question', reply: 'First answer' }]
  const listNative = vi.fn(async () => [thread()])
  const read = vi.fn(async () => ({ thread: thread(), turns: [...history] }))
  const { get, workspace } = await setup(
    vi.fn<RunProvider>(),
    { list: async () => [], listNative, read },
    { list: async () => [], send: async () => ({ outcome: 'unavailable' }) },
  )
  const first = await (await get(workspace + '/sessions?native=1')).json()
  expect(first.sessions).toHaveLength(1)
  const session = `${prefix}/sessions/${first.sessions[0].id}`
  expect(listNative).toHaveBeenCalledTimes(1)
  read.mockClear()
  history.push({ id: 'new-desktop-turn', prompt: 'New question', reply: 'New answer' })

  const cached = await (await get(session)).json()
  expect(cached.messages).toHaveLength(2)
  expect(read).not.toHaveBeenCalled()

  const opened = await (await get(session + '?native=1')).json()
  expect(opened.messages.map(({ content }: { content: string }) => content)).toEqual([
    'First question',
    'First answer',
    'New question',
    'New answer',
  ])
  expect(read).toHaveBeenCalledExactlyOnceWith(providerSessionId, realpathSync(fixtures.cwd), expect.any(AbortSignal))
  expect(listNative).toHaveBeenCalledTimes(1)

  expect((await get(workspace + '/sessions?native=1&refresh=1')).status).toBe(200)
  expect(listNative).toHaveBeenCalledTimes(2)
})

test.skipIf(process.platform === 'win32')(
  'automatically saves native turns and sends mobile input to the loaded Codex thread',
  async () => {
    const provider = vi.fn<RunProvider>()
    const history = [{ id: 'desktop-turn', prompt: 'Desktop question', reply: 'Desktop answer' }]
    let updatedAt = Math.floor(Date.now() / 1_000)
    let live = true
    const thread = () => ({ id: providerSessionId, cwd: realpathSync(fixtures.cwd), preview: '', updatedAt })
    const send = vi
      .fn<NonNullable<Parameters<typeof createAgentOpenApiRuntime>[3]>['send']>()
      .mockResolvedValue({ outcome: 'accepted', turnId: 'mobile-turn' })
    const list = vi.fn(async () => (live ? [{ ...thread(), ephemeral: false, status: { type: 'idle' } }] : []))
    const { app, workspace, get, submit, request, store } = await setup(
      provider,
      {
        list: async () => [],
        listNative: async () => [thread()],
        read: async () => ({ thread: thread(), turns: [...history] }),
      },
      { list, send },
    )
    const response = await get(workspace + '/sessions?native=1')
    expect(response.status).toBe(200)
    const { sessions } = await response.json()
    expect(sessions).toEqual([
      expect.objectContaining({ nativeCodex: true, terminalActive: true, terminalWritable: true }),
    ])
    const id = sessions[0].id
    const nativeSession = `${prefix}/sessions/${id}`
    expect(store.getAgentSession(id)?.providerSessionId).toBe(providerSessionId)
    expect((await app.request(nativeSession + '/turns?native=1', { method: 'POST' })).status).toBe(401)
    const input = { requestId: nextTurnId, prompt: 'Mobile question' }
    expect((await submit(nativeSession + '/turns', input)).status).toBe(202)
    expect((await submit(nativeSession + '/turns?native=1', input)).status).toBe(202)
    expect((await submit(nativeSession + '/turns?native=1', input)).status).toBe(202)
    expect((await submit(nativeSession + '/turns?native=1', { ...input, prompt: 'Different' })).status).toBe(409)
    expect(send).toHaveBeenCalledExactlyOnceWith(
      providerSessionId,
      realpathSync(fixtures.cwd),
      input.prompt,
      expect.any(AbortSignal),
    )
    expect(provider).not.toHaveBeenCalled()
    expect(ptys).toHaveLength(0)

    history.push({ id: 'mobile-turn', prompt: input.prompt, reply: 'Mobile answer' })
    updatedAt++
    const turnPath = nativeSession + '/turns/' + nextTurnId + '?native=1'
    await vi.waitFor(
      async () => {
        expect(await (await get(turnPath)).json()).toMatchObject({ requestId: nextTurnId, state: 'completed' })
      },
      { timeout: 5_000 },
    )
    expect((await get(workspace + '/sessions?native=1')).status).toBe(200)
    expect((await get(workspace + '/sessions?native=1')).status).toBe(200)
    expect(store.getConversation(id)?.messages.map(({ content }) => content)).toEqual([
      'Desktop question',
      'Desktop answer',
      'Mobile question',
      'Mobile answer',
    ])

    send.mockResolvedValueOnce({ outcome: 'unknown' })
    const unconfirmed = { requestId: otherTurnId, prompt: 'Unconfirmed mobile question' }
    const endpoint = nativeSession + '/turns?native=1'
    expect((await submit(endpoint, unconfirmed)).status).toBe(503)
    expect(await (await submit(endpoint, unconfirmed)).json()).toMatchObject({
      error: { code: 'native_delivery_unknown' },
    })
    expect(send).toHaveBeenCalledTimes(2)

    const deletion = `${prefix}/conversations/${id}`
    expect((await request(deletion, 'DELETE')).status).toBe(409)
    live = false
    await vi.waitFor(
      async () => {
        expect(await (await get(nativeSession + '/status?native=1')).json()).toMatchObject({
          terminalActive: false,
          terminalWritable: false,
        })
      },
      { timeout: 5_000 },
    )
    expect((await request(deletion, 'DELETE')).status).toBe(204)
    const scansBeforeDelete = list.mock.calls.length
    updatedAt++
    await vi.waitFor(
      async () => {
        expect((await get(workspace + '/sessions?native=1')).status).toBe(200)
        expect(list.mock.calls.length).toBeGreaterThan(scansBeforeDelete)
      },
      { timeout: 5_000 },
    )
    expect(await (await get(workspace + '/sessions?native=1')).json()).toMatchObject({ sessions: [] })
  },
  14_000,
)

test('discovers a registered subworkspace and continues its session across desktop and OpenAPI', async () => {
  const runProvider = vi.fn<RunProvider>().mockResolvedValue({ ok: true, providerSessionId, reply: 'Finished' })
  const { app, get, submit, workspace, inventory } = await setup(runProvider)
  vi.stubEnv('GOBLIN_SERVER_DATA_DIR', fixtures.cwd)
  const subworkspace = path.join(fixtures.cwd, 'Release work')
  const member = path.join(subworkspace, 'example')
  mkdirSync(member, { recursive: true })
  execFileSync('git', ['init', '-b', 'release'], { cwd: member })
  await registerBranchWorkspaceFolder(fixtures.cwd, subworkspace)

  const targets = await (await get(`${workspace}/targets`)).json()
  expect(targets.subworkspaces).toEqual([
    expect.objectContaining({
      name: 'Release work',
      root: expect.objectContaining({ name: 'Release work' }),
      worktrees: [expect.objectContaining({ name: 'example', branch: 'release' })],
    }),
  ])

  const started = await submit(`${workspace}/sessions`, {
    mode: 'background',
    provider: 'codex',
    worktreeId: targets.subworkspaces[0].worktrees[0].id,
    prompt: 'First message',
    requestId: originalTurnId,
  })
  expect(started.status).toBe(202)
  expect(started.headers.get('Location')).toBe(`${prefix}/sessions/${originalTurnId}/turns/${originalTurnId}`)
  const desktopSession = `/api/agent-sessions/sessions/${originalTurnId}`
  expect((await app.request(desktopSession)).status).toBe(401)
  const desktop = (route: string, body?: object) =>
    app.request(route, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goblin-internal-secret': internalSecret, 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    })
  const terminalEntries = (worktreePath: string) =>
    '/api/agent-sessions/terminal-entries?' + new URLSearchParams({ projectRoot: fixtures.cwd, worktreePath })
  expect((await app.request(terminalEntries(member))).status).toBe(401)
  expect(await (await desktop(terminalEntries(member))).json()).toMatchObject({
    sessions: [{ id: originalTurnId }],
  })
  expect(await (await desktop(terminalEntries(fixtures.cwd))).json()).toEqual({ sessions: [] })
  const workspaceId = inventory.workspaces[0].id
  expect(await (await desktop(`/api/agent-sessions/workspaces/${workspaceId}/sessions`)).json()).toMatchObject({
    sessions: [{ id: originalTurnId }],
  })
  await vi.waitFor(async () =>
    expect(await (await desktop(desktopSession)).json()).toMatchObject({
      messages: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Finished' },
      ],
    }),
  )
  const continued = await desktop(`${desktopSession}/turns`, { requestId: nextTurnId, prompt: 'From desktop' })
  expect(continued.status).toBe(202)
  await vi.waitFor(async () =>
    expect(await (await get(`${prefix}/sessions/${originalTurnId}/status`)).json()).toMatchObject({
      latestTurn: { requestId: nextTurnId, state: 'completed' },
    }),
  )
  expect(await (await get(`${prefix}/workspaces/${workspaceId}/sessions`)).json()).toMatchObject({
    sessions: [{ id: originalTurnId, latestTurn: { requestId: nextTurnId } }],
  })
  expect(await (await get(`${prefix}/sessions/${originalTurnId}`)).json()).toMatchObject({
    id: originalTurnId,
    messages: [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Finished' },
      { role: 'user', content: 'From desktop' },
      { role: 'assistant', content: 'Finished' },
    ],
  })
  expect(await (await get(`${musePrefix}/sessions/${originalTurnId}/status`)).json()).toMatchObject({
    id: originalTurnId,
    latestTurn: { requestId: nextTurnId, state: 'completed' },
  })
  expect(runProvider).toHaveBeenLastCalledWith(
    expect.objectContaining({ cwd: realpathSync(member), providerSessionId }),
  )

  const desktopStarted = await desktop(`/api/agent-sessions/workspaces/${workspaceId}/sessions`, {
    mode: 'background',
    provider: 'codex',
    requestId: otherTurnId,
    prompt: 'New from desktop',
  })
  expect(desktopStarted.status).toBe(202)
  expect(await (await get(`${workspace}/sessions`)).json()).toMatchObject({
    sessions: expect.arrayContaining([expect.objectContaining({ id: otherTurnId })]),
  })
  await vi.waitFor(async () =>
    expect(await (await get(`${prefix}/sessions/${otherTurnId}`)).json()).toMatchObject({
      id: otherTurnId,
      messages: [
        { role: 'user', content: 'New from desktop' },
        { role: 'assistant', content: 'Finished' },
      ],
    }),
  )
})

test('paginates session summaries across open workspaces and searches beyond the first page', async () => {
  const { app, get, workspace, otherWorkspace, store } = await setup()
  const receivedAt = Math.floor(Date.now() / 1_000)
  const oldPrompt = 'Find this older conversation\nComplete detail is only available after opening it.'
  const seed = (workspaceRoute: string, repoId: string, providerId: string, prompt: string, updatedAt: number) =>
    store.importCodexSession(
      { workspaceId: workspaceRoute.split('/').at(-1)!, worktreeId: 'worktree', repoId, cwd: repoId },
      providerId,
      [{ id: 'turn', prompt, reply: 'Example reply' }],
      updatedAt,
      true,
    )!
  const first = seed(workspace, fixtures.cwd, originalTurnId, 'First worktree', receivedAt)
  const second = seed(otherWorkspace, fixtures.otherCwd, nextTurnId, 'Second worktree', receivedAt)
  const older = seed(workspace, fixtures.cwd, otherTurnId, oldPrompt, receivedAt - 1)
  const hidden = seed('/workspaces/unopened', fixtures.cwd, providerSessionId, 'Unopened workspace', receivedAt)
  const address = `${prefix}/sessions`

  expect((await app.request(address)).status).toBe(401)
  expect((await get(`${address}?limit=0`)).status).toBe(400)
  expect((await get(`${address}?cursor=bad`)).status).toBe(400)
  const pageOne = await (await get(`${address}?limit=1`)).json()
  const pageTwo = await (await get(`${address}?limit=1&cursor=${pageOne.nextCursor}`)).json()
  const lastPage = await (await get(`${address}?limit=1&cursor=${pageTwo.nextCursor}`)).json()
  const summaries = [...pageOne.sessions, ...pageTwo.sessions, ...lastPage.sessions]
  expect(summaries.map(({ id }) => id)).toEqual([...[first.id, second.id].sort(), older.id])
  expect(summaries).toHaveLength(3)
  expect(summaries.every((summary) => !('messages' in summary))).toBe(true)
  expect(summaries.some(({ id }) => id === hidden.id)).toBe(false)
  expect(lastPage.nextCursor).toBeNull()
  expect(lastPage.sessions[0].latestTurn.prompt).toBe('Find this older conversation')
  const search = await (await get(`${address}?q=older%20conversation`)).json()
  expect(search.sessions.map(({ id }: { id: string }) => id)).toEqual([older.id])
  expect(await (await get(`${address}/${older.id}`)).json()).toMatchObject({
    messages: [
      { role: 'user', content: oldPrompt },
      { role: 'assistant', content: 'Example reply' },
    ],
  })
})

test('deletes an idle background conversation through OpenAPI and removes it from the desktop panel', async () => {
  const pending = Promise.withResolvers<AgentProviderResult>()
  const runProvider = vi.fn<RunProvider>().mockReturnValue(pending.promise)
  const { app, get, submit, request, workspace } = await setup(runProvider)
  const started = await submit(`${workspace}/sessions`, {
    mode: 'background',
    provider: 'codex',
    requestId: originalTurnId,
    prompt: 'Review the test output',
  })
  expect(started.status).toBe(202)
  const conversation = `${prefix}/conversations/${originalTurnId}`
  const session = `${prefix}/sessions/${originalTurnId}`
  const desktopSession = `/api/agent-sessions/sessions/${originalTurnId}`
  const desktopList = workspace.replace(prefix, '/api/agent-sessions') + '/sessions'
  const desktop = (route: string) => app.request(route, { headers: { 'x-goblin-internal-secret': internalSecret } })

  expect((await app.request(conversation, { method: 'DELETE' })).status).toBe(401)
  expect((await request(conversation, 'DELETE')).status).toBe(409)
  pending.resolve({ ok: true, providerSessionId, reply: 'Review finished' })
  await vi.waitFor(async () => {
    expect(await (await desktop(desktopSession)).json()).toMatchObject({
      status: 'ready',
      messages: [
        { role: 'user', content: 'Review the test output' },
        { role: 'assistant', content: 'Review finished' },
      ],
    })
  })

  expect((await request(conversation, 'DELETE')).status).toBe(204)
  expect(await (await request(conversation, 'DELETE')).json()).toMatchObject({
    error: { code: 'conversation_not_found' },
  })
  expect((await get(`${conversation}/messages`)).status).toBe(404)
  expect((await get(`${session}/turns/${originalTurnId}`)).status).toBe(404)
  expect(await (await get(`${workspace}/sessions`)).json()).toMatchObject({ sessions: [] })
  expect(await (await desktop(desktopList)).json()).toEqual({ sessions: [] })
  expect((await desktop(`${desktopSession}/status`)).status).toBe(404)
})

test('stops a running background turn when explicitly deleting its conversation', async () => {
  const pending = Promise.withResolvers<AgentProviderResult>()
  const runProvider = vi.fn<RunProvider>().mockReturnValue(pending.promise)
  const { app, agents, get, submit, request, workspace } = await setup(runProvider)
  const input = { mode: 'background', provider: 'claude', requestId: originalTurnId, prompt: 'Run checks' }
  expect((await submit(`${workspace}/sessions`, input)).status).toBe(202)
  const conversation = `${prefix}/conversations/${originalTurnId}`
  const turn = `${prefix}/sessions/${originalTurnId}/turns/${originalTurnId}`
  const signal = runProvider.mock.calls[0]![0].signal

  expect((await app.request(`${conversation}?mode=stop-background`, { method: 'DELETE' })).status).toBe(401)
  expect((await request(conversation, 'DELETE')).status).toBe(409)
  expect((await request(`${conversation}?mode=remove-desktop-copy`, 'DELETE')).status).toBe(409)
  expect(signal.aborted).toBe(false)
  expect((await request(`${conversation}?mode=stop-background`, 'DELETE')).status).toBe(204)
  expect(signal.aborted).toBe(true)
  expect((await submit(`${workspace}/sessions`, input)).status).toBe(409)

  pending.resolve({ ok: true, providerSessionId, reply: 'Late reply' })
  await vi.waitFor(() => expect(agents.isWorking(originalTurnId)).toBe(false))
  expect((await get(turn)).status).toBe(404)
  expect((await get(`${conversation}/messages`)).status).toBe(404)
  expect(await (await get(`${workspace}/sessions`)).json()).toMatchObject({ sessions: [] })
})

test.skipIf(process.platform === 'win32')(
  'removes a running desktop Codex copy while the source thread remains active',
  async () => {
    const updatedAt = Math.floor(Date.now() / 1_000)
    const thread = () => ({ id: providerSessionId, cwd: realpathSync(fixtures.cwd), preview: '', updatedAt })
    const read = vi.fn(async () => ({
      thread: thread(),
      turns: [{ id: 'desktop-turn', prompt: 'Check output', reply: 'Checks passed' }],
    }))
    const liveThread = () => ({ ...thread(), ephemeral: false, status: { type: 'active' } })
    const list = vi.fn(async () => [liveThread()])
    const { get, request, workspace } = await setup(
      vi.fn<RunProvider>(),
      { list: async () => [], listNative: async () => [thread()], read },
      { list, send: async () => ({ outcome: 'unavailable' }) },
    )
    const { sessions } = await (await get(`${workspace}/sessions?native=1`)).json()
    expect(sessions).toEqual([expect.objectContaining({ nativeCodex: true, status: 'working', terminalActive: true })])
    const conversation = `${prefix}/conversations/${sessions[0].id}`
    expect((await request(`${conversation}?mode=stop-background`, 'DELETE')).status).toBe(409)
    expect((await request(`${conversation}?mode=remove-desktop-copy`, 'DELETE')).status).toBe(204)
    expect((await get(conversation)).status).toBe(404)
    expect(await list()).toEqual([liveThread()])
    expect(await (await get(`${workspace}/sessions?native=1&refresh=1`)).json()).toMatchObject({ sessions: [] })
  },
)

test.skipIf(process.platform === 'win32')(
  'discovers visible native Codex history when newer live threads are hidden',
  async () => {
    const updatedAt = Math.floor(Date.now() / 1_000)
    const hiddenIds = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`)
    const threads = () =>
      [...hiddenIds, providerSessionId].map((id, index) => ({
        id,
        cwd: realpathSync(fixtures.cwd),
        preview: '',
        updatedAt: updatedAt - index,
      }))
    const read = vi.fn(async (id: string) => ({
      thread: threads().find((thread) => thread.id === id)!,
      turns: [{ id: 'desktop-turn', prompt: 'Check output', reply: 'Checks passed' }],
    }))
    const { get, workspace, store } = await setup(
      vi.fn<RunProvider>(),
      { list: async () => [], listNative: async () => threads(), read },
      {
        list: async () => threads().map((thread) => ({ ...thread, ephemeral: false, status: { type: 'idle' } })),
        send: async () => ({ outcome: 'unavailable' }),
      },
    )
    const repoId = fixtures.cwd
    const target = {
      workspaceId: workspacePublicId(repoId),
      worktreeId: workspacePublicId(`${repoId}\0${repoId}`),
      repoId,
      cwd: repoId,
    }
    for (const id of hiddenIds) {
      const record = store.importCodexSession(target, id, [], updatedAt, true)!
      expect(store.deleteConversation(record.id)).toBe(true)
    }

    const response = await get(`${workspace}/sessions?native=1`)
    expect(response.status).toBe(200)
    const { sessions } = await response.json()
    expect(sessions).toHaveLength(1)
    expect(store.getAgentSession(sessions[0].id)?.providerSessionId).toBe(providerSessionId)
    expect(read.mock.calls).toEqual([[providerSessionId, expect.any(String), expect.any(AbortSignal)]])
  },
)

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

test('registers explicit and detected terminal sessions and uses the worker lease for unified input', async () => {
  fixtures.processName = 'sh'
  const { app, get, submit, request, workspace, createTerminal } = await setup(undefined, undefined, undefined, true)
  const terminal = await (await submit(`${workspace}/terminal-sessions`, { provider: 'claude' })).json()
  const resource = `${prefix}/terminal-records/${terminal.id}/session`
  expect((await app.request(resource)).status).toBe(401)
  const session = await (await get(resource)).json()
  expect(session).toMatchObject({
    id: terminal.conversationId,
    provider: 'claude',
    mode: 'terminal',
    terminalActive: true,
    terminalLink: { terminalId: terminal.id, source: 'explicit' },
  })
  const base = `${prefix}/sessions/${session.id}`
  expect(await (await get(base + '/messages')).json()).toMatchObject({ messages: [], nextCursor: null })
  expect(await (await get(base + '/control')).json()).toMatchObject({
    revision: session.revision,
    controller: null,
    connected: false,
  })
  const lease = await submit(base + '/control', {})
  expect(lease.status).toBe(201)
  const { controlId } = await lease.json()
  const input = { requestId: nextTurnId, data: 'Example\r' }
  const busy = await submit(base + '/input', input)
  expect(busy.status).toBe(409)
  expect(await busy.json()).toMatchObject({ current: { revision: session.revision }, control: { controller: 'api' } })
  expect((await submit(base + '/input', { ...input, controlId })).status).toBe(202)
  expect((await submit(base + '/input', { ...input, controlId })).status).toBe(202)
  expect(ptys[0]!.write).toHaveBeenCalledExactlyOnceWith(input.data)
  expect((await request(base + '/control/' + controlId, 'DELETE')).status).toBe(204)
  expect((await submit(base + '/turns', { requestId: nextTurnId, prompt: 'Example' })).status).toBe(409)
  ptys[0]!.exit!()
  expect(await (await get(base + '/status')).json()).toMatchObject({ terminalActive: false })
  expect((await submit(base + '/input', input)).status).toBe(409)

  const shellId = await createTerminal()
  const link = `${prefix}/terminal-records/${shellId}/session`
  expect((await get(link)).status).toBe(404)
  ptys[1]!.processName = 'codex'
  ptys[1]!.output!('ready')
  expect(await (await get(link)).json()).toMatchObject({ provider: 'codex', terminalLink: { source: 'detected' } })
  expect(await (await submit(link, { provider: 'codex' })).json()).toMatchObject({ terminalLink: { source: 'manual' } })
})

test('uses a verified native Codex link for structured input and Muse history', async () => {
  fixtures.processName = 'sh'
  const updatedAt = Math.floor(Date.now() / 1_000)
  const thread = () => ({ id: providerSessionId, cwd: realpathSync(fixtures.cwd), preview: '', updatedAt })
  const history = [{ id: 'desktop-existing-turn', prompt: 'Original input', reply: 'Original output' }]
  const send = vi
    .fn<NonNullable<Parameters<typeof createAgentOpenApiRuntime>[3]>['send']>()
    .mockResolvedValue({ outcome: 'accepted', turnId: 'linked-turn' })
  const { get, submit, workspace, request } = await setup(
    undefined,
    {
      list: async () => [],
      read: async () => ({ thread: thread(), turns: history }),
    },
    { list: async () => [], send },
    true,
  )
  const terminal = await (await submit(`${workspace}/terminal-sessions`, { provider: 'codex' })).json()
  const linked = await submit(`${prefix}/terminal-records/${terminal.id}/session`, {
    provider: 'codex',
    providerSessionId,
  })
  expect(linked.status).toBe(200)
  const session = await linked.json()
  expect(session).toMatchObject({ nativeCodex: true, terminalLink: { terminalId: terminal.id, source: 'manual' } })
  expect((await get(`${prefix}/sessions/${terminal.conversationId}/status`)).status).toBe(200)
  const base = `${prefix}/sessions/${session.id}`
  const lease = await submit(base + '/control', {})
  const leaseId = (await lease.json()).controlId
  const input = { requestId: nextTurnId, prompt: 'Follow up', expectedRevision: session.revision }
  const denied = await submit(base + '/turns', input)
  expect(denied.status).toBe(409)
  expect(await denied.json()).toMatchObject({ error: { code: 'control_in_use' }, controller: 'api' })
  expect(send).not.toHaveBeenCalled()
  expect((await request(base + '/control/' + leaseId, 'DELETE')).status).toBe(204)
  expect((await submit(base + '/turns', input)).status).toBe(202)
  expect((await submit(base + '/turns', input)).status).toBe(202)
  expect(send).toHaveBeenCalledTimes(1)
  const messagesPath = `${musePrefix}/sessions/${session.id}/messages`
  const latest = await (await get(messagesPath + '?limit=1')).json()
  expect(latest.messages).toMatchObject([{ content: 'Original output', turnRequestId: expect.any(String) }])
  expect(await (await get(messagesPath + '?beforeSeq=' + latest.nextCursor)).json()).toMatchObject({
    messages: [{ content: 'Original input', turnRequestId: latest.messages[0].turnRequestId }],
    nextCursor: null,
  })
})

test('uses the same session and turn store for compatibility requests and rejects stale revisions', async () => {
  const provider = vi.fn<RunProvider>().mockResolvedValue({ ok: true, providerSessionId, reply: 'Example reply' })
  const { app, get, submit, workspace } = await setup(provider)
  const workspaceId = workspace.split('/').at(-1)
  const url = prefix + '/chat/completions'
  const payload = {
    model: 'codex',
    messages: [{ role: 'user', content: 'Example input' }],
    metadata: { hob_workspace_id: workspaceId, hob_request_id: originalTurnId },
  }
  expect((await app.request(url, { method: 'POST' })).status).toBe(401)
  expect((await submit(url, { ...payload, stream: true })).status).toBe(400)
  const result = await submit(url, payload)
  expect(result.status).toBe(200)
  expect(result.headers.get('X-Hob-Session-Id')).toBe(originalTurnId)
  expect(await result.json()).toMatchObject({
    object: 'chat.completion',
    choices: [{ message: { role: 'assistant', content: 'Example reply' } }],
  })
  expect((await submit(url, payload)).status).toBe(200)
  expect(provider).toHaveBeenCalledTimes(1)
  const session = `${prefix}/sessions/${originalTurnId}`
  const current = await (await get(session + '/status')).json()
  expect(current.revision).toBeGreaterThan(1)
  const stale = await submit(session + '/turns', { requestId: nextTurnId, prompt: 'Second', expectedRevision: 1 })
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({
    error: { code: 'revision_conflict' },
    current: { revision: current.revision },
  })
  expect(await (await get(session + '/turns')).json()).toMatchObject({ turns: [{ requestId: originalTurnId }] })
  expect(await (await get(musePrefix + '/sessions/' + originalTurnId)).json()).toMatchObject({
    messages: [{ content: 'Example input' }, { content: 'Example reply' }],
  })
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
    paths: { '/workspaces/{workspaceId}/sessions': { post: { operationId: 'startHobgoblinAgentSession' } } },
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
  'keeps OpenAPI terminals inside a plain workspace nested in a Git repository (%s)',
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

test('keeps Muse connector URLs, authentication and terminal locations compatible', async () => {
  const { app, get, submit, workspace, inventory } = await setup()
  const museWorkspace = `${musePrefix}/workspaces/${inventory.workspaces[0].id}`
  expect((await app.request(`${musePrefix}/workspaces`)).status).toBe(401)
  expect(await (await get(`${musePrefix}/workspaces`)).json()).toEqual(inventory)
  const created = await submit(`${museWorkspace}/terminal-sessions`, { provider: 'codex' })
  expect(created.status).toBe(201)
  const terminal = await created.json()
  const location = `${museWorkspace}/terminal-sessions/${terminal.id}`
  expect(created.headers.get('Location')).toBe(location)
  expect(await (await get(location)).json()).toEqual(
    await (await get(`${workspace}/terminal-sessions/${terminal.id}`)).json(),
  )
})

test.each(['', '/muse'])('publishes terminal and session operations at /api/open/v1%s/openapi.json', async (scope) => {
  const { app } = await setup()
  const terminal = `${scope}/workspaces/{workspaceId}/terminals/{terminalId}`
  const contract = await app.request(`${prefix}${scope}/openapi.json`)
  expect(contract.status).toBe(200)
  const document = await contract.json()
  if (!scope) expect(JSON.stringify(document)).not.toMatch(/muse/i)
  expect(document).toMatchObject({
    info: { title: scope ? 'Hobgoblin for Muse' : 'Hobgoblin OpenAPI' },
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
      [`${scope}/workspaces/{workspaceId}/sessions`]: {
        post: {
          operationId: 'startHobgoblinAgentSession',
          description: expect.stringContaining(
            scope ? 'only when the user explicitly asks for background execution' : 'Set mode to background',
          ),
        },
      },
      [`${scope}/workspaces/{workspaceId}/terminals`]: {
        get: { operationId: 'listHobgoblinTerminals' },
        post: { operationId: 'createHobgoblinTerminal' },
      },
      [`${scope}/workspaces/{workspaceId}/terminal-sessions`]: {
        get: { operationId: 'listHobgoblinTerminalAgentSessions' },
        post: {
          operationId: 'startHobgoblinTerminalAgentSession',
          description: expect.stringContaining(
            scope ? 'Use this operation by default' : 'Read the terminal at the returned Location',
          ),
        },
      },
      [`${scope}/workspaces/{workspaceId}/terminal-sessions/{terminalId}`]: {
        get: { operationId: 'readHobgoblinTerminalAgentSession' },
        delete: { operationId: 'endHobgoblinTerminalAgentSession' },
      },
      [`${scope}/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control`]: {
        post: { operationId: 'acquireHobgoblinTerminalAgentControl', deprecated: true },
      },
      [`${scope}/workspaces/{workspaceId}/terminal-sessions/{terminalId}/input`]: {
        post: { operationId: 'submitHobgoblinTerminalAgentInput' },
      },
      [`${scope}/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control/{controlId}/input`]: {
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
      [`${scope}/sessions/{sessionId}`]: { delete: { operationId: 'closeHobgoblinAgentSession' } },
      [`${scope}/sessions/{sessionId}/turns/{requestId}`]: { delete: { operationId: 'cancelHobgoblinAgentTurn' } },
    },
  })
})

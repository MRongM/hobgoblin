import { type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test, vi } from 'vitest'
import { createConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import { createOpenApiKeySource } from '#/server/modules/open-api-key-source.ts'
import { workspacePublicId } from '#/server/modules/workspace-public-id.ts'
import { createConversationOpenApiRoutes } from '#/server/routes/conversation-open-api.ts'
import type { TerminalLifecycleEvent, TerminalRecord } from '#/server/terminal/terminal-registry-model.ts'
import { createTerminalRegistry } from '#/server/terminal/terminal-registry-source.ts'
import { createTerminalTranscript } from '#/server/terminal/terminal-transcript-source.ts'
import { createTerminalWorkerRuntime } from '#/server/terminal/terminal-worker-bootstrap.ts'
import { WorkerBackedTerminalHost } from '#/server/terminal/terminal-worker-host.ts'
import type { TerminalWorkerRequest } from '#/server/terminal/terminal-worker-protocol.ts'
import { closeAllServerTerminalSessions } from '#/server/terminal/terminal.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'

const simulated = vi.hoisted(() => ({
  failNext: false,
  exits: [] as Array<() => void>,
  outputs: [] as Array<(data: string) => void>,
}))

vi.mock('#/server/terminal/terminal-pty-runtime.ts', () => ({
  spawnTerminalPtyRuntime() {
    if (simulated.failNext) {
      simulated.failNext = false
      return { ok: false, message: 'error.terminal-create-failed' }
    }
    return {
      ok: true,
      runtime: {
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        processName: () => 'shell',
        onData(listener: (data: string) => void) {
          simulated.outputs.push(listener)
          return { dispose: vi.fn() }
        },
        onExit(listener: () => void) {
          simulated.exits.push(listener)
          return { dispose: vi.fn() }
        },
      },
    }
  },
}))

class InProcessWorker extends EventEmitter {
  private readonly runtime = createTerminalWorkerRuntime(
    (message) => this.emit('message', message),
    (code) => this.emit('exit', code, null),
  )

  send(message: TerminalWorkerRequest): boolean {
    void this.runtime.handleMessage(message)
    return true
  }

  disconnect(): void {}
  kill(): void {}
}

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
  closeAllServerTerminalSessions()
  simulated.exits.length = 0
  simulated.outputs.length = 0
  simulated.failNext = false
})

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'hob-terminal-registry-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'terminals.sqlite')
  const registry = createTerminalRegistry(file)
  cleanup.push(registry.close)
  return { directory, file, registry }
}

function readEvents(file: string, id: string) {
  const reader = new DatabaseSync(file, { readOnly: true })
  try {
    return reader
      .prepare(
        `SELECT seq, revision, execution_id AS executionId, json_extract(snapshot, '$.phase') AS phase
        FROM terminal_events WHERE terminal_id = ? ORDER BY seq`,
      )
      .all(id)
  } finally {
    reader.close()
  }
}

test('records worker terminals without sockets and retains executions across restart, failure and worker exit', async () => {
  const { directory, file, registry } = fixture()
  const workers: InProcessWorker[] = []
  const host = new WorkerBackedTerminalHost({
    terminalRegistry: registry,
    spawnWorker() {
      const worker = new InProcessWorker()
      workers.push(worker)
      return worker as unknown as ChildProcess
    },
  })
  cleanup.push(() => host.shutdown())
  const conversationStore = createConversationOpenApiStore(path.join(directory, 'conversations.sqlite'))
  cleanup.push(conversationStore.close)
  const token = 'example-registry-key'
  const app = createConversationOpenApiRoutes({
    keys: createOpenApiKeySource({
      file: path.join(directory, 'keys.json'),
      internalSecret: 'example-internal-secret',
      controlToken: token,
    }),
    store: conversationStore,
    terminalRegistry: registry,
  })
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  async function read(query = ''): Promise<{ records: TerminalRecord[]; nextCursor: number | null }> {
    const response = await app.request(`/terminal-records${query}`, auth)
    expect(response.status).toBe(200)
    return await response.json()
  }
  const clientId = 'client_test'
  const attachmentId = 'attachment_test'
  const target = {
    repoRoot: directory,
    worktreePath: directory,
    branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    kind: 'additional' as const,
    attachmentId,
  }

  expect((await app.request('/terminal-records')).status).toBe(401)
  expect((await app.request('/terminal-records?limit=101', auth)).status).toBe(400)
  expect((await app.request('/terminal-records?cursor=0', auth)).status).toBe(400)
  expect(await (await app.request('/openapi.json')).json()).toMatchObject({
    paths: { '/terminal-records': { get: { operationId: 'listHobgoblinTerminalRecords' } } },
  })
  const shell = await host.create(clientId, target)
  if (!shell.ok) throw new Error(shell.message)
  expect(host.getDiagnostics().registeredSockets).toBe(0)
  const first = (await read('?state=running')).records[0]!
  expect(first).toMatchObject({
    id: shell.sessionId,
    phase: 'open',
    revision: 2,
    workspaceId: workspacePublicId(directory),
    worktreeId: workspacePublicId(`${directory}\0${directory}`),
    cwd: directory,
    backend: { transport: 'local', kind: 'pty' },
    agentProvider: null,
  })

  const socket = { send: vi.fn(), close: vi.fn() }
  host.registerSocket(clientId, attachmentId, socket)
  const controls = { sessionId: first.id, cols: 80, rows: 24, attachmentId }
  expect((await host.takeover(clientId, controls)).ok).toBe(true)
  const restart = await host.restart(clientId, controls)
  if (!restart.ok) throw new Error(restart.message)
  host.unregisterSocket(clientId, attachmentId, socket)
  simulated.exits[0]!()
  const restarted = (await read('?state=running')).records[0]!
  expect(restarted).toMatchObject({ id: first.id, phase: 'open', revision: 5, createdAt: first.createdAt })
  expect(restarted.executionId).not.toBe(first.executionId)
  expect(readEvents(file, first.id)).toMatchObject([
    { phase: 'opening', executionId: first.executionId },
    { phase: 'open', executionId: first.executionId },
    { phase: 'closed', executionId: first.executionId },
    { phase: 'restarting', executionId: restarted.executionId },
    { phase: 'open', executionId: restarted.executionId, seq: restarted.lastEventSeq, revision: restarted.revision },
  ])

  const agent = await host.create(clientId, { ...target, agentProvider: 'codex' })
  if (!agent.ok) throw new Error(agent.message)
  simulated.failNext = true
  expect((await host.create(clientId, target)).ok).toBe(false)
  const page = await read('?limit=1')
  expect(page.records).toMatchObject([{ phase: 'error', reason: 'launch_failed', revision: 2 }])
  expect(page.nextCursor).toBeTypeOf('number')

  simulated.exits[1]!()
  expect((await read(`?state=exited&workspaceId=${first.workspaceId}`)).records).toMatchObject([
    { id: page.records[0]!.id, phase: 'error' },
    { id: first.id, phase: 'closed', reason: 'exited' },
  ])
  const next = await read(`?cursor=${page.nextCursor}`)
  expect(next.records).toMatchObject([
    { id: agent.sessionId, agentProvider: 'codex', phase: 'open' },
    { id: first.id, phase: 'closed' },
  ])
  expect(next.nextCursor).toBeNull()

  workers[0]!.emit('exit', 1, null)
  closeAllServerTerminalSessions()
  expect((await read('?state=running')).records).toEqual([])
  expect((await read('?state=exited')).records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: agent.sessionId, phase: 'interrupted', reason: 'worker_lost' }),
    ]),
  )
  const replacement = await host.create(clientId, target)
  expect(replacement.ok).toBe(true)
  expect(workers).toHaveLength(2)
  expect((await read('?state=running')).records).toMatchObject([{ phase: 'open' }])
  host.shutdown()
  expect((await read('?state=exited')).records[0]).toMatchObject({ phase: 'interrupted', reason: 'server_stopped' })
})

test('filters a Windows terminal using the public IDs of the original workspace paths', async () => {
  const { registry } = fixture()
  const isAbsolute = path.isAbsolute
  const nativeCheck = vi.spyOn(path, 'isAbsolute').mockImplementation((value) => {
    return isAbsolute(value) || path.win32.isAbsolute(value)
  })
  cleanup.push(() => nativeCheck.mockRestore())
  const host = new WorkerBackedTerminalHost({
    terminalRegistry: registry,
    spawnWorker: () => new InProcessWorker() as unknown as ChildProcess,
  })
  cleanup.push(() => host.shutdown())
  const repoRoot = 'C:\\Work\\Example'
  const shell = await host.create('client_test', {
    repoRoot,
    worktreePath: 'c:\\work\\example',
    branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    kind: 'additional',
  })
  if (!shell.ok) throw new Error(shell.message)

  const workspaceId = workspacePublicId(repoRoot)
  expect(registry.list({ limit: 10, workspaceId, state: 'running' }).records).toMatchObject([
    { id: shell.sessionId, workspaceId, worktreeId: workspacePublicId(`${repoRoot}\0${repoRoot}`) },
  ])
})

test('records the worker terminal title and retains it after the terminal exits', async () => {
  const { directory, registry } = fixture()
  const host = new WorkerBackedTerminalHost({
    terminalRegistry: registry,
    spawnWorker: () => new InProcessWorker() as unknown as ChildProcess,
  })
  cleanup.push(() => host.shutdown())
  const terminal = await host.create('client_test', {
    repoRoot: directory,
    worktreePath: directory,
    branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    kind: 'additional',
  })
  if (!terminal.ok) throw new Error(terminal.message)
  expect(registry.list({ limit: 10 }).records[0]).toMatchObject({ title: null })

  simulated.outputs[0]!('\x1b]0;Running tests\x07\x1b]0;Test results\x07')
  await vi.waitFor(() => {
    expect(registry.list({ limit: 10, state: 'running' }).records).toMatchObject([
      { id: terminal.sessionId, title: 'Test results', revision: 3 },
    ])
  })

  simulated.exits[0]!()
  expect(registry.list({ limit: 10, state: 'exited' }).records).toMatchObject([
    { id: terminal.sessionId, title: 'Test results', revision: 4 },
  ])
})

function openingEvent(): TerminalLifecycleEvent {
  return {
    id: 'term_00000000-0000-4000-8000-000000000001',
    executionId: '00000000-0000-4000-8000-000000000002',
    workspaceId: workspacePublicId('/workspace'),
    worktreeId: workspacePublicId('/workspace\0/workspace'),
    cwd: '/workspace',
    backend: { transport: 'local', kind: 'pty' },
    agentProvider: null,
    phase: 'opening',
    reason: null,
  }
}

test('commits queued lifecycle events in order after a short SQLite write lock', async () => {
  const { file, registry } = fixture()
  const event = openingEvent()
  registry.record('first-worker', event)

  const writer = new DatabaseSync(file)
  try {
    writer.exec('BEGIN IMMEDIATE')
    registry.record('first-worker', { ...event, phase: 'open' })
    registry.record('first-worker', { ...event, phase: 'closed', reason: 'exited' })
    expect(() => registry.list({ limit: 10 })).toThrow(/waiting for lifecycle writes/)
    expect(readEvents(file, event.id)).toMatchObject([{ phase: 'opening', revision: 1 }])
    writer.exec('ROLLBACK')
  } finally {
    writer.close()
  }

  await vi.waitFor(() => {
    expect(registry.list({ limit: 10 }).records).toMatchObject([
      { id: event.id, phase: 'closed', reason: 'exited', revision: 3 },
    ])
  })
  const [record] = registry.list({ limit: 10 }).records
  expect(readEvents(file, event.id)).toMatchObject([
    { phase: 'opening', revision: 1 },
    { phase: 'open', revision: 2 },
    { phase: 'closed', revision: 3, seq: record?.lastEventSeq },
  ])
})

test('expires old lifecycle events while retaining the record and its revision', () => {
  const { file, registry } = fixture()
  const event = openingEvent()
  registry.record('worker', event)
  registry.record('worker', { ...event, phase: 'closed', reason: 'exited' })
  const snapshot = registry.list({ limit: 1 }).records[0]
  const db = new DatabaseSync(file)
  try {
    db.prepare('UPDATE terminal_events SET occurred_at = ? WHERE revision = 1').run(
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    )
  } finally {
    db.close()
  }
  registry.close()
  const reopened = createTerminalRegistry(file)
  cleanup.push(reopened.close)
  expect(reopened.list({ limit: 1 }).records[0]).toEqual(snapshot)
  expect(readEvents(file, event.id)).toMatchObject([{ phase: 'closed', revision: 2, seq: snapshot?.lastEventSeq }])
})

test('reads worker output without sockets and resumes after the last committed sequence', async () => {
  const { registry, directory } = fixture()
  const transcript = createTerminalTranscript(path.join(directory, 'output.sqlite'))
  cleanup.push(transcript.close)
  const host = new WorkerBackedTerminalHost({
    terminalRegistry: registry,
    terminalTranscript: transcript,
    spawnWorker: () => new InProcessWorker() as unknown as ChildProcess,
  })
  cleanup.push(() => host.shutdown())
  const store = createConversationOpenApiStore(path.join(directory, 'conversations.sqlite'))
  cleanup.push(store.close)
  const token = 'example-transcript-key'
  const routes = createConversationOpenApiRoutes({
    keys: createOpenApiKeySource({
      file: path.join(directory, 'keys.json'),
      internalSecret: 'example-internal-secret',
      controlToken: token,
    }),
    store,
    terminalRegistry: registry,
    terminalTranscript: transcript,
  })
  const terminal = await host.create('client_test', {
    repoRoot: directory,
    worktreePath: directory,
    branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    kind: 'additional',
  })
  if (!terminal.ok) throw new Error(terminal.message)
  const url = `/terminal-records/${terminal.sessionId}/transcript`
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  const read = async (query = '') => {
    const response = await routes.request(url + query, auth)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    return await response.json()
  }

  expect((await routes.request(url)).status).toBe(401)
  expect((await routes.request(url + '?afterSeq=0&beforeSeq=1', auth)).status).toBe(400)
  simulated.outputs[0]!('\x1b[3')
  simulated.outputs[0]!('2mFirst\x1b[0m\r\nSecond')
  await vi.waitFor(async () => {
    expect(await read()).toMatchObject({ source: 'pty', lines: [{ text: 'First' }], tail: { text: 'Second' } })
  })
  const first = await read()
  simulated.outputs[0]!('\r\n')
  simulated.outputs[0]!('x'.repeat(130 * 1024))
  simulated.outputs[0]!('Final partial line')
  simulated.exits[0]!()
  await vi.waitFor(async () => {
    expect(await read(`?afterSeq=${first.nextAfterSeq}`)).toMatchObject({
      lines: [{ text: 'Second' }, { text: null, truncated: true }, { text: 'Final partial line' }],
      hasMoreAfter: false,
      tail: null,
    })
  })
})

test('rolls back the event if saving the registry projection fails and reconciles on reopen', () => {
  const { file, registry } = fixture()
  const opening = openingEvent()
  registry.record('first-worker', opening)
  const writer = new DatabaseSync(file)
  try {
    writer.exec(`CREATE TRIGGER reject_phase BEFORE UPDATE ON terminal_records WHEN new.phase = 'open'
      BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`)
  } finally {
    writer.close()
  }
  registry.record('first-worker', { ...opening, phase: 'open' })
  expect(readEvents(file, opening.id)).toMatchObject([{ phase: 'opening', revision: 1 }])
  expect(() => registry.list({ limit: 10 })).toThrow(/needs reconciliation/)

  registry.close()
  const reopened = createTerminalRegistry(file)
  cleanup.push(reopened.close)
  const recovered = reopened.list({ limit: 10 }).records[0]!
  expect(recovered).toMatchObject({
    id: opening.id,
    executionId: opening.executionId,
    phase: 'interrupted',
    reason: 'worker_lost',
    revision: 2,
  })
  expect(readEvents(file, opening.id)).toMatchObject([
    { phase: 'opening', revision: 1 },
    { phase: 'interrupted', revision: 2, seq: recovered.lastEventSeq },
  ])
})

# Remote Port Forwarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Ports` tab to the Explorer area so SSH remote repositories can start, inspect, copy/open, and stop local SSH port forwards.

**Architecture:** Build a narrow port-forwarding feature slice. Shared code validates requests and formats URLs, the system layer owns system `ssh -N -L` child processes, the server manager owns runtime session state, and the renderer adds an Explorer `Ports` panel plus close-repo cleanup.

**Tech Stack:** TypeScript in Node strip-only mode, Bun, Vitest, React 19, Hono, Zustand, system OpenSSH via `node:child_process.spawn`.

---

## File Structure

- Create `src/shared/port-forwarding.ts`
  - Shared request/result/session types.
  - Host/port validation.
  - Start request normalization.
  - Browser URL formatting.
- Create `src/shared/port-forwarding.test.ts`
  - Unit coverage for validation, normalization, and URL formatting.
- Create `src/system/ssh/port-forward.ts`
  - Build OpenSSH local-forward argument arrays.
  - Start long-lived `ssh` child processes without shell execution.
  - Capture capped stderr and expose a stop/exit contract.
- Create `src/system/ssh/port-forward.test.ts`
  - Unit coverage for argument construction, spawn options, ready/failure behavior, and stop contract.
- Create `src/server/modules/port-forwarding.ts`
  - Runtime manager with in-memory sessions.
  - Remote repo resolution.
  - Start/list/stop/stop-for-repo/shutdown flows.
- Create `src/server/modules/port-forwarding.test.ts`
  - Manager lifecycle tests with fake SSH starter and fake port allocator.
- Create `src/server/routes/port-forwarding.ts`
  - Thin Hono route boundary for `/list`, `/start`, `/stop`, and `/stop-for-repo`.
- Create `src/server/routes/port-forwarding.test.ts`
  - Route body parsing and fallback tests.
- Modify `src/server/app-factory.ts`
  - Mount `/api/port-forwarding` with internal auth.
- Modify `src/server/runtime.ts`
  - Stop port-forwarding sessions on server shutdown.
- Modify `src/server/runtime.test.ts`
  - Verify shutdown calls port-forwarding cleanup once.
- Create `src/web/port-forwarding-client.ts`
  - Renderer HTTP client functions.
- Create `src/web/port-forwarding-client.test.ts`
  - Verify endpoints and request bodies.
- Create `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
  - Explorer `Ports` tab UI.
- Create `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`
  - Component tests for local empty state, remote form, warning, start/list/stop/copy/open.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`
  - Add the `Ports` tab and render `ProjectPortsPanel`.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
  - Update tab expectations and verify switching to Ports.
- Modify `src/web/stores/repos/lifecycle-write-paths.ts`
  - Fire-and-forget `stopPortForwardSessionsForRepo(id)` from `closeRepo`.
- Modify `src/web/stores/repos/lifecycle.test.ts`
  - Verify closing a repo requests port-forward cleanup.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`
  - Add new labels and errors while preserving dictionary parity.
- Use existing `bun run typecheck`, `bun run test`, and `bun run check:architecture` for verification.

## Task 1: Shared Port-Forwarding Model

**Files:**
- Create: `src/shared/port-forwarding.ts`
- Create: `src/shared/port-forwarding.test.ts`

- [ ] **Step 1: Write failing shared model tests**

Create `src/shared/port-forwarding.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  formatPortForwardLocalUrl,
  isLoopbackBindHost,
  normalizePortForwardStartRequest,
  validatePortForwardHost,
} from '#/shared/port-forwarding.ts'

describe('port forwarding shared model', () => {
  test('normalizes defaults for a remote start request', () => {
    expect(normalizePortForwardStartRequest({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 })).toEqual({
      ok: true,
      request: {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '127.0.0.1',
        localPort: null,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      },
    })
  })

  test('normalizes string ports from route and form bodies', () => {
    expect(
      normalizePortForwardStartRequest({
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '0.0.0.0',
        localPort: '5173',
        remoteHost: 'localhost',
        remotePort: '3000',
      }),
    ).toEqual({
      ok: true,
      request: {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '0.0.0.0',
        localPort: 5173,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
    })
  })

  test('rejects invalid hosts and ports', () => {
    expect(validatePortForwardHost('localhost')).toEqual({ ok: true, host: 'localhost' })
    expect(validatePortForwardHost('api.internal')).toEqual({ ok: true, host: 'api.internal' })
    expect(validatePortForwardHost('bad host')).toEqual({ ok: false, message: 'error.invalid-host' })
    expect(validatePortForwardHost('127.0.0.1:3000')).toEqual({ ok: false, message: 'error.invalid-host' })
    expect(validatePortForwardHost('')).toEqual({ ok: false, message: 'error.invalid-host' })
    expect(normalizePortForwardStartRequest({ repoId: 'ssh-config://prod/srv/repo', remotePort: 0 })).toEqual({
      ok: false,
      message: 'error.invalid-port',
    })
    expect(normalizePortForwardStartRequest({ repoId: 'ssh-config://prod/srv/repo', remotePort: 65536 })).toEqual({
      ok: false,
      message: 'error.invalid-port',
    })
  })

  test('formats browser-safe local URLs', () => {
    expect(formatPortForwardLocalUrl('127.0.0.1', 3000)).toBe('http://127.0.0.1:3000')
    expect(formatPortForwardLocalUrl('localhost', 3000)).toBe('http://localhost:3000')
    expect(formatPortForwardLocalUrl('0.0.0.0', 3000)).toBe('http://127.0.0.1:3000')
  })

  test('detects loopback bind hosts', () => {
    expect(isLoopbackBindHost('127.0.0.1')).toBe(true)
    expect(isLoopbackBindHost('localhost')).toBe(true)
    expect(isLoopbackBindHost('0.0.0.0')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the shared model test to verify it fails**

Run:

```bash
bun run test src/shared/port-forwarding.test.ts
```

Expected: FAIL with a module-not-found error for `#/shared/port-forwarding.ts`.

- [ ] **Step 3: Implement the shared model**

Create `src/shared/port-forwarding.ts`:

```ts
export type PortForwardSessionStatus = 'starting' | 'active' | 'failed' | 'stopped'

export interface PortForwardStartRequest {
  repoId: string
  localBindHost: string
  localPort: number | null
  remoteHost: string
  remotePort: number
}

export interface PortForwardSessionSnapshot {
  id: string
  repoId: string
  localBindHost: string
  requestedLocalPort: number | null
  actualLocalPort: number | null
  remoteHost: string
  remotePort: number
  status: PortForwardSessionStatus
  localUrl: string | null
  message?: string
  createdAt: string
  updatedAt: string
}

export type PortForwardStartResult =
  | { ok: true; session: PortForwardSessionSnapshot }
  | { ok: false; message: string; detail?: string; session?: PortForwardSessionSnapshot }

export type PortForwardListResult = { ok: true; sessions: PortForwardSessionSnapshot[] } | { ok: false; message: string }
export type PortForwardStopResult = { ok: true; session: PortForwardSessionSnapshot } | { ok: false; message: string }
export type PortForwardStopForRepoResult = { ok: true; stopped: PortForwardSessionSnapshot[] } | { ok: false; message: string }

export type PortForwardStartRequestResult =
  | { ok: true; request: PortForwardStartRequest }
  | { ok: false; message: string }

export function normalizePortForwardStartRequest(value: unknown): PortForwardStartRequestResult {
  if (!isRecord(value)) return { ok: false, message: 'error.invalid-arguments' }
  const repoId = typeof value.repoId === 'string' ? value.repoId.trim() : ''
  if (!repoId) return { ok: false, message: 'error.invalid-arguments' }

  const localBindHost = validatePortForwardHost(
    typeof value.localBindHost === 'string' && value.localBindHost.trim() ? value.localBindHost : '127.0.0.1',
  )
  if (!localBindHost.ok) return localBindHost

  const remoteHost = validatePortForwardHost(
    typeof value.remoteHost === 'string' && value.remoteHost.trim() ? value.remoteHost : '127.0.0.1',
  )
  if (!remoteHost.ok) return remoteHost

  const remotePort = normalizeRequiredPort(value.remotePort)
  if (remotePort === null) return { ok: false, message: 'error.invalid-port' }

  const localPort = normalizeOptionalPort(value.localPort)
  if (localPort === undefined) return { ok: false, message: 'error.invalid-port' }

  return {
    ok: true,
    request: {
      repoId,
      localBindHost: localBindHost.host,
      localPort,
      remoteHost: remoteHost.host,
      remotePort,
    },
  }
}

export function validatePortForwardHost(value: string): { ok: true; host: string } | { ok: false; message: string } {
  const host = value.trim()
  if (!host || host.includes(':') || /[\s\0-\x1f\x7f]/.test(host)) return { ok: false, message: 'error.invalid-host' }
  return { ok: true, host }
}

export function isLoopbackBindHost(host: string): boolean {
  const value = host.trim().toLowerCase()
  return value === 'localhost' || value === '127.0.0.1'
}

export function formatPortForwardLocalUrl(localBindHost: string, actualLocalPort: number): string {
  const browserHost = localBindHost === '0.0.0.0' ? '127.0.0.1' : localBindHost
  return `http://${browserHost}:${actualLocalPort}`
}

function normalizeRequiredPort(value: unknown): number | null {
  const port = normalizePortNumber(value)
  return port ?? null
}

function normalizeOptionalPort(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  return normalizePortNumber(value) ?? undefined
}

function normalizePortNumber(value: unknown): number | null {
  const port = typeof value === 'string' ? Number(value.trim()) : value
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
```

- [ ] **Step 4: Run the shared model test to verify it passes**

Run:

```bash
bun run test src/shared/port-forwarding.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shared model**

```bash
git add src/shared/port-forwarding.ts src/shared/port-forwarding.test.ts
git commit -m "feat(port-forwarding): add shared model"
```

## Task 2: SSH Local Forward System Layer

**Files:**
- Create: `src/system/ssh/port-forward.ts`
- Create: `src/system/ssh/port-forward.test.ts`

- [ ] **Step 1: Write failing system tests**

Create `src/system/ssh/port-forward.test.ts`:

```ts
import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { buildSshLocalPortForwardArgs, startSshLocalPortForward } from '#/system/ssh/port-forward.ts'

describe('ssh local port forwarding', () => {
  test('builds OpenSSH local forwarding args without shell syntax', () => {
    expect(
      buildSshLocalPortForwardArgs({
        alias: 'prod',
        localBindHost: '127.0.0.1',
        localPort: 5173,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      }),
    ).toEqual([
      '-N',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '-L',
      '127.0.0.1:5173:127.0.0.1:3000',
      '--',
      'prod',
    ])
  })

  test('starts ssh with stdio pipes and no shell', async () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child as never)
    const handle = await startSshLocalPortForward(
      {
        alias: 'prod',
        localBindHost: '127.0.0.1',
        localPort: 5173,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
      { spawn, readyDelayMs: 0 },
    )

    expect(spawn).toHaveBeenCalledWith(
      'ssh',
      expect.arrayContaining(['-L', '127.0.0.1:5173:localhost:3000', '--', 'prod']),
      { stdio: ['ignore', 'ignore', 'pipe'], shell: false },
    )
    expect(handle.pid).toBe(1234)
    handle.stop()
    expect(child.kill).toHaveBeenCalled()
  })

  test('returns a failed start when ssh exits during the ready window', async () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child as never)
    const promise = startSshLocalPortForward(
      {
        alias: 'prod',
        localBindHost: '127.0.0.1',
        localPort: 5173,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
      { spawn, readyDelayMs: 10 },
    )
    child.stderr.emit('data', Buffer.from('bind failed'))
    child.emit('exit', 255, null)

    await expect(promise).rejects.toThrow('bind failed')
  })
})

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    killed: boolean
  }
  child.pid = 1234
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  child.killed = false
  return child
}
```

- [ ] **Step 2: Run the system test to verify it fails**

Run:

```bash
bun run test src/system/ssh/port-forward.test.ts
```

Expected: FAIL with a module-not-found error for `#/system/ssh/port-forward.ts`.

- [ ] **Step 3: Implement the SSH local forward system layer**

Create `src/system/ssh/port-forward.ts`:

```ts
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process'
import type { PortForwardStartRequest } from '#/shared/port-forwarding.ts'

const SSH_CONNECT_TIMEOUT_SEC = 10
const DEFAULT_READY_DELAY_MS = 300
const STDERR_LIMIT = 4096

export interface SshLocalPortForwardInput extends Omit<PortForwardStartRequest, 'repoId' | 'localPort'> {
  alias: string
  localPort: number
}

export interface SshLocalPortForwardHandle {
  pid: number | null
  stop(): void
  onExit(listener: (exit: SshLocalPortForwardExit) => void): () => void
  stderrText(): string
}

export interface SshLocalPortForwardExit {
  code: number | null
  signal: NodeJS.Signals | null
  stderr: string
}

type SpawnLike = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => Pick<ChildProcessWithoutNullStreams, 'pid' | 'stderr' | 'kill' | 'killed' | 'on'>

export interface StartSshLocalPortForwardOptions {
  spawn?: SpawnLike
  readyDelayMs?: number
}

export function buildSshLocalPortForwardArgs(input: SshLocalPortForwardInput): string[] {
  return [
    '-N',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`,
    '-L',
    `${input.localBindHost}:${input.localPort}:${input.remoteHost}:${input.remotePort}`,
    '--',
    input.alias,
  ]
}

export async function startSshLocalPortForward(
  input: SshLocalPortForwardInput,
  options: StartSshLocalPortForwardOptions = {},
): Promise<SshLocalPortForwardHandle> {
  const spawn = options.spawn ?? nodeSpawn
  const readyDelayMs = options.readyDelayMs ?? DEFAULT_READY_DELAY_MS
  const args = buildSshLocalPortForwardArgs(input)
  const child = spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false })
  let stderr = ''
  let settledExit: SshLocalPortForwardExit | null = null
  const exitListeners = new Set<(exit: SshLocalPortForwardExit) => void>()

  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr = capText(`${stderr}${String(chunk)}`, STDERR_LIMIT)
  })
  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    settledExit = { code, signal, stderr }
    for (const listener of exitListeners) listener(settledExit)
  })

  await waitForReadyWindow(readyDelayMs)
  if (settledExit) throw new Error(summarizeSshForwardFailure(settledExit.stderr))

  return {
    pid: child.pid ?? null,
    stop() {
      if (!child.killed) child.kill()
    },
    onExit(listener) {
      exitListeners.add(listener)
      if (settledExit) listener(settledExit)
      return () => exitListeners.delete(listener)
    },
    stderrText() {
      return stderr
    },
  }
}

function waitForReadyWindow(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function summarizeSshForwardFailure(stderr: string): string {
  const summary = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-3).join('\n')
  return summary || 'error.port-forward-start-failed'
}

function capText(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(value.length - limit)
}
```

- [ ] **Step 4: Run the system test to verify it passes**

Run:

```bash
bun run test src/system/ssh/port-forward.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the system layer**

```bash
git add src/system/ssh/port-forward.ts src/system/ssh/port-forward.test.ts
git commit -m "feat(port-forwarding): add ssh local forward launcher"
```

## Task 3: Server Runtime Manager

**Files:**
- Create: `src/server/modules/port-forwarding.ts`
- Create: `src/server/modules/port-forwarding.test.ts`

- [ ] **Step 1: Write failing manager tests**

Create `src/server/modules/port-forwarding.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { createPortForwardingManagerForTest } from '#/server/modules/port-forwarding.ts'
import type { SshLocalPortForwardHandle } from '#/system/ssh/port-forward.ts'

const REMOTE_TARGET = {
  id: 'ssh-config://prod/srv/repo',
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/repo',
  displayName: 'prod:repo',
}

describe('port forwarding manager', () => {
  test('starts and lists a remote repo session', async () => {
    const handle = fakeHandle()
    const manager = testManager({ handle })

    const result = await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })

    expect(result.ok).toBe(true)
    expect(result.ok ? result.session.status : '').toBe('active')
    expect(result.ok ? result.session.actualLocalPort : null).toBe(3000)
    expect(result.ok ? result.session.localUrl : null).toBe('http://127.0.0.1:3000')
    await expect(manager.list('ssh-config://prod/srv/repo')).resolves.toMatchObject({
      ok: true,
      sessions: [expect.objectContaining({ remotePort: 3000, status: 'active' })],
    })
  })

  test('falls back to an allocated port when requested port is occupied', async () => {
    const manager = testManager({ allocatedPort: 61888, handle: fakeHandle() })

    const result = await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: 3000,
      remoteHost: 'localhost',
      remotePort: 3000,
    })

    expect(result.ok ? result.session.requestedLocalPort : null).toBe(3000)
    expect(result.ok ? result.session.actualLocalPort : null).toBe(61888)
  })

  test('rejects local repos', async () => {
    const manager = testManager()
    await expect(
      manager.start({
        repoId: '/tmp/repo',
        localBindHost: '127.0.0.1',
        localPort: null,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
  })

  test('marks a running session failed when ssh exits unexpectedly', async () => {
    const handle = fakeHandle()
    const manager = testManager({ handle })
    const result = await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })
    expect(result.ok).toBe(true)

    handle.emitExit({ code: 255, signal: null, stderr: 'connection lost' })

    const list = await manager.list('ssh-config://prod/srv/repo')
    expect(list.ok ? list.sessions[0]?.status : '').toBe('failed')
    expect(list.ok ? list.sessions[0]?.message : '').toBe('connection lost')
  })

  test('stops sessions for one repo without touching another repo', async () => {
    const first = fakeHandle()
    const second = fakeHandle()
    const manager = testManager({ handles: [first, second] })
    await manager.start({
      repoId: 'ssh-config://prod/srv/repo',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3000,
    })
    await manager.start({
      repoId: 'ssh-config://prod/srv/other',
      localBindHost: '127.0.0.1',
      localPort: null,
      remoteHost: '127.0.0.1',
      remotePort: 3001,
    })

    await manager.stopForRepo('ssh-config://prod/srv/repo')

    expect(first.stop).toHaveBeenCalled()
    expect(second.stop).not.toHaveBeenCalled()
  })
})

function testManager(options: { allocatedPort?: number; handle?: ReturnType<typeof fakeHandle>; handles?: ReturnType<typeof fakeHandle>[] } = {}) {
  const handles = [...(options.handles ?? (options.handle ? [options.handle] : [fakeHandle()]))]
  return createPortForwardingManagerForTest({
    resolveRemoteTarget: async (ref) => ({ target: { ...REMOTE_TARGET, id: `ssh-config://${ref.alias}${ref.remotePath}`, remotePath: ref.remotePath } }),
    reservePort: async (_host, preferred) => options.allocatedPort ?? preferred,
    startForward: async () => handles.shift() ?? fakeHandle(),
    now: (() => {
      let tick = 0
      return () => new Date(Date.UTC(2026, 5, 15, 12, 0, tick += 1))
    })(),
    id: (() => {
      let tick = 0
      return () => `pf_${tick += 1}`
    })(),
  })
}

function fakeHandle(): SshLocalPortForwardHandle & {
  stop: ReturnType<typeof vi.fn>
  emitExit(exit: { code: number | null; signal: NodeJS.Signals | null; stderr: string }): void
} {
  let listener: ((exit: { code: number | null; signal: NodeJS.Signals | null; stderr: string }) => void) | null = null
  return {
    pid: 1234,
    stop: vi.fn(),
    stderrText: () => '',
    onExit(next) {
      listener = next
      return () => {
        listener = null
      }
    },
    emitExit(exit) {
      listener?.(exit)
    },
  }
}
```

Also export a test-only factory from the implementation in this task named `createPortForwardingManagerForTest`. Keep it intentionally typed and used only by tests.

- [ ] **Step 2: Run the manager test to verify it fails**

Run:

```bash
bun run test src/server/modules/port-forwarding.test.ts
```

Expected: FAIL with a module-not-found error for `#/server/modules/port-forwarding.ts`.

- [ ] **Step 3: Implement the manager**

Create `src/server/modules/port-forwarding.ts`:

```ts
import { reserveAvailablePort } from '#/system/port-allocation.ts'
import { startSshLocalPortForward, type SshLocalPortForwardHandle } from '#/system/ssh/port-forward.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import {
  formatPortForwardLocalUrl,
  normalizePortForwardStartRequest,
  type PortForwardListResult,
  type PortForwardSessionSnapshot,
  type PortForwardStartRequest,
  type PortForwardStartResult,
  type PortForwardStopForRepoResult,
  type PortForwardStopResult,
} from '#/shared/port-forwarding.ts'
import { isRemoteRepoId, parseRemoteRepoId, type RemoteConnectionInput, type ResolvedRemoteTarget } from '#/shared/remote-repo.ts'

interface RuntimeSession {
  snapshot: PortForwardSessionSnapshot
  handle: SshLocalPortForwardHandle | null
  stoppedByUser: boolean
}

interface ManagerDeps {
  resolveRemoteTarget: (input: RemoteConnectionInput, signal?: AbortSignal) => Promise<ResolvedRemoteTarget>
  reservePort: (host: string, preferredPort: number) => Promise<number>
  startForward: typeof startSshLocalPortForward
  now: () => Date
  id: () => string
}

export interface PortForwardingManager {
  list(repoId: string): Promise<PortForwardListResult>
  start(input: unknown, signal?: AbortSignal): Promise<PortForwardStartResult>
  stop(id: string): Promise<PortForwardStopResult>
  stopForRepo(repoId: string): Promise<PortForwardStopForRepoResult>
  shutdown(): void
}

export function createPortForwardingManagerForTest(deps: ManagerDeps): PortForwardingManager {
  return createPortForwardingManager(deps)
}

const defaultManager = createPortForwardingManager({
  resolveRemoteTarget: resolveSshRemoteTarget,
  reservePort: reserveAvailablePort,
  startForward: startSshLocalPortForward,
  now: () => new Date(),
  id: createSessionId,
})

export async function listPortForwardSessions(repoId: string): Promise<PortForwardListResult> {
  return await defaultManager.list(repoId)
}

export async function startPortForwardSession(input: unknown, signal?: AbortSignal): Promise<PortForwardStartResult> {
  return await defaultManager.start(input, signal)
}

export async function stopPortForwardSession(id: string): Promise<PortForwardStopResult> {
  return await defaultManager.stop(id)
}

export async function stopPortForwardSessionsForRepo(repoId: string): Promise<PortForwardStopForRepoResult> {
  return await defaultManager.stopForRepo(repoId)
}

export function shutdownPortForwarding(): void {
  defaultManager.shutdown()
}

function createPortForwardingManager(deps: ManagerDeps): PortForwardingManager {
  const sessions = new Map<string, RuntimeSession>()

  function stamp(session: PortForwardSessionSnapshot, patch: Partial<PortForwardSessionSnapshot>): PortForwardSessionSnapshot {
    return { ...session, ...patch, updatedAt: deps.now().toISOString() }
  }

  function setSession(session: RuntimeSession, patch: Partial<PortForwardSessionSnapshot>): RuntimeSession {
    session.snapshot = stamp(session.snapshot, patch)
    sessions.set(session.snapshot.id, session)
    return session
  }

  async function resolveAlias(repoId: string, signal?: AbortSignal) {
    if (!isRemoteRepoId(repoId)) return null
    const ref = parseRemoteRepoId(repoId)
    if (!ref) return null
    try {
      return await deps.resolveRemoteTarget(ref, signal)
    } catch {
      throw new Error('error.ssh-config-changed')
    }
  }

  return {
    async list(repoId) {
      return {
        ok: true,
        sessions: Array.from(sessions.values())
          .filter((session) => session.snapshot.repoId === repoId)
          .map((session) => session.snapshot),
      }
    },

    async start(input, signal) {
      const normalized = normalizePortForwardStartRequest(input)
      if (!normalized.ok) return normalized
      const request = normalized.request
      let resolved: ResolvedRemoteTarget | null
      try {
        resolved = await resolveAlias(request.repoId, signal)
      } catch {
        return { ok: false, message: 'error.ssh-config-changed' }
      }
      if (!resolved) return { ok: false, message: 'error.invalid-arguments' }

      const createdAt = deps.now().toISOString()
      const id = deps.id()
      const session: RuntimeSession = {
        handle: null,
        stoppedByUser: false,
        snapshot: {
          id,
          repoId: request.repoId,
          localBindHost: request.localBindHost,
          requestedLocalPort: request.localPort,
          actualLocalPort: null,
          remoteHost: request.remoteHost,
          remotePort: request.remotePort,
          status: 'starting',
          localUrl: null,
          createdAt,
          updatedAt: createdAt,
        },
      }
      sessions.set(id, session)

      const preferredPort = request.localPort ?? request.remotePort
      let actualLocalPort: number
      try {
        actualLocalPort = await deps.reservePort(request.localBindHost, preferredPort)
        const handle = await deps.startForward({
          alias: resolved.target.alias,
          localBindHost: request.localBindHost,
          localPort: actualLocalPort,
          remoteHost: request.remoteHost,
          remotePort: request.remotePort,
        })
        session.handle = handle
        handle.onExit((exit) => {
          if (session.snapshot.status === 'stopped') return
          setSession(session, {
            status: session.stoppedByUser ? 'stopped' : 'failed',
            message: session.stoppedByUser ? undefined : safeDetail(exit.stderr),
          })
        })
        setSession(session, {
          status: 'active',
          actualLocalPort,
          localUrl: formatPortForwardLocalUrl(request.localBindHost, actualLocalPort),
        })
        return { ok: true, session: session.snapshot }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'error.port-forward-start-failed'
        setSession(session, { status: 'failed', message: safeDetail(detail) })
        return { ok: false, message: 'error.port-forward-start-failed', detail: safeDetail(detail), session: session.snapshot }
      }
    },

    async stop(id) {
      const session = sessions.get(id)
      if (!session) return { ok: false, message: 'error.port-forward-not-found' }
      session.stoppedByUser = true
      session.handle?.stop()
      setSession(session, { status: 'stopped' })
      return { ok: true, session: session.snapshot }
    },

    async stopForRepo(repoId) {
      const stopped: PortForwardSessionSnapshot[] = []
      for (const session of sessions.values()) {
        if (session.snapshot.repoId !== repoId) continue
        session.stoppedByUser = true
        session.handle?.stop()
        setSession(session, { status: 'stopped' })
        stopped.push(session.snapshot)
      }
      return { ok: true, stopped }
    },

    shutdown() {
      for (const session of sessions.values()) {
        session.stoppedByUser = true
        session.handle?.stop()
        setSession(session, { status: 'stopped' })
      }
    },
  }
}

function createSessionId(): string {
  return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function safeDetail(value: string): string {
  return value.trim().split(/\r?\n/).filter(Boolean).slice(-3).join('\n').slice(0, 1000)
}
```

- [ ] **Step 4: Run the manager test to verify it passes**

Run:

```bash
bun run test src/server/modules/port-forwarding.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the manager**

```bash
git add src/server/modules/port-forwarding.ts src/server/modules/port-forwarding.test.ts
git commit -m "feat(port-forwarding): add server runtime manager"
```

## Task 4: Server Routes And Runtime Shutdown

**Files:**
- Create: `src/server/routes/port-forwarding.ts`
- Create: `src/server/routes/port-forwarding.test.ts`
- Modify: `src/server/app-factory.ts`
- Modify: `src/server/runtime.ts`
- Modify: `src/server/runtime.test.ts`

- [ ] **Step 1: Write failing route and runtime tests**

Create `src/server/routes/port-forwarding.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPortForwardSessions: vi.fn(),
  startPortForwardSession: vi.fn(),
  stopPortForwardSession: vi.fn(),
  stopPortForwardSessionsForRepo: vi.fn(),
}))

vi.mock('#/server/modules/port-forwarding.ts', () => ({
  listPortForwardSessions: mocks.listPortForwardSessions,
  startPortForwardSession: mocks.startPortForwardSession,
  stopPortForwardSession: mocks.stopPortForwardSession,
  stopPortForwardSessionsForRepo: mocks.stopPortForwardSessionsForRepo,
}))

describe('port forwarding routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [] })
    mocks.startPortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-start-failed' })
    mocks.stopPortForwardSession.mockResolvedValue({ ok: false, message: 'error.port-forward-not-found' })
    mocks.stopPortForwardSessionsForRepo.mockResolvedValue({ ok: true, stopped: [] })
  })

  test('delegates list/start/stop/stop-for-repo to the module', async () => {
    const { createPortForwardingRoutes } = await import('#/server/routes/port-forwarding.ts')
    const app = createPortForwardingRoutes()

    await app.request(new Request('http://127.0.0.1/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }),
    }))
    await app.request(new Request('http://127.0.0.1/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 }),
    }))
    await app.request(new Request('http://127.0.0.1/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'pf_1' }),
    }))
    await app.request(new Request('http://127.0.0.1/stop-for-repo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }),
    }))

    expect(mocks.listPortForwardSessions).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
    expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 },
      expect.any(AbortSignal),
    )
    expect(mocks.stopPortForwardSession).toHaveBeenCalledWith('pf_1')
    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
  })
})
```

Modify `src/server/runtime.test.ts` mocks and shutdown test:

```ts
const mocks = vi.hoisted(() => ({
  createApp: vi.fn(() => ({ fetch: vi.fn() })),
  stopBackgroundSync: vi.fn(),
  shutdownPortForwarding: vi.fn(),
  workerHostCtor: vi.fn(),
}))

vi.mock('#/server/modules/port-forwarding.ts', () => ({
  shutdownPortForwarding: mocks.shutdownPortForwarding,
}))

test('shutdown is idempotent and stops background sync, port forwarding, and terminal host teardown', async () => {
  const { createServerRuntime } = await import('#/server/runtime.ts')
  const events: string[] = []
  const terminalHost = {
    shutdown: vi.fn(() => {
      events.push('terminal')
    }),
  } as unknown as ServerTerminalHost
  mocks.stopBackgroundSync.mockImplementation(() => {
    events.push('background-sync')
  })
  mocks.shutdownPortForwarding.mockImplementation(() => {
    events.push('port-forwarding')
  })

  const runtime = createServerRuntime({
    version: '0.1.0',
    startedAt: 1,
    internalSecret: 'secret',
    terminalHost,
  })

  runtime.shutdown()
  runtime.shutdown()

  expect(mocks.stopBackgroundSync).toHaveBeenCalledTimes(1)
  expect(mocks.shutdownPortForwarding).toHaveBeenCalledTimes(1)
  expect(terminalHost.shutdown).toHaveBeenCalledTimes(1)
  expect(events).toEqual(['background-sync', 'port-forwarding', 'terminal'])
})
```

- [ ] **Step 2: Run route/runtime tests to verify they fail**

Run:

```bash
bun run test src/server/routes/port-forwarding.test.ts src/server/runtime.test.ts
```

Expected: FAIL because `createPortForwardingRoutes` is missing and runtime does not call `shutdownPortForwarding`.

- [ ] **Step 3: Implement routes and runtime integration**

Create `src/server/routes/port-forwarding.ts`:

```ts
import { Hono } from 'hono'
import {
  listPortForwardSessions,
  startPortForwardSession,
  stopPortForwardSession,
  stopPortForwardSessionsForRepo,
} from '#/server/modules/port-forwarding.ts'

export function createPortForwardingRoutes() {
  const app = new Hono()
  async function jsonOr<T>(run: () => Promise<T>, fallback: T, label: string) {
    try {
      return await run()
    } catch (err) {
      console.warn(`[server][port-forwarding] ${label} failed`, err)
      return fallback
    }
  }

  app.post('/list', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    return c.json(await jsonOr(() => listPortForwardSessions(repoId), { ok: false, message: 'error.invalid-arguments' }, 'list'))
  })

  app.post('/start', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(await jsonOr(() => startPortForwardSession(body, c.req.raw.signal), { ok: false, message: 'error.port-forward-start-failed' }, 'start'))
  })

  app.post('/stop', async (c) => {
    const body = await c.req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    return c.json(await jsonOr(() => stopPortForwardSession(id), { ok: false, message: 'error.port-forward-not-found' }, 'stop'))
  })

  app.post('/stop-for-repo', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    return c.json(await jsonOr(() => stopPortForwardSessionsForRepo(repoId), { ok: false, message: 'error.invalid-arguments' }, 'stop-for-repo'))
  })

  return app
}
```

Modify `src/server/app-factory.ts`:

```ts
import { createPortForwardingRoutes } from '#/server/routes/port-forwarding.ts'
```

Add auth and route registration beside the other API routes:

```ts
app.use('/api/port-forwarding/*', createInternalAuthMiddleware(options.internalSecret))
app.route('/api/port-forwarding', createPortForwardingRoutes())
```

Modify `src/server/runtime.ts`:

```ts
import { shutdownPortForwarding } from '#/server/modules/port-forwarding.ts'
```

Inside `shutdown()` after `stopBackgroundSync()` and before `terminalHost.shutdown()`:

```ts
shutdownPortForwarding()
```

- [ ] **Step 4: Run route/runtime tests to verify they pass**

Run:

```bash
bun run test src/server/routes/port-forwarding.test.ts src/server/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS. If it fails, fix imports so `src/main/**` still does not import server/web modules and `src/server/**` does not import Electron.

- [ ] **Step 6: Commit server route integration**

```bash
git add src/server/routes/port-forwarding.ts src/server/routes/port-forwarding.test.ts src/server/app-factory.ts src/server/runtime.ts src/server/runtime.test.ts
git commit -m "feat(port-forwarding): expose server routes"
```

## Task 5: Renderer Client And Close-Repo Cleanup

**Files:**
- Create: `src/web/port-forwarding-client.ts`
- Create: `src/web/port-forwarding-client.test.ts`
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`
- Modify: `src/web/stores/repos/lifecycle.test.ts`

- [ ] **Step 1: Write failing client and close-repo tests**

Create `src/web/port-forwarding-client.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { RendererBootstrapSnapshot } from '#/shared/bootstrap.ts'
import { RENDERER_BRIDGE_VERSION } from '#/shared/bootstrap.ts'

function installBootstrap(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __GOBLIN_BOOTSTRAP__: {
        runtime: { kind: 'web', bridgeVersion: RENDERER_BRIDGE_VERSION, capabilities: [] },
        homeDir: '',
        initialI18n: null,
        initialSettings: null,
        initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
      } satisfies RendererBootstrapSnapshot,
      location: { href: 'http://127.0.0.1:32100/', origin: 'http://127.0.0.1:32100', search: '' },
      matchMedia: vi.fn(() => ({ matches: true })),
    },
  })
}

describe('port-forwarding-client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    installBootstrap()
  })

  test('calls list/start/stop endpoints', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, sessions: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await import('#/web/port-forwarding-client.ts')

    await client.listPortForwardSessions('ssh-config://prod/srv/repo')
    await client.startPortForwardSession({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 })
    await client.stopPortForwardSession('pf_1')
    await client.stopPortForwardSessionsForRepo('ssh-config://prod/srv/repo')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:32100/api/port-forwarding/list',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:32100/api/port-forwarding/start',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:32100/api/port-forwarding/stop',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'pf_1' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:32100/api/port-forwarding/stop-for-repo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo' }) }),
    )
  })
})
```

Add a focused test to `src/web/stores/repos/lifecycle.test.ts`:

```ts
vi.mock('#/web/port-forwarding-client.ts', () => ({
  stopPortForwardSessionsForRepo: vi.fn(async () => ({ ok: true, stopped: [] })),
}))

test('closeRepo requests port-forward cleanup for the closed repo', async () => {
  const { stopPortForwardSessionsForRepo } = await import('#/web/port-forwarding-client.ts')
  const { useReposStore } = await import('#/web/stores/repos/store.ts')
  useReposStore.setState({
    repos: {
      'ssh-config://prod/srv/repo': emptyRepo('ssh-config://prod/srv/repo', 'prod:repo'),
    },
    order: ['ssh-config://prod/srv/repo'],
    activeId: 'ssh-config://prod/srv/repo',
  })

  useReposStore.getState().closeRepo('ssh-config://prod/srv/repo')

  expect(stopPortForwardSessionsForRepo).toHaveBeenCalledWith('ssh-config://prod/srv/repo')
})
```

If `lifecycle.test.ts` already has module mocks at the top, add this mock beside them rather than inside the test body.

- [ ] **Step 2: Run client/lifecycle tests to verify they fail**

Run:

```bash
bun run test src/web/port-forwarding-client.test.ts src/web/stores/repos/lifecycle.test.ts
```

Expected: FAIL because `port-forwarding-client.ts` is missing and `closeRepo` does not call cleanup.

- [ ] **Step 3: Implement renderer client and close-repo cleanup**

Create `src/web/port-forwarding-client.ts`:

```ts
import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  PortForwardListResult,
  PortForwardStartResult,
  PortForwardStopForRepoResult,
  PortForwardStopResult,
} from '#/shared/port-forwarding.ts'

export async function listPortForwardSessions(repoId: string, signal?: AbortSignal): Promise<PortForwardListResult> {
  return await postServerJson('/api/port-forwarding/list', { repoId }, { signal })
}

export async function startPortForwardSession(input: object, signal?: AbortSignal): Promise<PortForwardStartResult> {
  return await postServerJson('/api/port-forwarding/start', input, { signal })
}

export async function stopPortForwardSession(id: string): Promise<PortForwardStopResult> {
  return await postServerJson('/api/port-forwarding/stop', { id })
}

export async function stopPortForwardSessionsForRepo(repoId: string): Promise<PortForwardStopForRepoResult> {
  return await postServerJson('/api/port-forwarding/stop-for-repo', { repoId })
}
```

Modify `src/web/stores/repos/lifecycle-write-paths.ts`:

```ts
import { stopPortForwardSessionsForRepo } from '#/web/port-forwarding-client.ts'
```

Inside `closeRepo(id: string)`, after `disposeRepoRuntime(id)`:

```ts
void stopPortForwardSessionsForRepo(id).catch(() => {
  /* port-forward cleanup is best-effort; server shutdown also stops active forwards */
})
```

- [ ] **Step 4: Run client/lifecycle tests to verify they pass**

Run:

```bash
bun run test src/web/port-forwarding-client.test.ts src/web/stores/repos/lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit renderer client cleanup**

```bash
git add src/web/port-forwarding-client.ts src/web/port-forwarding-client.test.ts src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/lifecycle.test.ts
git commit -m "feat(port-forwarding): add renderer client cleanup"
```

## Task 6: Project Ports Panel UI

**Files:**
- Create: `src/web/components/repo-workspace/ProjectPortsPanel.tsx`
- Create: `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/web/components/repo-workspace/ProjectPortsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

const mocks = vi.hoisted(() => ({
  listPortForwardSessions: vi.fn(),
  startPortForwardSession: vi.fn(),
  stopPortForwardSession: vi.fn(),
  openExternalUrl: vi.fn(),
}))

vi.mock('#/web/port-forwarding-client.ts', () => ({
  listPortForwardSessions: mocks.listPortForwardSessions,
  startPortForwardSession: mocks.startPortForwardSession,
  stopPortForwardSession: mocks.stopPortForwardSession,
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  openExternalUrl: mocks.openExternalUrl,
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [] })
  mocks.startPortForwardSession.mockResolvedValue({
    ok: true,
    session: activeSession(),
  })
  mocks.stopPortForwardSession.mockResolvedValue({
    ok: true,
    session: { ...activeSession(), status: 'stopped' },
  })
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  })
  useReposStore.setState({
    repos: {},
    order: [],
    activeId: null,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('ProjectPortsPanel', () => {
  test('shows a local-repo empty state', async () => {
    seedRepo('/repo')
    const { container, root } = await render('/repo')
    expect(container.textContent).toContain('ports.local-only-title')
    expect(container.querySelector('input')).toBeNull()
    await act(async () => root.unmount())
  })

  test('renders remote form and loads sessions', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    expect(container.querySelector('input[name="remotePort"]')).toBeTruthy()
    expect(mocks.listPortForwardSessions).toHaveBeenCalledWith('ssh-config://prod/srv/repo', expect.any(AbortSignal))
    await act(async () => root.unmount())
  })

  test('shows warning for non-loopback bind host', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="localBindHost"]')!.value = '0.0.0.0'
      container.querySelector<HTMLInputElement>('input[name="localBindHost"]')!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('ports.non-loopback-warning')
    await act(async () => root.unmount())
  })

  test('starts a port forward from form values', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    const { container, root } = await render('ssh-config://prod/srv/repo')
    await fill(container, 'remotePort', '3000')
    await fill(container, 'remoteHost', 'localhost')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="ports-start"]')?.click()
    })
    expect(mocks.startPortForwardSession).toHaveBeenCalledWith(
      {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '127.0.0.1',
        localPort: null,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
      expect.any(AbortSignal),
    )
    await act(async () => root.unmount())
  })

  test('renders session actions for active sessions', async () => {
    seedRepo('ssh-config://prod/srv/repo')
    mocks.listPortForwardSessions.mockResolvedValue({ ok: true, sessions: [activeSession()] })
    const { container, root } = await render('ssh-config://prod/srv/repo')

    expect(container.textContent).toContain('127.0.0.1:61888')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="ports-copy-pf_1"]')?.click()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://127.0.0.1:61888')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="ports-open-pf_1"]')?.click()
    })
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:61888')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="ports-stop-pf_1"]')?.click()
    })
    expect(mocks.stopPortForwardSession).toHaveBeenCalledWith('pf_1')
    await act(async () => root.unmount())
  })
})

async function render(repoId: string): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ProjectPortsPanel repoId={repoId} />)
  })
  return { container, root }
}

function seedRepo(repoId: string): void {
  useReposStore.setState({
    repos: { [repoId]: emptyRepo(repoId, repoId.includes('ssh-config://') ? 'prod:repo' : 'repo') },
    order: [repoId],
    activeId: repoId,
  })
}

async function fill(container: HTMLElement, name: string, value: string): Promise<void> {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function activeSession() {
  return {
    id: 'pf_1',
    repoId: 'ssh-config://prod/srv/repo',
    localBindHost: '127.0.0.1',
    requestedLocalPort: 3000,
    actualLocalPort: 61888,
    remoteHost: 'localhost',
    remotePort: 3000,
    status: 'active' as const,
    localUrl: 'http://127.0.0.1:61888',
    createdAt: '2026-06-15T12:00:00.000Z',
    updatedAt: '2026-06-15T12:00:01.000Z',
  }
}
```

- [ ] **Step 2: Run component test to verify it fails**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected: FAIL with a module-not-found error for `ProjectPortsPanel.tsx`.

- [ ] **Step 3: Implement the ports panel**

Create `src/web/components/repo-workspace/ProjectPortsPanel.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Play, Square } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { cn } from '#/web/lib/cn.ts'
import { openExternalUrl } from '#/web/app-shell-client.ts'
import {
  listPortForwardSessions,
  startPortForwardSession,
  stopPortForwardSession,
} from '#/web/port-forwarding-client.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import {
  isLoopbackBindHost,
  normalizePortForwardStartRequest,
  type PortForwardSessionSnapshot,
} from '#/shared/port-forwarding.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

interface PortsPanelView {
  exists: boolean
  isRemote: boolean
}

export function ProjectPortsPanel({ repoId }: { repoId: string }) {
  const t = useT()
  const view = usePortsPanelView(repoId)
  const [localBindHost, setLocalBindHost] = useState('127.0.0.1')
  const [localPort, setLocalPort] = useState('')
  const [remoteHost, setRemoteHost] = useState('127.0.0.1')
  const [remotePort, setRemotePort] = useState('')
  const [sessions, setSessions] = useState<PortForwardSessionSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      if (!view.exists || !view.isRemote) return
      setLoading(true)
      const result = await listPortForwardSessions(repoId, signal)
      if (signal?.aborted) return
      setLoading(false)
      if (result.ok) {
        setSessions(result.sessions)
        setError(null)
      } else {
        setError(result.message)
      }
    },
    [repoId, view.exists, view.isRemote],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadSessions(controller.signal)
    const timer = window.setInterval(() => void loadSessions(controller.signal), 3000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [loadSessions])

  const nonLoopback = useMemo(() => localBindHost.trim() && !isLoopbackBindHost(localBindHost), [localBindHost])

  async function handleStart() {
    const normalized = normalizePortForwardStartRequest({
      repoId,
      localBindHost,
      localPort: localPort.trim() ? Number(localPort) : null,
      remoteHost,
      remotePort: Number(remotePort),
    })
    if (!normalized.ok) {
      setError(normalized.message)
      return
    }
    const controller = new AbortController()
    setPending(true)
    setError(null)
    const result = await startPortForwardSession(normalized.request, controller.signal)
    setPending(false)
    if (!result.ok) {
      setError(result.detail || result.message)
    }
    await loadSessions()
  }

  if (!view.exists) return null
  if (!view.isRemote) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center">
        <div>
          <div className="text-sm font-medium text-foreground">{t('ports.local-only-title')}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t('ports.local-only-body')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-background p-3 text-xs">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_7rem_auto]">
        <Input name="localBindHost" value={localBindHost} onChange={(event) => setLocalBindHost(event.currentTarget.value)} aria-label={t('ports.local-bind-host')} />
        <Input name="localPort" value={localPort} onChange={(event) => setLocalPort(event.currentTarget.value)} placeholder={t('ports.local-port-placeholder')} aria-label={t('ports.local-port')} />
        <Input name="remoteHost" value={remoteHost} onChange={(event) => setRemoteHost(event.currentTarget.value)} aria-label={t('ports.remote-host')} />
        <Input name="remotePort" value={remotePort} onChange={(event) => setRemotePort(event.currentTarget.value)} aria-label={t('ports.remote-port')} />
        <Button data-testid="ports-start" type="button" disabled={pending} onClick={handleStart}>
          <Play className="size-3.5" />
          {t('ports.start')}
        </Button>
      </div>
      {nonLoopback ? <div className="rounded border border-attention/50 px-2 py-1 text-attention">{t('ports.non-loopback-warning')}</div> : null}
      {error ? <div className="text-danger">{t(error)}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {loading && sessions.length === 0 ? <div className="text-muted-foreground">{t('ports.loading')}</div> : null}
        {!loading && sessions.length === 0 ? <div className="text-muted-foreground">{t('ports.empty')}</div> : null}
        {sessions.map((session) => (
          <PortForwardSessionRow key={session.id} session={session} onStopped={loadSessions} />
        ))}
      </div>
    </div>
  )
}

function PortForwardSessionRow({ session, onStopped }: { session: PortForwardSessionSnapshot; onStopped: () => Promise<void> }) {
  const t = useT()
  const canUseUrl = !!session.localUrl && session.status === 'active'
  return (
    <div className="flex min-w-0 items-center gap-2 rounded border border-separator px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11px]">
          {session.localBindHost}:{session.actualLocalPort ?? session.requestedLocalPort ?? session.remotePort} -&gt; {session.remoteHost}:{session.remotePort}
        </div>
        {session.message ? <div className="mt-0.5 truncate text-danger">{t(session.message)}</div> : null}
      </div>
      <Badge variant={session.status === 'active' ? 'success' : session.status === 'failed' ? 'destructive' : 'secondary'}>{session.status}</Badge>
      <Button data-testid={`ports-open-${session.id}`} type="button" size="icon" variant="ghost" disabled={!canUseUrl} onClick={() => session.localUrl && void openExternalUrl(session.localUrl)}>
        <ExternalLink className="size-3.5" />
      </Button>
      <Button data-testid={`ports-copy-${session.id}`} type="button" size="icon" variant="ghost" disabled={!canUseUrl} onClick={() => session.localUrl && void navigator.clipboard?.writeText(session.localUrl)}>
        <Copy className="size-3.5" />
      </Button>
      <Button data-testid={`ports-stop-${session.id}`} type="button" size="icon" variant="ghost" disabled={session.status === 'stopped'} onClick={async () => { await stopPortForwardSession(session.id); await onStopped() }}>
        <Square className="size-3.5" />
      </Button>
    </div>
  )
}

function usePortsPanelView(repoId: string): PortsPanelView {
  return useStoreWithEqualityFn(
    useReposStore,
    (state) => {
      const repo = state.repos[repoId]
      return { exists: !!repo, isRemote: !!repo && isRemoteRepoId(repoId) }
    },
    (a, b) => a.exists === b.exists && a.isRemote === b.isRemote,
  )
}
```

If TypeScript reports `Badge` variant names do not match existing variants, inspect `src/web/components/ui/badge.tsx` and use only the variants defined there.

- [ ] **Step 4: Run component test to verify it passes**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the ports panel**

```bash
git add src/web/components/repo-workspace/ProjectPortsPanel.tsx src/web/components/repo-workspace/ProjectPortsPanel.test.tsx
git commit -m "feat(port-forwarding): add ports panel"
```

## Task 7: Explorer Tab Integration And I18n

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Write failing Explorer tab test updates**

Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx` mocks:

```tsx
vi.mock('#/web/components/repo-workspace/ProjectPortsPanel.tsx', () => ({
  ProjectPortsPanel: () => <div data-testid="project-ports-panel" />,
}))
```

Change the tab assertion in `switches the explorer area between file, changes, and status tabs`:

```ts
expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status', 'ports.title'])
```

Add:

```ts
await act(async () => {
  tabs[3]?.click()
})

expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
expect(container.querySelector('[data-testid="project-status-panel"]')).toBeNull()
expect(container.querySelector('[data-testid="project-ports-panel"]')).toBeTruthy()
```

- [ ] **Step 2: Run Explorer test to verify it fails**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: FAIL because the `Ports` tab does not exist yet.

- [ ] **Step 3: Add the `Ports` tab**

Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`:

```ts
import { ProjectPortsPanel } from '#/web/components/repo-workspace/ProjectPortsPanel.tsx'
```

Change:

```ts
type ExplorerTab = 'files' | 'changes' | 'status'
```

to:

```ts
type ExplorerTab = 'files' | 'changes' | 'status' | 'ports'
```

Add the tab:

```ts
const tabs = [
  { id: 'files' as const, label: t('file-tree.title') },
  { id: 'changes' as const, label: t('tab.changes') },
  { id: 'status' as const, label: t('tab.status') },
  { id: 'ports' as const, label: t('ports.title') },
]
```

Change the panel rendering:

```tsx
{activeTab === 'files' ? (
  <ProjectFileTree repoId={repoId} revealRequest={revealRequest} />
) : activeTab === 'changes' ? (
  <ProjectChangesPanel repoId={repoId} onRevealPath={handleRevealPath} />
) : activeTab === 'status' ? (
  <ProjectStatusPanel repoId={repoId} layout={layout} />
) : (
  <ProjectPortsPanel repoId={repoId} />
)}
```

- [ ] **Step 4: Add i18n keys**

Add these English strings to `src/shared/i18n/en.ts`:

```ts
'ports.title': 'Ports',
'ports.local-only-title': 'SSH remotes only',
'ports.local-only-body': 'Open an SSH remote repository to forward local ports to remote services.',
'ports.local-bind-host': 'Local bind host',
'ports.local-port': 'Local port',
'ports.local-port-placeholder': 'auto',
'ports.remote-host': 'Remote host',
'ports.remote-port': 'Remote port',
'ports.start': 'Start',
'ports.loading': 'Loading port forwards…',
'ports.empty': 'No port forwards',
'ports.non-loopback-warning': 'This bind address may expose the forwarded service to devices on your local network.',
'error.invalid-host': 'Host is invalid',
'error.invalid-port': 'Port is invalid',
'error.port-forward-start-failed': 'Could not start port forwarding',
'error.port-forward-not-found': 'Port forwarding session was not found',
```

Add equivalent keys to `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, and `src/shared/i18n/ko.ts`. Keep keys identical across all dictionaries. Suggested Chinese strings:

```ts
'ports.title': '端口',
'ports.local-only-title': '仅支持 SSH 远程仓库',
'ports.local-only-body': '打开 SSH 远程仓库后，可以把本地端口转发到远端服务。',
'ports.local-bind-host': '本地监听地址',
'ports.local-port': '本地端口',
'ports.local-port-placeholder': '自动',
'ports.remote-host': '远端主机',
'ports.remote-port': '远端端口',
'ports.start': '启动',
'ports.loading': '正在加载端口转发…',
'ports.empty': '没有端口转发',
'ports.non-loopback-warning': '这个监听地址可能让局域网设备访问转发后的服务。',
'error.invalid-host': '主机无效',
'error.invalid-port': '端口无效',
'error.port-forward-start-failed': '无法启动端口转发',
'error.port-forward-not-found': '端口转发会话不存在',
```

- [ ] **Step 5: Run Explorer and dictionary tests**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/shared/i18n/dictionaries.test.ts src/shared/i18n/snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Explorer tab integration**

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "feat(port-forwarding): add explorer ports tab"
```

## Task 8: End-To-End Verification And Cleanup

**Files:**
- Modify only files already touched if verification exposes issues.

- [ ] **Step 1: Run focused port-forwarding tests**

Run:

```bash
bun run test src/shared/port-forwarding.test.ts src/system/ssh/port-forward.test.ts src/server/modules/port-forwarding.test.ts src/server/routes/port-forwarding.test.ts src/web/port-forwarding-client.test.ts src/web/components/repo-workspace/ProjectPortsPanel.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS. If it fails on `Badge` variants or React event typing, inspect the local component APIs and use the existing project types rather than adding wrappers.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run the app:

```bash
bun run dev
```

Open a remote repository through an existing SSH config alias. In Explorer, select `Ports`, start `remoteHost=127.0.0.1`, `remotePort=<known service port>`, and verify:

- The session becomes `active`.
- If the requested local port is occupied, the row shows a different actual local port.
- Copy writes the actual local URL.
- Open uses the actual local URL.
- Stop changes the row to `stopped`.
- Closing the repository tab stops remaining active sessions.

- [ ] **Step 6: Commit verification fixes if any**

If verification required fixes:

```bash
git add src/shared/port-forwarding.ts src/shared/port-forwarding.test.ts src/system/ssh/port-forward.ts src/system/ssh/port-forward.test.ts src/server/modules/port-forwarding.ts src/server/modules/port-forwarding.test.ts src/server/routes/port-forwarding.ts src/server/routes/port-forwarding.test.ts src/server/app-factory.ts src/server/runtime.ts src/server/runtime.test.ts src/web/port-forwarding-client.ts src/web/port-forwarding-client.test.ts src/web/components/repo-workspace/ProjectPortsPanel.tsx src/web/components/repo-workspace/ProjectPortsPanel.test.tsx src/web/components/repo-workspace/RepoExplorerPane.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/lifecycle.test.ts src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "fix(port-forwarding): resolve verification issues"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: This plan covers Explorer `Ports` tab placement, SSH local forwarding only, custom local bind host, custom remote host, local port fallback, runtime-only sessions, copy/open/stop actions, close-repo cleanup, server shutdown cleanup, validation, errors, and tests.
- Placeholder scan: No task contains unresolved placeholders or unbounded test instructions.
- Type consistency: The shared type names `PortForwardStartRequest`, `PortForwardSessionSnapshot`, and status union values match across shared, server, client, and UI tasks.
- Scope check: The plan does not add persisted presets, reverse forwarding, SOCKS forwarding, realtime events, or new package dependencies.

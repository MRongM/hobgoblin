# Remote Terminal Tmux Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hobgoblin-managed remote terminals resume stable per-worktree tmux sessions, while external remote terminals and non-interactive remote operations stay on plain SSH.

**Architecture:** Split remote terminal SSH construction into managed and external builders in `src/system/remote-terminal.ts`. Route only the server-managed terminal catalog path through the tmux-aware builder, using resolved `user@host:port`, remote repo path, worktree path, and `terminal-N` number for deterministic `goblin-<hash>` session names. Keep external Terminal/Ghostty launchers on the external builder so they never include tmux.

**Tech Stack:** TypeScript in Node strip-only mode, Bun scripts, Vitest, Electron/server terminal runtime, `node:crypto` SHA-256, SSH/tmux shell scripts.

**Git safety:** Commit steps are intentionally omitted because this repository's `AGENTS.md` requires explicit user confirmation before `git commit`.

---

## File Structure

- `src/system/remote-terminal.ts`: Owns safe SSH shell quoting, managed tmux session naming, managed tmux-aware invocation construction, and external plain-SSH invocation construction.
- `src/system/remote-terminal.test.ts`: Unit tests for session identity, quoting, managed behavior, external behavior, and invalid input rejection.
- `src/system/ssh/commands.ts`: Keeps non-interactive remote commands unchanged and adapts the server-managed remote terminal invocation to call the managed builder with terminal number and current SSH safety options.
- `src/system/ssh/commands.test.ts`: Proves remote Git/file-tree commands remain plain command scripts and the managed terminal invocation contains tmux.
- `src/server/terminal/terminal-catalog.ts`: Parses `terminal-N` into the numeric tmux slot and reuses the smallest missing terminal id for additional sessions.
- `src/server/terminal/terminal.test.ts`: Server integration tests for tmux-aware remote spawn and terminal id reuse.
- `src/system/apple-terminal.ts`, `src/system/ghostty.ts`, `src/system/terminals.ts`: External remote terminal launch path accepts a target object and uses the external plain-SSH builder.
- `src/system/apple-terminal.test.ts`, `src/system/ghostty.test.ts`, `src/system/terminals.test.ts`: Verify external remote terminal commands do not contain tmux.
- `src/server/modules/remote.ts`: No behavior change beyond continuing to call `openRemoteInPreferredTerminal(alias, worktreePath, pref)`.
- `src/server/modules/remote.test.ts`: Existing expectations should remain valid and prove the server remote terminal module still passes alias/path/pref.

## Task 1: Split Remote Terminal Builders

**Files:**

- Modify: `src/system/remote-terminal.test.ts`
- Modify: `src/system/remote-terminal.ts`

- [ ] **Step 1: Replace the remote terminal builder tests with managed and external coverage**

Replace `src/system/remote-terminal.test.ts` with:

```ts
import { describe, expect, test } from 'vitest'
import {
  buildExternalRemoteTerminalInvocation,
  buildManagedRemoteTerminalInvocation,
  buildManagedRemoteTerminalSessionName,
} from '#/system/remote-terminal.ts'

const BASE_MANAGED_TARGET = {
  alias: 'prod',
  endpoint: { user: 'alice', host: '192.168.1.20', port: 22 },
  repoPath: '/srv/repo',
  worktreePath: '/srv/repo-feature',
  terminalNumber: 1,
}

describe('buildManagedRemoteTerminalSessionName', () => {
  test('is stable for the same resolved endpoint, repo path, worktree path, and terminal number', () => {
    expect(buildManagedRemoteTerminalSessionName(BASE_MANAGED_TARGET)).toBe(
      buildManagedRemoteTerminalSessionName(BASE_MANAGED_TARGET),
    )
  })

  test('does not change when only the ssh alias changes', () => {
    expect(buildManagedRemoteTerminalSessionName({ ...BASE_MANAGED_TARGET, alias: 'renamed-prod' })).toBe(
      buildManagedRemoteTerminalSessionName(BASE_MANAGED_TARGET),
    )
  })

  test('changes when endpoint, paths, or terminal number change', () => {
    const base = buildManagedRemoteTerminalSessionName(BASE_MANAGED_TARGET)

    expect(
      buildManagedRemoteTerminalSessionName({
        ...BASE_MANAGED_TARGET,
        endpoint: { user: 'bob', host: '192.168.1.20', port: 22 },
      }),
    ).not.toBe(base)
    expect(
      buildManagedRemoteTerminalSessionName({
        ...BASE_MANAGED_TARGET,
        endpoint: { user: 'alice', host: '192.168.1.21', port: 22 },
      }),
    ).not.toBe(base)
    expect(
      buildManagedRemoteTerminalSessionName({
        ...BASE_MANAGED_TARGET,
        endpoint: { user: 'alice', host: '192.168.1.20', port: 2222 },
      }),
    ).not.toBe(base)
    expect(buildManagedRemoteTerminalSessionName({ ...BASE_MANAGED_TARGET, repoPath: '/srv/other' })).not.toBe(base)
    expect(buildManagedRemoteTerminalSessionName({ ...BASE_MANAGED_TARGET, worktreePath: '/srv/repo-other' })).not.toBe(
      base,
    )
    expect(buildManagedRemoteTerminalSessionName({ ...BASE_MANAGED_TARGET, terminalNumber: 2 })).not.toBe(base)
  })

  test('returns a short tmux-safe goblin-prefixed session name', () => {
    expect(
      buildManagedRemoteTerminalSessionName({
        alias: 'prod',
        endpoint: { user: 'alice', host: 'dev.example.com', port: 2222 },
        repoPath: '/srv/repo with spaces',
        worktreePath: "/srv/repo's-feature",
        terminalNumber: 3,
      }),
    ).toMatch(/^goblin-[a-f0-9]{24}$/)
  })
})

describe('buildManagedRemoteTerminalInvocation', () => {
  test('builds a tmux-first ssh invocation with native shell fallback', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET)

    expect(invocation).not.toBeNull()
    expect(invocation?.command).toBe('ssh')
    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("cd '/srv/repo-feature' || exit")
    expect(invocation?.script).toContain('command -v tmux >/dev/null 2>&1')
    expect(invocation?.script).toContain("exec tmux new-session -A -s 'goblin-")
    expect(invocation?.script).toContain("-c '/srv/repo-feature'")
    expect(invocation?.script).toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(invocation?.shellCommand).toContain('ssh')
    expect(invocation?.shellCommand).toContain('prod')
    expect(invocation?.shellCommand).toContain('tmux')
  })

  test('includes caller-provided ssh options before the destination', () => {
    const invocation = buildManagedRemoteTerminalInvocation(BASE_MANAGED_TARGET, {
      sshOptions: ['-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10'],
    })

    expect(invocation?.args.slice(0, 7)).toEqual([
      '-tt',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '--',
      'prod',
    ])
  })

  test('shell-quotes remote paths that contain single quotes', () => {
    const invocation = buildManagedRemoteTerminalInvocation({
      ...BASE_MANAGED_TARGET,
      worktreePath: "/srv/repo's-feature",
    })

    expect(invocation).not.toBeNull()
    expect(invocation?.script).toContain("cd '/srv/repo'\\''s-feature' || exit")
    expect(invocation?.script).toContain("-c '/srv/repo'\\''s-feature'")
  })

  test('keeps non-ascii paths as quoted shell data', () => {
    const invocation = buildManagedRemoteTerminalInvocation({
      ...BASE_MANAGED_TARGET,
      repoPath: '/srv/项目',
      worktreePath: '/srv/项目/功能',
    })

    expect(invocation?.script).toContain("cd '/srv/项目/功能' || exit")
  })

  test('rejects unsafe managed target input', () => {
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, alias: 'bad alias' })).toBeNull()
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, repoPath: 'relative/repo' })).toBeNull()
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, worktreePath: 'relative/repo' })).toBeNull()
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, worktreePath: '/srv/\u0000repo' })).toBeNull()
    expect(
      buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, endpoint: { user: '', host: 'host', port: 22 } }),
    ).toBeNull()
    expect(
      buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, endpoint: { user: 'alice', host: '', port: 22 } }),
    ).toBeNull()
    expect(
      buildManagedRemoteTerminalInvocation({
        ...BASE_MANAGED_TARGET,
        endpoint: { user: 'alice', host: 'host', port: 0 },
      }),
    ).toBeNull()
    expect(buildManagedRemoteTerminalInvocation({ ...BASE_MANAGED_TARGET, terminalNumber: 0 })).toBeNull()
  })
})

describe('buildExternalRemoteTerminalInvocation', () => {
  test('builds a plain ssh login-shell invocation without tmux', () => {
    const invocation = buildExternalRemoteTerminalInvocation({
      alias: 'prod',
      worktreePath: '/srv/repo-feature',
    })

    expect(invocation).not.toBeNull()
    expect(invocation?.command).toBe('ssh')
    expect(invocation?.args).toEqual(['-tt', '--', 'prod', expect.stringContaining('sh -lc')])
    expect(invocation?.script).toContain("cd '/srv/repo-feature' || exit")
    expect(invocation?.script).toContain('exec "${SHELL:-/bin/sh}" -l')
    expect(invocation?.script).not.toContain('tmux')
    expect(invocation?.shellCommand).not.toContain('tmux')
  })

  test('rejects unsafe external target input', () => {
    expect(buildExternalRemoteTerminalInvocation({ alias: 'bad alias', worktreePath: '/srv/repo' })).toBeNull()
    expect(buildExternalRemoteTerminalInvocation({ alias: 'prod', worktreePath: 'relative/repo' })).toBeNull()
    expect(buildExternalRemoteTerminalInvocation({ alias: 'prod', worktreePath: '/srv/\u0000repo' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run test src/system/remote-terminal.test.ts
```

Expected: FAIL because `buildManagedRemoteTerminalInvocation`, `buildManagedRemoteTerminalSessionName`, and `buildExternalRemoteTerminalInvocation` are not exported yet.

- [ ] **Step 3: Replace `src/system/remote-terminal.ts` with the split builders**

Use this implementation:

```ts
import { createHash } from 'node:crypto'

export interface RemoteTerminalEndpoint {
  user: string
  host: string
  port: number
}

export interface ManagedRemoteTerminalTarget {
  alias: string
  endpoint: RemoteTerminalEndpoint
  repoPath: string
  worktreePath: string
  terminalNumber: number
}

export interface ExternalRemoteTerminalTarget {
  alias: string
  worktreePath: string
}

export interface RemoteTerminalInvocation {
  command: 'ssh'
  args: string[]
  script: string
  shellCommand: string
}

export interface RemoteTerminalInvocationOptions {
  sshOptions?: readonly string[]
}

export function buildManagedRemoteTerminalSessionName(target: ManagedRemoteTerminalTarget): string {
  const endpoint = remoteEndpointIdentity(target.endpoint)
  const digest = createHash('sha256')
    .update(endpoint)
    .update('\0')
    .update(target.repoPath)
    .update('\0')
    .update(target.worktreePath)
    .update('\0')
    .update(String(target.terminalNumber))
    .digest('hex')
    .slice(0, 24)
  return `goblin-${digest}`
}

export function buildManagedRemoteTerminalInvocation(
  target: ManagedRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): RemoteTerminalInvocation | null {
  if (
    !isSafeRemoteAlias(target.alias) ||
    !isSafeRemoteEndpoint(target.endpoint) ||
    !isSafeRemoteAbsolutePath(target.repoPath) ||
    !isSafeRemoteAbsolutePath(target.worktreePath) ||
    !isSafeTerminalNumber(target.terminalNumber)
  ) {
    return null
  }

  const sessionName = buildManagedRemoteTerminalSessionName(target)
  const script = [
    `cd ${shellQuote(target.worktreePath)} || exit`,
    'if command -v tmux >/dev/null 2>&1; then',
    `  exec tmux new-session -A -s ${shellQuote(sessionName)} -c ${shellQuote(target.worktreePath)}`,
    'fi',
    'exec "${SHELL:-/bin/sh}" -l',
  ].join('\n')
  return buildSshInvocation(target.alias, script, options)
}

export function buildExternalRemoteTerminalInvocation(
  target: ExternalRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): RemoteTerminalInvocation | null {
  if (!isSafeRemoteAlias(target.alias) || !isSafeRemoteAbsolutePath(target.worktreePath)) return null

  const script = [`cd ${shellQuote(target.worktreePath)} || exit`, 'exec "${SHELL:-/bin/sh}" -l'].join('\n')
  return buildSshInvocation(target.alias, script, options)
}

function buildSshInvocation(
  alias: string,
  script: string,
  options: RemoteTerminalInvocationOptions,
): RemoteTerminalInvocation {
  const remoteCommand = `sh -lc ${shellQuote(script)}`
  const args = ['-tt', ...(options.sshOptions ?? []), '--', alias, remoteCommand]
  return {
    command: 'ssh',
    args,
    script,
    shellCommand: ['ssh', ...args].map(shellQuote).join(' '),
  }
}

function remoteEndpointIdentity(endpoint: RemoteTerminalEndpoint): string {
  return `${endpoint.user}@${endpoint.host}:${endpoint.port}`
}

function isSafeRemoteEndpoint(endpoint: RemoteTerminalEndpoint): boolean {
  return (
    isSafeEndpointPart(endpoint.user) &&
    isSafeEndpointPart(endpoint.host) &&
    Number.isInteger(endpoint.port) &&
    endpoint.port >= 1 &&
    endpoint.port <= 65535
  )
}

function isSafeEndpointPart(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !/[\0-\x1f\x7f]/.test(value)
}

function isSafeTerminalNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1
}

function isSafeRemoteAlias(alias: string): boolean {
  return alias.length > 0 && alias.length <= 255 && !/[\s\0/?#\\]/.test(alias)
}

function isSafeRemoteAbsolutePath(remotePath: string): boolean {
  return (
    remotePath.length > 0 &&
    remotePath.length <= 4096 &&
    remotePath.startsWith('/') &&
    !/[\0-\x1f\x7f]/.test(remotePath)
  )
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
bun run test src/system/remote-terminal.test.ts
```

Expected: PASS.

## Task 2: Route Managed Remote Terminals Through Tmux Builder

**Files:**

- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/commands.ts`

- [ ] **Step 1: Add managed remote terminal command tests**

In `src/system/ssh/commands.test.ts`, change the import to:

```ts
import { buildRemoteCommandInvocation, buildRemoteTerminalInvocation } from '#/system/ssh/commands.ts'
```

Add these tests inside `describe('remote command scripts', () => { ... })` after the existing file-tree tests and before Git write tests:

```ts
test('renders tmux-aware managed remote terminal invocation through the ssh command adapter', () => {
  const invocation = buildRemoteTerminalInvocation(TARGET, '/srv/repo-feature', {
    cols: 100,
    rows: 30,
    terminalNumber: 2,
  })

  expect(invocation.command).toBe('ssh')
  expect(invocation.args).toEqual([
    '-tt',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=10',
    '--',
    'prod',
    expect.stringContaining('sh -lc'),
  ])
  expect(invocation.script).toContain("cd '/srv/repo-feature' || exit")
  expect(invocation.script).toContain('command -v tmux >/dev/null 2>&1')
  expect(invocation.script).toContain("exec tmux new-session -A -s 'goblin-")
  expect(invocation.script).toContain("-c '/srv/repo-feature'")
  expect(invocation.script).toContain('exec "${SHELL:-/bin/sh}" -l')
})

test('keeps non-interactive remote command scripts out of tmux', () => {
  const invocation = buildRemoteCommandInvocation(TARGET, {
    type: 'gitStatus',
    path: '/srv/repo-feature',
  })

  expect(invocation.script).toBe("git -C '/srv/repo-feature' status --porcelain -z")
  expect(invocation.args.join(' ')).not.toContain('tmux')
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run test src/system/ssh/commands.test.ts
```

Expected: FAIL because `buildRemoteTerminalInvocation()` still uses the plain login shell and does not accept `terminalNumber`.

- [ ] **Step 3: Update imports in `src/system/ssh/commands.ts`**

Add this import near the existing imports:

```ts
import { buildManagedRemoteTerminalInvocation } from '#/system/remote-terminal.ts'
```

- [ ] **Step 4: Replace the terminal invocation adapter**

Replace the existing `buildRemoteTerminalInvocation()` in `src/system/ssh/commands.ts` with:

```ts
export function buildRemoteTerminalInvocation(
  target: RemoteRepoTarget,
  remotePath: string,
  options: { cols: number; rows: number; terminalNumber: number },
): RemoteCommandInvocation {
  const invocation = buildManagedRemoteTerminalInvocation(
    {
      alias: target.alias,
      endpoint: {
        user: target.user,
        host: target.host,
        port: target.port,
      },
      repoPath: target.remotePath,
      worktreePath: remotePath,
      terminalNumber: options.terminalNumber,
    },
    {
      sshOptions: ['-o', 'StrictHostKeyChecking=yes', '-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SEC}`],
    },
  )
  if (!invocation) throw new Error('Invalid remote terminal invocation')
  return {
    command: invocation.command,
    args: invocation.args,
    script: invocation.script,
  }
}
```

The `cols` and `rows` fields stay in the signature because the catalog already passes size data through this boundary and the call shape remains stable for future PTY sizing changes.

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
bun run test src/system/ssh/commands.test.ts
```

Expected: PASS.

## Task 3: Use Numeric Terminal Slots in Server Terminal Catalog

**Files:**

- Modify: `src/server/terminal/terminal.test.ts`
- Modify: `src/server/terminal/terminal-catalog.ts`

- [ ] **Step 1: Mock resolved remote SSH targets in terminal tests**

Add this mock after the existing `vi.mock('#/system/git/worktrees.ts', ...)` block in `src/server/terminal/terminal.test.ts`:

```ts
vi.mock('#/system/ssh/config.ts', () => ({
  resolveRemoteTarget: vi.fn(async () => ({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
  })),
}))
```

- [ ] **Step 2: Add server tests for tmux spawn and smallest missing terminal id**

Add these tests near the top of `describe('server terminal sessions', () => { ... })`, after the ownership test:

```ts
test('creates remote terminal sessions with a tmux-aware ssh command', async () => {
  const result = await createServerTerminal('client_1', {
    repoRoot: 'ssh-config://prod/srv/repo',
    branch: 'feature',
    worktreePath: '/srv/repo-feature',
    kind: 'additional',
    cols: 100,
    rows: 30,
  })

  expect(result.ok).toBe(true)
  expect(spawn).toHaveBeenCalledWith(
    'ssh',
    [
      '-tt',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      '--',
      'prod',
      expect.stringContaining('tmux new-session -A'),
    ],
    expect.objectContaining({
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
    }),
  )
  const args = vi.mocked(spawn).mock.calls[0]![1] as string[]
  expect(args[7]).toContain('/srv/repo-feature')
  expect(args[7]).toContain('tmux new-session -A')
  expect(args[7]).toContain('goblin-')
  expect(args[7]).not.toContain('alice@example.com')
  expect(args[7]).not.toContain('/srv/repo\u0000')
})

test('reuses the smallest missing terminal number for additional sessions', async () => {
  const first = await createServerTerminal('client_1', {
    repoRoot: '/repo',
    branch: 'feature',
    worktreePath: '/repo-linked',
    kind: 'additional',
  })
  expect(first.ok).toBe(true)
  if (!first.ok) return
  expect(first.key).toBe('/repo\u0000/repo-linked\u0000terminal-1')
  const firstSession = first.sessions.find((session) => session.key === first.key)
  expect(firstSession).toBeTruthy()
  if (!firstSession) return

  const second = await createServerTerminal('client_1', {
    repoRoot: '/repo',
    branch: 'feature',
    worktreePath: '/repo-linked',
    kind: 'additional',
  })
  expect(second.ok).toBe(true)
  if (!second.ok) return
  expect(second.key).toBe('/repo\u0000/repo-linked\u0000terminal-2')

  expect(closeServerTerminal('client_1', { sessionId: firstSession.sessionId })).toBe(true)

  const reopened = await createServerTerminal('client_1', {
    repoRoot: '/repo',
    branch: 'feature',
    worktreePath: '/repo-linked',
    kind: 'additional',
  })
  expect(reopened.ok).toBe(true)
  if (!reopened.ok) return
  expect(reopened.key).toBe('/repo\u0000/repo-linked\u0000terminal-1')
})
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
bun run test src/server/terminal/terminal.test.ts
```

Expected: FAIL because remote terminal creation does not pass `terminalNumber`, and `nextTerminalId()` currently returns `max + 1` instead of the smallest missing positive number.

- [ ] **Step 4: Change `nextTerminalId()` to reuse the smallest missing number**

In `src/server/terminal/terminal-catalog.ts`, replace `nextTerminalId()` with:

```ts
  async nextTerminalId(repoRoot: string, worktreePath: string): Promise<string> {
    const sessions = await this.options.manager.listSessions(repoRoot)
    const usedIndexes = new Set<number>()
    for (const session of sessions) {
      const parsed = parseSessionKey(session.key)
      if (!parsed || parsed.repoRoot !== repoRoot || parsed.worktreePath !== worktreePath) continue
      const index = parseTerminalIdIndex(parsed.terminalId)
      if (index !== null) usedIndexes.add(index)
    }
    let nextIndex = 1
    while (usedIndexes.has(nextIndex)) nextIndex += 1
    return formatTerminalId(nextIndex)
  }
```

- [ ] **Step 5: Pass the parsed terminal number to the remote invocation**

In `src/server/terminal/terminal-catalog.ts`, inside `ensureRemote()` after SSH target resolution, add:

```ts
const terminalNumber = parseTerminalIdIndex(context.terminalId)
if (terminalNumber === null) return { ok: false, message: 'error.invalid-arguments' }
```

Then replace the current `buildRemoteTerminalInvocation()` call with:

```ts
const invocation = buildRemoteTerminalInvocation(resolved.target, input.worktreePath, {
  cols: context.cols,
  rows: context.rows,
  terminalNumber,
})
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
bun run test src/server/terminal/terminal.test.ts
```

Expected: PASS.

## Task 4: Keep External Remote Terminals on Plain SSH

**Files:**

- Modify: `src/system/apple-terminal.test.ts`
- Modify: `src/system/apple-terminal.ts`
- Modify: `src/system/ghostty.test.ts`
- Modify: `src/system/ghostty.ts`
- Modify: `src/system/terminals.test.ts`
- Modify: `src/system/terminals.ts`

- [ ] **Step 1: Update Apple Terminal remote tests**

In `src/system/apple-terminal.test.ts`, replace `openRemoteInAppleTerminal('prod', '/srv/repo-feature')` with:

```ts
openRemoteInAppleTerminal({ alias: 'prod', worktreePath: '/srv/repo-feature' })
```

After the existing command content expectations in the success test, add:

```ts
expect(mocks.execa.mock.calls[0]![1][2]).not.toContain('tmux')
```

In the invalid input test, replace the two calls with:

```ts
await expect(openRemoteInAppleTerminal({ alias: 'bad alias', worktreePath: '/srv/repo' })).resolves.toEqual({
  ok: false,
  message: 'error.invalid-arguments',
})
await expect(openRemoteInAppleTerminal({ alias: 'prod', worktreePath: 'relative/repo' })).resolves.toEqual({
  ok: false,
  message: 'error.invalid-arguments',
})
```

- [ ] **Step 2: Update Ghostty remote tests**

In `src/system/ghostty.test.ts`, replace each successful remote open call with:

```ts
openRemoteInGhostty({ alias: 'prod', worktreePath: '/srv/repo-feature' })
```

Add these assertions:

```ts
expect(mocks.execa.mock.calls[0]![1][2]).not.toContain('tmux')
```

in the running-window test, and:

```ts
expect(mocks.execa.mock.calls[1]![1][8]).not.toContain('tmux')
```

in the cold-start test.

In the invalid input test, replace the two calls with:

```ts
await expect(openRemoteInGhostty({ alias: 'bad alias', worktreePath: '/srv/repo' })).resolves.toEqual({
  ok: false,
  message: 'error.invalid-arguments',
})
await expect(openRemoteInGhostty({ alias: 'prod', worktreePath: 'relative/repo' })).resolves.toEqual({
  ok: false,
  message: 'error.invalid-arguments',
})
```

In the unavailable test, replace the call with:

```ts
await expect(openRemoteInGhostty({ alias: 'prod', worktreePath: '/srv/repo' })).resolves.toEqual({
  ok: false,
  message: 'error.ghostty-not-installed',
})
```

- [ ] **Step 3: Update terminal registry tests to pass target objects to backends**

In `src/system/terminals.test.ts`, change the mocks to:

```ts
vi.mock('#/system/ghostty.ts', () => ({
  isGhosttyInstalled: vi.fn(() => false),
  openInGhostty: vi.fn(async (path: string) => ({ ok: true, message: path })),
  openRemoteInGhostty: vi.fn(async (target: { alias: string; worktreePath: string }) => ({
    ok: true,
    message: `${target.alias}:${target.worktreePath}`,
  })),
}))

vi.mock('#/system/apple-terminal.ts', () => ({
  isAppleTerminalInstalled: vi.fn(async () => true),
  openInAppleTerminal: vi.fn(async (path: string) => ({ ok: true, message: path })),
  openRemoteInAppleTerminal: vi.fn(async (target: { alias: string; worktreePath: string }) => ({
    ok: true,
    message: `${target.alias}:${target.worktreePath}`,
  })),
}))
```

Update successful backend expectations to:

```ts
expect(openRemoteInAppleTerminal).toHaveBeenCalledWith({ alias: 'prod', worktreePath: '/srv/repo-feature' })
```

and:

```ts
expect(openRemoteInGhostty).toHaveBeenCalledWith({ alias: 'prod', worktreePath: '/srv/repo-feature' })
```

In the direct `openRemoteInTerminalBackend()` test, replace the alias/path arguments with:

```ts
        { alias: 'prod', worktreePath: '/srv/repo-feature' },
```

- [ ] **Step 4: Run focused external terminal tests and verify they fail**

Run:

```bash
bun run test src/system/apple-terminal.test.ts src/system/ghostty.test.ts src/system/terminals.test.ts
```

Expected: FAIL because the production functions still accept `(alias, remotePath)` and import the removed `buildRemoteTerminalInvocation()` from `src/system/remote-terminal.ts`.

- [ ] **Step 5: Update Apple Terminal implementation**

In `src/system/apple-terminal.ts`, replace the remote-terminal import with:

```ts
import { buildExternalRemoteTerminalInvocation, type ExternalRemoteTerminalTarget } from '#/system/remote-terminal.ts'
```

Replace the remote opener signature and invocation construction with:

```ts
export async function openRemoteInAppleTerminal(
  target: ExternalRemoteTerminalTarget,
): Promise<{ ok: boolean; message: string }> {
  const invocation = buildExternalRemoteTerminalInvocation(target)
  if (!invocation) return { ok: false, message: 'error.invalid-arguments' }
```

At the success return, use:

```ts
return { ok: true, message: target.worktreePath }
```

- [ ] **Step 6: Update Ghostty implementation**

In `src/system/ghostty.ts`, replace the remote-terminal import with:

```ts
import { buildExternalRemoteTerminalInvocation, type ExternalRemoteTerminalTarget } from '#/system/remote-terminal.ts'
```

Replace the remote opener signature and invocation construction with:

```ts
export async function openRemoteInGhostty(target: ExternalRemoteTerminalTarget): Promise<{ ok: boolean; message: string }> {
  const invocation = buildExternalRemoteTerminalInvocation(target)
  if (!invocation) return { ok: false, message: 'error.invalid-arguments' }
  if (!isGhosttyInstalled()) return { ok: false, message: 'error.ghostty-not-installed' }
```

Replace both success returns in `openRemoteInGhostty()` with:

```ts
return { ok: true, message: target.worktreePath }
```

- [ ] **Step 7: Update terminal backend registry**

In `src/system/terminals.ts`, add:

```ts
import type { ExternalRemoteTerminalTarget } from '#/system/remote-terminal.ts'
```

Change `TerminalBackend.openRemote` to:

```ts
  openRemote?: (target: ExternalRemoteTerminalTarget) => Promise<ExecResult>
```

Replace `openRemoteInTerminalBackend()` with:

```ts
export function openRemoteInTerminalBackend(
  backend: TerminalBackend | null,
  target: ExternalRemoteTerminalTarget,
): Promise<ExecResult> {
  if (!backend) return Promise.resolve({ ok: false, message: 'error.terminal-not-installed' })
  return backend.openRemote
    ? backend.openRemote(target)
    : Promise.resolve({ ok: false, message: 'error.remote-terminal-not-supported' })
}
```

Keep the public `openRemoteInPreferredTerminal(alias, worktreePath, pref)` signature stable, but change its body to:

```ts
export async function openRemoteInPreferredTerminal(
  alias: string,
  worktreePath: string,
  pref: TerminalPref,
): Promise<ExecResult> {
  const resolved = resolveTerminalApp(pref, await getTerminalAppAvailability())
  return await openRemoteInTerminalBackend(resolved ? backends[resolved] : null, { alias, worktreePath })
}
```

- [ ] **Step 8: Run focused external terminal tests and verify they pass**

Run:

```bash
bun run test src/system/apple-terminal.test.ts src/system/ghostty.test.ts src/system/terminals.test.ts src/server/modules/remote.test.ts
```

Expected: PASS.

## Task 5: Full Verification

**Files:**

- Validate all modified source and tests.

- [ ] **Step 1: Search for stale imports and accidental tmux routing**

Run:

```bash
rg -n "buildRemoteTerminalInvocation\\(|buildExternalRemoteTerminalInvocation|buildManagedRemoteTerminalInvocation|openRemoteInAppleTerminal\\(|openRemoteInGhostty\\(|openRemoteInTerminalBackend\\(" "src"
```

Expected:

- `buildManagedRemoteTerminalInvocation` appears in `src/system/remote-terminal.ts`, `src/system/remote-terminal.test.ts`, and `src/system/ssh/commands.ts`.
- `buildExternalRemoteTerminalInvocation` appears in `src/system/remote-terminal.ts`, `src/system/remote-terminal.test.ts`, `src/system/apple-terminal.ts`, and `src/system/ghostty.ts`.
- `buildRemoteTerminalInvocation(` appears only in `src/system/ssh/commands.ts`, `src/system/ssh/commands.test.ts`, and `src/server/terminal/terminal-catalog.ts`.

- [ ] **Step 2: Run focused tests for the feature**

Run:

```bash
bun run test src/system/remote-terminal.test.ts src/system/ssh/commands.test.ts src/system/apple-terminal.test.ts src/system/ghostty.test.ts src/system/terminals.test.ts src/server/modules/remote.test.ts src/server/terminal/terminal.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run project typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 6: Manual verification on remote hosts**

On a remote host with tmux installed:

```bash
tmux list-sessions | rg "goblin-"
```

Then in Hobgoblin:

1. Open a saved remote repository.
2. Open `terminal-1` and `terminal-2` for the same remote worktree.
3. In `terminal-1`, run `export GOBLIN_TMUX_SLOT=one`.
4. In `terminal-2`, run `export GOBLIN_TMUX_SLOT=two`.
5. Close `terminal-1`.
6. Click `+` to create the next additional terminal.
7. Run `printf '%s\n' "$GOBLIN_TMUX_SLOT"` in the reopened terminal.

Expected: the reopened terminal prints `one`, proving it reused terminal slot `1`; `terminal-2` still prints `two`.

On a remote host without tmux:

1. Open an in-app remote terminal for a worktree.
2. Run `pwd`.

Expected: the terminal opens a login shell in the selected worktree and no structured error appears solely because tmux is missing.

For external terminals:

1. Trigger the remote branch Terminal action for Terminal.app or Ghostty.
2. Run `tmux display-message -p '#S'` in that external window.

Expected: the command fails unless the user manually entered tmux; the external launcher itself did not attach to a tmux session.

# Remote Branches Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository file-area remote branches tab that lists remote-tracking refs, supports local search/manual refresh, and deletes real remote server branches after destructive confirmation.

**Architecture:** Keep remote server branch deletion separate from local branch deletion. Shared helpers parse and protect remote refs, system git/SSH layers own command construction, server repo backends dispatch local versus SSH behavior, and the web panel owns only interaction state.

**Tech Stack:** TypeScript strip-only Node, Bun, Vitest, React, Zustand store selectors, Hono routes, shadcn/Radix UI primitives, lucide-react icons.

**Project Safety Note:** This plan intentionally does not include `git commit` steps because `AGENTS.md` says not to plan or execute git commits unless the user explicitly asks.

---

## File Structure

- Create `src/shared/remote-branches.ts`: pure parsing, search, and protection helpers for `remote/branch` refs.
- Create `src/shared/remote-branches.test.ts`: unit coverage for parsing, search, invalid refs, and protected branch checks.
- Modify `src/system/git/branches.ts`: add local repository remote server branch delete primitive.
- Modify `src/system/git/branches.test.ts`: verify local git command construction and invalid input rejection.
- Modify `src/system/ssh/commands.ts`: add SSH command kind for `git push --delete`.
- Modify `src/system/ssh/commands.test.ts`: verify SSH script construction.
- Modify `src/system/ssh/git.ts`: add SSH-backed remote server branch delete helper.
- Modify `src/system/ssh/git.test.ts`: verify SSH helper calls the new command and rejects invalid/protected refs.
- Modify `src/server/modules/repo-backend.ts`: expose distinct backend method for remote server branch deletion.
- Modify `src/server/modules/repo-write-paths.ts`: add network mutation service function.
- Modify `src/server/routes/repo.ts`: add `/api/repo/delete-remote-branch`.
- Modify `src/server/modules/repo.test.ts`: cover local/SSH dispatch, network options, invalidation, and protected branch rejection.
- Modify `src/shared/rpc.ts`: add embedded server RPC handler type.
- Modify `src/shared/embedded-server-rpc-routes.ts`: map the new embedded route.
- Modify `src/web/repo-client.ts`: add client function.
- Modify `src/web/repo-client.test.ts`: verify request shape.
- Modify `src/web/stores/repos/test-utils.ts`: route test fetches for component/store tests.
- Create `src/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx`: UI panel.
- Create `src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx`: React tests for load, search, refresh, protection, confirmation, and reload.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.tsx`: add the new tab.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`: verify tab visibility and panel rendering.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, `src/shared/i18n/ko.ts`: add labels and messages.

---

### Task 1: Shared Remote Branch Helpers

**Files:**
- Create: `src/shared/remote-branches.ts`
- Create: `src/shared/remote-branches.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/shared/remote-branches.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  isProtectedRemoteBranchRef,
  parseRemoteBranchRef,
  remoteBranchRefMatchesQuery,
  remoteBranchSortKey,
} from '#/shared/remote-branches.ts'

describe('remote branch helpers', () => {
  test('parses nested remote branch refs at the first slash', () => {
    expect(parseRemoteBranchRef('origin/feature/api-client')).toEqual({
      remote: 'origin',
      branch: 'feature/api-client',
      fullRef: 'origin/feature/api-client',
    })
  })

  test('trims valid refs and rejects invalid remote tracking refs', () => {
    expect(parseRemoteBranchRef('  upstream/release/1.0  ')).toEqual({
      remote: 'upstream',
      branch: 'release/1.0',
      fullRef: 'upstream/release/1.0',
    })
    expect(parseRemoteBranchRef('origin/HEAD')).toBeNull()
    expect(parseRemoteBranchRef('origin/-bad')).toBeNull()
    expect(parseRemoteBranchRef('/feature/a')).toBeNull()
    expect(parseRemoteBranchRef('origin')).toBeNull()
  })

  test('marks protected branch names across remotes', () => {
    expect(isProtectedRemoteBranchRef('origin/main')).toBe(true)
    expect(isProtectedRemoteBranchRef('upstream/master')).toBe(true)
    expect(isProtectedRemoteBranchRef('mirror/develop')).toBe(true)
    expect(isProtectedRemoteBranchRef('origin/trunk')).toBe(true)
    expect(isProtectedRemoteBranchRef('origin/feature/main-fix')).toBe(false)
    expect(isProtectedRemoteBranchRef('origin/HEAD')).toBe(false)
  })

  test('matches search query tokens against the full ref', () => {
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', 'api')).toBe(true)
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', 'origin api')).toBe(true)
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', 'bugfix')).toBe(false)
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', '   ')).toBe(true)
  })

  test('sorts refs by remote then branch name', () => {
    expect(['upstream/main', 'origin/z', 'origin/a'].sort((a, b) => remoteBranchSortKey(a).localeCompare(remoteBranchSortKey(b)))).toEqual([
      'origin/a',
      'origin/z',
      'upstream/main',
    ])
  })
})
```

- [ ] **Step 2: Run helper tests and verify red**

Run:

```bash
bun run test src/shared/remote-branches.test.ts
```

Expected: FAIL because `src/shared/remote-branches.ts` does not exist.

- [ ] **Step 3: Add helper implementation**

Create `src/shared/remote-branches.ts`:

```ts
import { PROTECTED_BRANCHES } from '#/shared/git-types.ts'
import { isRemoteTrackingRef } from '#/shared/worktree-create.ts'

export interface RemoteBranchRefParts {
  remote: string
  branch: string
  fullRef: string
}

export function parseRemoteBranchRef(ref: string): RemoteBranchRefParts | null {
  const fullRef = ref.trim()
  if (!isRemoteTrackingRef(fullRef)) return null
  const slash = fullRef.indexOf('/')
  if (slash <= 0) return null
  return {
    remote: fullRef.slice(0, slash),
    branch: fullRef.slice(slash + 1),
    fullRef,
  }
}

export function parseRemoteBranchInput(remote: string, branch: string): RemoteBranchRefParts | null {
  const fullRef = `${remote.trim()}/${branch.trim()}`
  const parsed = parseRemoteBranchRef(fullRef)
  if (!parsed) return null
  return parsed.remote === remote.trim() && parsed.branch === branch.trim() ? parsed : null
}

export function isProtectedRemoteBranchRef(ref: string): boolean {
  const parsed = parseRemoteBranchRef(ref)
  return parsed ? PROTECTED_BRANCHES.has(parsed.branch) : false
}

export function remoteBranchRefMatchesQuery(ref: string, query: string): boolean {
  const haystack = ref.toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function remoteBranchSortKey(ref: string): string {
  const parsed = parseRemoteBranchRef(ref)
  return parsed ? `${parsed.remote}\0${parsed.branch}` : `\uffff${ref}`
}
```

- [ ] **Step 4: Run helper tests and verify green**

Run:

```bash
bun run test src/shared/remote-branches.test.ts
```

Expected: PASS.

---

### Task 2: System Git And SSH Delete Primitives

**Files:**
- Modify: `src/system/git/branches.ts`
- Modify: `src/system/git/branches.test.ts`
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`
- Modify: `src/system/ssh/git.ts`
- Modify: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Add failing local git tests**

Modify the import in `src/system/git/branches.test.ts`:

```ts
import { createBranch, createTrackingBranch, deleteRemoteServerBranch } from '#/system/git/branches.ts'
```

Append inside `describe('branch creation helpers', ...)`:

```ts
  test('deletes a remote server branch with network options', async () => {
    const signal = new AbortController().signal

    await expect(
      deleteRemoteServerBranch('/repo', 'origin', 'feature/remove-me', signal, {
        timeoutMs: 120_000,
        proxyUrl: 'http://127.0.0.1:7890',
      }),
    ).resolves.toEqual({ ok: true, message: 'ok' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repo',
      {
        timeoutMs: 120_000,
        signal,
        env: {
          HTTP_PROXY: 'http://127.0.0.1:7890',
          HTTPS_PROXY: 'http://127.0.0.1:7890',
          http_proxy: 'http://127.0.0.1:7890',
          https_proxy: 'http://127.0.0.1:7890',
        },
      },
      'push',
      '--delete',
      '--',
      'origin',
      'feature/remove-me',
    )
  })

  test('rejects invalid and protected remote server branch delete inputs before running git', async () => {
    await expect(deleteRemoteServerBranch('/repo', 'origin', 'main')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(deleteRemoteServerBranch('/repo', 'bad/remote', 'feature/a')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run local git tests and verify red**

Run:

```bash
bun run test src/system/git/branches.test.ts
```

Expected: FAIL because `deleteRemoteServerBranch` is not exported.

- [ ] **Step 3: Implement local git primitive**

Modify imports in `src/system/git/branches.ts`:

```ts
import {
  git,
  gitNetworkOptions,
  gitResultWithOptions,
  NETWORK_TIMEOUT_MS,
  type GitNetworkOptions,
} from '#/system/git/helper.ts'
import { isProtectedRemoteBranchRef, parseRemoteBranchInput } from '#/shared/remote-branches.ts'
```

Add below `deleteUpstreamBranch`:

```ts
export async function deleteRemoteServerBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
  const parsed = parseRemoteBranchInput(remote, branch)
  if (!parsed || isProtectedRemoteBranchRef(parsed.fullRef)) return { ok: false, message: 'error.invalid-arguments' }
  return gitResultWithOptions(
    cwd,
    gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal),
    'push',
    '--delete',
    '--',
    parsed.remote,
    parsed.branch,
  )
}
```

- [ ] **Step 4: Run local git tests and verify green**

Run:

```bash
bun run test src/system/git/branches.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing SSH command test**

Append inside `describe('remote command scripts', ...)` in `src/system/ssh/commands.test.ts`:

```ts
  test('renders remote server branch delete command', () => {
    const invocation = buildRemoteCommandInvocation(TARGET, {
      type: 'gitRemoteBranchDelete',
      path: '/srv/repo',
      remote: 'origin',
      branch: 'feature/remove-me',
    })

    expect(invocation.script).toContain("git -C '/srv/repo' push --delete -- origin feature/remove-me")
    expect(invocation.args).toContain(TARGET.alias)
  })
```

- [ ] **Step 6: Run SSH command tests and verify red**

Run:

```bash
bun run test src/system/ssh/commands.test.ts -- -t "remote server branch delete"
```

Expected: FAIL because `gitRemoteBranchDelete` is not in `RemoteCommandKind`.

- [ ] **Step 7: Add SSH command kind and script**

In `src/system/ssh/commands.ts`, add to `RemoteCommandKind` near other git branch commands:

```ts
  | { type: 'gitRemoteBranchDelete'; path: string; remote: string; branch: string }
```

Add a `scriptForCommand` case near `gitRemoteBranches`:

```ts
    case 'gitRemoteBranchDelete':
      return `git -C ${shellQuote(command.path)} push --delete -- ${shellQuote(command.remote)} ${shellQuote(command.branch)}`
```

- [ ] **Step 8: Run SSH command tests and verify green**

Run:

```bash
bun run test src/system/ssh/commands.test.ts -- -t "remote server branch delete"
```

Expected: PASS.

- [ ] **Step 9: Add failing SSH git helper tests**

Modify the import in `src/system/ssh/git.test.ts` to include:

```ts
  deleteRemoteServerBranch,
```

Append near the existing `deleteRemoteBranch` tests:

```ts
  test('deleteRemoteServerBranch runs remote push delete for valid non-protected refs', async () => {
    const run = vi.fn(async () => okRemoteResult('deleted'))

    await expect(
      deleteRemoteServerBranch(TARGET, { remote: 'origin', branch: 'feature/remove-me', run: run as any }),
    ).resolves.toEqual({ ok: true, message: 'deleted' })

    expect(run).toHaveBeenCalledWith(
      { type: 'gitRemoteBranchDelete', path: '/srv/repo', remote: 'origin', branch: 'feature/remove-me' },
      TARGET,
      { signal: undefined, timeoutMs: 90_000 },
    )
  })

  test('deleteRemoteServerBranch rejects invalid and protected refs before SSH execution', async () => {
    const run = vi.fn(async () => okRemoteResult('deleted'))

    await expect(
      deleteRemoteServerBranch(TARGET, { remote: 'origin', branch: 'main', run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      deleteRemoteServerBranch(TARGET, { remote: 'bad/remote', branch: 'feature/a', run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(run).not.toHaveBeenCalled()
  })
```

- [ ] **Step 10: Run SSH git tests and verify red**

Run:

```bash
bun run test src/system/ssh/git.test.ts -- -t "deleteRemoteServerBranch"
```

Expected: FAIL because the SSH helper is not exported.

- [ ] **Step 11: Implement SSH git helper**

In `src/system/ssh/git.ts`, import helpers:

```ts
import { isProtectedRemoteBranchRef, parseRemoteBranchInput } from '#/shared/remote-branches.ts'
```

Add near `deleteRemoteBranch`:

```ts
export async function deleteRemoteServerBranch(
  target: RemoteRepoTarget,
  input: { remote: string; branch: string; signal?: AbortSignal; run?: RemoteGitRunner },
): Promise<ExecResult> {
  const parsed = parseRemoteBranchInput(input.remote, input.branch)
  if (!parsed || isProtectedRemoteBranchRef(parsed.fullRef)) return { ok: false, message: 'error.invalid-arguments' }
  const run: RemoteGitRunner = input.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const result = await run(
    { type: 'gitRemoteBranchDelete', path: target.remotePath, remote: parsed.remote, branch: parsed.branch },
    target,
    { signal: input.signal, timeoutMs: REMOTE_BRANCH_OP_TIMEOUT_MS },
  )
  return remoteExecResult(result)
}
```

- [ ] **Step 12: Run system primitive tests**

Run:

```bash
bun run test src/shared/remote-branches.test.ts src/system/git/branches.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: PASS.

---

### Task 3: Server, Backend, RPC, And Web Client

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/modules/repo.test.ts`
- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/embedded-server-rpc-routes.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`
- Modify: `src/web/stores/repos/test-utils.ts`

- [ ] **Step 1: Add failing web client test**

Append to `describe('repo-client', ...)` in `src/web/repo-client.test.ts`:

```ts
  test('deletes remote server branch through the embedded server', async () => {
    installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, message: 'deleted' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { deleteRepositoryRemoteBranch } = await import('#/web/repo-client.ts')
    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32100/api/repo/delete-remote-branch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
        body: JSON.stringify({ cwd: '/tmp/repo', remote: 'origin', branch: 'feature/remove-me' }),
      }),
    )
  })
```

- [ ] **Step 2: Run web client test and verify red**

Run:

```bash
bun run test src/web/repo-client.test.ts -- -t "deletes remote server branch"
```

Expected: FAIL because `deleteRepositoryRemoteBranch` does not exist.

- [ ] **Step 3: Add client function**

In `src/web/repo-client.ts`, add near `deleteRepositoryBranch`:

```ts
export async function deleteRepositoryRemoteBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/delete-remote-branch', { cwd, remote, branch, sourceToken }, { signal })
}
```

- [ ] **Step 4: Add embedded RPC route and type**

In `src/shared/embedded-server-rpc-routes.ts`, add next to `repo.deleteBranch`:

```ts
  'repo.deleteRemoteBranch': { route: '/api/repo/delete-remote-branch', method: 'POST' },
```

In `src/shared/rpc.ts`, add next to `deleteBranch`:

```ts
    deleteRemoteBranch: (input: {
      cwd: string
      remote: string
      branch: string
    }) => Promise<ExecResult>
```

In `src/web/stores/repos/test-utils.ts`, add a fetch router case:

```ts
        if (url.pathname === '/api/repo/delete-remote-branch') return call('repo.deleteRemoteBranch', body)
```

- [ ] **Step 5: Run web client test and verify green**

Run:

```bash
bun run test src/web/repo-client.test.ts -- -t "deletes remote server branch"
```

Expected: PASS.

- [ ] **Step 6: Add failing server tests**

In `src/server/modules/repo.test.ts`, add hoisted mocks:

```ts
  deleteLocalRemoteServerBranch: vi.fn(),
  deleteSshRemoteServerBranch: vi.fn(),
```

Wire them in the existing `vi.mock` blocks:

```ts
deleteRemoteServerBranch: mocks.deleteLocalRemoteServerBranch,
```

for `#/system/git/branches.ts`, and:

```ts
deleteRemoteServerBranch: mocks.deleteSshRemoteServerBranch,
```

for `#/system/ssh/git.ts`.

Add defaults in `beforeEach`:

```ts
  mocks.deleteLocalRemoteServerBranch.mockResolvedValue({ ok: true, message: 'deleted local remote' })
  mocks.deleteSshRemoteServerBranch.mockResolvedValue({ ok: true, message: 'deleted ssh remote' })
```

Append tests near the existing network settings tests:

```ts
  test('deleteRepositoryRemoteBranch passes configured network options to local push delete', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted local remote',
    })

    expect(mocks.deleteLocalRemoteServerBranch).toHaveBeenCalledWith(
      '/tmp/repo',
      'origin',
      'feature/remove-me',
      expect.any(AbortSignal),
      { timeoutMs: 240_000, proxyUrl: 'socks5://127.0.0.1:7890' },
    )
  })

  test('deleteRepositoryRemoteBranch dispatches SSH repos without local network options', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('ssh-config://prod/srv/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted ssh remote',
    })

    expect(mocks.deleteSshRemoteServerBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      { remote: 'origin', branch: 'feature/remove-me', signal: expect.any(AbortSignal) },
    )
  })

  test('deleteRepositoryRemoteBranch publishes snapshot invalidation after success', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'feature/remove-me')).resolves.toEqual({
      ok: true,
      message: 'deleted local remote',
    })

    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryRemoteBranch rejects protected refs before backend dispatch', async () => {
    const { deleteRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    await expect(deleteRepositoryRemoteBranch('/tmp/repo', 'origin', 'main')).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(mocks.deleteLocalRemoteServerBranch).not.toHaveBeenCalled()
    expect(mocks.deleteSshRemoteServerBranch).not.toHaveBeenCalled()
  })
```

- [ ] **Step 7: Run server tests and verify red**

Run:

```bash
bun run test src/server/modules/repo.test.ts -- -t "deleteRepositoryRemoteBranch"
```

Expected: FAIL because the server function and backend method do not exist.

- [ ] **Step 8: Extend repo backend**

In `src/server/modules/repo-backend.ts`, import local and SSH helpers:

```ts
  deleteRemoteServerBranch as deleteLocalRemoteServerBranch,
```

from `#/system/git/branches.ts`, and:

```ts
  deleteRemoteServerBranch as deleteSshRemoteServerBranch,
```

from `#/system/ssh/git.ts`.

Add to `RepoBackend`:

```ts
  deleteRemoteServerBranch(
    remote: string,
    branch: string,
    signal?: AbortSignal,
    networkOptions?: GitNetworkOptions,
  ): Promise<ExecResult>
```

Add to the local backend object:

```ts
    async deleteRemoteServerBranch(remote, branch, signal, networkOptions) {
      return await deleteLocalRemoteServerBranch(repoId, remote, branch, signal, networkOptions)
    },
```

Add to the SSH backend object:

```ts
    async deleteRemoteServerBranch(remote, branch, signal) {
      return await deleteSshRemoteServerBranch(target, { remote, branch, signal })
    },
```

- [ ] **Step 9: Add server write path function**

In `src/server/modules/repo-write-paths.ts`, import helper:

```ts
import { isProtectedRemoteBranchRef, parseRemoteBranchInput } from '#/shared/remote-branches.ts'
```

Add near `deleteRepositoryBranch`:

```ts
export async function deleteRepositoryRemoteBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const parsed = parseRemoteBranchInput(remote, branch)
  if (!parsed || isProtectedRemoteBranchRef(parsed.fullRef)) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.deleteRemoteServerBranch(parsed.remote, parsed.branch, mergedSignal, networkOptions),
      sourceToken,
    )
  })
}
```

- [ ] **Step 10: Add Hono route**

In `src/server/routes/repo.ts`, add `deleteRepositoryRemoteBranch` to the import list from `repo-write-paths.ts`.

Add route near `/delete-branch`:

```ts
  app.post('/delete-remote-branch', async (c) => {
    const body = await c.req.json().catch(() => null)
    const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
    const remote = typeof body?.remote === 'string' ? body.remote : ''
    const branch = typeof body?.branch === 'string' ? body.branch : ''
    const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
    return c.json(
      await jsonOr(
        () => deleteRepositoryRemoteBranch(cwd, remote, branch, c.req.raw.signal, sourceToken),
        { ok: false, message: 'error.failed-read-repo' },
        'delete-remote-branch',
      ),
    )
  })
```

- [ ] **Step 11: Run server and client tests**

Run:

```bash
bun run test src/server/modules/repo.test.ts src/web/repo-client.test.ts
```

Expected: PASS.

---

### Task 4: Remote Branches Panel

**Files:**
- Create: `src/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx`
- Create: `src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx`

- [ ] **Step 1: Write failing panel tests**

Create `src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'

const mocks = vi.hoisted(() => ({
  getRepositoryRemoteBranches: vi.fn(),
  fetchRepository: vi.fn(),
  deleteRepositoryRemoteBranch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
  fetchRepository: mocks.fetchRepository,
  deleteRepositoryRemoteBranch: mocks.deleteRepositoryRemoteBranch,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

beforeEach(() => {
  mocks.getRepositoryRemoteBranches.mockReset()
  mocks.fetchRepository.mockReset()
  mocks.deleteRepositoryRemoteBranch.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
  mocks.getRepositoryRemoteBranches.mockResolvedValue(['origin/main', 'origin/feature/a', 'upstream/bugfix/login'])
  mocks.fetchRepository.mockResolvedValue({ ok: true, message: 'fetched' })
  mocks.deleteRepositoryRemoteBranch.mockResolvedValue({ ok: true, message: 'deleted' })
  document.body.innerHTML = ''
})

async function renderPanel(repoId = '/repo') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ProjectRemoteBranchesPanel repoId={repoId} />)
  })
  await act(async () => {})
  return { container, root }
}

describe('ProjectRemoteBranchesPanel', () => {
  test('loads and filters remote branches', async () => {
    const { container, root } = await renderPanel()

    expect(container.textContent).toContain('origin/main')
    expect(container.textContent).toContain('origin/feature/a')
    expect(container.textContent).toContain('upstream/bugfix/login')

    const input = container.querySelector<HTMLInputElement>('input[aria-label="remote-branches.search-label"]')!
    await act(async () => {
      input.value = 'bugfix'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('origin/feature/a')
    expect(container.textContent).toContain('upstream/bugfix/login')
    await act(async () => root.unmount())
  })

  test('refreshes through fetch then reloads refs', async () => {
    mocks.getRepositoryRemoteBranches
      .mockResolvedValueOnce(['origin/feature/a'])
      .mockResolvedValueOnce(['origin/feature/a', 'origin/feature/b'])
    const { container, root } = await renderPanel()

    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="remote-branches-refresh"]')!
    await act(async () => {
      refresh.click()
    })

    expect(mocks.fetchRepository).toHaveBeenCalledWith('/repo', 'user')
    expect(container.textContent).toContain('origin/feature/b')
    await act(async () => root.unmount())
  })

  test('disables protected branch deletion', async () => {
    const { container, root } = await renderPanel()

    const protectedButton = container.querySelector<HTMLButtonElement>('[data-testid="remote-branch-delete-origin-main"]')!
    expect(protectedButton.disabled).toBe(true)
    await act(async () => root.unmount())
  })

  test('confirms delete, calls API with parsed remote and branch, then reloads', async () => {
    mocks.getRepositoryRemoteBranches
      .mockResolvedValueOnce(['origin/feature/a'])
      .mockResolvedValueOnce([])
    const { container, root } = await renderPanel()

    const deleteButton = container.querySelector<HTMLButtonElement>('[data-testid="remote-branch-delete-origin-feature-a"]')!
    await act(async () => {
      deleteButton.click()
    })
    expect(container.textContent).toContain('remote-branches.confirm-title')
    expect(container.textContent).toContain('origin/feature/a')

    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'remote-branches.confirm-delete',
    )!
    await act(async () => {
      confirm.click()
    })

    expect(mocks.deleteRepositoryRemoteBranch).toHaveBeenCalledWith('/repo', 'origin', 'feature/a')
    expect(mocks.getRepositoryRemoteBranches).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })
})
```

- [ ] **Step 2: Run panel tests and verify red**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx
```

Expected: FAIL because `ProjectRemoteBranchesPanel.tsx` does not exist.

- [ ] **Step 3: Implement panel**

Create `src/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#/web/components/ui/tooltip.tsx'
import { cn } from '#/web/lib/cn.ts'
import { deleteRepositoryRemoteBranch, fetchRepository, getRepositoryRemoteBranches } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'
import {
  isProtectedRemoteBranchRef,
  parseRemoteBranchRef,
  remoteBranchRefMatchesQuery,
  remoteBranchSortKey,
  type RemoteBranchRefParts,
} from '#/shared/remote-branches.ts'

interface ProjectRemoteBranchesPanelProps {
  repoId: string
}

function refTestId(ref: string): string {
  return ref.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function RemoteBranchConfirmBody({ branch }: { branch: RemoteBranchRefParts }) {
  const t = useT()
  return (
    <div className="space-y-3">
      <span className="block">{t('remote-branches.confirm-body')}</span>
      <dl className="space-y-1 text-xs">
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{t('remote-branches.remote')}</dt>
          <dd className="break-all font-mono text-foreground">{branch.remote}</dd>
        </div>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{t('remote-branches.branch')}</dt>
          <dd className="break-all font-mono text-foreground">{branch.branch}</dd>
        </div>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">{t('remote-branches.full-ref')}</dt>
          <dd className="break-all font-mono text-foreground">{branch.fullRef}</dd>
        </div>
      </dl>
    </div>
  )
}

export function ProjectRemoteBranchesPanel({ repoId }: ProjectRemoteBranchesPanelProps) {
  const t = useT()
  const [refs, setRefs] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RemoteBranchRefParts | null>(null)

  async function loadBranches(signal?: AbortSignal) {
    setLoading(true)
    setError(null)
    try {
      const nextRefs = await getRepositoryRemoteBranches(repoId, signal)
      if (signal?.aborted) return
      setRefs(nextRefs.filter((ref) => parseRemoteBranchRef(ref)).sort((a, b) => remoteBranchSortKey(a).localeCompare(remoteBranchSortKey(b))))
    } catch (err) {
      if (signal?.aborted) return
      setRefs([])
      setError(err instanceof Error ? err.message : 'remote-branches.load-error')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const ctrl = new AbortController()
    void loadBranches(ctrl.signal)
    return () => ctrl.abort()
  }, [repoId])

  const visibleRefs = useMemo(
    () => refs.filter((ref) => remoteBranchRefMatchesQuery(ref, query)),
    [query, refs],
  )

  async function refresh() {
    const result = await fetchRepository(repoId, 'user')
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    await loadBranches()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    const result = await deleteRepositoryRemoteBranch(repoId, target.remote, target.branch)
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    setDeleteTarget(null)
    toast.success(t('remote-branches.delete-success'))
    await loadBranches()
  }

  const emptyTitle = error
    ? t('remote-branches.load-error')
    : query.trim()
      ? t('remote-branches.filter-empty')
      : t('remote-branches.empty')

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-pane">
      <div className="flex min-h-9 items-center gap-2 border-t border-separator/70 px-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label={t('remote-branches.search-label')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('remote-branches.search-placeholder')}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <AsyncButton
          data-testid="remote-branches-refresh"
          type="button"
          size="icon"
          variant="ghost"
          loading={loading}
          aria-label={t('remote-branches.refresh')}
          title={t('remote-branches.refresh')}
          onClick={refresh}
        >
          {({ busy }) => (
            busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />
          )}
        </AsyncButton>
      </div>
      <ScrollPane>
        {loading && refs.length === 0 ? (
          <EmptyState title={t('common.loading')} />
        ) : visibleRefs.length === 0 ? (
          <EmptyState title={emptyTitle} body={error ? t(error) : undefined} />
        ) : (
          <TooltipProvider>
            <ul className="py-1">
              {visibleRefs.map((ref) => {
                const parsed = parseRemoteBranchRef(ref)
                if (!parsed) return null
                const protectedBranch = isProtectedRemoteBranchRef(ref)
                const deleteButton = (
                  <Button
                    data-testid={`remote-branch-delete-${refTestId(ref)}`}
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={protectedBranch}
                    aria-label={t('remote-branches.delete')}
                    className={cn('size-7 shrink-0', protectedBranch ? 'text-muted-foreground' : 'text-danger hover:text-danger')}
                    onClick={() => setDeleteTarget(parsed)}
                  >
                    {protectedBranch ? <ShieldAlert className="size-3.5" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
                  </Button>
                )
                return (
                  <li key={ref} className="flex min-h-8 items-center gap-2 px-2 text-sm hover:bg-list-row-hover">
                    <span className="min-w-0 flex-1 truncate font-mono" title={ref}>{ref}</span>
                    {protectedBranch ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{deleteButton}</TooltipTrigger>
                        <TooltipContent>{t('remote-branches.protected-delete-disabled')}</TooltipContent>
                      </Tooltip>
                    ) : (
                      deleteButton
                    )}
                  </li>
                )
              })}
            </ul>
          </TooltipProvider>
        )}
      </ScrollPane>
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? t('remote-branches.confirm-title') : ''}
        message={deleteTarget ? <RemoteBranchConfirmBody branch={deleteTarget} /> : ''}
        confirmLabel={t('remote-branches.confirm-delete')}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
```

- [ ] **Step 4: Run panel tests and verify green**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx
```

Expected: PASS.

---

### Task 5: Explorer Tab And Localization

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add failing explorer pane test coverage**

In `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`, add mock:

```tsx
vi.mock('#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx', () => ({
  ProjectRemoteBranchesPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="project-remote-branches-panel" data-repo-id={repoId} />
  ),
}))
```

Append inside `describe('RepoExplorerPane', ...)`:

```tsx
  test('renders remote branches tab for git repositories', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: true,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const remoteTab = tabs.find((tab) => tab.textContent?.includes('tab.remote-branches'))
    expect(remoteTab).toBeTruthy()

    await act(async () => {
      remoteTab?.click()
    })

    expect(container.querySelector('[data-testid="project-remote-branches-panel"]')?.getAttribute('data-repo-id')).toBe(REPO_ID)
    await act(async () => root.unmount())
  })
```

- [ ] **Step 2: Run explorer test and verify red**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx -- -t "remote branches tab"
```

Expected: FAIL because the tab is not rendered.

- [ ] **Step 3: Integrate tab**

In `src/web/components/repo-workspace/RepoExplorerPane.tsx`, add import:

```ts
import { GitFork } from 'lucide-react'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'
```

If `lucide-react` imports are grouped, merge `GitFork` into the existing import list instead of adding a second import.

Update the tab type:

```ts
type ExplorerTab = 'files' | 'changes' | 'status' | 'history' | 'remoteBranches' | 'ports'
```

Add tab item before `ports`:

```ts
    { id: 'remoteBranches' as const, label: t('tab.remote-branches'), icon: GitFork },
```

Add panel branch before `ports`:

```tsx
        ) : activeVisibleTab === 'remoteBranches' ? (
          <ProjectRemoteBranchesPanel repoId={repoId} />
```

- [ ] **Step 4: Add localization keys**

Add these keys to `src/shared/i18n/en.ts`:

```ts
  'tab.remote-branches': 'Remote branches',
  'remote-branches.search-label': 'Search remote branches',
  'remote-branches.search-placeholder': 'Search remote branches',
  'remote-branches.refresh': 'Refresh remote branches',
  'remote-branches.empty': 'No remote branches',
  'remote-branches.filter-empty': 'No matching remote branches',
  'remote-branches.load-error': 'Could not load remote branches',
  'remote-branches.delete': 'Delete remote branch',
  'remote-branches.protected-delete-disabled': 'Protected branches cannot be deleted here.',
  'remote-branches.confirm-title': 'Delete remote branch?',
  'remote-branches.confirm-body': 'This deletes the branch from the remote server. It does not only remove a local tracking ref.',
  'remote-branches.remote': 'Remote',
  'remote-branches.branch': 'Branch',
  'remote-branches.full-ref': 'Full ref',
  'remote-branches.confirm-delete': 'Delete remote branch',
  'remote-branches.delete-success': 'Remote branch deleted',
```

Add these keys to `src/shared/i18n/zh.ts`:

```ts
  'tab.remote-branches': '远程分支',
  'remote-branches.search-label': '搜索远程分支',
  'remote-branches.search-placeholder': '搜索远程分支',
  'remote-branches.refresh': '刷新远程分支',
  'remote-branches.empty': '没有远程分支',
  'remote-branches.filter-empty': '没有匹配的远程分支',
  'remote-branches.load-error': '无法加载远程分支',
  'remote-branches.delete': '删除远程分支',
  'remote-branches.protected-delete-disabled': '受保护分支不能在这里删除。',
  'remote-branches.confirm-title': '删除远程分支？',
  'remote-branches.confirm-body': '这会删除远程服务器上的分支，不只是移除本地跟踪引用。',
  'remote-branches.remote': '远程',
  'remote-branches.branch': '分支',
  'remote-branches.full-ref': '完整引用',
  'remote-branches.confirm-delete': '删除远程分支',
  'remote-branches.delete-success': '远程分支已删除',
```

Add these keys to `src/shared/i18n/ja.ts`:

```ts
  'tab.remote-branches': 'リモートブランチ',
  'remote-branches.search-label': 'リモートブランチを検索',
  'remote-branches.search-placeholder': 'リモートブランチを検索',
  'remote-branches.refresh': 'リモートブランチを更新',
  'remote-branches.empty': 'リモートブランチがありません',
  'remote-branches.filter-empty': '一致するリモートブランチがありません',
  'remote-branches.load-error': 'リモートブランチを読み込めませんでした',
  'remote-branches.delete': 'リモートブランチを削除',
  'remote-branches.protected-delete-disabled': '保護されたブランチはここでは削除できません。',
  'remote-branches.confirm-title': 'リモートブランチを削除しますか？',
  'remote-branches.confirm-body': 'これはリモートサーバー上のブランチを削除します。ローカルの追跡参照だけを削除する操作ではありません。',
  'remote-branches.remote': 'リモート',
  'remote-branches.branch': 'ブランチ',
  'remote-branches.full-ref': '完全な参照',
  'remote-branches.confirm-delete': 'リモートブランチを削除',
  'remote-branches.delete-success': 'リモートブランチを削除しました',
```

Add these keys to `src/shared/i18n/ko.ts`:

```ts
  'tab.remote-branches': '원격 브랜치',
  'remote-branches.search-label': '원격 브랜치 검색',
  'remote-branches.search-placeholder': '원격 브랜치 검색',
  'remote-branches.refresh': '원격 브랜치 새로고침',
  'remote-branches.empty': '원격 브랜치가 없습니다',
  'remote-branches.filter-empty': '일치하는 원격 브랜치가 없습니다',
  'remote-branches.load-error': '원격 브랜치를 불러올 수 없습니다',
  'remote-branches.delete': '원격 브랜치 삭제',
  'remote-branches.protected-delete-disabled': '보호된 브랜치는 여기에서 삭제할 수 없습니다.',
  'remote-branches.confirm-title': '원격 브랜치를 삭제할까요?',
  'remote-branches.confirm-body': '이 작업은 원격 서버의 브랜치를 삭제합니다. 로컬 추적 참조만 제거하는 작업이 아닙니다.',
  'remote-branches.remote': '원격',
  'remote-branches.branch': '브랜치',
  'remote-branches.full-ref': '전체 참조',
  'remote-branches.confirm-delete': '원격 브랜치 삭제',
  'remote-branches.delete-success': '원격 브랜치를 삭제했습니다',
```

- [ ] **Step 5: Run explorer and dictionary tests**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/shared/i18n/dictionaries.test.ts
```

Expected: PASS.

---

### Task 6: Full Verification

**Files:**
- Verify all files touched by Tasks 1-5.

- [ ] **Step 1: Run focused remote branch tests**

Run:

```bash
bun run test src/shared/remote-branches.test.ts src/system/git/branches.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts src/web/repo-client.test.ts src/web/components/repo-workspace/ProjectRemoteBranchesPanel.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

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

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- src/shared/remote-branches.ts src/system/git/branches.ts src/system/ssh/commands.ts src/system/ssh/git.ts src/server/modules/repo-backend.ts src/server/modules/repo-write-paths.ts src/server/routes/repo.ts src/shared/rpc.ts src/shared/embedded-server-rpc-routes.ts src/web/repo-client.ts src/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx src/web/components/repo-workspace/RepoExplorerPane.tsx src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
```

Expected: diff contains only the remote branches tab feature and its tests.

---

## Self-Review

Spec coverage:

- Remote branches tab: Task 5.
- List/search/manual refresh: Task 4.
- Delete real remote server branch: Tasks 2 and 3.
- Second confirmation: Task 4.
- Protected `main`, `master`, `develop`, `trunk`: Tasks 1, 2, 3, and 4.
- Local and SSH repositories: Tasks 2 and 3.
- No batch delete, no auto-fetch-on-open, no local tracking ref delete: preserved by component/API scope.

Placeholder scan:

- No placeholder markers, incomplete sections, or deferred implementation steps are present.

Type consistency:

- Shared helper name: `parseRemoteBranchInput`.
- System/backend method name: `deleteRemoteServerBranch`.
- Web API function name: `deleteRepositoryRemoteBranch`.
- HTTP route: `/api/repo/delete-remote-branch`.
- Embedded RPC key: `repo.deleteRemoteBranch`.

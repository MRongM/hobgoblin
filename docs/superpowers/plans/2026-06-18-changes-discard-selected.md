# Changes Discard Selected Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add path-scoped discard in the `Changes` tab for selected files/folders across local and SSH remote repositories.

**Architecture:** Keep renderer interaction state local to `ProjectChangesPanel`. Route all mutations through the existing repo write path: web client -> repo route -> `repo-write-paths` -> `RepoBackend` -> local Git or SSH Git command. Publish repo snapshot invalidation after any Git-attempted discard result because `git restore` and `git clean` are not transactional.

**Tech Stack:** Bun, TypeScript strip-only mode, React, Zustand, shadcn/Radix primitives, Hono server routes, execa-backed local Git, SSH command builder, Vitest.

---

## File Structure

- Modify `src/system/git/reset.ts`: add local path-scoped discard helper.
- Modify `src/system/git/reset.test.ts`: cover restore/clean command ordering and failure behavior.
- Modify `src/system/ssh/commands.ts`: add remote command type and shell-quoted script for path-scoped discard.
- Modify `src/system/ssh/commands.test.ts`: cover quoting and `--` pathspec separation.
- Modify `src/system/ssh/git.ts`: add `discardRemoteChangesForPaths`.
- Modify `src/system/ssh/git.test.ts`: cover known worktree dispatch and invalid remote worktree path.
- Modify `src/server/modules/repo-backend.ts`: add `RepoBackend.discardChanges` for local and remote backends.
- Modify `src/server/modules/repo-write-paths.ts`: add `discardRepositoryChanges`, path validation, and invalidation-after-Git-attempt semantics.
- Modify `src/server/modules/repo.test.ts`: cover local/remote dispatch and invalidation behavior.
- Modify `src/server/routes/repo.ts`: add `POST /discard-changes`.
- Modify `src/server/routes/repo.test.ts`: cover body parsing.
- Modify `src/web/repo-client.ts`: add `discardRepositoryChanges`.
- Modify `src/web/repo-client.test.ts`: cover request body.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ko.ts`, `src/shared/i18n/ja.ts`: add discard-selected copy.
- Modify `src/web/components/FilePathTreeList.tsx`: support directory row rendering override.
- Modify `src/web/components/StatusList.tsx`: support selectable changed paths in tree/list views.
- Modify `src/web/components/repo-workspace/ProjectChangesPanel.tsx`: own selection, confirmation, mutation call, and toolbar controls.
- Modify `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`: cover selection, folder selection, confirmation, success/failure, and path reveal preservation.

Do not run `git commit` unless the user explicitly asks. The plan uses verification checkpoints instead.

---

### Task 1: Local Git Path-Scoped Discard

**Files:**
- Modify: `src/system/git/reset.ts`
- Test: `src/system/git/reset.test.ts`

- [ ] **Step 1: Write failing tests for local discard command order**

Add these tests inside `describe('resetHardToCurrentHead', ...)` or split to a new `describe('discardChangesForPaths', ...)` in `src/system/git/reset.test.ts`.

```ts
import { discardChangesForPaths, resetHardToCurrentHead } from '#/system/git/reset.ts'

test('discardChangesForPaths restores tracked changes then cleans untracked paths', async () => {
  const signal = new AbortController().signal
  gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: '' })

  const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts', 'docs'], signal)

  expect(result).toEqual({ ok: true, message: '' })
  expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
    1,
    '/repo/worktree',
    { signal },
    'restore',
    '--staged',
    '--worktree',
    '--source=HEAD',
    '--',
    'src/app.ts',
    'docs',
  )
  expect(gitResultWithOptionsMock).toHaveBeenNthCalledWith(
    2,
    '/repo/worktree',
    { signal },
    'clean',
    '-fd',
    '--',
    'src/app.ts',
    'docs',
  )
})

test('discardChangesForPaths does not clean when restore fails', async () => {
  gitResultWithOptionsMock.mockResolvedValueOnce({ ok: false, message: 'fatal: bad pathspec' })

  const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts'])

  expect(result).toEqual({ ok: false, message: 'fatal: bad pathspec' })
  expect(gitResultWithOptionsMock).toHaveBeenCalledTimes(1)
})

test('discardChangesForPaths returns clean failure after restore succeeds', async () => {
  gitResultWithOptionsMock
    .mockResolvedValueOnce({ ok: true, message: '' })
    .mockResolvedValueOnce({ ok: false, message: 'fatal: clean failed' })

  const result = await discardChangesForPaths('/repo/worktree', ['src/app.ts'])

  expect(result).toEqual({ ok: false, message: 'fatal: clean failed' })
  expect(gitResultWithOptionsMock).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
bun run test src/system/git/reset.test.ts
```

Expected: FAIL because `discardChangesForPaths` is not exported.

- [ ] **Step 3: Implement local discard helper**

In `src/system/git/reset.ts`, keep `resetHardToCurrentHead` and add:

```ts
export async function discardChangesForPaths(
  cwd: string,
  paths: string[],
  signal?: AbortSignal,
): Promise<ExecResult> {
  const restore = await gitResultWithOptions(
    cwd,
    { signal },
    'restore',
    '--staged',
    '--worktree',
    '--source=HEAD',
    '--',
    ...paths,
  )
  if (!restore.ok) return restore
  return await gitResultWithOptions(cwd, { signal }, 'clean', '-fd', '--', ...paths)
}
```

- [ ] **Step 4: Verify local Git tests pass**

Run:

```bash
bun run test src/system/git/reset.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Review `src/system/git/reset.ts` for TypeScript strip-only compatibility: no enums, no namespaces, no parameter properties.

---

### Task 2: SSH Remote Command And Wrapper

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/git.ts`
- Test: `src/system/ssh/commands.test.ts`
- Test: `src/system/ssh/git.test.ts`

- [ ] **Step 1: Write failing command-builder test**

Add to `src/system/ssh/commands.test.ts` near the reset-hard test:

```ts
test('renders quoted remote discard selected changes command', () => {
  const invocation = buildRemoteCommandInvocation(TARGET, {
    type: 'gitDiscardChanges',
    path: "/srv/repo-feature/user's-work",
    paths: ['src/app.ts', "docs/user's guide"],
  })

  expect(invocation.script).toBe(
    "git -C '/srv/repo-feature/user'\\''s-work' restore --staged --worktree --source=HEAD -- 'src/app.ts' 'docs/user'\\''s guide' && " +
      "git -C '/srv/repo-feature/user'\\''s-work' clean -fd -- 'src/app.ts' 'docs/user'\\''s guide'",
  )
})
```

- [ ] **Step 2: Write failing remote wrapper tests**

Add imports and tests in `src/system/ssh/git.test.ts`.

Update the import list:

```ts
import {
  commitRemoteChanges,
  discardRemoteChangesForPaths,
  resetRemoteHard,
  remoteExecResult,
} from '#/system/ssh/git.ts'
```

Add tests near `resetRemoteHard`:

```ts
test('discardRemoteChangesForPaths discards paths inside a known remote worktree', async () => {
  const run = vi.fn(async (command: { type: string }) => {
    switch (command.type) {
      case 'gitWorktreeList':
        return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
      case 'gitDiscardChanges':
        return okRemoteResult('')
      default:
        return okRemoteResult('')
    }
  })

  const result = await discardRemoteChangesForPaths(TARGET, '/srv/repo', ['src/app.ts', 'docs'], { run: run as any })

  expect(result).toEqual({ ok: true, message: 'ok' })
  expect(run).toHaveBeenCalledWith(
    { type: 'gitDiscardChanges', path: '/srv/repo', paths: ['src/app.ts', 'docs'] },
    TARGET,
    { signal: undefined, timeoutMs: 180_000 },
  )
})

test('discardRemoteChangesForPaths rejects relative worktree paths before running remote commands', async () => {
  const run = vi.fn()

  const result = await discardRemoteChangesForPaths(TARGET, 'relative/repo', ['src/app.ts'], { run: run as any })

  expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
  expect(run).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run focused failing SSH tests**

Run:

```bash
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: FAIL because `gitDiscardChanges` and `discardRemoteChangesForPaths` do not exist.

- [ ] **Step 4: Add remote command type and script**

In `src/system/ssh/commands.ts`, add to `RemoteCommandKind`:

```ts
  | { type: 'gitDiscardChanges'; path: string; paths: string[] }
```

In `scriptForCommand`, add near `gitResetHard`:

```ts
    case 'gitDiscardChanges': {
      const pathspecs = command.paths.map((item) => shellQuote(item)).join(' ')
      return [
        `git -C ${shellQuote(command.path)} restore --staged --worktree --source=HEAD -- ${pathspecs}`,
        `git -C ${shellQuote(command.path)} clean -fd -- ${pathspecs}`,
      ].join(' && ')
    }
```

- [ ] **Step 5: Add remote wrapper**

In `src/system/ssh/git.ts`, add near `resetRemoteHard`:

```ts
export async function discardRemoteChangesForPaths(
  target: RemoteRepoTarget,
  worktreePath: string,
  paths: string[],
  options: { signal?: AbortSignal; run?: RemoteGitRunner } = {},
): Promise<ExecResult> {
  if (!isValidRemotePath(worktreePath)) return { ok: false, message: 'error.invalid-path' }
  const run: RemoteGitRunner = options.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const known = await resolveKnownRemoteWorktree(target, worktreePath, { signal: options.signal, run })
  if ('ok' in known) return known
  const result = await run(
    { type: 'gitDiscardChanges', path: known.path, paths },
    target,
    { signal: options.signal, timeoutMs: REMOTE_BRANCH_OP_TIMEOUT_MS },
  )
  return remoteExecResult(result)
}
```

- [ ] **Step 6: Verify SSH tests pass**

Run:

```bash
bun run test src/system/ssh/commands.test.ts src/system/ssh/git.test.ts
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Confirm remote script contains `--` before pathspecs in both restore and clean commands.

---

### Task 3: Server Backend And Write Path

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`
- Test: `src/server/modules/repo.test.ts`

- [ ] **Step 1: Write failing server tests for dispatch and invalidation**

In `src/server/modules/repo.test.ts`, extend the hoisted mocks:

```ts
  discardChangesForPaths: vi.fn(),
  discardRemoteChangesForPaths: vi.fn(),
```

Update mocks:

```ts
vi.mock('#/system/git/reset.ts', () => ({
  discardChangesForPaths: mocks.discardChangesForPaths,
  resetHardToCurrentHead: mocks.resetHardToCurrentHead,
}))
```

```ts
vi.mock('#/system/ssh/git.ts', () => ({
  checkoutRemoteBranch: mocks.checkoutRemoteBranch,
  commitRemoteChanges: mocks.commitRemoteChanges,
  createRemoteBranch: mocks.createRemoteBranch,
  createRemoteFileTreeDirectory: mocks.createRemoteFileTreeDirectory,
  createRemoteTrackingBranch: mocks.createRemoteTrackingBranch,
  createRemoteWorktree: vi.fn(),
  deleteRemoteBranch: mocks.deleteRemoteBranch,
  deleteRemoteFileTreeEntries: mocks.deleteRemoteFileTreeEntries,
  discardRemoteChangesForPaths: mocks.discardRemoteChangesForPaths,
  fetchRemoteRepository: mocks.fetchRemoteRepository,
  getRemoteBrowserUrl: mocks.getRemoteBrowserUrl,
  getRemoteCommitDetail: mocks.getRemoteCommitDetail,
  getRemoteHistory: mocks.getRemoteHistory,
  getRemotePatch: vi.fn(),
  getRemoteTrackingBranches: mocks.getRemoteTrackingBranches,
  getRemoteLog: vi.fn(),
  getRemoteSnapshot: vi.fn(),
  getRemoteStatus: vi.fn(),
  pullRemoteBranch: mocks.pullRemoteBranch,
  pushRemoteBranch: mocks.pushRemoteBranch,
  mergeRemoteBranch: mocks.mergeRemoteBranch,
  moveRemoteFileTreeEntries: mocks.moveRemoteFileTreeEntries,
  renameRemoteFileTreeEntry: mocks.renameRemoteFileTreeEntry,
  removeRemoteWorktree: mocks.removeRemoteWorktree,
  resetRemoteHard: mocks.resetRemoteHard,
}))
```

In `beforeEach`, add:

```ts
  mocks.discardChangesForPaths.mockResolvedValue({ ok: true, message: '' })
  mocks.discardRemoteChangesForPaths.mockResolvedValue({ ok: true, message: '' })
```

Add tests near the existing reset/commit tests:

```ts
test('discardRepositoryChanges dispatches local paths and publishes invalidation on success', async () => {
  const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

  const result = await discardRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', ['src/app.ts', 'docs'])

  expect(result).toEqual({ ok: true, message: '' })
  expect(mocks.discardChangesForPaths).toHaveBeenCalledWith('/tmp/repo-worktree', ['src/app.ts', 'docs'], undefined)
  expect(mocks.discardRemoteChangesForPaths).not.toHaveBeenCalled()
  expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
    repoId: '/tmp/repo',
    query: 'repo-snapshot',
  })
})

test('discardRepositoryChanges dispatches remote paths and publishes invalidation on success', async () => {
  const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

  const result = await discardRepositoryChanges('ssh-config://prod/srv/repo', '/srv/repo', ['src/app.ts'])

  expect(result).toEqual({ ok: true, message: '' })
  expect(mocks.discardChangesForPaths).not.toHaveBeenCalled()
  expect(mocks.discardRemoteChangesForPaths).toHaveBeenCalledWith(
    expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
    '/srv/repo',
    ['src/app.ts'],
    { signal: undefined },
  )
  expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
    repoId: 'ssh-config://prod/srv/repo',
    query: 'repo-snapshot',
  })
})

test('discardRepositoryChanges publishes invalidation when Git was attempted and failed', async () => {
  mocks.discardChangesForPaths.mockResolvedValueOnce({ ok: false, message: 'fatal: clean failed' })
  const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

  const result = await discardRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', ['src/app.ts'])

  expect(result).toEqual({ ok: false, message: 'fatal: clean failed' })
  expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
    repoId: '/tmp/repo',
    query: 'repo-snapshot',
  })
})

test.each([
  [[]],
  [['']],
  [['/absolute/path']],
  [['../outside']],
  [['src/../outside']],
])('discardRepositoryChanges rejects invalid paths %o before publishing invalidation', async (paths) => {
  const { discardRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

  const result = await discardRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', paths)

  expect(result).toEqual({ ok: false, message: 'error.invalid-arguments' })
  expect(mocks.discardChangesForPaths).not.toHaveBeenCalled()
  expect(mocks.discardRemoteChangesForPaths).not.toHaveBeenCalled()
  expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run focused failing server test**

Run:

```bash
bun run test src/server/modules/repo.test.ts
```

Expected: FAIL because `discardRepositoryChanges` and backend methods are missing.

- [ ] **Step 3: Extend backend interface and implementations**

In `src/server/modules/repo-backend.ts`, import:

```ts
import { resetHardToCurrentHead, discardChangesForPaths } from '#/system/git/reset.ts'
```

Add to SSH imports:

```ts
  discardRemoteChangesForPaths,
```

Add to `RepoBackend`:

```ts
  discardChanges(worktreePath: string, paths: string[], signal?: AbortSignal): Promise<ExecResult>
```

Add local implementation near `resetHard`:

```ts
    async discardChanges(worktreePath, paths, signal) {
      if (!isValidCwd(worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      return await discardChangesForPaths(worktreePath, paths, signal)
    },
```

Add remote implementation near `resetHard`:

```ts
    async discardChanges(worktreePath, paths, signal) {
      return await discardRemoteChangesForPaths(target, worktreePath, paths, { signal })
    },
```

- [ ] **Step 4: Add write path validation and invalidation semantics**

In `src/server/modules/repo-write-paths.ts`, add helper functions near other local validators:

```ts
function isSafeRelativeGitPath(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.trim() === '') return false
  if (value.startsWith('/')) return false
  return !value.split('/').some((part) => part === '..')
}

function normalizeDiscardPaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length === 0) return null
  const paths = value.filter(isSafeRelativeGitPath)
  return paths.length === value.length ? paths : null
}

function publishSnapshotInvalidationAfterGitAttempt(
  cwd: string,
  result: ExecResult,
  sourceToken?: string,
): ExecResult {
  publishRepoSnapshotInvalidation(cwd, sourceToken)
  return result
}
```

Add exported write path near `resetRepositoryHard`:

```ts
export async function discardRepositoryChanges(
  repoId: string,
  worktreePath: string,
  paths: unknown,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const normalizedPaths = normalizeDiscardPaths(paths)
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath) || !normalizedPaths) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return publishSnapshotInvalidationAfterGitAttempt(
      repoId,
      await backend.discardChanges(worktreePath, normalizedPaths, signal),
      sourceToken,
    )
  })
}
```

- [ ] **Step 5: Verify server tests pass**

Run:

```bash
bun run test src/server/modules/repo.test.ts
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Confirm validation failures do not call `publishRepoSnapshotInvalidation`, while Git-attempted failures do.

---

### Task 4: Route And Web Client API

**Files:**
- Modify: `src/server/routes/repo.ts`
- Modify: `src/server/routes/repo.test.ts`
- Modify: `src/web/repo-client.ts`
- Modify: `src/web/repo-client.test.ts`

- [ ] **Step 1: Write failing route test**

In `src/server/routes/repo.test.ts`, add `discardRepositoryChanges` to the write-path mock:

```ts
  discardRepositoryChanges: vi.fn(),
```

Update the mock factory:

```ts
  discardRepositoryChanges: mocks.discardRepositoryChanges,
```

In `beforeEach`, add:

```ts
    mocks.discardRepositoryChanges.mockResolvedValue({ ok: true, message: '' })
```

Add test:

```ts
test('routes discard selected changes with parsed body values', async () => {
  const { createRepoRoutes } = await import('#/server/routes/repo.ts')
  const app = createRepoRoutes()

  const response = await app.request('http://localhost/discard-changes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      repoId: '/repo',
      worktreePath: '/repo',
      paths: ['src/app.ts', 'docs'],
      sourceToken: 'client_123',
    }),
  })

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({ ok: true, message: '' })
  expect(mocks.discardRepositoryChanges).toHaveBeenCalledWith(
    '/repo',
    '/repo',
    ['src/app.ts', 'docs'],
    expect.any(AbortSignal),
    'client_123',
  )
})
```

- [ ] **Step 2: Write failing web client test**

In `src/web/repo-client.test.ts`, add a test near commit/reset client tests:

```ts
test('requests discard selected changes through the embedded server', async () => {
  installWebBootstrap(webBootstrap({ initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' } }))
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, message: '' }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const { discardRepositoryChanges } = await import('#/web/repo-client.ts')
  await expect(discardRepositoryChanges('/repo', '/repo', ['src/app.ts', 'docs'])).resolves.toEqual({
    ok: true,
    message: '',
  })

  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:32100/api/repo/discard-changes',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-goblin-internal-secret': 'secret' }),
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', paths: ['src/app.ts', 'docs'] }),
    }),
  )
})
```

- [ ] **Step 3: Run focused failing tests**

Run:

```bash
bun run test src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: FAIL because route/client functions do not exist.

- [ ] **Step 4: Add server route**

In `src/server/routes/repo.ts`, import `discardRepositoryChanges` from `repo-write-paths.ts`.

Add route near `/reset-hard`:

```ts
  app.post('/discard-changes', async (c) => {
    const body = await c.req.json().catch(() => null)
    const repoId = typeof body?.repoId === 'string' ? body.repoId : ''
    const worktreePath = typeof body?.worktreePath === 'string' ? body.worktreePath : ''
    const paths = Array.isArray(body?.paths) ? body.paths : []
    const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
    return c.json(
      await jsonOr(
        () => discardRepositoryChanges(repoId, worktreePath, paths, c.req.raw.signal, sourceToken),
        { ok: false, message: 'error.failed-read-repo' },
        'discard-changes',
      ),
    )
  })
```

- [ ] **Step 5: Add web client function**

In `src/web/repo-client.ts`, add near `resetRepositoryHard`:

```ts
export async function discardRepositoryChanges(
  repoId: string,
  worktreePath: string,
  paths: string[],
): Promise<ExecResult> {
  return postServerJson('/api/repo/discard-changes', { repoId, worktreePath, paths })
}
```

- [ ] **Step 6: Verify route/client tests pass**

Run:

```bash
bun run test src/server/routes/repo.test.ts src/web/repo-client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Confirm no browser or renderer code imports `src/server/**`; the client goes through `repo-client.ts`.

---

### Task 5: I18n Copy

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`
- Test: `src/shared/i18n/dictionaries.test.ts`

- [ ] **Step 1: Write failing dictionary expectations**

Add to `src/shared/i18n/dictionaries.test.ts`:

```ts
test('includes discard selected changes copy', () => {
  expect(en['changes.discard-selected']).toBe('Discard selected')
  expect(en['changes.selected-count']).toBe('{count} selected')
  expect(en['changes.discard-confirm-file-title']).toBe('Discard changes to this file?')
  expect(en['changes.discard-confirm-folder-title']).toBe('Discard changes in this folder?')
  expect(en['changes.discard-confirm-multiple-title']).toBe('Discard changes to {count} selected items?')
  expect(en['changes.discard-confirm-body']).toContain('staged, unstaged, and untracked')
  expect(en['changes.discard-confirm-confirm']).toBe('Discard')
})
```

- [ ] **Step 2: Run failing i18n test**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts
```

Expected: FAIL because keys are missing.

- [ ] **Step 3: Add English copy**

In `src/shared/i18n/en.ts`, near existing `action.reset-hard` keys, add:

```ts
  'changes.discard-selected': 'Discard selected',
  'changes.selected-count': '{count} selected',
  'changes.discard-confirm-file-title': 'Discard changes to this file?',
  'changes.discard-confirm-folder-title': 'Discard changes in this folder?',
  'changes.discard-confirm-multiple-title': 'Discard changes to {count} selected items?',
  'changes.discard-confirm-body':
    'This will discard staged, unstaged, and untracked changes under the selected paths. Untracked files and folders will be deleted and cannot be restored from Git.',
  'changes.discard-confirm-confirm': 'Discard',
```

- [ ] **Step 4: Add Chinese copy**

In `src/shared/i18n/zh.ts`, add matching keys:

```ts
  'changes.discard-selected': '丢弃选中项',
  'changes.selected-count': '已选 {count} 项',
  'changes.discard-confirm-file-title': '丢弃此文件的改动？',
  'changes.discard-confirm-folder-title': '丢弃此文件夹内的改动？',
  'changes.discard-confirm-multiple-title': '丢弃选中的 {count} 项改动？',
  'changes.discard-confirm-body':
    '这会丢弃选中路径下已暂存、未暂存和未跟踪的改动。未跟踪的文件和文件夹会被删除，且无法从 Git 恢复。',
  'changes.discard-confirm-confirm': '丢弃',
```

- [ ] **Step 5: Add Korean copy**

In `src/shared/i18n/ko.ts`, add matching keys:

```ts
  'changes.discard-selected': '선택 항목 버리기',
  'changes.selected-count': '{count}개 선택됨',
  'changes.discard-confirm-file-title': '이 파일의 변경사항을 버릴까요?',
  'changes.discard-confirm-folder-title': '이 폴더의 변경사항을 버릴까요?',
  'changes.discard-confirm-multiple-title': '선택한 {count}개 항목의 변경사항을 버릴까요?',
  'changes.discard-confirm-body':
    '선택한 경로의 스테이징된 변경사항, 스테이징되지 않은 변경사항, 추적되지 않은 변경사항을 버립니다. 추적되지 않은 파일과 폴더는 삭제되며 Git에서 복구할 수 없습니다.',
  'changes.discard-confirm-confirm': '버리기',
```

- [ ] **Step 6: Add Japanese copy**

In `src/shared/i18n/ja.ts`, add matching keys:

```ts
  'changes.discard-selected': '選択項目を破棄',
  'changes.selected-count': '{count} 件選択中',
  'changes.discard-confirm-file-title': 'このファイルの変更を破棄しますか？',
  'changes.discard-confirm-folder-title': 'このフォルダー内の変更を破棄しますか？',
  'changes.discard-confirm-multiple-title': '選択した {count} 件の変更を破棄しますか？',
  'changes.discard-confirm-body':
    '選択したパス配下のステージ済み、未ステージ、未追跡の変更を破棄します。未追跡のファイルとフォルダーは削除され、Git からは復元できません。',
  'changes.discard-confirm-confirm': '破棄',
```

- [ ] **Step 7: Verify i18n tests pass**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts
```

Expected: PASS, including placeholder alignment for `{count}`.

- [ ] **Step 8: Checkpoint**

Confirm all new keys exist in all four dictionaries.

---

### Task 6: Selectable Status List Model

**Files:**
- Modify: `src/web/components/FilePathTreeList.tsx`
- Modify: `src/web/components/StatusList.tsx`
- Test: `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`

- [ ] **Step 1: Write failing UI test for checkboxes in tree view**

In `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`, add:

```ts
test('renders selectable changed files and folders in tree view', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    statusLoaded: true,
    status: [
      {
        path: WORKTREE_PATH,
        branch: 'feature/worktree',
        isMain: true,
        entries: [
          { x: 'M', y: ' ', path: 'src/app.ts' },
          { x: '?', y: '?', path: 'src/components/Button.tsx' },
        ],
      },
    ],
  })

  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <ProjectChangesPanel repoId={REPO_ID} />
      </InlineCommitDraftProvider>,
    )
  })

  expect(container?.querySelector('button[aria-label="changes.select-file:src/app.ts"]')).toBeTruthy()
  expect(container?.querySelector('button[aria-label="changes.select-folder:src"]')).toBeTruthy()
  expect(container?.textContent).not.toContain('changes.selected-count')
})
```

- [ ] **Step 2: Run failing UI test**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: FAIL because no selection checkboxes exist.

- [ ] **Step 3: Extend `FilePathTreeList` to render directories**

In `src/web/components/FilePathTreeList.tsx`, export directory row type and add `renderDirectory`.

Replace the private directory interface with:

```ts
export interface FilePathTreeDirectoryRow {
  kind: 'directory'
  name: string
  path: string
  depth: number
}
```

Extend props:

```ts
interface FilePathTreeListProps<T> {
  items: T[]
  getPath: (item: T) => string
  renderFile: (row: FilePathTreeFileRow<T>) => ReactNode
  renderDirectory?: (row: FilePathTreeDirectoryRow) => ReactNode
  className?: string
}
```

Update component signature and directory branch:

```tsx
export function FilePathTreeList<T>({ items, getPath, renderFile, renderDirectory, className }: FilePathTreeListProps<T>) {
  const rows = buildFilePathTreeRows(items, getPath)

  return (
    <ul className={className}>
      {rows.map((row) =>
        row.kind === 'directory' ? (
          renderDirectory ? (
            <Fragment key={`dir:${row.path}`}>{renderDirectory(row)}</Fragment>
          ) : (
            <li
              key={`dir:${row.path}`}
              data-file-folder-path={row.path}
              className="flex min-h-6 items-center gap-1.5 pr-2 text-xs text-muted-foreground"
              style={{ paddingLeft: `${0.5 + row.depth * 1}rem` }}
            >
              <Folder size={13} className="shrink-0" />
              <span className="min-w-0 truncate font-mono">{row.name}</span>
            </li>
          )
        ) : (
          <Fragment key={`file:${row.id}`}>{renderFile(row)}</Fragment>
        ),
      )}
    </ul>
  )
}
```

- [ ] **Step 4: Extend `StatusList` selection props and rendering**

In `src/web/components/StatusList.tsx`, import `Folder` and `Checkbox`:

```ts
import { Folder } from 'lucide-react'
import { Checkbox } from '#/web/components/ui/checkbox.tsx'
```

Add props:

```ts
interface StatusSelectionProps {
  selectedTargets?: ReadonlySet<string>
  onToggleFile?: (path: string) => void
  onToggleDirectory?: (path: string) => void
}
```

Extend `Props`, `StatusWorktreeList`, and `StatusTreeFileRow` with `StatusSelectionProps`.

Add helper:

```ts
function directoryChildPaths(entries: StatusEntry[], directoryPath: string): string[] {
  const prefix = `${directoryPath}/`
  return entries.map((entry) => entry.path).filter((path) => path.startsWith(prefix))
}

function isSelectedByTarget(selectedTargets: ReadonlySet<string> | undefined, filePath: string): boolean {
  if (!selectedTargets) return false
  if (selectedTargets.has(filePath)) return true
  const parts = filePath.split('/').filter(Boolean)
  let directory = ''
  for (const part of parts.slice(0, -1)) {
    directory = directory ? `${directory}/${part}` : part
    if (selectedTargets.has(directory)) return true
  }
  return false
}
```

For tree mode, pass `renderDirectory`:

```tsx
        renderDirectory={(row) => {
          const childPaths = directoryChildPaths(worktree.entries, row.path)
          const checked = selectedTargets?.has(row.path) ?? false
          const selectedCount = childPaths.filter((path) => isSelectedByTarget(selectedTargets, path)).length
          const indeterminate = !checked && selectedCount > 0
          return (
            <li
              key={`dir:${row.path}`}
              data-file-folder-path={row.path}
              className="grid min-h-6 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 pr-2 text-xs text-muted-foreground"
              style={{ paddingLeft: fileTreeRowPadding(row.depth) }}
            >
              <Checkbox
                aria-label={`changes.select-folder:${row.path}`}
                checked={indeterminate ? 'indeterminate' : checked}
                onCheckedChange={() => onToggleDirectory?.(row.path)}
              />
              <span className="flex min-w-0 items-center gap-1.5">
                <Folder size={13} className="shrink-0" />
                <span className="min-w-0 truncate font-mono">{row.name}</span>
              </span>
            </li>
          )
        }}
```

For list rows, change grid columns to include checkbox when `onToggleFile` exists:

```tsx
className="grid grid-cols-[1rem_2ch_minmax(0,1fr)] items-center gap-3 px-1.5"
```

Render before `StatusCode`:

```tsx
<Checkbox
  aria-label={`changes.select-file:${entry.path}`}
  checked={isSelectedByTarget(selectedTargets, entry.path)}
  onCheckedChange={() => onToggleFile?.(entry.path)}
/>
```

For `StatusTreeFileRow`, use the same checkbox before `StatusCode` and columns:

```tsx
className="grid min-h-6 grid-cols-[1rem_2ch_minmax(0,1fr)] items-center gap-3 pr-1.5 tracking-wider"
```

- [ ] **Step 5: Verify UI test now passes**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: PASS for checkbox rendering while existing reveal tests still pass.

- [ ] **Step 6: Checkpoint**

Confirm `StatusList` still renders the empty state when there are zero changes.

---

### Task 7: ProjectChangesPanel Selection And Discard Flow

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.tsx`
- Test: `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`

- [ ] **Step 1: Mock discard client in ProjectChangesPanel tests**

In `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`, extend `repoClientMocks`:

```ts
const repoClientMocks = vi.hoisted(() => ({
  discardRepositoryChanges: vi.fn(),
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))
```

Update the `repo-client` mock:

```ts
    discardRepositoryChanges: repoClientMocks.discardRepositoryChanges,
```

In `beforeEach`, add:

```ts
  repoClientMocks.discardRepositoryChanges.mockResolvedValue({ ok: true, message: '' })
```

- [ ] **Step 2: Write failing tests for file selection and success clear**

Add:

```ts
test('discards a selected changed file after confirmation and clears selection on success', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    statusLoaded: true,
    status: [
      {
        path: WORKTREE_PATH,
        branch: 'feature/worktree',
        isMain: true,
        entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
      },
    ],
  })

  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <ProjectChangesPanel repoId={REPO_ID} />
      </InlineCommitDraftProvider>,
    )
  })

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.select-file:src/app.ts"]')?.click()
  })

  expect(container?.textContent).toContain('changes.selected-count')
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.discard-selected"]')?.click()
  })
  expect(document.body.textContent).toContain('changes.discard-confirm-file-title')

  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('changes.discard-confirm-confirm'))
      ?.click()
  })

  expect(repoClientMocks.discardRepositoryChanges).toHaveBeenCalledWith(REPO_ID, WORKTREE_PATH, ['src/app.ts'])
  expect(container?.textContent).not.toContain('changes.selected-count')
})
```

- [ ] **Step 3: Write failing tests for folder selection and failure preservation**

Add:

```ts
test('discards a selected changed folder as one pathspec target', async () => {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    statusLoaded: true,
    status: [
      {
        path: WORKTREE_PATH,
        branch: 'feature/worktree',
        isMain: true,
        entries: [
          { x: 'M', y: ' ', path: 'src/app.ts' },
          { x: '?', y: '?', path: 'src/components/Button.tsx' },
          { x: 'D', y: ' ', path: 'README.md' },
        ],
      },
    ],
  })

  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <ProjectChangesPanel repoId={REPO_ID} />
      </InlineCommitDraftProvider>,
    )
  })

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.select-folder:src"]')?.click()
  })

  expect(container?.textContent).toContain('changes.selected-count')
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.discard-selected"]')?.click()
  })
  expect(document.body.textContent).toContain('changes.discard-confirm-folder-title')
  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('changes.discard-confirm-confirm'))
      ?.click()
  })

  expect(repoClientMocks.discardRepositoryChanges).toHaveBeenCalledWith(REPO_ID, WORKTREE_PATH, ['src'])
})

test('keeps selected paths when discard fails', async () => {
  repoClientMocks.discardRepositoryChanges.mockResolvedValueOnce({ ok: false, message: 'fatal: clean failed' })
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    statusLoaded: true,
    status: [
      {
        path: WORKTREE_PATH,
        branch: 'feature/worktree',
        isMain: true,
        entries: [{ x: 'M', y: ' ', path: 'src/app.ts' }],
      },
    ],
  })

  await act(async () => {
    root!.render(
      <InlineCommitDraftProvider>
        <ProjectChangesPanel repoId={REPO_ID} />
      </InlineCommitDraftProvider>,
    )
  })

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.select-file:src/app.ts"]')?.click()
  })
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="changes.discard-selected"]')?.click()
  })
  await act(async () => {
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('changes.discard-confirm-confirm'))
      ?.click()
  })

  expect(container?.textContent).toContain('changes.selected-count')
})
```

- [ ] **Step 4: Run failing ProjectChangesPanel tests**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: FAIL because `ProjectChangesPanel` has no discard selection flow.

- [ ] **Step 5: Add selection helpers and client import**

In `src/web/components/repo-workspace/ProjectChangesPanel.tsx`, update imports:

```ts
import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { discardRepositoryChanges } from '#/web/repo-client.ts'
```

Add helpers above `ProjectChangesPanel`:

```ts
function changedFilePaths(status: SelectedBranchDetailPresentation['selectedStatus']): string[] {
  return status.flatMap((worktree) => worktree.entries.map((entry) => entry.path))
}

function changedDirectoryPaths(filePaths: string[]): string[] {
  const directories = new Set<string>()
  for (const filePath of filePaths) {
    const parts = filePath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part
      directories.add(current)
    }
  }
  return Array.from(directories)
}

function toggleTargetSelection(selected: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selected)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  return next
}
```

- [ ] **Step 6: Own selection in `ProjectChangesPanel`**

Inside `ProjectChangesPanel`, add:

```ts
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(() => new Set())
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
```

After `detail` and `hasChanges`:

```ts
  const currentChangedFiles = useMemo(() => changedFilePaths(detail.selectedStatus), [detail.selectedStatus])
  const currentChangedDirectories = useMemo(() => changedDirectoryPaths(currentChangedFiles), [currentChangedFiles])
  const currentSelectableTargets = useMemo(
    () => new Set([...currentChangedFiles, ...currentChangedDirectories]),
    [currentChangedDirectories, currentChangedFiles],
  )
  useEffect(() => {
    setSelectedTargets((current) => {
      const next = new Set(Array.from(current).filter((path) => currentSelectableTargets.has(path)))
      return next.size === current.size ? current : next
    })
  }, [currentSelectableTargets])
```

Pass props:

```tsx
      <ProjectChangesActionBar
        repo={repo}
        branch={detail.branch}
        disableCommit={!hasChanges}
        showFileViewMode={hasChanges}
        fileViewMode={fileViewMode}
        selectedCount={selectedTargets.size}
        onDiscardSelected={() => setConfirmDiscardOpen(true)}
        onFileViewModeChange={setFileViewMode}
      />
      <ProjectChangesContent
        repo={repo}
        branch={detail.branch}
        selectedStatus={detail.selectedStatus}
        statusLoading={detail.loading.status}
        statusError={detail.errors.status}
        statusStale={detail.stale.status}
        fileViewMode={fileViewMode}
        selectedTargets={selectedTargets}
        onToggleFile={(path) => setSelectedTargets((current) => toggleTargetSelection(current, path))}
        onToggleDirectory={(path) => setSelectedTargets((current) => toggleTargetSelection(current, path))}
        onRevealPath={onRevealPath}
      />
```

- [ ] **Step 7: Add discard confirm dialog**

Still inside `ProjectChangesPanel`, before `</section>`, render:

```tsx
      <ConfirmDialog
        open={confirmDiscardOpen}
        title={discardConfirmTitle(t, selectedTargets, new Set(currentChangedDirectories))}
        message={t('changes.discard-confirm-body')}
        confirmLabel={t('changes.discard-confirm-confirm')}
        destructive
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={async () => {
          const worktreePath = detail.branch.worktree?.path
          if (!worktreePath) return
          const paths = Array.from(selectedTargets)
          const result = await discardRepositoryChanges(repo.id, worktreePath, paths)
          useReposStore.getState().setLastResult(repo.id, result, repo.instanceToken)
          if (result.ok) setSelectedTargets(new Set())
          setConfirmDiscardOpen(false)
        }}
      />
```

Add helper:

```ts
function discardConfirmTitle(
  t: (key: string) => string,
  selectedTargets: ReadonlySet<string>,
  directoryTargets: ReadonlySet<string>,
): string {
  if (selectedTargets.size === 1) {
    const [target] = Array.from(selectedTargets)
    return target && directoryTargets.has(target)
      ? t('changes.discard-confirm-folder-title')
      : t('changes.discard-confirm-file-title')
  }
  return t('changes.discard-confirm-multiple-title').replace('{count}', String(selectedTargets.size))
}
```

- [ ] **Step 8: Update action bar**

Extend `ProjectChangesActionBar` props:

```ts
  selectedCount: number
  onDiscardSelected: () => void
```

Inside action bar:

```tsx
      {selectedCount > 0 && (
        <>
          <span className="mr-auto text-xs text-muted-foreground">
            {t('changes.selected-count').replace('{count}', String(selectedCount))}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            aria-label={t('changes.discard-selected')}
            onClick={onDiscardSelected}
          >
            <RotateCcw size={14} />
            {t('changes.discard-selected')}
          </Button>
        </>
      )}
```

Make sure `const t = useT()` exists in `ProjectChangesActionBar`.

- [ ] **Step 9: Pass selection props through content to `StatusList`**

Extend `ProjectChangesContent` props:

```ts
  selectedTargets: ReadonlySet<string>
  onToggleFile: (path: string) => void
  onToggleDirectory: (path: string) => void
```

Pass to both `StatusList` render branches:

```tsx
<StatusList
  status={selectedStatus}
  viewMode={fileViewMode}
  selectedTargets={selectedTargets}
  onToggleFile={onToggleFile}
  onToggleDirectory={onToggleDirectory}
  onPathClick={onRevealPath}
/>
```

- [ ] **Step 10: Verify ProjectChangesPanel tests pass**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Checkpoint**

Review the action bar layout in code: `N selected` should use `mr-auto` so it does not crowd commit/view-mode controls.

---

### Task 8: Final Verification

**Files:**
- All modified files from prior tasks.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
bun run test src/system/git/reset.test.ts src/system/ssh/commands.test.ts src/system/ssh/git.test.ts src/server/modules/repo.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts src/shared/i18n/dictionaries.test.ts src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
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

- [ ] **Step 4: Run full tests**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 5: Manual review checklist**

Check these conditions in the changed code:

```text
- No TypeScript enum, namespace, parameter property, or import alias was added.
- New imports use repo aliases with explicit .ts/.tsx extensions.
- New package dependencies were not added.
- Renderer does not import server/main modules.
- Git pathspec commands always include -- before selected paths.
- Remote pathspec values are shell-quoted.
- User-facing strings use dictionary keys, not hard-coded English in components.
- No git commit was created unless the user explicitly requested it.
```

---

## Self-Review

- Spec coverage: the plan covers local and SSH remote discard, explicit selection controls in tree/list views, confirmation, API route/client, invalidation after Git attempts, failed selection preservation, and focused tests.
- Placeholder scan: no task depends on a placeholder implementation. Folder targets remain first-class selection targets, so folder confirmation copy and directory pathspec discard are both covered.
- Type consistency: function names are consistent across tasks: `discardChangesForPaths`, `discardRemoteChangesForPaths`, `discardRepositoryChanges`, `RepoBackend.discardChanges`, and `gitDiscardChanges`.

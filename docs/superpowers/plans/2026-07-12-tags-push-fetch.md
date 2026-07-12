# Tags Push & Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row push button to the local Tags panel and upgrade its Refresh button to also fetch from remote.

**Architecture:** New `pushLocalTag` function threads through the full stack (git layer → SSH layer → RepoBackend interface → write-paths orchestration → route → client), following the same pattern as `pushRepositoryBranch`. The Refresh upgrade is a UI-only change reusing the existing `/api/repo/fetch` path — no new endpoint needed.

**Tech Stack:** TypeScript (Node.js strip-only), Bun test runner (vitest), React, Hono, lucide-react, sonner toasts.

---

### Task 1: Add `pushLocalTag` to git layer

**Files:**
- Modify: `src/system/git/tags.ts`
- Modify: `src/system/git/tags.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/system/git/tags.test.ts`, inside `describe('local tag helpers', ...)`:

```ts
// At top of file, extend the mock hoisting to cover remote.ts and add gitNetworkOptions/NETWORK_TIMEOUT_MS:
const getRemotesMock = vi.hoisted(() => vi.fn())
const resolveFetchRemoteForRemotesMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/remote.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/remote.ts')>('#/system/git/remote.ts')
  return {
    ...actual,
    getRemotes: getRemotesMock,
    resolveFetchRemoteForRemotes: resolveFetchRemoteForRemotesMock,
  }
})
```

Then extend `beforeEach` to add:

```ts
getRemotesMock.mockReset()
resolveFetchRemoteForRemotesMock.mockReset()
getRemotesMock.mockResolvedValue([{ name: 'origin', fetchUrl: 'git@github.com:a/b.git', pushUrl: 'git@github.com:a/b.git' }])
resolveFetchRemoteForRemotesMock.mockReturnValue('origin')
```

Add these test cases:

```ts
test('pushes a local tag to the resolved remote', async () => {
  const { pushLocalTag } = await import('#/system/git/tags.ts')
  await expect(pushLocalTag('/repo', 'v1.0.0')).resolves.toEqual({ ok: true, message: 'ok' })
  expect(resolveFetchRemoteForRemotesMock).toHaveBeenCalledWith(
    [{ name: 'origin', fetchUrl: 'git@github.com:a/b.git', pushUrl: 'git@github.com:a/b.git' }],
    null,
  )
  expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
    '/repo',
    expect.objectContaining({ signal: undefined }),
    'push',
    '--',
    'origin',
    'refs/tags/v1.0.0',
  )
})

test('returns error when no remote exists', async () => {
  resolveFetchRemoteForRemotesMock.mockReturnValue(null)
  const { pushLocalTag } = await import('#/system/git/tags.ts')
  await expect(pushLocalTag('/repo', 'v1.0.0')).resolves.toEqual({
    ok: false,
    message: 'error.push-no-remote',
  })
  expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
})

test('rejects unsafe tag names before pushing', async () => {
  const { pushLocalTag } = await import('#/system/git/tags.ts')
  await expect(pushLocalTag('/repo', '-bad')).resolves.toEqual({
    ok: false,
    message: 'error.invalid-arguments',
  })
  expect(gitResultWithOptionsMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd /Users/longjiang/src/tries/2026-06-13-hobgoblin/hobgoblin-opt-history
bun run test src/system/git/tags.test.ts
```

Expected: 3 new tests fail with `pushLocalTag is not a function` or similar.

- [ ] **Step 3: Implement `pushLocalTag` in `src/system/git/tags.ts`**

Add the following imports at the top of the file:

```ts
import { gitNetworkOptions, gitResultWithOptions, NETWORK_TIMEOUT_MS } from '#/system/git/helper.ts'
import type { GitNetworkOptions } from '#/system/git/helper.ts'
import { getRemotes, resolveFetchRemoteForRemotes } from '#/system/git/remote.ts'
import type { ExecResult } from '#/shared/git-types.ts'
```

Note: The file already imports `git` and `gitResultWithOptions` from helper.ts and `isSafeBranchName` from refnames.ts — update those existing import lines rather than duplicating them.

Add the function after `deleteLocalTag`:

```ts
export async function pushLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  networkOptions?: GitNetworkOptions,
): Promise<ExecResult> {
  if (!isSafeBranchName(name)) return { ok: false, message: 'error.invalid-arguments' }
  const remotes = await getRemotes(cwd, signal)
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  const remote = resolveFetchRemoteForRemotes(remotes, null)
  if (!remote) return { ok: false, message: 'error.push-no-remote' }
  return await gitResultWithOptions(
    cwd,
    gitNetworkOptions(networkOptions, NETWORK_TIMEOUT_MS, signal),
    'push',
    '--',
    remote,
    `refs/tags/${name}`,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun run test src/system/git/tags.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/system/git/tags.ts src/system/git/tags.test.ts
git commit -m "feat(tags): add pushLocalTag to git layer"
```

---

### Task 2: Add `gitTagPush` SSH command type and shell handler

**Files:**
- Modify: `src/system/ssh/commands.ts`
- Modify: `src/system/ssh/commands.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/system/ssh/commands.test.ts`. Find the block of tests for existing tag commands (`gitTagDelete`, `gitRemoteTagDelete`). Add:

```ts
test('gitTagPush generates correct shell string', () => {
  const script = scriptForCommandExposed({ type: 'gitTagPush', path: '/repo', remote: 'origin', tag: 'v1.0.0' })
  expect(script).toBe("git -C '/repo' push -- 'origin' 'refs/tags/v1.0.0'")
})
```

Note: Check the test file for how `scriptForCommand` is exposed (it may be called `scriptForCommandExposed` or exported via a test helper). Match the existing pattern exactly.

- [ ] **Step 2: Run test to verify it fails**

```
bun run test src/system/ssh/commands.test.ts
```

Expected: New test fails because `gitTagPush` is not in the union.

- [ ] **Step 3: Add the command type and shell handler**

In `src/system/ssh/commands.ts`, add to the `RemoteCommandKind` union (after `gitRemoteTagDelete`):

```ts
| { type: 'gitTagPush'; path: string; remote: string; tag: string }
```

In `scriptForCommand`, add the case after `case 'gitRemoteTagDelete':`:

```ts
case 'gitTagPush':
  return `git -C ${shellQuote(command.path)} push -- ${shellQuote(command.remote)} ${shellQuote(`refs/tags/${command.tag}`)}`
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run test src/system/ssh/commands.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/system/ssh/commands.ts src/system/ssh/commands.test.ts
git commit -m "feat(tags): add gitTagPush SSH command type"
```

---

### Task 3: Add `pushLocalTag` to SSH git layer

**Files:**
- Modify: `src/system/ssh/git.ts`

No separate test file for `ssh/git.ts` — the integration is covered at the backend and route levels.

- [ ] **Step 1: Add `pushLocalTag` export to `src/system/ssh/git.ts`**

Find the `deleteRemoteServerTag` function (around line 1067). After it, add:

```ts
export async function pushLocalTag(
  target: RemoteRepoTarget,
  input: { name: string; signal?: AbortSignal; run?: RemoteGitRunner },
): Promise<ExecResult> {
  if (!isSafeBranchName(input.name)) return { ok: false, message: 'error.invalid-arguments' }
  const run: RemoteGitRunner = input.run ?? ((command, t, runOptions) => runRemoteCommand(t, command, runOptions))
  const pushTarget = await resolveRemotePushTarget(target, input.name, { signal: input.signal, run })
  if (input.signal?.aborted) return { ok: false, message: 'cancelled' }
  if ('ok' in pushTarget) return pushTarget
  const result = await run(
    { type: 'gitTagPush', path: target.remotePath, remote: pushTarget.remote, tag: input.name },
    target,
    { signal: input.signal, timeoutMs: REMOTE_BRANCH_OP_TIMEOUT_MS },
  )
  return remoteExecResult(result)
}
```

Note: `resolveRemotePushTarget` is a private async function already defined in this file. It takes `(target, branch, { signal, run })` and returns `{ remote, branch, setUpstream } | ExecResult`. For tags we only use `pushTarget.remote`.

- [ ] **Step 2: Run typecheck**

```
bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/system/ssh/git.ts
git commit -m "feat(tags): add pushLocalTag to SSH git layer"
```

---

### Task 4: Wire `pushLocalTag` through `RepoBackend` and write-paths

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo-write-paths.ts`

- [ ] **Step 1: Add `pushLocalTag` to the `RepoBackend` interface**

In `src/server/modules/repo-backend.ts`, find the `RepoBackend` interface. After the `deleteLocalTag` method signature, add:

```ts
pushLocalTag(name: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
```

- [ ] **Step 2: Implement in local backend**

In the `createLocalRepoBackend` function's returned object, after the `deleteLocalTag` method, add:

```ts
async pushLocalTag(name, signal, networkOptions) {
  if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
  return await pushLocalGitTag(repoId, name, signal, networkOptions)
},
```

- [ ] **Step 3: Add import for `pushLocalTag` from git layer**

Find the existing import of `createLocalTag as createLocalGitTag, deleteLocalTag as deleteLocalGitTag, getLocalTags as getLocalGitTags` from `#/system/git/tags.ts`. Add `pushLocalTag as pushLocalGitTag` to that import:

```ts
import {
  createLocalTag as createLocalGitTag,
  deleteLocalTag as deleteLocalGitTag,
  getLocalTags as getLocalGitTags,
  pushLocalTag as pushLocalGitTag,
} from '#/system/git/tags.ts'
```

- [ ] **Step 4: Implement in remote backend**

In the `createRemoteRepoBackend` function's returned object, after the `deleteLocalTag` method, add:

```ts
async pushLocalTag(name, signal) {
  return await pushRemoteLocalTag(target, { name, signal })
},
```

- [ ] **Step 5: Add import for `pushLocalTag` from SSH layer**

Find the existing block of imports from `#/system/ssh/git.ts`. Add `pushLocalTag as pushRemoteLocalTag`:

```ts
  pushLocalTag as pushRemoteLocalTag,
```

(Add it to the existing import group alongside the other tag functions like `createLocalTag as createRemoteLocalTag`, `deleteLocalTag as deleteRemoteLocalTag`.)

- [ ] **Step 6: Add `pushRepositoryLocalTag` to write-paths**

In `src/server/modules/repo-write-paths.ts`, find the existing `deleteRepositoryLocalTag` function. After it, add:

```ts
export async function pushRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.pushLocalTag(name, mergedSignal, networkOptions)
  })
}
```

- [ ] **Step 7: Add import in write-paths**

In `src/server/modules/repo-write-paths.ts`, find the import of `createLocalTag as createLocalGitTag, deleteLocalTag as deleteLocalGitTag` from tags.ts. Update it to not import from tags.ts directly — `pushLocalTag` is now called through the backend interface. No change to the import needed; the backend handles dispatch.

- [ ] **Step 8: Run typecheck**

```
bun run typecheck
```

Expected: No errors. TypeScript will error if `RepoBackend` interface is not fully implemented in both backends.

- [ ] **Step 9: Commit**

```bash
git add src/server/modules/repo-backend.ts src/server/modules/repo-write-paths.ts
git commit -m "feat(tags): add pushLocalTag to RepoBackend and write-paths"
```

---

### Task 5: Add route, RPC types, and web client

**Files:**
- Modify: `src/server/routes/repo.ts`
- Modify: `src/shared/rpc.ts`
- Modify: `src/shared/embedded-server-rpc-routes.ts`
- Modify: `src/web/repo-client.ts`

- [ ] **Step 1: Add route to `src/server/routes/repo.ts`**

Import `pushRepositoryLocalTag` in the existing import block from `#/server/modules/repo-write-paths.ts`:

```ts
  pushRepositoryLocalTag,
```

Add the route handler after the `/delete-local-tag` handler:

```ts
app.post('/push-local-tag', async (c) => {
  const body = await c.req.json().catch(() => null)
  const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
  const name = typeof body?.name === 'string' ? body.name : ''
  const sourceToken = typeof body?.sourceToken === 'string' ? body.sourceToken : undefined
  return c.json(
    await jsonOr(
      () => pushRepositoryLocalTag(cwd, name, c.req.raw.signal, sourceToken),
      { ok: false, message: 'error.failed-read-repo' },
      'push-local-tag',
    ),
  )
})
```

- [ ] **Step 2: Add RPC type to `src/shared/rpc.ts`**

Find the line:
```ts
deleteLocalTag: (input: { cwd: string; name: string }) => Promise<ExecResult>
```

After it, add:
```ts
pushLocalTag: (input: { cwd: string; name: string }) => Promise<ExecResult>
```

- [ ] **Step 3: Register route in `src/shared/embedded-server-rpc-routes.ts`**

After the `'repo.deleteLocalTag'` entry, add:

```ts
'repo.pushLocalTag': { route: '/api/repo/push-local-tag', method: 'POST' },
```

- [ ] **Step 4: Add client wrapper to `src/web/repo-client.ts`**

After the `deleteRepositoryLocalTag` function, add:

```ts
export async function pushRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/push-local-tag', { cwd, name, sourceToken }, { signal })
}
```

- [ ] **Step 5: Run typecheck**

```
bun run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/repo.ts src/shared/rpc.ts src/shared/embedded-server-rpc-routes.ts src/web/repo-client.ts
git commit -m "feat(tags): add push-local-tag route, RPC type, and client wrapper"
```

---

### Task 6: Add i18n keys

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ko.ts`
- Modify: `src/shared/i18n/ja.ts`

- [ ] **Step 1: Add keys to `src/shared/i18n/en.ts`**

Find the line `'tags.refresh': 'Refresh tags',`. After it, add:

```ts
'tags.push': 'Push tag',
'tags.push-success': 'Tag pushed',
```

- [ ] **Step 2: Add keys to `src/shared/i18n/zh.ts`**

Find `'tags.refresh': '刷新标签',`. After it, add:

```ts
'tags.push': '推送标签',
'tags.push-success': '标签已推送',
```

- [ ] **Step 3: Add keys to `src/shared/i18n/ko.ts`**

Find `'tags.refresh': '태그 새로고침',`. After it, add:

```ts
'tags.push': '태그 푸시',
'tags.push-success': '태그를 푸시했습니다',
```

- [ ] **Step 4: Add keys to `src/shared/i18n/ja.ts`**

Find `'tags.refresh': 'タグを更新',`. After it, add:

```ts
'tags.push': 'タグをプッシュ',
'tags.push-success': 'タグをプッシュしました',
```

- [ ] **Step 5: Run typecheck**

```
bun run typecheck
```

Expected: No errors (TypeScript enforces i18n key exhaustiveness).

- [ ] **Step 6: Commit**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ko.ts src/shared/i18n/ja.ts
git commit -m "feat(tags): add push i18n keys"
```

---

### Task 7: Update `ProjectTagsPanel` with push button and improved refresh

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectTagsPanel.tsx`
- Modify: `src/web/components/repo-workspace/ProjectTagsPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/web/components/repo-workspace/ProjectTagsPanel.test.tsx`, add new mock functions to the `mocks` object in `vi.hoisted`:

```ts
const mocks = vi.hoisted(() => ({
  getRepositoryLocalTags: vi.fn(),
  createRepositoryLocalTag: vi.fn(),
  deleteRepositoryLocalTag: vi.fn(),
  fetchRepository: vi.fn(),
  pushRepositoryLocalTag: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
```

Update the mock for `#/web/repo-client.ts`:

```ts
vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryLocalTags: mocks.getRepositoryLocalTags,
  createRepositoryLocalTag: mocks.createRepositoryLocalTag,
  deleteRepositoryLocalTag: mocks.deleteRepositoryLocalTag,
  fetchRepository: mocks.fetchRepository,
  pushRepositoryLocalTag: mocks.pushRepositoryLocalTag,
}))
```

Add to `beforeEach`:

```ts
mocks.fetchRepository.mockReset()
mocks.pushRepositoryLocalTag.mockReset()
mocks.fetchRepository.mockResolvedValue({ ok: true, message: '' })
mocks.pushRepositoryLocalTag.mockResolvedValue({ ok: true, message: '' })
```

Add these new tests:

```ts
test('refresh button calls fetchRepository then loadTags', async () => {
  const { container, root } = await renderPanel()

  const refresh = container.querySelector<HTMLButtonElement>('[data-testid="tags-refresh"]')!
  await act(async () => {
    refresh.click()
  })

  expect(mocks.fetchRepository).toHaveBeenCalledWith('/repo', 'user')
  expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(2)
  await act(async () => root.unmount())
})

test('refresh shows error toast when fetchRepository fails', async () => {
  mocks.fetchRepository.mockResolvedValue({ ok: false, message: 'error.network' })
  const { container, root } = await renderPanel()

  const refresh = container.querySelector<HTMLButtonElement>('[data-testid="tags-refresh"]')!
  await act(async () => {
    refresh.click()
  })

  expect(mocks.toastError).toHaveBeenCalledWith('error.network')
  expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())
})

test('push button calls pushRepositoryLocalTag and shows success toast', async () => {
  const { container, root } = await renderPanel()

  const pushBtn = container.querySelector<HTMLButtonElement>('[data-testid="tag-push-v1-0-0"]')!
  await act(async () => {
    pushBtn.click()
  })

  expect(mocks.pushRepositoryLocalTag).toHaveBeenCalledWith('/repo', 'v1.0.0', expect.any(AbortSignal), expect.any(String))
  expect(mocks.toastSuccess).toHaveBeenCalledWith('tags.push-success')
  await act(async () => root.unmount())
})

test('push button shows error toast when push fails', async () => {
  mocks.pushRepositoryLocalTag.mockResolvedValue({ ok: false, message: 'error.push-no-remote' })
  const { container, root } = await renderPanel()

  const pushBtn = container.querySelector<HTMLButtonElement>('[data-testid="tag-push-v1-0-0"]')!
  await act(async () => {
    pushBtn.click()
  })

  expect(mocks.toastError).toHaveBeenCalledWith('error.push-no-remote')
  await act(async () => root.unmount())
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun run test src/web/components/repo-workspace/ProjectTagsPanel.test.tsx
```

Expected: 4 new tests fail. The existing `refresh` test will also fail because `fetchRepository` is not yet called.

- [ ] **Step 3: Update `ProjectTagsPanel.tsx`**

Replace the imports section at the top to add new imports:

```ts
import { useEffect, useRef, useState } from 'react'
import { ArrowUpFromLine, Loader2, RefreshCw, Search, Tag, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { CreateTagDialog, type CreateTagRequest } from '#/web/components/CreateTagDialog.tsx'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { Input } from '#/web/components/ui/input.tsx'
import { cn } from '#/web/lib/cn.ts'
import {
  createRepositoryLocalTag,
  deleteRepositoryLocalTag,
  fetchRepository,
  getRepositoryLocalTags,
  pushRepositoryLocalTag,
} from '#/web/repo-client.ts'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'
```

Inside `ProjectTagsPanel`, add state for push after the existing state declarations:

```ts
const { pending: pushPending, isPending: isPushPending, run: runPush } = useAsyncPending<'push'>()
const [pushingTag, setPushingTag] = useState<string | null>(null)
```

Replace the `handleRefresh` inline call (currently `onClick={() => void loadTags()}`) with a named function. Add before the return:

```ts
async function handleRefresh() {
  const result = await fetchRepository(repoId, 'user')
  if (!result.ok) {
    toast.error(t(result.message))
    return
  }
  await loadTags()
}

async function handlePushTag(tag: string) {
  setPushingTag(tag)
  try {
    const ctrl = new AbortController()
    const sourceToken = `push-tag-${Date.now()}`
    const result = await pushRepositoryLocalTag(repoId, tag, ctrl.signal, sourceToken)
    if (!result.ok) {
      toast.error(t(result.message))
      return
    }
    toast.success(t('tags.push-success'))
  } finally {
    setPushingTag(null)
  }
}
```

Update the Refresh button's `onClick`:

```tsx
onClick={() => void handleRefresh()}
```

Inside the tag list row (`<div key={tag} className="group flex items-center gap-2 px-3 py-2 text-sm">`), add the push button before the delete button:

```tsx
<Button
  type="button"
  variant="ghost"
  size="icon-sm"
  data-testid={`tag-push-${tagToTestId(tag)}`}
  disabled={isPushPending}
  aria-label={t('tags.push')}
  title={t('tags.push')}
  onClick={() => void runPush('push', () => handlePushTag(tag))}
  className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
>
  {pushPending === 'push' && pushingTag === tag ? (
    <Loader2 className="size-3.5 animate-spin" />
  ) : (
    <ArrowUpFromLine className="size-3.5" />
  )}
</Button>
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun run test src/web/components/repo-workspace/ProjectTagsPanel.test.tsx
```

Expected: All tests pass including the updated refresh test.

- [ ] **Step 5: Run full test suite**

```
bun run test
```

Expected: No regressions.

- [ ] **Step 6: Run typecheck**

```
bun run typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/web/components/repo-workspace/ProjectTagsPanel.tsx src/web/components/repo-workspace/ProjectTagsPanel.test.tsx
git commit -m "feat(tags): add push button and upgrade refresh to fetch from remote"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```
bun run test
```

Expected: All tests pass.

- [ ] **Step 2: Run architecture check**

```
bun run check:architecture
```

Expected: No violations.

- [ ] **Step 3: Run typecheck**

```
bun run typecheck
```

Expected: Clean.

# Non-Git Directory Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow opening any readable local directory as a workspace tab; non-git directories show a placeholder with an "Initialize Git Repository" button while the terminal remains fully functional.

**Architecture:** Add `isGitRepo?: boolean` to `ProbeResult` so the server can signal "readable but not git" without returning `ok: false`. Mirror this as `isGitRepo: boolean` on `RepoState`. The branch area in the UI gates on this flag to show either `BranchList` (existing) or a new `NonGitRepoPlaceholder` component.

**Tech Stack:** TypeScript, React (Zustand store), Hono (server routes), Vitest (tests), execa (git subprocess), lucide-react (icons), sonner (toasts)

---

### Task 1: Add `isGitRepo` to shared `ProbeResult` type

**Files:**
- Modify: `src/shared/rpc.ts`

- [ ] **Step 1: Add the field**

In `src/shared/rpc.ts`, find:
```ts
export interface ProbeResult {
  ok: boolean
  root?: string
  name?: string
  message?: string
}
```
Replace with:
```ts
export interface ProbeResult {
  ok: boolean
  root?: string
  name?: string
  message?: string
  /** undefined or true = git repo; false = readable directory that is not a git repo */
  isGitRepo?: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/rpc.ts
git commit -m "feat(types): add isGitRepo field to ProbeResult"
```

---

### Task 2: Add `isGitRepo` to `RepoState` and `emptyRepo`

**Files:**
- Modify: `src/web/stores/repos/types.ts`
- Modify: `src/web/stores/repos/helpers.ts`

- [ ] **Step 1: Add field to `RepoState`**

In `src/web/stores/repos/types.ts`, find the `RepoState` interface and add `isGitRepo: boolean` after `name`:

```ts
export interface RepoState {
  /** Absolute repo root — also the unique id. */
  id: string
  name: string
  isGitRepo: boolean
  // ...rest unchanged
```

- [ ] **Step 2: Initialize field in `emptyRepo`**

In `src/web/stores/repos/helpers.ts`, find `emptyRepo` and add `isGitRepo: true` after `name`:

```ts
export function emptyRepo(id: string, name: string): RepoState {
  return {
    id,
    name,
    isGitRepo: true,
    instanceToken: nextInstanceToken++,
    // ...rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add src/web/stores/repos/types.ts src/web/stores/repos/helpers.ts
git commit -m "feat(store): add isGitRepo to RepoState, default true"
```

---

### Task 3: Server — probe returns ok for readable non-git directories

**Files:**
- Modify: `src/server/modules/repo-backend.ts`
- Modify: `src/server/modules/repo.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/server/modules/repo.test.ts`, find the `describe('probeRepository path errors'` block (around line 614) and add a new test after the existing three:

```ts
test('returns ok with isGitRepo:false for readable non-git directory', async () => {
  mocks.fsStat.mockResolvedValueOnce({ isDirectory: () => true })
  mocks.fsAccess.mockResolvedValueOnce(undefined)
  mocks.isGitRepo.mockResolvedValueOnce(false)

  const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
  await expect(probeRepository('/tmp/notgit')).resolves.toEqual({
    ok: true,
    root: '/tmp/notgit',
    name: 'notgit',
    isGitRepo: false,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/server/modules/repo.test.ts --reporter=verbose 2>&1 | tail -30
```
Expected: test fails (probe still returns `{ ok: false, message: 'error.not-git-repo' }`)

- [ ] **Step 3: Implement the change in `repo-backend.ts`**

In `src/server/modules/repo-backend.ts`, find `createLocalRepoBackend`'s `probe()` method. Replace:

```ts
async probe() {
  if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-path' }
  const gitAvailable = await checkGitAvailable()
  if (!gitAvailable.ok) return gitAvailable
  const readable = await probeReadableDirectory(repoId)
  if (!readable.ok) return readable
  const ok = await isGitRepo(repoId)
  if (!ok) return { ok: false, message: 'error.not-git-repo' }
  const root = await getRepoRoot(repoId)
  if (!root) return { ok: false, message: 'error.failed-read-repo' }
  const name = await getRepoName(repoId)
  return { ok: true, root, name }
},
```

With:

```ts
async probe() {
  if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-path' }
  const gitAvailable = await checkGitAvailable()
  if (!gitAvailable.ok) return gitAvailable
  const readable = await probeReadableDirectory(repoId)
  if (!readable.ok) return readable
  const gitRepo = await isGitRepo(repoId)
  if (!gitRepo) {
    return { ok: true, root: repoId, name: path.basename(repoId), isGitRepo: false }
  }
  const root = await getRepoRoot(repoId)
  if (!root) return { ok: false, message: 'error.failed-read-repo' }
  const name = await getRepoName(repoId)
  return { ok: true, root, name, isGitRepo: true }
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/server/modules/repo.test.ts --reporter=verbose 2>&1 | tail -30
```
Expected: all tests in that file pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/repo-backend.ts src/server/modules/repo.test.ts
git commit -m "feat(server): probe returns ok for readable non-git directories"
```

---

### Task 4: Propagate `isGitRepo: false` from probe into `RepoState`

**Files:**
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`

The `resolveRepoPath` function calls `probeRepository` and constructs a `ResolvedRepo` object. We need to carry `isGitRepo` through to `RepoState`.

- [ ] **Step 1: Update `ResolvedRepo` interface and `resolveRepoPath`**

In `src/web/stores/repos/lifecycle-write-paths.ts`, find:

```ts
interface ResolvedRepo {
  id: string
  name: string
  target?: RemoteRepoTarget
}
```

Replace with:

```ts
interface ResolvedRepo {
  id: string
  name: string
  isGitRepo?: boolean
  target?: RemoteRepoTarget
}
```

Then in `resolveRepoPath`, find:

```ts
    return {
      input: entry.id,
      reason: null,
      repo: {
        id: probe.root,
        name: probe.name ?? (entry.kind === 'remote' ? entry.ref.displayName : lastPathSegment(probe.root)),
        ...(target ? { target } : {}),
      },
      target,
    }
```

Replace with:

```ts
    return {
      input: entry.id,
      reason: null,
      repo: {
        id: probe.root,
        name: probe.name ?? (entry.kind === 'remote' ? entry.ref.displayName : lastPathSegment(probe.root)),
        isGitRepo: probe.isGitRepo ?? true,
        ...(target ? { target } : {}),
      },
      target,
    }
```

- [ ] **Step 2: Apply `isGitRepo` in `addResolvedRepo`**

In the same file, find `addResolvedRepo`. It calls `emptyRepo(id, name)` then returns the result. After the `emptyRepo` call, set `isGitRepo`:

Find:
```ts
  const repo = restoreRepoProjectionFromSnapshot(emptyRepo(id, name), s.restorableRepoCache[id])
  if (resolvedRepo.target) repo.remote.target = resolvedRepo.target
```

Replace with:
```ts
  const repo = restoreRepoProjectionFromSnapshot(emptyRepo(id, name), s.restorableRepoCache[id])
  if (resolvedRepo.target) repo.remote.target = resolvedRepo.target
  if (resolvedRepo.isGitRepo === false) repo.isGitRepo = false
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 4: Commit**

```bash
git add src/web/stores/repos/lifecycle-write-paths.ts
git commit -m "feat(store): propagate isGitRepo:false from probe into RepoState"
```

---

### Task 5: Add `git init` system function

**Files:**
- Create: `src/system/git/init.ts`
- Modify: `src/server/modules/repo-write-paths.ts`

- [ ] **Step 1: Create `src/system/git/init.ts`**

```ts
import { gitResult } from '#/system/git/helper.ts'
import type { ExecResult } from '#/shared/git-types.ts'

export async function initRepository(cwd: string): Promise<ExecResult> {
  return await gitResult(cwd, 'init')
}
```

- [ ] **Step 2: Add `initRepository` export in `repo-write-paths.ts`**

At the top of `src/server/modules/repo-write-paths.ts`, add the import alongside the other git imports:

```ts
import { initRepository as gitInit } from '#/system/git/init.ts'
```

Then at the end of the file, export a server-level function:

```ts
export async function initRepository(cwd: string): Promise<ExecResult> {
  if (!isValidCwd(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await gitInit(cwd)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/system/git/init.ts src/server/modules/repo-write-paths.ts
git commit -m "feat(git): add initRepository (git init) to system and write-paths"
```

---

### Task 6: Register `POST /repo/init` route

**Files:**
- Modify: `src/server/routes/repo.ts`

- [ ] **Step 1: Add import and route**

In `src/server/routes/repo.ts`, add `initRepository` to the write-paths import:

```ts
import {
  // ...existing imports...
  initRepository,
} from '#/server/modules/repo-write-paths.ts'
```

Then after the last `app.post(...)` call, add:

```ts
  app.post('/init', async (c) => {
    const body = await c.req.json().catch(() => null)
    const cwd = typeof body?.cwd === 'string' ? body.cwd : ''
    return c.json(await jsonOr(() => initRepository(cwd), { ok: false, message: 'error.failed-read-repo' }, 'init'))
  })
```

- [ ] **Step 2: Commit**

```bash
git add src/server/routes/repo.ts
git commit -m "feat(server): register POST /repo/init route"
```

---

### Task 7: Add `initRepository` client function

**Files:**
- Modify: `src/web/repo-client.ts`

- [ ] **Step 1: Add client function**

In `src/web/repo-client.ts`, add after `cloneRepository`:

```ts
export async function initRepository(cwd: string): Promise<ExecResult> {
  return await postServerJson('/api/repo/init', { cwd })
}
```

Note: `ExecResult` is already imported from `'#/shared/git-types.ts'` at the top of this file.

- [ ] **Step 2: Commit**

```bash
git add src/web/repo-client.ts
git commit -m "feat(client): add initRepository RPC call"
```

---

### Task 8: Add `initGitRepository` store action

**Files:**
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`
- Modify: `src/web/stores/repos/lifecycle.ts`
- Modify: `src/web/stores/repos/types.ts`

The action lives in lifecycle since it mutates repo open/close state.

- [ ] **Step 1: Add action type to `RuntimeCoherentRepoProjectionActions` in `types.ts`**

In `src/web/stores/repos/types.ts`, inside `RuntimeCoherentRepoProjectionActions`, add:

```ts
  /** Initialize the directory at `id` as a git repo, then refresh. */
  initGitRepository: (id: string) => Promise<ExecResult>
```

- [ ] **Step 2: Implement action in `lifecycle-write-paths.ts`**

At the top of `src/web/stores/repos/lifecycle-write-paths.ts`, add these imports:

```ts
import { initRepository as initRepositoryRpc } from '#/web/repo-client.ts'
import { replaceRepoState } from '#/web/stores/repos/helpers.ts'
import { runRepoRefreshIntent } from '#/web/stores/repos/refresh-coordinator.ts'
```

Then in `createRuntimeRepoLifecycleActions`, add `initGitRepository` alongside `ensureWorkspaceOpen` and `closeRepo`:

```ts
    async initGitRepository(id: string): Promise<ExecResult> {
      const result = await initRepositoryRpc(id)
      if (!result.ok) return result
      set((s) => {
        const repo = s.repos[id]
        if (!repo) return s
        return replaceRepoState(s, repo, (draft) => {
          draft.isGitRepo = true
        })
      })
      const repo = get().repos[id]
      if (repo) {
        void runRepoRefreshIntent(get, {
          kind: 'core-data-changed',
          reason: 'initial-load',
          id,
          token: repo.instanceToken,
        })
      }
      return result
    },
```

- [ ] **Step 3: Expose the action in `lifecycle.ts`**

In `src/web/stores/repos/lifecycle.ts`, the `createLifecycleActions` function spreads `createRuntimeRepoLifecycleActions(set, get)` which already includes `initGitRepository` — no change needed here. Verify the export is correct:

```bash
grep -n "createRuntimeRepoLifecycleActions\|initGitRepository" src/web/stores/repos/lifecycle.ts src/web/stores/repos/lifecycle-write-paths.ts
```
Expected: `createRuntimeRepoLifecycleActions` appears in both files, `initGitRepository` appears in `lifecycle-write-paths.ts`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/web/stores/repos/types.ts src/web/stores/repos/lifecycle-write-paths.ts
git commit -m "feat(store): add initGitRepository action"
```

---

### Task 9: Add i18n strings for non-git placeholder

**Files:**
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Add keys to `en.ts`**

In `src/shared/i18n/en.ts`, near the `branches.*` section, add:

```ts
  'non-git.init-button': 'Initialize Git Repository',
  'non-git.init-failed': 'Failed to initialize repository',
```

- [ ] **Step 2: Add keys to other languages**

In `src/shared/i18n/zh.ts`:
```ts
  'non-git.init-button': '初始化 Git 仓库',
  'non-git.init-failed': '初始化仓库失败',
```

In `src/shared/i18n/ja.ts`:
```ts
  'non-git.init-button': 'Git リポジトリを初期化',
  'non-git.init-failed': 'リポジトリの初期化に失敗しました',
```

In `src/shared/i18n/ko.ts`:
```ts
  'non-git.init-button': 'Git 저장소 초기화',
  'non-git.init-failed': '저장소 초기화 실패',
```

- [ ] **Step 3: Verify dict keys compile**

The dict type is derived from `en.ts` so adding these keys to all files is enough:
```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts
git commit -m "feat(i18n): add non-git placeholder strings"
```

---

### Task 10: Create `NonGitRepoPlaceholder` component

**Files:**
- Create: `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { GitIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { Button } from '#/web/components/ui/button.tsx'

interface Props {
  repoId: string
}

export function NonGitRepoPlaceholder({ repoId }: Props) {
  const t = useT()
  const initGitRepository = useReposStore((s) => s.initGitRepository)
  const [loading, setLoading] = useState(false)

  async function handleInit() {
    setLoading(true)
    const result = await initGitRepository(repoId)
    setLoading(false)
    if (!result.ok) {
      toast.error(t('non-git.init-failed'), { description: result.message })
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <p className="max-w-full truncate text-[11px] text-muted-foreground" title={repoId}>
        {repoId}
      </p>
      <Button onClick={handleInit} disabled={loading} size="sm">
        <GitIcon size={14} className="mr-1.5" />
        {t('non-git.init-button')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx
git commit -m "feat(ui): add NonGitRepoPlaceholder component"
```

---

### Task 11: Wire `NonGitRepoPlaceholder` into `BranchArea`

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`

- [ ] **Step 1: Add import and conditional render**

At the top of `src/web/components/repo-workspace/RepoExplorerPane.tsx`, add:

```ts
import { NonGitRepoPlaceholder } from '#/web/components/repo-workspace/NonGitRepoPlaceholder.tsx'
```

Then in the `BranchArea` function, update to read `isGitRepo` and conditionally render:

Find:
```tsx
function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Toolbar data-testid="branch-area-toolbar" className="px-2" variant="detail">
        <BranchFilterControls
          repoId={repoId}
          className="h-full min-w-0 flex-1 gap-1"
          searchClassName="max-w-[calc(100%_-_5.5rem)]"
        />
      </Toolbar>
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}
```

Replace with:

```tsx
function BranchArea({ repoId, showActions }: { repoId: string; showActions: boolean }) {
  const isGitRepo = useReposStore((s) => s.repos[repoId]?.isGitRepo ?? true)

  if (!isGitRepo) {
    return (
      <section className="flex min-h-0 flex-1 flex-col">
        <NonGitRepoPlaceholder repoId={repoId} />
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <Toolbar data-testid="branch-area-toolbar" className="px-2" variant="detail">
        <BranchFilterControls
          repoId={repoId}
          className="h-full min-w-0 flex-1 gap-1"
          searchClassName="max-w-[calc(100%_-_5.5rem)]"
        />
      </Toolbar>
      <BranchList repoId={repoId} showActions={showActions} />
    </section>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/repo-workspace/RepoExplorerPane.tsx
git commit -m "feat(ui): show NonGitRepoPlaceholder when isGitRepo is false"
```

---

### Task 12: Full run — tests and typecheck

- [ ] **Step 1: Run all tests**

```bash
npx vitest run 2>&1 | tail -40
```
Expected: all tests pass. If any fail, read the output and fix before continuing.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1
```
Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Final commit (if any files changed during fixes)**

```bash
git status
# Only commit if there are changes from fix steps
git add <changed files>
git commit -m "fix: address typecheck/test issues in non-git support"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Open non-git directory without error → Tasks 3, 4
- ✅ Branch area shows path + init button → Tasks 9, 10, 11
- ✅ Terminal is available (no changes needed — terminal only needs repoId path, unaffected) → no task needed
- ✅ `git init` runs and refreshes → Tasks 5, 6, 7, 8
- ✅ After init, normal git branch view appears (isGitRepo flips to true, refreshCoreData loads branches) → Task 8
- ✅ Init failure shows error toast → Task 10

**Type consistency check:**
- `ProbeResult.isGitRepo` defined in Task 1, read in Task 3 (server) and Task 4 (client lifecycle)
- `RepoState.isGitRepo` defined in Task 2, written in Task 4, read in Task 8 and Task 11
- `initGitRepository` defined in Task 8's types, implemented in Task 8, called in Task 10
- `initRepository` (server write-path) defined in Task 5, routed in Task 6, called from client in Task 7
- `initRepository` (client RPC) defined in Task 7, called in `initRepositoryRpc` alias in Task 8
- i18n keys `non-git.init-button` and `non-git.init-failed` defined in Task 9, used in Task 10

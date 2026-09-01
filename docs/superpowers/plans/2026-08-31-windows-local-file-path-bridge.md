# Windows Local File Path Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared Windows/WSL path-identity bridge, keep remote synchronization attached to the original workspace member, and adapt explicit Windows/WSL paths in the open-repository dialog.

**Architecture:** A pure shared module classifies explicit Windows drive, UNC, standard WSL mount, WSL UNC, WSL locator, and contextual POSIX forms. Repository lifecycle compares the probed Git root through that identity without changing the stored repository key, while a small web projection helper maps explicit user input into the existing Local/WSL form model. Git execution continues to follow the opened project type, never the active terminal shell.

**Tech Stack:** TypeScript strip-only mode, React, Zustand, Bun, Vitest, existing `remote-repo.ts` and `path-semantics.ts` primitives.

**Spec:** `docs/superpowers/specs/2026-08-31-windows-local-file-path-bridge-design.md`

**Execution:** Run inline in this session with `executing-plans`, `test-driven-development`, and `verification-before-completion`. Do not dispatch subagents. Commit each green task locally; do not push, merge, clean worktrees, remove existing duplicate projects, or modify the independent `windows/` package.

---

## File Responsibility Map

- Create `src/shared/local-file-path-bridge.ts`: pure recognition, normalization, stable identity, and explicit Windows/WSL locator conversion.
- Create `src/shared/local-file-path-bridge.test.ts`: exhaustive bridge matrix and malformed/ambiguous input coverage.
- Modify `src/shared/path-semantics.ts` and `src/shared/path-semantics.test.ts`: retain relative/containment and low-level Windows identity only; move local-host comparison ownership to the bridge.
- Modify `src/server/modules/branch-workspace-plan.ts`, `src/server/modules/branch-workspace-read.ts`, and `src/web/components/repo-workspace/branch-workspace-member-target.ts`: import the canonical local-host comparison from the bridge.
- Modify `src/web/stores/repos/lifecycle-write-paths.ts`: retain the current repository key during equivalent root reprobe and reject genuine root changes.
- Modify `src/web/stores/repos/refresh.test.ts`: reproduce the Windows workspace-member duplicate/fetch failure and root-mismatch safety cases.
- Modify `src/shared/i18n/en.ts`, `src/shared/i18n/zh.ts`, `src/shared/i18n/ja.ts`, and `src/shared/i18n/ko.ts`: localize the repository-root-change diagnostic.
- Modify `src/web/lib/open-repo-dialog.ts` and `src/web/lib/open-repo-dialog.test.ts`: project recognized input into the existing Local/WSL form state.
- Modify `src/web/components/OpenRepositoryDialog.tsx` and `src/web/components/OpenRepositoryDialog.test.tsx`: apply the projection while editing and prove submitted locators.

### Task 1: Build The Pure Local File Path Bridge

**Files:**

- Create: `src/shared/local-file-path-bridge.test.ts`
- Create: `src/shared/local-file-path-bridge.ts`

- [ ] **Step 1: Write the failing recognition and identity tests**

Create tests that pin the public union and conversion behavior:

```ts
import { describe, expect, test } from 'vitest'
import {
  localFilePathIdentityKey,
  resolveLocalFilePath,
  sameLocalFilePath,
} from '#/shared/local-file-path-bridge.ts'

describe('local file path bridge', () => {
  test('unifies native Windows drives with standard WSL mounts', () => {
    expect(sameLocalFilePath('C:\\Users\\dev\\repo', 'c:/users/dev/repo')).toBe(true)
    expect(sameLocalFilePath('C:\\Users\\dev\\repo', '/mnt/c/Users/dev/repo')).toBe(true)
    expect(resolveLocalFilePath('/mnt/c/Users/dev/repo')).toMatchObject({
      execution: 'windows',
      inputKind: 'wsl-drive-mount',
      projectPath: 'C:\\Users\\dev\\repo',
    })
  })

  test('keeps ordinary UNC paths Windows-local', () => {
    expect(resolveLocalFilePath('\\\\server\\share\\Repo')).toMatchObject({
      execution: 'windows',
      inputKind: 'windows-unc',
      projectPath: '\\\\server\\share\\Repo',
    })
    expect(sameLocalFilePath('\\\\SERVER\\SHARE\\Repo', '\\\\server\\share\\repo')).toBe(true)
  })

  test('unifies WSL locators and both WSL UNC hosts', () => {
    const locator = 'wsl://Ubuntu/home/dev/repo'
    expect(sameLocalFilePath(locator, '\\\\wsl.localhost\\ubuntu\\home\\dev\\repo')).toBe(true)
    expect(sameLocalFilePath(locator, '\\\\wsl$\\Ubuntu\\home\\dev\\repo')).toBe(true)
    expect(resolveLocalFilePath('\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo')).toMatchObject({
      execution: 'wsl',
      inputKind: 'wsl-unc',
      distribution: 'Ubuntu',
      linuxPath: '/home/dev/repo',
      projectPath: locator,
    })
  })

  test('requires WSL context for a bare Linux path', () => {
    expect(resolveLocalFilePath('/home/dev/repo')).toMatchObject({ execution: 'posix' })
    expect(resolveLocalFilePath('/home/dev/repo', { kind: 'wsl', distribution: 'Ubuntu' })).toMatchObject({
      execution: 'wsl',
      distribution: 'Ubuntu',
      linuxPath: '/home/dev/repo',
      projectPath: 'wsl://Ubuntu/home/dev/repo',
    })
    expect(
      sameLocalFilePath('wsl://Ubuntu/home/dev/repo', '/home/dev/repo', {
        kind: 'wsl',
        distribution: 'Ubuntu',
      }),
    ).toBe(true)
  })

  test('keeps Linux path case significant inside one distribution', () => {
    expect(sameLocalFilePath('wsl://Ubuntu/home/dev/Repo', 'wsl://ubuntu/home/dev/repo')).toBe(false)
  })

  test('rejects remote SSH identifiers, relative paths, and malformed input', () => {
    expect(localFilePathIdentityKey('ssh-config://example/srv/repo')).toBeNull()
    expect(resolveLocalFilePath('repo')).toBeNull()
    expect(resolveLocalFilePath('C:repo')).toBeNull()
    expect(resolveLocalFilePath('\\\\wsl$\\\\home\\dev')).toBeNull()
    expect(resolveLocalFilePath('/home/\0/repo')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the bridge test and verify RED**

Run:

```bash
bun run test src/shared/local-file-path-bridge.test.ts
```

Expected: FAIL because `#/shared/local-file-path-bridge.ts` does not exist.

- [ ] **Step 3: Implement the discriminated pure bridge**

Create `src/shared/local-file-path-bridge.ts` with this complete pure implementation:

```ts
import { isWslRepoId, normalizeRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { pathStyle, windowsPathIdentityKey } from '#/shared/path-semantics.ts'

export type LocalFilePathContext =
  | { kind: 'windows' }
  | { kind: 'wsl'; distribution: string }
  | { kind: 'posix' }

export type LocalFilePathResolution =
  | {
      execution: 'windows'
      inputKind: 'windows-drive' | 'windows-unc' | 'wsl-drive-mount'
      identityKey: string
      projectPath: string
      windowsPath: string
    }
  | {
      execution: 'wsl'
      inputKind: 'wsl-repo-id' | 'wsl-unc' | 'posix'
      identityKey: string
      projectPath: string
      distribution: string
      linuxPath: string
    }
  | {
      execution: 'posix'
      inputKind: 'posix'
      identityKey: string
      projectPath: string
      posixPath: string
    }

export function resolveLocalFilePath(
  input: string,
  context?: LocalFilePathContext,
): LocalFilePathResolution | null {
  if (hasUnsafeText(input)) return null

  const wslRepo = resolveWslRepoId(input)
  if (wslRepo) return wslRepo

  const wslUnc = resolveWslUnc(input)
  if (wslUnc) return wslUnc

  const windowsDrive = resolveWindowsDrive(input, 'windows-drive')
  if (windowsDrive) return windowsDrive

  const posixPath = normalizePosixAbsolute(input)
  if (posixPath) {
    const mount = WSL_MOUNT_RE.exec(posixPath)
    if (mount) {
      const drive = (mount[1] ?? '').toUpperCase()
      const tail = mount[2] ?? ''
      return resolveWindowsDrive(`${drive}:/${tail}`, 'wsl-drive-mount')
    }
    if (context?.kind === 'wsl') return wslResolution('posix', context.distribution, posixPath)
    return {
      execution: 'posix',
      inputKind: 'posix',
      identityKey: `posix:${posixPath}`,
      projectPath: posixPath,
      posixPath,
    }
  }

  if (pathStyle(input) === 'windowsUncAbsolute') return resolveWindowsUnc(input)
  return null
}

export function localFilePathIdentityKey(input: string, context?: LocalFilePathContext): string | null {
  return resolveLocalFilePath(input, context)?.identityKey ?? null
}

export function sameLocalFilePath(left: string, right: string, context?: LocalFilePathContext): boolean {
  const leftIdentity = localFilePathIdentityKey(left, context)
  const rightIdentity = localFilePathIdentityKey(right, context)
  return leftIdentity !== null && leftIdentity === rightIdentity
}

const WINDOWS_DRIVE_RE = /^([A-Za-z]):[\\/](.*)$/u
const WSL_MOUNT_RE = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/u
const WSL_UNC_RE = /^\\\\(wsl\.localhost|wsl\$)[\\/]([^\\/\0]+)[\\/](.*)$/iu

function resolveWslRepoId(input: string): LocalFilePathResolution | null {
  if (!isWslRepoId(input)) return null
  const ref = parseRemoteRepoId(input)
  if (!ref || ref.transport !== 'wsl') return null
  return wslResolution('wsl-repo-id', ref.alias, ref.remotePath)
}

function resolveWslUnc(input: string): LocalFilePathResolution | null {
  const match = WSL_UNC_RE.exec(input)
  if (!match) return null
  const distribution = match[2] ?? ''
  const linuxPath = normalizePosixAbsolute(`/${(match[3] ?? '').replace(/\\/gu, '/')}`)
  return linuxPath ? wslResolution('wsl-unc', distribution, linuxPath) : null
}

function wslResolution(
  inputKind: 'wsl-repo-id' | 'wsl-unc' | 'posix',
  distribution: string,
  linuxPath: string,
): LocalFilePathResolution | null {
  try {
    const projectPath = normalizeRemoteRepoId({ transport: 'wsl', alias: distribution, remotePath: linuxPath })
    return {
      execution: 'wsl',
      inputKind,
      identityKey: `wsl:${encodeURIComponent(distribution.toLowerCase())}:${linuxPath}`,
      projectPath,
      distribution,
      linuxPath,
    }
  } catch {
    return null
  }
}

function resolveWindowsDrive(
  input: string,
  inputKind: 'windows-drive' | 'wsl-drive-mount',
): LocalFilePathResolution | null {
  const match = WINDOWS_DRIVE_RE.exec(input)
  if (!match) return null
  const drive = (match[1] ?? '').toUpperCase()
  const tail = normalizeAbsoluteParts((match[2] ?? '').split(/[\\/]+/u))
  const windowsPath = `${drive}:\\${tail.join('\\')}`
  const windowsIdentity = windowsPathIdentityKey(windowsPath)
  if (!windowsIdentity) return null
  return {
    execution: 'windows',
    inputKind,
    identityKey: `windows:${windowsIdentity}`,
    projectPath: windowsPath,
    windowsPath,
  }
}

function resolveWindowsUnc(input: string): LocalFilePathResolution | null {
  const parts = input.slice(2).split(/[\\/]+/u)
  const root = parts.slice(0, 2)
  if (root.length !== 2 || root.some((part) => !part)) return null
  const tail = normalizeAbsoluteParts(parts.slice(2))
  const windowsPath = `\\\\${[...root, ...tail].join('\\')}`
  const windowsIdentity = windowsPathIdentityKey(windowsPath)
  if (!windowsIdentity) return null
  return {
    execution: 'windows',
    inputKind: 'windows-unc',
    identityKey: `windows:${windowsIdentity}`,
    projectPath: windowsPath,
    windowsPath,
  }
}

function normalizeAbsoluteParts(parts: string[]): string[] {
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') normalized.pop()
    else normalized.push(part)
  }
  return normalized
}

function normalizePosixAbsolute(value: string): string | null {
  if (!value.startsWith('/') || hasUnsafeText(value)) return null
  return `/${normalizeAbsoluteParts(value.split('/')).join('/')}`
}

function hasUnsafeText(value: string): boolean {
  return value.length === 0 || /[\x00-\x1f\x7f]/u.test(value)
}
```

- [ ] **Step 4: Run the bridge test and verify GREEN**

Run:

```bash
bun run test src/shared/local-file-path-bridge.test.ts
```

Expected: all bridge matrix tests PASS.

- [ ] **Step 5: Commit the pure bridge**

```bash
git add src/shared/local-file-path-bridge.ts src/shared/local-file-path-bridge.test.ts
git commit -m "feat(paths): add Windows WSL path bridge"
```

### Task 2: Make The Bridge The Canonical Local-Host Comparator

**Files:**

- Modify: `src/shared/path-semantics.ts`
- Modify: `src/shared/path-semantics.test.ts`
- Modify: `src/server/modules/branch-workspace-plan.ts`
- Modify: `src/server/modules/branch-workspace-read.ts`
- Modify: `src/web/components/repo-workspace/branch-workspace-member-target.ts`

- [ ] **Step 1: Move local-host comparison coverage to the bridge test**

Delete the `sameLocalHostPath` import and its describe block from `path-semantics.test.ts`. Preserve the POSIX lexical-equivalence assertion by adding this case to `local-file-path-bridge.test.ts`:

```ts
test('matches lexically equivalent POSIX paths without changing case semantics', () => {
  expect(sameLocalFilePath('/srv/projects/other/../repo', '/srv/projects/repo')).toBe(true)
  expect(sameLocalFilePath('/srv/Repo', '/srv/repo')).toBe(false)
})
```

- [ ] **Step 2: Remove the superseded comparator and use the bridge directly**

Remove `sameLocalHostPath`, `windowsOrWslPathIdentityKey`, and `posixPathIdentityKey` from `path-semantics.ts`. Keep `windowsPathIdentityKey` there as the low-level Windows lexical primitive used by terminal/worktree safety code and by the bridge.

Replace the three direct imports and calls:

```ts
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
```

Use `sameLocalFilePath(left, right)` in `branch-workspace-plan.ts`, `branch-workspace-read.ts`, and `branch-workspace-member-target.ts` without changing their existing remote-POSIX branches.

- [ ] **Step 3: Run affected identity tests**

Run:

```bash
bun run test src/shared/path-semantics.test.ts src/shared/local-file-path-bridge.test.ts src/shared/worktree-guards.test.ts src/server/modules/branch-workspace-plan.test.ts src/server/modules/branch-workspace-read.test.ts src/web/components/repo-workspace/branch-workspace-member-target.test.ts
```

Expected: all six listed test files PASS.

- [ ] **Step 4: Commit canonical comparator migration**

```bash
git add src/shared/path-semantics.ts src/shared/path-semantics.test.ts src/shared/local-file-path-bridge.test.ts src/server/modules/branch-workspace-plan.ts src/server/modules/branch-workspace-read.ts src/web/components/repo-workspace/branch-workspace-member-target.ts
git commit -m "refactor(paths): centralize local host identity"
```

### Task 3: Keep Synchronization On The Original Workspace Member

**Files:**

- Modify: `src/web/stores/repos/refresh.test.ts`
- Modify: `src/web/stores/repos/lifecycle-write-paths.ts`
- Modify: `src/web/stores/repos/refresh.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

- [ ] **Step 1: Write failing Windows synchronization regression tests**

Add two tests under the existing manual-refresh describe block in `refresh.test.ts`. The first seeds `C:\\workspace\\api` as a member whose `workspaceRootId` is `C:\\workspace`, sets project order to only the workspace root, makes `repo.probe` report `C:/Workspace/api`, and records RPC cwd values:

```ts
test('manual sync keeps an equivalent Git-for-Windows root on the original workspace member', async () => {
  const memberId = 'C:\\workspace\\api'
  const reportedId = 'C:/Workspace/api'
  const workspaceRootId = 'C:\\workspace'
  const token = seedRepoState({
    id: memberId,
    remote: { remotes: ['origin'], hasRemotes: true },
  }).instanceToken
  useReposStore.setState((state) => ({
    order: [workspaceRootId],
    repos: {
      ...state.repos,
      [memberId]: replaceRepo(state.repos[memberId]!, (repo) => {
        repo.workspaceRootId = workspaceRootId
      }),
    },
  }))
  const calls = { fetch: [] as string[], snapshot: [] as string[], status: [] as string[] }
  rpcHandlers['repo.probe'] = async () => ({ ok: true, root: reportedId, name: 'api', isGitRepo: true })
  rpcHandlers['repo.fetch'] = async ({ cwd }: { cwd: string }) => {
    calls.fetch.push(cwd)
    return { ok: true, message: 'ok' }
  }
  rpcHandlers['repo.snapshot'] = async ({ cwd }: { cwd: string }) => {
    calls.snapshot.push(cwd)
    return { branches: [branch('main')], current: 'main' }
  }
  rpcHandlers['repo.status'] = async ({ cwd }: { cwd: string }) => {
    calls.status.push(cwd)
    return []
  }

  await expect(useReposStore.getState().syncAndRefresh(memberId, { token })).resolves.toEqual({
    ok: true,
    message: 'ok',
  })

  const state = useReposStore.getState()
  expect(state.order).toEqual([workspaceRootId])
  expect(state.repos[reportedId]).toBeUndefined()
  expect(state.repos[memberId]?.workspaceRootId).toBe(workspaceRootId)
  expect(calls).toEqual({ fetch: [memberId], snapshot: [memberId], status: [memberId] })
})
```

Add the root-mismatch safety case:

```ts
test('manual sync rejects a genuinely different repository root without importing it', async () => {
  const memberId = 'C:\\workspace\\api'
  const movedId = 'D:/moved/api'
  const workspaceRootId = 'C:\\workspace'
  const token = seedRepoState({
    id: memberId,
    remote: { remotes: ['origin'], hasRemotes: true },
  }).instanceToken
  useReposStore.setState((state) => ({
    order: [workspaceRootId],
    repos: {
      ...state.repos,
      [memberId]: replaceRepo(state.repos[memberId]!, (repo) => {
        repo.workspaceRootId = workspaceRootId
      }),
    },
  }))
  const calls = { fetch: 0, snapshot: 0, status: 0 }
  rpcHandlers['repo.probe'] = async () => ({ ok: true, root: movedId, name: 'api', isGitRepo: true })
  rpcHandlers['repo.fetch'] = async () => {
    calls.fetch += 1
    return { ok: true, message: 'ok' }
  }
  rpcHandlers['repo.snapshot'] = async () => {
    calls.snapshot += 1
    return { branches: [], current: '' }
  }
  rpcHandlers['repo.status'] = async () => {
    calls.status += 1
    return []
  }

  await expect(useReposStore.getState().syncAndRefresh(memberId, { token })).resolves.toEqual({
    ok: false,
    message: 'error.repository-root-changed',
  })

  const state = useReposStore.getState()
  expect(state.order).toEqual([workspaceRootId])
  expect(state.repos[movedId]).toBeUndefined()
  expect(state.repos[memberId]?.availability).toMatchObject({
    phase: 'unavailable',
    reason: 'error.repository-root-changed',
  })
  expect(calls).toEqual({ fetch: 0, snapshot: 0, status: 0 })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts
```

Expected: the equivalent-root case FAILS because the reported spelling becomes a new top-level repository, and the moved-root case FAILS because no root-change guard exists.

- [ ] **Step 3: Canonicalize reprobe to the existing repository key**

Import the bridge and add one local helper in `lifecycle-write-paths.ts`:

```ts
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'

function repositoryIdAfterReprobe(
  current: Pick<ReposStore['repos'][string], 'id' | 'remote'>,
  resolved: ResolvedRepo,
): string | null {
  if (current.remote.target || resolved.target || isRemoteRepoId(current.id) || isRemoteRepoId(resolved.id)) {
    return current.id === resolved.id ? current.id : null
  }
  return sameLocalFilePath(current.id, resolved.id) ? current.id : null
}
```

After the fresh-token check and successful probe, replace the existing `resolvedRepo` block with this flow:

```ts
const canonicalId = repositoryIdAfterReprobe(fresh, resolved.repo)
if (!canonicalId) {
  const message = 'error.repository-root-changed'
  let nextToken = token
  set((s) => {
    const repo = s.repos[id]
    if (!repo || repo.instanceToken !== token) return s
    const nextRepo = replaceRepo(repo, (draft) => {
      rotateRepoInstanceToken(draft)
      resetRepoOperations(draft)
      markRepoUnavailable(draft, message)
    })
    nextToken = nextRepo.instanceToken
    return { repos: { ...s.repos, [id]: nextRepo } }
  })
  return { kind: 'unavailable', id, token: nextToken, message }
}

const resolvedRepo = { ...resolved.repo, id: canonicalId }
let changed: boolean | null = null
set((s) => {
  const repo = s.repos[canonicalId]
  if (!repo || repo.instanceToken !== token) return s
  const result = addResolvedRepo(s, resolvedRepo)
  changed = result.changed
  return result.changed ? { repos: result.repos, order: result.order } : s
})

const nextRepo = get().repos[canonicalId]
if (changed === null || !nextRepo) return { kind: 'stale' }
return {
  kind: 'available',
  id: canonicalId,
  token: nextRepo.instanceToken,
  isGitRepo: nextRepo.isGitRepo,
  changed,
}
```

This branch does not call `ensureWorkspaceOpen`, `recordRecentRepo`, `importWorkspace`, or project-order insertion.

Because rotating the repository token intentionally makes the enclosing operation stale, retain that safety and translate only this persisted root-change state back into the explicit sync result after `runExclusiveOperation` returns `null`:

```ts
if (result !== null) return result
const repoAfterReprobe = get().repos[id]
return repoAfterReprobe?.instanceToken !== token &&
  repoAfterReprobe?.availability.phase === 'unavailable' &&
  repoAfterReprobe.availability.reason === 'error.repository-root-changed'
  ? { ok: false as const, message: repoAfterReprobe.availability.reason }
  : null
```

- [ ] **Step 4: Add the localized root-change diagnostic**

Add the same key to all four dictionaries beside the repository read errors:

```ts
// en.ts
'error.repository-root-changed': 'The repository root changed. Reopen the project before synchronizing.',

// zh.ts
'error.repository-root-changed': '仓库根目录已发生变化，请重新打开项目后再同步。',

// ja.ts
'error.repository-root-changed': 'リポジトリのルートが変更されました。同期する前にプロジェクトを開き直してください。',

// ko.ts
'error.repository-root-changed': '저장소 루트가 변경되었습니다. 동기화하기 전에 프로젝트를 다시 여세요.',
```

- [ ] **Step 5: Run synchronization and dictionary tests**

Run:

```bash
bun run test src/web/stores/repos/refresh.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: both Windows regression cases and all existing refresh/i18n cases PASS.

- [ ] **Step 6: Commit the synchronization fix**

```bash
git add src/web/stores/repos/refresh.test.ts src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/refresh.ts src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts docs/superpowers/plans/2026-08-31-windows-local-file-path-bridge.md
git commit -m "fix(repo): preserve workspace member during sync"
```

### Task 4: Adapt Explicit Windows And WSL Open Paths

**Files:**

- Modify: `src/web/lib/open-repo-dialog.test.ts`
- Modify: `src/web/lib/open-repo-dialog.ts`
- Modify: `src/web/components/OpenRepositoryDialog.test.tsx`
- Modify: `src/web/components/OpenRepositoryDialog.tsx`

- [ ] **Step 1: Write failing pure form-projection tests**

Import `projectOpenRepositoryPathInput` in `open-repo-dialog.test.ts` and add:

```ts
describe('projectOpenRepositoryPathInput', () => {
  test('projects WSL locators and UNC paths into WSL fields', () => {
    expect(
      projectOpenRepositoryPathInput('\\\\wsl.localhost\\ubuntu\\home\\dev\\repo', {
        source: 'local',
        distribution: '',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'wsl', distribution: 'Ubuntu', path: '/home/dev/repo' })
    expect(
      projectOpenRepositoryPathInput('wsl://Ubuntu/home/dev/repo', {
        source: 'local',
        distribution: '',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'wsl', distribution: 'Ubuntu', path: '/home/dev/repo' })
  })

  test('projects a standard WSL drive mount back to Local', () => {
    expect(
      projectOpenRepositoryPathInput('/mnt/c/Users/dev/repo', {
        source: 'wsl',
        distribution: 'Ubuntu',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'local', distribution: 'Ubuntu', path: 'C:\\Users\\dev\\repo' })
  })

  test('does not guess a distribution for a bare Linux path', () => {
    expect(
      projectOpenRepositoryPathInput('/home/dev/repo', {
        source: 'local',
        distribution: '',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'local', distribution: '', path: '/home/dev/repo' })
    expect(
      projectOpenRepositoryPathInput('/home/dev/repo', {
        source: 'wsl',
        distribution: 'Ubuntu',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'wsl', distribution: 'Ubuntu', path: '/home/dev/repo' })
  })
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
bun run test src/web/lib/open-repo-dialog.test.ts
```

Expected: FAIL because `projectOpenRepositoryPathInput` is not exported.

- [ ] **Step 3: Implement deterministic form projection**

Add the helper to `open-repo-dialog.ts`:

```ts
import { resolveLocalFilePath, type LocalFilePathContext } from '#/shared/local-file-path-bridge.ts'

interface OpenRepositoryPathState {
  source: OpenRepositorySource
  distribution: string
  distributions: readonly string[]
}

export interface OpenRepositoryPathProjection {
  source: OpenRepositorySource
  distribution: string
  path: string
}

export function projectOpenRepositoryPathInput(
  input: string,
  state: OpenRepositoryPathState,
): OpenRepositoryPathProjection {
  const distribution = state.distribution.trim()
  const context: LocalFilePathContext | undefined =
    state.source === 'wsl' && distribution ? { kind: 'wsl', distribution } : undefined
  const resolution = resolveLocalFilePath(input, context)
  if (!resolution || resolution.execution === 'posix') {
    return { source: state.source, distribution: state.distribution, path: input }
  }
  if (resolution.execution === 'windows') {
    const path = resolution.inputKind === 'wsl-drive-mount' ? resolution.projectPath : input
    return { source: 'local', distribution: state.distribution, path }
  }
  const registeredDistribution =
    state.distributions.find((item) => item.toLowerCase() === resolution.distribution.toLowerCase()) ??
    resolution.distribution
  return {
    source: 'wsl',
    distribution: registeredDistribution,
    path: resolution.linuxPath,
  }
}
```

- [ ] **Step 4: Write failing dialog integration tests**

Add these Windows component cases to `OpenRepositoryDialog.test.tsx`:

```tsx
test('adapts a WSL UNC path pasted from PowerShell and submits a WSL locator', async () => {
  wslImportMocks.hostPlatform = 'win32'
  const onOpen = vi.fn(async (): Promise<OpenRepoResult> => ({
    ok: true,
    id: 'wsl://Ubuntu/home/dev/repo',
  }))
  render(<OpenRepositoryDialog open onClose={vi.fn()} onOpen={onOpen} />)
  await flush()

  setInputValue('#open-repo-path', '\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo')
  await flush()

  expect(buttonByText('repo-tabs.open-source-wsl').getAttribute('data-variant')).toBe('default')
  expect(input('#open-repo-wsl-distribution').value).toBe('Ubuntu')
  expect(input('#open-repo-path').value).toBe('/home/dev/repo')
  click('button[type="submit"]')
  await flush()

  expect(onOpen).toHaveBeenCalledWith('wsl://Ubuntu/home/dev/repo')
})

test('adapts a WSL drive mount to a native Local path', async () => {
  wslImportMocks.hostPlatform = 'win32'
  const onOpen = vi.fn(async (): Promise<OpenRepoResult> => ({
    ok: true,
    id: 'C:\\Users\\dev\\repo',
  }))
  render(<OpenRepositoryDialog open initialSource="wsl" onClose={vi.fn()} onOpen={onOpen} />)
  await flush()

  setInputValue('#open-repo-path', '/mnt/c/Users/dev/repo')
  await flush()

  expect(buttonByText('repo-tabs.open-source-local').getAttribute('data-variant')).toBe('default')
  expect(input('#open-repo-path').value).toBe('C:\\Users\\dev\\repo')
  click('button[type="submit"]')
  await flush()

  expect(onOpen).toHaveBeenCalledWith('C:\\Users\\dev\\repo')
})
```

- [ ] **Step 5: Run the component test and verify RED**

Run:

```bash
bun run test src/web/components/OpenRepositoryDialog.test.tsx
```

Expected: the dialog keeps the old source and submits the unadapted input.

- [ ] **Step 6: Apply projection from the path input**

Import `projectOpenRepositoryPathInput` beside `OpenRepositorySource`. Replace the path input change handler with:

```tsx
onChange={(event) => {
  const input = event.target.value
  if (!supportsWslImport) {
    setPath(input)
  } else {
    const projection = projectOpenRepositoryPathInput(input, {
      source,
      distribution,
      distributions,
    })
    setSource(projection.source)
    setDistribution(projection.distribution)
    setPath(projection.path)
  }
  setError(null)
}}
```

Keep native-picker results, source buttons, distribution edits, submit validation, and server-side WSL availability checks on their current paths.

- [ ] **Step 7: Run all open-dialog tests**

Run:

```bash
bun run test src/web/lib/open-repo-dialog.test.ts src/web/components/OpenRepositoryDialog.test.tsx
```

Expected: all pure projection and component submission tests PASS.

- [ ] **Step 8: Commit adaptive open-path handling**

```bash
git add src/web/lib/open-repo-dialog.ts src/web/lib/open-repo-dialog.test.ts src/web/components/OpenRepositoryDialog.tsx src/web/components/OpenRepositoryDialog.test.tsx
git commit -m "feat(repo): adapt Windows and WSL open paths"
```

### Task 5: Verify Scope, Architecture, And Regression Safety

**Files:**

- Modify only files already touched if formatting or valid review fixes require it.

- [ ] **Step 1: Format changed implementation files**

Run the repository's configured formatter on the exact implementation files:

```bash
bunx prettier --write src/shared/local-file-path-bridge.ts src/shared/local-file-path-bridge.test.ts src/shared/path-semantics.ts src/shared/path-semantics.test.ts src/server/modules/branch-workspace-plan.ts src/server/modules/branch-workspace-read.ts src/web/components/repo-workspace/branch-workspace-member-target.ts src/web/stores/repos/lifecycle-write-paths.ts src/web/stores/repos/refresh.ts src/web/stores/repos/refresh.test.ts src/shared/i18n/en.ts src/shared/i18n/zh.ts src/shared/i18n/ja.ts src/shared/i18n/ko.ts src/web/lib/open-repo-dialog.ts src/web/lib/open-repo-dialog.test.ts src/web/components/OpenRepositoryDialog.tsx src/web/components/OpenRepositoryDialog.test.tsx
```

Expected: Prettier completes without an error and changes only those files.

- [ ] **Step 2: Run the focused feature slice**

Run:

```bash
bun run test src/shared/local-file-path-bridge.test.ts src/shared/path-semantics.test.ts src/web/stores/repos/refresh.test.ts src/web/lib/open-repo-dialog.test.ts src/web/components/OpenRepositoryDialog.test.tsx
```

Expected: all focused tests PASS with no unhandled async work.

- [ ] **Step 3: Run repository gates**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: typecheck and architecture PASS. Record the full-suite count and distinguish any known platform baseline failures from failures introduced by this change; do not claim a green full suite unless the fresh command is green.

- [ ] **Step 4: Inspect the final diff and safety boundaries**

Run:

```bash
git diff --check f57be655..HEAD
git status --short
git diff --stat f57be655..HEAD
git diff f57be655..HEAD -- src package.json bun.lock
```

Expected: no whitespace errors, no dependency changes, no `windows/` package edits, no real user paths or identifiers in fixtures, no import/open call in the synchronization path, and only planned files changed.

- [ ] **Step 5: Apply verification-before-completion and leave external actions for the user**

Summarize fresh evidence, commits, remaining packaged-Windows smoke coverage, and the intentionally deferred choices: whether to design safe cleanup for already-persisted duplicates, whether to port the bridge into the independent `windows/` package, and whether to push or merge the local commits.

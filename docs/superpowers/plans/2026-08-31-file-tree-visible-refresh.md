# File Tree Visible Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a root-level Files refresh immediately reload the worktree root and every currently expanded directory so externally changed files appear without collapsing the tree.

**Architecture:** Keep directory entries as component-local renderer state and reuse the existing `loadDirectory()` read path. A new root-level refresh callback snapshots the visible expanded directory nodes, then reloads those directories together with the worktree root; directory-specific context-menu refresh remains narrowly scoped to its target.

**Tech Stack:** React 19, TypeScript 6 in Node.js strip-only mode, Vitest 4, Bun 1.3.

## Global Constraints

- Preserve current expansion state and any selection whose node still exists after refresh.
- Do not scan collapsed or previously unvisited directories.
- Do not add file watchers, polling, realtime invalidation, persistence, database changes, server routes, or shared API changes.
- Keep local, WSL, and SSH-backed file trees on the same existing `getRepositoryFileTree()` contract.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions; no new import is required.
- Do not create commits, branches, or worktrees as part of this plan.
- Preserve all unrelated existing worktree changes.

---

### Task 1: Refresh Visible Expanded Directories

**Files:**

- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Test: `src/web/components/file-tree/ProjectFileTree.test.tsx`

**Interfaces:**

- Consumes: existing `loadDirectory(relativePath: string, absolutePath: string, signal?: AbortSignal)` and `flatNodes: FileTreeNode[]`.
- Produces: component-local `refreshVisibleTree(): void`, used by the toolbar and empty-area root refresh actions.

- [x] **Step 1: Write the failing component regression test**

Add this test beside the existing toolbar refresh test in `src/web/components/file-tree/ProjectFileTree.test.tsx`:

```tsx
test('refreshes the root and expanded directories from the file tree toolbar', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })

  await render(<ProjectFileTree repoId="/repo" />)

  await act(async () => {
    treeItemByText('src').click()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(container?.textContent).toContain('app.ts')

  getRepositoryFileTree.mockClear()
  getRepositoryFileTree
    .mockImplementationOnce(async (_repoId, worktreePath, dirPath) => ({
      ok: true,
      worktreePath,
      dirPath,
      entries: [
        { name: 'src', absolutePath: '/repo/src', relativePath: 'src', kind: 'directory' },
        { name: 'README.md', absolutePath: '/repo/README.md', relativePath: 'README.md', kind: 'file' },
      ],
    }))
    .mockImplementationOnce(async (_repoId, worktreePath, dirPath) => ({
      ok: true,
      worktreePath,
      dirPath,
      entries: [
        { name: 'app.ts', absolutePath: '/repo/src/app.ts', relativePath: 'src/app.ts', kind: 'file' },
        { name: 'new.ts', absolutePath: '/repo/src/new.ts', relativePath: 'src/new.ts', kind: 'file' },
      ],
    }))

  const refreshButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.refresh"]')
  if (!refreshButton) throw new Error('missing refresh button')

  await act(async () => {
    refreshButton.click()
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(getRepositoryFileTree).toHaveBeenCalledTimes(2)
  expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo', undefined)
  expect(getRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', '/repo/src', undefined)
  expect(treeItemByText('src').getAttribute('aria-selected')).toBe('true')
  expect(container?.textContent).toContain('new.ts')
})
```

- [x] **Step 2: Run the regression test and verify RED**

Run:

```bash
bun run test "src/web/components/file-tree/ProjectFileTree.test.tsx" -- -t "refreshes the root and expanded directories from the file tree toolbar"
```

Expected: FAIL because the current toolbar callback requests only `/repo`; `/repo/src` is not reloaded and `new.ts` is absent.

- [x] **Step 3: Implement the minimal visible-tree refresh callback**

Add this callback after `refreshTreeDirectory` in `src/web/components/file-tree/ProjectFileTree.tsx`:

```tsx
const refreshVisibleTree = useCallback(() => {
  if (!worktreePath) return
  const targets = [
    { relativePath: ROOT_DIR, absolutePath: worktreePath },
    ...flatNodes
      .filter((node) => node.expanded && isExpandableNode(node))
      .map((node) => ({ relativePath: node.relativePath, absolutePath: node.absolutePath })),
  ]
  for (const target of targets) {
    void loadDirectory(target.relativePath, target.absolutePath)
  }
}, [flatNodes, loadDirectory, worktreePath])
```

Route both root-level refresh affordances through it by replacing each exact occurrence of:

```tsx
onRefresh={() => refreshTreeDirectory(rootCreateEntryTarget())}
```

with:

```tsx
onRefresh = { refreshVisibleTree }
```

Keep `refreshTreeDirectory()` and `refreshDirectoryForContextNode()` unchanged so a directory row's context-menu refresh still reloads only that selected directory or file parent.

- [x] **Step 4: Run the regression test and verify GREEN**

Run:

```bash
bun run test "src/web/components/file-tree/ProjectFileTree.test.tsx" -- -t "refreshes the root and expanded directories from the file tree toolbar"
```

Expected: PASS with two reads: `/repo` and `/repo/src`.

- [x] **Step 5: Run the complete file-tree component test file**

Run:

```bash
bun run test "src/web/components/file-tree/ProjectFileTree.test.tsx"
```

Expected: all `ProjectFileTree` tests pass.

- [x] **Step 6: Run project verification**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: typecheck and architecture checks pass. Full tests introduce no failure beyond the recorded pre-existing `src/server/terminal/terminal-catalog-shell-override.test.ts:42` baseline failure; if that baseline test also passes on the final run, the full suite is green.

### Task 2: Ignore Stale Directory Responses

**Files:**

- Modify: `src/web/components/file-tree/ProjectFileTree.tsx`
- Test: `src/web/components/file-tree/ProjectFileTree.test.tsx`

**Interfaces:**

- Consumes: existing component-local `loadDirectory()` request lifecycle.
- Produces: a component-local latest-request token per relative directory path; no public API changes.

- [x] **Step 1: Write the failing out-of-order response test**

Add a component test that starts an unresolved directory expansion read, performs a newer root-level refresh that returns `new.ts`, then resolves the older read with `old.ts`:

```tsx
test('ignores a stale expanded-directory response after a newer refresh completes', async () => {
  seedRepoWithSelectedBranch({ hasWorktree: true })

  await render(<ProjectFileTree repoId="/repo" />)

  let resolveStaleDirectory = (_result: RepoFileTreeResult) => {}
  const staleDirectoryRequest = new Promise<RepoFileTreeResult>((resolve) => {
    resolveStaleDirectory = resolve
  })
  getRepositoryFileTree.mockImplementationOnce(async () => await staleDirectoryRequest)

  await act(async () => {
    treeItemByText('src').click()
    await Promise.resolve()
  })

  getRepositoryFileTree
    .mockImplementationOnce(async (_repoId, worktreePath, dirPath) => ({
      ok: true,
      worktreePath,
      dirPath,
      entries: [
        { name: 'src', absolutePath: '/repo/src', relativePath: 'src', kind: 'directory' },
        { name: 'README.md', absolutePath: '/repo/README.md', relativePath: 'README.md', kind: 'file' },
      ],
    }))
    .mockImplementationOnce(async (_repoId, worktreePath, dirPath) => ({
      ok: true,
      worktreePath,
      dirPath,
      entries: [{ name: 'new.ts', absolutePath: '/repo/src/new.ts', relativePath: 'src/new.ts', kind: 'file' }],
    }))

  const refreshButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-tree.refresh"]')
  if (!refreshButton) throw new Error('missing refresh button')

  await act(async () => {
    refreshButton.click()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(container?.textContent).toContain('new.ts')

  await act(async () => {
    resolveStaleDirectory({
      ok: true,
      worktreePath: '/repo',
      dirPath: '/repo/src',
      entries: [{ name: 'old.ts', absolutePath: '/repo/src/old.ts', relativePath: 'src/old.ts', kind: 'file' }],
    })
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(container?.textContent).toContain('new.ts')
  expect(container?.textContent).not.toContain('old.ts')
})
```

- [x] **Step 2: Run the out-of-order response test and verify RED**

Run:

```bash
bun run test "src/web/components/file-tree/ProjectFileTree.test.tsx" -- -t "ignores a stale expanded-directory response after a newer refresh completes"
```

Expected: FAIL because the unresolved older response replaces the newer `new.ts` entry with `old.ts`.

- [x] **Step 3: Add latest-request tokens to `loadDirectory()`**

Create one request-token map beside the existing directory refs:

```tsx
const latestDirectoryRequestTokensRef = useRef(new Map<string, symbol>())
```

Immediately after the existing `if (!worktreePath) return null` guard in `loadDirectory()`, create and store a unique token for the relative directory path:

```tsx
const requestToken = Symbol(relativePath)
latestDirectoryRequestTokensRef.current.set(relativePath, requestToken)
```

Replace the existing response guard after `getRepositoryFileTree()` with:

```tsx
if (
  signal?.aborted ||
  activeWorktreeRef.current !== worktreePath ||
  latestDirectoryRequestTokensRef.current.get(relativePath) !== requestToken
) {
  return null
}
```

Clear the token map in the existing repo/worktree reset effect before starting the new root read so responses from the previous context cannot commit.

- [x] **Step 4: Run the out-of-order response test and verify GREEN**

Run:

```bash
bun run test "src/web/components/file-tree/ProjectFileTree.test.tsx" -- -t "ignores a stale expanded-directory response after a newer refresh completes"
```

Expected: PASS; the newer `new.ts` result remains visible after the older response resolves.

- [x] **Step 5: Strengthen the visible-refresh test and rerun the component suite**

Add this entry to the root refresh mock in `refreshes the root and expanded directories from the file tree toolbar`:

```tsx
{ name: 'ROOT_NEW.md', absolutePath: '/repo/ROOT_NEW.md', relativePath: 'ROOT_NEW.md', kind: 'file' },
```

Add this assertion beside the existing `new.ts` assertion:

```tsx
expect(container?.textContent).toContain('ROOT_NEW.md')
```

Then run:

```bash
bun run test "src/web/components/file-tree/ProjectFileTree.test.tsx"
```

Expected: all `ProjectFileTree` tests pass, covering applied root and expanded-directory results.

- [x] **Step 6: Repeat project verification**

Run:

```bash
bunx prettier --check "src/web/components/file-tree/ProjectFileTree.tsx" "src/web/components/file-tree/ProjectFileTree.test.tsx" "docs/superpowers/plans/2026-08-31-file-tree-visible-refresh.md"
bun run typecheck
bun run check:architecture
bun run test
```

Expected: formatting, typecheck, and architecture checks pass. Full tests retain only the recorded pre-existing baseline failure, unless that unrelated test also becomes green.

## Plan Self-Review

- Spec coverage: the tasks cover root refresh, all visible expanded directories, expansion/selection preservation through stable local state, unchanged targeted directory refresh, and latest-request-wins ordering.
- Scope control: no automatic watching, persistence, database, server, transport, or dependency changes are included.
- Placeholder scan: no unresolved placeholders, deferred implementation, or unspecified error-handling steps remain.
- Type consistency: `refreshVisibleTree(): void` consumes existing `flatNodes`, `worktreePath`, and `loadDirectory()` values without adding public interfaces.

# Branch Workspace Member Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark exact branch workspace member worktrees with a neutral `branch workspace` badge in a workspace repository's ordinary worktree list.

**Architecture:** `BranchList` derives member paths from the active workspace's existing branch workspace query snapshot, using configured repository-member identity plus exact worktree paths. It passes one presentation flag through `BranchRow` to `BranchSummaryInline`, which owns the localized neutral badge. No server, shared protocol, persistence, or realtime changes are introduced.

**Tech Stack:** React 19, TypeScript 6 in Node strip-only mode, TanStack Query, Zustand, Tailwind CSS 4, Vitest, Bun.

## Global Constraints

- Use `子工作区` in Chinese and `branch workspace` in English for the badge.
- Match membership by configured repository member name and exact worktree path; never infer it from a branch name.
- Exclude member records whose `progress` is `removed`.
- Show the badge only inside the currently active multi-repository workspace project.
- Reuse the existing branch workspace query and invalidation path; add no server or persisted state.
- Keep examples and tests privacy-safe with generic paths and identifiers.
- Use repo-alias imports with explicit `.ts` or `.tsx` extensions.
- Do not use enum declarations, runtime namespaces, parameter properties, or import aliases.
- Do not run Git commits because the project instructions require explicit user authorization.

---

## Scope And File Structure

- Modify `src/shared/i18n/en.ts`, `zh.ts`, `ja.ts`, and `ko.ts` to own one dedicated localized badge label.
- Modify `src/shared/i18n/dictionaries.test.ts` to lock the four labels and dictionary alignment.
- Modify `src/web/components/repo-workspace/BranchSummaryInline.tsx` to own neutral badge presentation and tooltip context.
- Modify `src/web/components/branch-list/BranchRow.tsx` to pass the explicit presentation flag without deriving membership.
- Modify `src/web/components/branch-list/BranchRow.test.tsx` to cover badge rendering and defensive worktree gating.
- Modify `src/web/components/BranchList.tsx` to derive current member paths from existing workspace/query data.
- Modify `src/web/components/BranchList.test.tsx` to cover active-workspace scope, exact-path matching, removed records, and standalone scope.

No new production file is needed: the membership projection has one caller and remains small enough to keep inside `BranchList`.

### Task 1: Add Dedicated Localized Badge Copy

**Files:**

- Test: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**

- Produces: `DictKey` value `workspace.branch-workspace.member-badge` in all four dictionaries.

- [x] **Step 1: Write the failing dictionary test**

Add this test beside the existing branch workspace terminology tests:

```ts
test('uses concise branch workspace member badge copy in every locale', () => {
  expect(en['workspace.branch-workspace.member-badge']).toBe('branch workspace')
  expect(zh['workspace.branch-workspace.member-badge']).toBe('子工作区')
  expect(ja['workspace.branch-workspace.member-badge']).toBe('ブランチワークスペース')
  expect(ko['workspace.branch-workspace.member-badge']).toBe('브랜치 워크스페이스')
})
```

- [x] **Step 2: Run the test and verify RED**

Run `bun run test src/shared/i18n/dictionaries.test.ts`.

Expected: FAIL because `workspace.branch-workspace.member-badge` is absent.

- [x] **Step 3: Add the four dictionary values**

Place each key beside `workspace.branch-workspace.list`:

```ts
// en.ts
'workspace.branch-workspace.member-badge': 'branch workspace',

// zh.ts
'workspace.branch-workspace.member-badge': '子工作区',

// ja.ts
'workspace.branch-workspace.member-badge': 'ブランチワークスペース',

// ko.ts
'workspace.branch-workspace.member-badge': '브랜치 워크스페이스',
```

- [x] **Step 4: Run the test and verify GREEN**

Run `bun run test src/shared/i18n/dictionaries.test.ts`.

Expected: PASS with no dictionary-alignment failure.

### Task 2: Render The Neutral Member Badge

**Files:**

- Test: `src/web/components/branch-list/BranchRow.test.tsx`
- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchSummaryInline.tsx`

**Interfaces:**

- Consumes: `workspace.branch-workspace.member-badge` from Task 1.
- Produces: optional `branchWorkspaceMember?: boolean` prop on `BranchRow` and `BranchSummaryInline`.
- Produces: `data-testid="branch-workspace-member-badge"` on the visible badge.

- [x] **Step 1: Extend the test translator and write the failing badge test**

Add this translator case in `BranchRow.test.tsx`:

```ts
case 'workspace.branch-workspace.member-badge':
  return '子工作区'
```

Add a focused test:

```tsx
test('shows a neutral branch workspace badge for a flagged member worktree', () => {
  const repo = emptyRepo('/tmp/repo', 'repo')
  const branch = createRepoBranch('feature/member', {
    worktree: { path: '/tmp/member-worktree' },
  })

  render(
    <ul>
      <BranchRow
        repo={repo}
        branch={branch}
        branchWorkspaceMember
        selected={null}
        onSelectBranch={vi.fn()}
        selectedRef={createRef<HTMLLIElement>()}
        showActions={false}
      />
    </ul>,
  )

  const badge = document.querySelector('[data-testid="branch-workspace-member-badge"]')
  expect(badge?.textContent).toBe('子工作区')
  expect(badge?.getAttribute('data-variant')).toBe('outline')
  expect(document.querySelector('[title*="子工作区"]')).not.toBeNull()
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run `bun run test src/web/components/branch-list/BranchRow.test.tsx`.

Expected: FAIL because no member badge is rendered.

- [x] **Step 3: Thread the explicit presentation prop**

Add `branchWorkspaceMember?: boolean` to both prop interfaces. Destructure it in `BranchRow` and pass it to `BranchSummaryInline`:

```tsx
<BranchSummaryInline
  repo={repo}
  branch={branch}
  displayName={displayName}
  branchWorkspaceMember={branchWorkspaceMember}
  selected={isSelected}
  className="w-full"
/>
```

In `BranchSummaryInline`, defensively gate the flag by actual worktree presence:

```ts
const isBranchWorkspaceMember = hasWorktree && branchWorkspaceMember === true
const branchWorkspaceMemberLabel = isBranchWorkspaceMember ? t('workspace.branch-workspace.member-badge') : null
```

Include `branchWorkspaceMemberLabel` in the `title` array after worktree state. Render the badge after `commitHashTag` and before terminal state:

```tsx
{
  branchWorkspaceMemberLabel ? (
    <Badge
      data-testid="branch-workspace-member-badge"
      variant="outline"
      className="h-4 px-1 text-[10px] font-normal text-muted-foreground"
    >
      {branchWorkspaceMemberLabel}
    </Badge>
  ) : null
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run `bun run test src/web/components/branch-list/BranchRow.test.tsx`.

Expected: PASS, including existing terminal and dirty badge tests.

### Task 3: Derive Exact Membership In The Worktree List

**Files:**

- Test: `src/web/components/BranchList.test.tsx`
- Modify: `src/web/components/BranchList.tsx`

**Interfaces:**

- Consumes: `useBranchWorkspaceQuery(rootId: string)` and `activeWorkspaceRootId(state)`.
- Consumes: workspace `repositoryIds`, `candidates`, and query snapshot `items[].repositories[]`.
- Produces: `branchWorkspaceMember` boolean for each `BranchRow`.

- [x] **Step 1: Add a controllable branch workspace query mock**

Add a hoisted state object and mock in `BranchList.test.tsx`:

```ts
const branchWorkspaceQueryState = vi.hoisted(() => ({
  data: undefined as BranchWorkspaceReadResult | undefined,
  rootId: '',
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceQuery: (rootId: string) => {
    branchWorkspaceQueryState.rootId = rootId
    return { data: branchWorkspaceQueryState.data }
  },
}))
```

Import `BranchWorkspaceReadResult` from `#/shared/branch-workspaces.ts`. Reset `data` and `rootId` in `beforeEach`. Add `workspace.branch-workspace.member-badge` → `子工作区` to the mocked translator.

- [x] **Step 2: Add complete test-local fixtures and write the failing active-workspace membership test**

Add these fixtures below `renderList`:

```ts
const WORKSPACE_ROOT_ID = '/tmp/workspace'
const MEMBER_WORKTREE_PATH = '/tmp/workspace/hobgoblin-feature/member-repo'

function successfulBranchWorkspaceRead(
  progress: 'complete' | 'removed' = 'complete',
): Extract<BranchWorkspaceReadResult, { ok: true }> {
  return {
    ok: true,
    rootId: WORKSPACE_ROOT_ID,
    auxiliaryCandidates: [],
    items: [
      {
        id: 'branch-1',
        rootId: WORKSPACE_ROOT_ID,
        branch: 'feature/member',
        directoryName: 'hobgoblin-feature',
        path: '/tmp/workspace/hobgoblin-feature',
        state: progress === 'removed' ? { kind: 'needs-action', action: 'continue-reduce' } : { kind: 'ready' },
        available: true,
        issues: [],
        repositories: [
          {
            repositoryName: 'member-repo',
            targetBranch: 'feature/member',
            baseBranch: 'main',
            branchOrigin: 'created',
            worktreePath: MEMBER_WORKTREE_PATH,
            progress,
            ready: progress === 'complete',
          },
        ],
        auxiliaryEntries: [],
      },
    ],
  }
}

function seedWorkspaceMembershipFixture(activeProjectId: string, progress: 'complete' | 'removed' = 'complete') {
  const repo = seedRepoState({
    id: REPO_ID,
    branches: [
      createRepoBranch('feature/member', { worktree: { path: MEMBER_WORKTREE_PATH } }),
      createRepoBranch('feature/other', { worktree: { path: '/tmp/other-worktree' } }),
    ],
    currentBranch: 'main',
    selectedBranch: 'feature/member',
  })
  repo.workspaceRootId = WORKSPACE_ROOT_ID
  useReposStore.setState({
    repos: { [REPO_ID]: repo },
    activeId: REPO_ID,
    activeProjectId,
    workspaceProjects: {
      [WORKSPACE_ROOT_ID]: {
        rootId: WORKSPACE_ROOT_ID,
        repositoryIds: [REPO_ID],
        candidates: [{ id: REPO_ID, name: 'member-repo', selected: true, available: true }],
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
  })
  branchWorkspaceQueryState.data = successfulBranchWorkspaceRead(progress)
}
```

Then add the active-workspace test:

```tsx
test('marks only exact current branch workspace member worktrees', () => {
  seedWorkspaceMembershipFixture(WORKSPACE_ROOT_ID)

  renderList()

  const rows = Array.from(container?.querySelectorAll('li') ?? [])
  const memberRow = rows.find((row) => row.textContent?.includes('feature/member'))
  const otherRow = rows.find((row) => row.textContent?.includes('feature/other'))
  expect(branchWorkspaceQueryState.rootId).toBe(WORKSPACE_ROOT_ID)
  expect(memberRow?.querySelector('[data-testid="branch-workspace-member-badge"]')?.textContent).toBe('子工作区')
  expect(otherRow?.querySelector('[data-testid="branch-workspace-member-badge"]')).toBeNull()
})
```

- [x] **Step 3: Write exclusion tests for removed and standalone membership**

Add two independent tests:

```ts
test('does not mark removed branch workspace members', () => {
  seedWorkspaceMembershipFixture(WORKSPACE_ROOT_ID, 'removed')

  renderList()

  expect(branchWorkspaceQueryState.rootId).toBe(WORKSPACE_ROOT_ID)
  expect(container?.querySelector('[data-testid="branch-workspace-member-badge"]')).toBeNull()
})

test('does not mark workspace members when the repository is active standalone', () => {
  seedWorkspaceMembershipFixture(REPO_ID)

  renderList()

  expect(branchWorkspaceQueryState.rootId).toBe('')
  expect(container?.querySelector('[data-testid="branch-workspace-member-badge"]')).toBeNull()
})
```

- [x] **Step 4: Run the focused list test and verify RED**

Run `bun run test src/web/components/BranchList.test.tsx`.

Expected: FAIL because `BranchList` does not derive or pass membership.

- [x] **Step 5: Derive current member paths from existing state and query data**

In `BranchList.tsx`:

```ts
const workspaceRootId = useReposStore(activeWorkspaceRootId)
const workspaceRepositoryName = useReposStore((state) => {
  if (!workspaceRootId) return null
  const workspace = state.workspaceProjects[workspaceRootId]
  if (!workspace?.repositoryIds.includes(repoId)) return null
  return workspace.candidates.find((candidate) => candidate.id === repoId && candidate.selected)?.name ?? null
})
const branchWorkspaceQuery = useBranchWorkspaceQuery(workspaceRootId ?? '')
const branchWorkspaceMemberPaths = useMemo(() => {
  const paths = new Set<string>()
  if (!workspaceRepositoryName || !branchWorkspaceQuery.data?.ok) return paths
  for (const item of branchWorkspaceQuery.data.items) {
    for (const member of item.repositories) {
      if (member.repositoryName === workspaceRepositoryName && member.progress !== 'removed') {
        paths.add(member.worktreePath)
      }
    }
  }
  return paths
}, [branchWorkspaceQuery.data, workspaceRepositoryName])
```

Import `useMemo`, `useBranchWorkspaceQuery`, and `activeWorkspaceRootId`. Add this field to each row's props:

```ts
branchWorkspaceMember: branch.worktree?.path
  ? branchWorkspaceMemberPaths.has(branch.worktree.path)
  : false,
```

- [x] **Step 6: Run the focused list test and verify GREEN**

Run `bun run test src/web/components/BranchList.test.tsx`.

Expected: PASS for exact membership, removed membership, standalone scope, drag ordering, and existing row behavior.

### Task 4: Verify The Integrated Change

**Files:**

- Read-only verification across all modified files.

- [x] **Step 1: Run all affected focused tests together**

Run:

```bash
bun run test src/shared/i18n/dictionaries.test.ts src/web/components/branch-list/BranchRow.test.tsx src/web/components/BranchList.test.tsx
```

Expected: all affected tests pass with zero failures.

- [x] **Step 2: Run type checking**

Run `bun run typecheck`.

Expected: exit code 0.

- [x] **Step 3: Run the architecture guard**

Run `bun run check:architecture`.

Expected: exit code 0; the renderer-only change adds no prohibited imports.

- [x] **Step 4: Run the full test suite and compare with baseline**

Run `bun run test`.

Expected for feature-owned tests: zero failures. The pre-change baseline had two unrelated timeouts:

- `src/server/app-factory.test.ts > injects bootstrap into the web index html for web requests`
- `src/web/components/repo-workspace/WorkspaceItemContextMenu.test.tsx > renders the fixed action order and dispatches each open action`

If those exact timeouts recur without new failures, report them as known baseline failures rather than claiming the full suite is green. If any affected or new test fails, fix it before completion.

- [x] **Step 5: Inspect the final diff**

Run `git diff --check`, then inspect `git diff` for the design, plan, translations, derivation, presentation, and tests.

Expected: no whitespace errors and no unrelated source changes.

## Plan Self-Review

- **Spec coverage:** Tasks cover localized copy, active-workspace scoping, exact repository/path identity, removed-member exclusion, standalone exclusion, presentation, tooltip context, focused tests, typecheck, architecture, and baseline-aware full-suite verification.
- **Scope:** One renderer-only presentation feature; no independent subsystem needs a separate plan.
- **Type consistency:** `branchWorkspaceMember?: boolean` is the single flag name from list to row summary; `workspace.branch-workspace.member-badge` is the single translation key.
- **No Git writes:** Commit steps are intentionally omitted under project instructions.

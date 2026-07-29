# Project List Change-Count Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each sidebar project row's cumulative Git change count in an attention badge.

**Architecture:** Extend the existing `useProjectSummaries` read projection with a derived `changeCount`, computed from the root project and configured member repositories. Render that value only in `SidebarProjectList`, reusing the established Git-change badge presentation.

**Tech Stack:** React 19, Zustand, TypeScript 6 strip-only mode, Tailwind CSS 4, Vitest.

## Global Constraints

- Sum every `WorktreeStatus.entries.length` for every Git repository in the project.
- Treat plain workspaces without Git members as zero and hide zero-value badges.
- Do not add persistence, server APIs, dependencies, or status refreshes.
- Keep repo-alias imports explicit with `.ts`/`.tsx` extensions.
- Execute inline without subagents.
- Defer any Git commit until the user's final explicit confirmation.

---

### Task 1: Add cumulative change count to the project summary

**Files:**
- Modify: `src/web/components/repo-workspace/project-switcher-model.tsx`
- Test: `src/web/components/repo-workspace/project-switcher-model.test.tsx`

**Interfaces:**
- Consumes: `RepoState.data.status: WorktreeStatus[]` and configured workspace `repositoryIds`.
- Produces: required `ProjectSummary.changeCount: number`.

- [x] **Step 1: Write the failing aggregation test**

Extend the configured-workspace summary fixture with two member repositories and status arrays whose entry counts total five. Include `changeCount` in `ProjectSummariesProbe` and assert:

```tsx
expect(JSON.parse(container!.querySelector('output')?.textContent ?? '{}')).toEqual({
  branchWorkspaceRootId: '/workspace-root',
  changeCount: 5,
  terminalWorktreeKeys: ['/workspace-root\0/workspace-root'],
})
```

- [x] **Step 2: Run the model test and verify RED**

Run:

```bash
bun run test -- src/web/components/repo-workspace/project-switcher-model.test.tsx
```

Expected: FAIL because `ProjectSummary` does not expose `changeCount`.

- [x] **Step 3: Implement the minimal read projection**

Extend the local projection input and summary shape:

```ts
interface ProjectTerminalRepo {
  id: string
  isGitRepo?: boolean
  remote?: Parameters<typeof repoTerminalWorktreePaths>[0]['remote']
  data: {
    branches: Array<{ worktree?: { path?: string } }>
    worktreesByPath: Record<string, unknown>
    status: Array<{ entries: readonly unknown[] }>
  }
}

export interface ProjectSummary {
  id: string
  name: string
  unavailable: boolean
  isGitRepo: boolean
  terminalWorktreeKeys: string[]
  branchWorkspaceRootId: string | null
  changeCount: number
}
```

Add one focused derivation and use it inside `useProjectSummaries`:

```ts
function projectChangeCount(repos: readonly ProjectTerminalRepo[]): number {
  return repos.reduce(
    (projectTotal, repo) =>
      repo.isGitRepo === false
        ? projectTotal
        : projectTotal + repo.data.status.reduce((repoTotal, status) => repoTotal + status.entries.length, 0),
    0,
  )
}

changeCount: projectChangeCount([repo, ...memberRepos]),
```

Compare `item.changeCount` in `projectSummariesEqual` so status updates publish a changed summary.

- [x] **Step 4: Run the model test and verify GREEN**

Run the same model test. Expected: all tests pass.

### Task 2: Render the project-list badge

**Files:**
- Modify: `src/web/components/repo-workspace/SidebarProjectList.tsx`
- Test: `src/web/components/repo-workspace/SidebarProjectList.test.tsx`

**Interfaces:**
- Consumes: `ProjectSummary.changeCount: number` from Task 1.
- Produces: `[data-testid="project-change-count-badge"]` when the count is positive.

- [x] **Step 1: Write failing row-presentation tests**

Set the Git project fixture to `changeCount: 5` and the plain project fixture to `changeCount: 0`, then assert:

```tsx
const changeBadge = projectRow('/repo-a').querySelector('[data-testid="project-change-count-badge"]')
expect(changeBadge?.textContent).toBe('5')
expect(changeBadge?.querySelector('.lucide-git-compare-arrows')).not.toBeNull()
expect(projectRow('/repo-b').querySelector('[data-testid="project-change-count-badge"]')).toBeNull()
```

- [x] **Step 2: Run the list test and verify RED**

Run:

```bash
bun run test -- src/web/components/repo-workspace/SidebarProjectList.test.tsx
```

Expected: FAIL because no project change badge is rendered.

- [x] **Step 3: Implement the minimal badge**

Import `GitCompareArrows` and `Badge`, derive the existing accessible label, and insert this immediately after the project name and before `ProjectTerminalStatus`:

```tsx
{project.changeCount > 0 ? (
  <Badge
    data-testid="project-change-count-badge"
    aria-label={t('branch-status.worktree-dirty', { n: project.changeCount })}
    title={t('branch-status.worktree-dirty', { n: project.changeCount })}
    variant="attention"
    className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
  >
    <GitCompareArrows size={10} aria-hidden="true" />
    {project.changeCount}
  </Badge>
) : null}
```

- [x] **Step 4: Run the list and model tests and verify GREEN**

Run:

```bash
bun run test -- src/web/components/repo-workspace/project-switcher-model.test.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx
```

Expected: both test files pass.

### Task 3: Verify the complete change

**Files:**
- Verify all files modified in Tasks 1 and 2.
- Verify: `docs/superpowers/specs/2026-07-23-project-list-change-count-badge-design.md`
- Verify: `docs/superpowers/plans/2026-07-23-project-list-change-count-badge.md`

**Interfaces:**
- Consumes: the completed summary projection and sidebar badge.
- Produces: a verified working tree ready for final user review and optional commit confirmation.

- [x] **Step 1: Check formatting and the final diff**

Run:

```bash
git diff --check
git diff --stat
```

Expected: no whitespace errors and only the scoped implementation, tests, design, and plan files.

- [x] **Step 2: Run required project verification**

Run:

```bash
bun run typecheck
bun run test
```

Expected: architecture boundaries, all TypeScript projects, and the complete Vitest suite pass.

- [x] **Step 3: Report results and request any required final confirmation**

Report the aggregation scope, files changed, and fresh verification counts. Do not commit or push unless the user explicitly confirms the Git operation.

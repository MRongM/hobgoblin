# Mobile Focus Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make available Git workspaces terminal-first on compact screens while preserving one-action access to project, branch, and file navigation without mutating desktop focus state.

**Architecture:** `App` removes redundant compact global chrome for eligible Git repositories. `RepoView` owns a repository-keyed local surface choice and composes either `BranchDetail` or `RepoExplorerPane`; child components emit presentation intents upward while existing repo/terminal stores retain their current ownership.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, Zustand, Tailwind CSS 4, Vitest, existing shadcn/Radix primitives.

## Global Constraints

- Compact means the existing `(max-width: 639px)` responsive mode.
- Do not mutate or repurpose restorable `detailFocusMode` or `detailCollapsed` for responsive presentation.
- Keep plain and unavailable workspace behavior unchanged.
- Use existing theme tokens and configured fonts; add no dependency or hard-coded production palette.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or TypeScript import aliases.
- Do not create a Git commit; repository instructions require explicit confirmation.

---

### Task 1: Compact shell chrome eligibility

**Files:**
- Modify: `src/web/App.test.tsx`
- Modify: `src/web/App.tsx`

**Interfaces:**
- Consumes: `visibleRepoId`, `useResponsiveUiMode()`, and the active `RepoState` projection.
- Produces: compact topbar visibility that is false only for an available Git repository.

- [ ] **Step 1: Write failing shell tests**

Replace the compact split expectation with an available-Git expectation that `global-topbar` and `repo-tabs` are absent. Add cases seeding `isGitRepo = false` and `availability.phase = 'unavailable'` and assert their compact topbar remains visible.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/App.test.tsx`

Expected: the available-Git compact test fails because the current shell still renders the global topbar.

- [ ] **Step 3: Implement the eligibility projection**

In `MainWindowViewportContent`, select the active repo's capability and availability and derive:

```ts
const compactFocusEligible = useReposStore((state) => {
  const repo = visibleRepoId ? state.repos[visibleRepoId] : undefined
  return !!repo && repo.isGitRepo !== false && repo.availability.phase !== 'unavailable'
})
const showGlobalTopbar = compact ? !compactFocusEligible : !visibleRepoId
```

Keep the existing compact topbar actions unchanged for the cases where the topbar still renders.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/web/App.test.tsx`

Expected: all `App.test.tsx` tests pass.

### Task 2: Local compact detail/explorer composition

**Files:**
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/components/RepoView.tsx`
- Modify: `src/web/components/BranchDetail.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.tsx` (optional prop interface only; behavior remains Task 3)
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx` (optional prop interface only; behavior remains Task 4)

**Interfaces:**
- Produces: `BranchDetail` props `compactFocusPresentation?: boolean` and `onShowCompactExplorer?: () => void`.
- Consumes later: `RepoExplorerPane` props `onShowCompactDetail?: () => void` and `onBranchSelected?: () => void`.

- [ ] **Step 1: Write failing compact composition tests**

Extend the `BranchDetail` and `RepoExplorerPane` test doubles to expose their new callbacks. Add tests proving:

```text
compact + selected worktree   -> detail only
workspace callback            -> explorer only
detail callback               -> detail only
compact + no selected worktree -> explorer only
default UI                    -> existing split pane
```

Also assert opening a terminal reveal path switches to explorer and preserves the reveal request.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/components/RepoView.test.tsx`

Expected: tests fail because compact mode still renders `RepoWorkspace` and the callbacks do not exist.

- [ ] **Step 3: Implement repository-keyed local composition**

In `RepoView`, store `compactExplorerRepoId: string | null`. Derive the selected branch and whether it has a worktree. For compact Git repositories:

```ts
const compactExplorerOpen = compactExplorerRepoId === repoId
const compactDetailAvailable = !!selectedBranch?.worktree?.path
const showCompactExplorer = compactExplorerOpen || !compactDetailAvailable
```

Render only `RepoExplorerPane` when `showCompactExplorer`; otherwise render only `BranchDetail` with `collapsed={false}`, `compactFocusPresentation`, and the local show-explorer callback. Keying explorer-open state by repo id makes a project switch default to detail without an effect.

Update terminal reveal handling to open the compact explorer before forwarding the existing reveal request. Pass the two explorer callbacks so returning or selecting a branch closes the local explorer.

Thread the new presentation props through `BranchDetail` into `BranchDetailToolbar` without changing its action/dialog ownership.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun run test src/web/components/RepoView.test.tsx`

Expected: all `RepoView` tests pass.

### Task 3: Compact context rail

**Files:**
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.tsx`
- Create: `src/web/components/topbar/TopbarRepoControls.test.tsx`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`
- Modify: `src/web/components/repo-workspace/FocusProjectSwitcher.tsx`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Interfaces:**
- Consumes: `compactFocusPresentation?: boolean`, `onShowCompactExplorer?: () => void`.
- Produces: `TopbarRepoControls` prop `focusPresentation?: boolean` and `FocusProjectSwitcher` prop `compact?: boolean`.

- [ ] **Step 1: Write a failing toolbar behavior test**

Render the toolbar with compact UI, `detailFocusMode={false}`, `compactFocusPresentation`, and a spy callback. Assert the focus project switcher and branch controls render, the leading button uses the new workspace label, clicking it calls the callback, and `useReposStore.getState().detailFocusMode` remains false.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/components/branch-detail/BranchDetailToolbar.test.tsx`

Expected: the context controls and workspace button are absent.

- [ ] **Step 3: Implement the context rail**

Derive:

```ts
const contextRail = behavior.mode === 'focus' || compactFocusPresentation
```

Use `contextRail` to render the leading navigation button, `FocusProjectSwitcher`, `TopbarRepoControls`, and bottom-placed terminal tooltips. When `compactFocusPresentation` is true, the leading button calls `onShowCompactExplorer`; otherwise it retains the existing focus toggle behavior.

Pass `focusPresentation={contextRail}` so `TopbarRepoControls` can reuse `FocusBranchControls` without requiring persisted focus state. Pass `compact` to limit the visible project label width while retaining the accessible full title.

Add dictionary keys:

```ts
'mobile.open-workspace': 'Open workspace'
'mobile.show-terminal': 'Show terminal'
```

with concise equivalent translations in the other three dictionaries.

- [ ] **Step 4: Run toolbar and i18n tests and verify GREEN**

Run: `bun run test src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/shared/i18n`

Expected: toolbar and dictionary parity tests pass.

### Task 4: Compact explorer surface

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectHeader.test.tsx`
- Modify: `src/web/components/repo-workspace/SidebarProjectHeader.tsx`
- Modify: `src/web/components/BranchList.test.tsx`
- Modify: `src/web/components/BranchList.tsx`
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/components/RepoView.tsx`

**Interfaces:**
- Consumes: `onShowCompactDetail?: () => void`, `onBranchSelected?: () => void`.
- Produces: a compact explorer with project header, vertical branch/file split, bottom status bar, and explicit return-to-detail intent.

- [ ] **Step 1: Write failing explorer tests**

In compact mode with `onShowCompactDetail`, assert `sidebar-project-header` and `statusbar` render and the split orientation is `vertical`. Update the `BranchList` test double to call `onBranchSelected`, then assert the callback reaches the parent. Add a focused `BranchList` test proving the optional callback fires after branch navigation. Add a `SidebarProjectHeader` test asserting the trailing compact button uses `mobile.show-terminal` and calls the supplied callback instead of toggling persisted focus. Add a `RepoView` regression proving a restorable desktop focus preference cannot hide compact explorer actions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/SidebarProjectHeader.test.tsx src/web/components/BranchList.test.tsx src/web/components/RepoView.test.tsx`

Expected: compact header/status are absent and the split remains horizontal.

- [ ] **Step 3: Implement compact explorer composition**

In `RepoExplorerPane`, make compact split orientation vertical, render `SidebarProjectHeader` and `StatusBar` when compact detail navigation is supplied, and pass branch selection intent into `BranchList`. Preserve the existing plain-workspace early return and desktop collapse behavior.

In `SidebarProjectHeader`, accept `onShowCompactDetail`. When present, render a trailing terminal-return control with `mobile.show-terminal`; otherwise preserve the desktop focus toggle.

In `BranchList`, add an optional `onBranchSelected` callback and call it after the existing navigation action. This is a UI presentation callback only; branch selection ownership stays unchanged.

In `RepoView`, compact explorer actions remain visible regardless of the persisted desktop `detailFocusMode`; that restorable preference must not affect compact-only composition.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/SidebarProjectHeader.test.tsx src/web/components/BranchList.test.tsx src/web/components/RepoView.test.tsx`

Expected: all focused explorer/composition tests pass.

### Task 5: Loading continuity and full verification

**Files:**
- Modify: `src/web/components/Skeleton.test.tsx`
- Modify: `src/web/components/Skeleton.tsx`

**Interfaces:**
- Consumes: existing `compact?: boolean` skeleton prop.
- Produces: compact detail-only loading skeleton without changing desktop skeletons.

- [ ] **Step 1: Write a failing skeleton test**

Change the compact skeleton expectation to assert only detail rows render and no split pane is mounted when `compact` is true and persisted focus is false.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test src/web/components/Skeleton.test.tsx`

Expected: compact skeleton still renders both branch and detail rows.

- [ ] **Step 3: Implement compact skeleton focus presentation**

Use the existing `compact` prop to select the detail pane directly, while leaving `repoWorkspaceBehavior` and all desktop paths unchanged.

- [ ] **Step 4: Run focused regression tests**

Run: `bun run test src/web/App.test.tsx src/web/components/RepoView.test.tsx src/web/components/Skeleton.test.tsx src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/SidebarProjectHeader.test.tsx`

Expected: all focused tests pass with zero failures.

- [ ] **Step 5: Run repository verification**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Expected: all commands exit 0.

- [ ] **Step 6: Visual verification**

Run the app in server mode, inspect a phone viewport and a desktop viewport, and verify: context controls remain reachable, terminal canvas receives the remaining height, explorer stacks vertically, focus rings are visible, labels truncate without overlap, and desktop chrome is unchanged. Respect `prefers-reduced-motion`; this design adds no new motion.

## Plan self-review

- Spec coverage: shell chrome, local composition, context rail, explorer surface, edge cases, skeleton continuity, accessibility, and full verification each map to a task.
- Placeholder scan: no TBD/TODO or “implement later” steps.
- Type consistency: compact presentation callbacks and optional props use the same names across producer and consumer tasks.
- Scope: one renderer-only responsive feature; no server, protocol, persistence, dependency, or unrelated architecture work.

# Member Worktree Click Terminal Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make branch workspace member rows focus their existing selected terminal on a changed single-click selection and toggle the file area on double click, matching ordinary worktree interaction results.

**Architecture:** Keep exact member target resolution and parent-scope activation in `WorkspaceRepositoryRail`. Because the visible repository remains the parent workspace root, explicitly read the selected viable member terminal from `TerminalSessionReadContext` and focus it through `TerminalSessionContext`; keep row components limited to forwarding click and double-click intents.

**Tech Stack:** React 19, TypeScript strip-only mode, Zustand, Vitest/jsdom, Bun.

## Global Constraints

- Preserve the parent branch workspace as the active project/context while selecting a member worktree.
- Focus only the already selected member terminal, only when changing member selection, and only when its phase is neither `closed` nor `error`.
- Do not create a terminal or choose an arbitrary replacement when no viable selected terminal exists.
- Double click toggles the desktop file area directly; compact presentation uses the existing file-surface callback.
- Preserve action-dock, context-menu, unavailable-member, and member-expansion behavior.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions and no strip-only-incompatible TypeScript syntax.
- Do not commit without the user's final explicit confirmation.

---

### Task 1: Simplify member row click and double-click contracts

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceList.tsx`

**Interfaces:**
- Consumes: `onToggleFileArea?: () => void` as the existing file-area intent.
- Produces: `onSelectRepositoryMember?: (item, member) => void` as the row selection intent; removes the obsolete `fileAreaCollapsed` interaction snapshot.

- [x] **Step 1: Write failing member-row tests**

Rename the single-click spy to `onSelectRepositoryMember`, assert a click calls only that callback, and add a double-click sequence assertion that two normal clicks select the member while one `dblclick` calls `onToggleFileArea` exactly once. Retain the disabled-member assertion.

```tsx
const onSelectRepositoryMember = vi.fn()
const onToggleFileArea = vi.fn()

act(() => dispatchMouseDoubleClickSequence(main))

expect(onSelectRepositoryMember).toHaveBeenCalledTimes(2)
expect(onSelectRepositoryMember).toHaveBeenLastCalledWith(item, member)
expect(onToggleFileArea).toHaveBeenCalledTimes(1)
```

- [x] **Step 2: Write the failing list forwarding test**

Replace the state-compensation harness with a direct intent-forwarding test: expand members, run the normal double-click sequence, assert member selection receives both click events, assert one file-area toggle, and assert the member list remains expanded.

- [x] **Step 3: Run focused tests and verify RED**

Run:

```bash
bun run test "src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceList.test.tsx"
```

Expected: FAIL because `onSelectRepositoryMember` is not yet part of the component contracts and the existing compensation suppresses one toggle path.

- [x] **Step 4: Implement the minimal row/list event routing**

In `BranchWorkspaceMemberRow.tsx`, remove `useRef`, `fileAreaCollapsed`, `onMouseDown`, and the interaction-start ref. Bind the main button directly:

```tsx
onClick: () => onSelectRepositoryMember?.(item, member),
onDoubleClick: onToggleFileArea,
```

Rename the callback through `BranchWorkspaceMemberRowProps`, `BranchWorkspaceListProps`, and the `BranchWorkspaceList` forwarding sites. Remove `fileAreaCollapsed` from those two component contracts.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the Task 1 command again. Expected: both files PASS.

---

### Task 2: Route changed member selection to its selected terminal

**Files:**
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`

**Interfaces:**
- Consumes: `TerminalSessionReadContextValue.worktreeSnapshot(worktreeTerminalKey)` and `TerminalSessionContextValue.focusTerminal(key)`.
- Produces: `onSelectRepositoryMember` callback for `BranchWorkspaceList`; removes `WorkspaceRepositoryRail.fileAreaCollapsed` because no descendant needs interaction-start state.

- [x] **Step 1: Write failing rail tests for terminal focus**

Extend `renderRail` terminal fixtures so a member path can expose an open selected session. Assert a changed member selection:

```tsx
expect(selectBranch).toHaveBeenCalledWith(API, 'feature/auth')
expect(setDetailTab).toHaveBeenCalledWith(API, 'terminal')
expect(activateBranchWorkspace).toHaveBeenCalledWith(ROOT, 'branch-1', 'api')
expect(terminalCommands.focusTerminal).toHaveBeenCalledWith(memberTerminalKey)
expect(onOpenDetailArea).toHaveBeenCalledTimes(1)
expect(onOpenFileArea).not.toHaveBeenCalled()
```

Add cases proving an already selected member is not refocused and selected `error`/`closed` sessions are not focused.

- [x] **Step 2: Run the rail test and verify RED**

Run:

```bash
bun run test "src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx"
```

Expected: FAIL because the current single-click callback opens the file area and never calls `focusTerminal`.

- [x] **Step 3: Implement member terminal-focused selection**

In `WorkspaceRepositoryRail.tsx`, replace `openRepositoryMember` with `selectRepositoryMember`. Resolve the member, calculate whether the exact `(branchWorkspaceId, repositoryName)` was already active before mutating state, then select the branch, terminal detail tab, compact detail surface, and parent member context. For a changed selection, focus only the selected viable snapshot session:

```tsx
const worktreeKey = worktreeTerminalKey(resolution.target.repositoryId, resolution.target.worktreePath)
const selectedTerminal = terminalReadContext?.worktreeSnapshot(worktreeKey).sessions.find((session) => session.selected)
if (selectedTerminal && selectedTerminal.phase !== 'closed' && selectedTerminal.phase !== 'error') {
  terminalCommands?.focusTerminal(selectedTerminal.key)
}
```

Do not call `selectTerminal` because the ordinary-worktree behavior preserves the existing selected session and focusing must not change terminal selection or bell state.

- [x] **Step 4: Remove obsolete file-area collapsed plumbing**

Remove `fileAreaCollapsed` from `WorkspaceRepositoryRail` and its call sites in `RepoExplorerPane.tsx`, `PlainWorkspacePane.tsx`, and `BranchWorkspacePane.tsx`. Update mocks/assertions that existed solely to verify forwarding that obsolete value; retain `StatusBar` and `FileAreaSplitPane` collapsed-state assertions because those surfaces still own layout state.

- [x] **Step 5: Run affected component tests and verify GREEN**

Run:

```bash
bun run test "src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx" "src/web/components/repo-workspace/RepoExplorerPane.test.tsx" "src/web/components/repo-workspace/BranchWorkspacePane.test.tsx"
```

Expected: all files PASS.

---

### Task 3: Align documentation and complete verification

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/ui-conventions.md`
- Modify: `docs/superpowers/specs/2026-08-13-member-worktree-click-terminal-focus-design.md`

**Interfaces:**
- Consumes: the implemented member-row behavior.
- Produces: canonical domain and UI wording for future changes.

- [x] **Step 1: Update canonical interaction wording**

Describe a member summary single click as selecting the member terminal context and focusing its selected viable terminal only when the member changes. Describe double click as the normal selection sequence followed by desktop file-area toggle, with compact presentation opening files. Remove wording that says a single click opens files.

- [x] **Step 2: Run focused regression tests**

```bash
bun run test "src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceList.test.tsx" "src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx" "src/web/components/repo-workspace/RepoExplorerPane.test.tsx" "src/web/components/repo-workspace/BranchWorkspacePane.test.tsx" "src/web/components/terminal/TerminalSessionProvider.test.tsx"
```

Expected: PASS.

- [x] **Step 3: Run project verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit 0.

- [x] **Step 4: Inspect the final diff without committing**

```bash
git diff --check
git status --short
git diff -- CONTEXT.md docs/ui-conventions.md src/web/components/repo-workspace
```

Expected: no whitespace errors; this task's changes coexist with the pre-existing dirty worktree changes. Leave any commit decision for the user's final confirmation.

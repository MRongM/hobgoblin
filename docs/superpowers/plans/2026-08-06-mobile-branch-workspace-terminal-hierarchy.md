# Mobile Web Branch Workspace Terminal Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Mobile Web branch-workspace root terminal topbar expose the same project, workspace-context, and terminal hierarchy as an ordinary Git repository terminal.

**Architecture:** Keep `BranchWorkspaceTerminalPanel` as the composition owner and reuse the existing `FocusProjectSwitcher`, `WorkspaceRepositorySwitcher`, `TerminalTabs`, and shared mobile horizontal-scroll classes. No new state, query, component abstraction, or protocol is introduced.

**Tech Stack:** React 19, TypeScript strip-only mode, Tailwind CSS, Vitest, Bun

## Global Constraints

- Always respond in Simplified Chinese.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Preserve the dirty worktree and do not create branches or commits without an explicit user request.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Align the branch-workspace terminal context hierarchy

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceTerminalPanelProps.toolbarLeading`, `FocusProjectSwitcher`, `WorkspaceRepositorySwitcher`, `TerminalTabs`, `useIsCompactUi()`.
- Produces: no new exported interface; compact rendering order becomes toolbar leading control, project switcher, workspace-context switcher, terminal switcher.

- [x] **Step 1: Write the failing compact hierarchy test**

Add a test that renders the panel with compact UI and a `toolbarLeading` sentinel. Assert that the toolbar uses `mobile-topbar-scroll`, its first child uses `mobile-topbar-scroll-content`, and the ordered children are the sentinel, project switcher, workspace-context switcher, and terminal tabs. Also assert both switchers receive `repoId={ROOT}` and `compact={true}`, while `TerminalTabs` receives `responsiveCompact={true}` and `focusMode={true}`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx
```

Expected: the new test fails because compact branch-workspace rendering lacks both context switchers and the shared scroll-content wrapper.

- [x] **Step 3: Implement the minimal shared hierarchy**

In `BranchWorkspaceTerminalPanel.tsx`, derive `contextRail` from compact presentation or desktop terminal Focus. Give the toolbar compact geometry and `mobile-topbar-scroll`; put its current leading control, existing context switchers, and `TerminalTabs` inside one `mobile-topbar-scroll-content` wrapper. Pass compact sizing to both switchers and pass `contextRail` to `TerminalTabs.focusMode`. Preserve the desktop-only exit behavior and fixed drag spacer.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx
```

Expected: all tests in the file pass with no warnings.

- [x] **Step 5: Verify nearby behavior and repository constraints**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspacePane.test.tsx src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
bun run typecheck
bun run check:architecture
bun run test
```

Expected: every command exits with code 0 and the complete test suite reports zero failures.

- [x] **Step 6: Review the final diff**

Check that the diff changes only the branch-workspace terminal composition, its regression tests, and these design/plan documents; confirm no unrelated dirty-worktree content was overwritten. Do not commit.

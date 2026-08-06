# Mobile Web Sidebar Controls Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the branch-workspace terminal scope control to ordinary Git repositories and hide only the inline editor shortcut from Mobile Web left-side list rows while preserving direct internal-terminal access.

**Architecture:** Reuse the existing `PanelLeftOpen` terminal-context control in `BranchWorkspacePane`. Apply the compact-only editor visibility rule once in the shared `WorkspaceListItemActionDock`, leaving callers, context menus, and terminal actions unchanged.

**Tech Stack:** React 19, TypeScript strip-only mode, Tailwind CSS, Lucide React, Vitest, Bun

## Global Constraints

- Always respond in Simplified Chinese.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not use enums, runtime namespaces, parameter properties, or import aliases.
- Preserve existing dirty-worktree content and do not create branches or commits without explicit user authorization.
- Mobile Web uses the existing `sm` breakpoint; desktop behavior must remain unchanged.
- Verify with `bun run typecheck`, `bun run test`, and `bun run check:architecture`.

---

### Task 1: Match the branch-workspace terminal scope control

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.test.tsx`
- Modify: `src/web/components/repo-workspace/BranchWorkspacePane.tsx`

**Interfaces:**

- Consumes: `BranchWorkspaceTerminalPanelProps.toolbarLeading`, Lucide `PanelLeftOpen`, shared `Button` size `icon`.
- Produces: no new exported interface; the compact root-terminal scope button keeps `data-testid="show-scope"` and its existing callback.

- [x] **Step 1: Write the failing compact icon assertions**

Extend the existing compact root-terminal test with these assertions:

```tsx
expect(back?.getAttribute('data-size')).toBe('icon')
expect(back?.querySelector('.lucide-panel-left-open')).not.toBeNull()
expect(back?.querySelector('.lucide-arrow-left')).toBeNull()
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/BranchWorkspacePane.test.tsx
```

Expected: the compact root-terminal test fails because the current button is `icon-xs` and renders `ArrowLeft`.

- [x] **Step 3: Implement the minimal icon alignment**

Keep `ArrowLeft` for the file-surface control, import `PanelLeftOpen`, and change only `compactScopeButton`:

```tsx
<Button
  type="button"
  variant="ghost"
  size="icon"
  data-testid="show-scope"
  aria-label={t('workspace.branch-workspace.scope-list')}
  title={t('workspace.branch-workspace.scope-list')}
  onClick={() => showCompactSurface('scope')}
>
  <PanelLeftOpen aria-hidden="true" />
</Button>
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the same focused command and expect all `BranchWorkspacePane` tests to pass.

### Task 2: Hide only the compact editor shortcut

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceListItem.test.tsx`
- Modify: `src/web/components/repo-workspace/WorkspaceListItem.tsx`
- Modify: `docs/ui-conventions.md`

**Interfaces:**

- Consumes: `WorkspaceListItemActionDock({ editor, internalTerminal, moreMenu })` and the existing Tailwind `sm` breakpoint.
- Produces: no new prop; the editor slot is hidden below `sm`, while the internal-terminal and More slots retain existing rendering and click semantics.

- [x] **Step 1: Write the failing responsive quick-action test**

Render an action dock with editor and internal-terminal actions. Assert the `.workspace-list-item-action-editor` slot includes `hidden` and `sm:inline-flex`; click `[data-workspace-list-item-action="terminal"]` and assert its real `onSelect` callback runs once.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceListItem.test.tsx
```

Expected: the new test fails because the editor slot is currently `inline-flex` at every viewport.

- [x] **Step 3: Implement the shared responsive rule**

Change only the shared editor slot classes:

```tsx
className={cn(
  'workspace-list-item-action-editor hidden size-5 sm:inline-flex',
  dockBusy && 'pointer-events-auto opacity-100',
)}
```

Do not change the internal-terminal slot, its action object, or any context menu projection.

- [x] **Step 4: Record the compact navigation convention**

Add a responsive-workspace convention stating that compact left-side list rows omit the inline editor shortcut, keep the internal-terminal shortcut directly clickable, and retain editor access in the context menu.

- [x] **Step 5: Run focused and neighboring tests and record the outcome**

Run:

```bash
bun run test src/web/components/repo-workspace/WorkspaceListItem.test.tsx src/web/components/repo-workspace/SidebarProjectList.test.tsx src/web/components/repo-workspace/WorkspaceRepositoryList.test.tsx src/web/components/repo-workspace/BranchWorkspaceList.test.tsx src/web/components/repo-workspace/BranchWorkspaceMemberRow.test.tsx
```

Expected: every listed test file passes and existing desktop/context-menu assertions remain green.

### Task 3: Repository verification

**Files:**

- Verify all modified source, tests, and documentation without further behavior changes.

**Interfaces:**

- Consumes: repository scripts from `package.json`.
- Produces: fresh verification evidence only.

- [x] **Step 1: Check formatting and whitespace**

Run Prettier check on the changed files and `git diff --check`; expect both to exit with code 0.

- [x] **Step 2: Run required checks and record the outcome**

Run:

```bash
bun run typecheck
bun run check:architecture
bun run build:web
bun run test
```

Expected: every command exits with code 0 and the complete test suite reports zero failures.

- [x] **Step 3: Review scope and preserve user changes**

Confirm the final diff contains only the two requested UI behavior changes, their tests, and documentation. Preserve the pre-existing `CONTEXT.md` and unrelated untracked design file. Do not commit.

## Verification Outcome

- The two focused TDD files and two unaffected branch-workspace list files pass: 4 files, 58 tests.
- Architecture boundaries, Web production build, formatting, and whitespace checks pass.
- Repository-wide typecheck and test remain blocked by the pre-existing in-progress worktree-dependency selection changes. Failures are outside the files modified by this plan and were present in the baseline before implementation.

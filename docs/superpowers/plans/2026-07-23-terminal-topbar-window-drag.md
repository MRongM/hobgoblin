# Terminal Topbar Window Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the terminal topbar's non-interactive surface draggable in every desktop left/right project context.

**Architecture:** Preserve the existing per-terminal-panel Electron drag-region contract instead of broadening the shared `Toolbar`. Ordinary Git and plain-workspace panels remain unchanged; the branch-workspace panel adopts the same topbar geometry and drag-region class in its ordinary split presentation.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4 arbitrary properties, Electron draggable regions, Vitest.

## Global Constraints

- Desktop workspaces use the fixed left/right split.
- Buttons and `[data-interactive]` elements remain `-webkit-app-region: no-drag` so terminal controls stay interactive.
- Do not change compact/mobile behavior, Electron main-process window configuration, or non-terminal toolbars.
- Use Node.js strip-only-compatible TypeScript.
- Verify with focused Vitest coverage, `bun run typecheck`, and `bun run check:architecture`.

---

### Task 1: Unify branch-workspace terminal topbar drag behavior

**Files:**
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx:151`
- Modify: `src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx:77`

**Interfaces:**
- Consumes: shared `Toolbar` props `chrome="topbar"`, `tone="topbar"`, and the existing Tailwind arbitrary property `[-webkit-app-region:drag]`.
- Produces: a branch-workspace terminal topbar whose normal and focus presentations use topbar geometry and expose a draggable non-interactive surface.

- [ ] **Step 1: Write the failing normal-mode contract test**

Replace the existing standard-geometry test assertions with:

```tsx
test('uses draggable project topbar chrome in the desktop split', async () => {
  await renderPanel()

  const toolbar = container.querySelector<HTMLElement>('[data-testid="branch-workspace-terminal-toolbar"]')
  expect(toolbar?.style.height).toBe('39px')
  expect(toolbar?.className).toContain('topbar-tone')
  expect(toolbar?.className).toContain('bg-topbar')
  expect(toolbar?.className).not.toContain('bg-toolbar')
  expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test -- "src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx"
```

Expected: FAIL because normal mode renders `41px` toolbar geometry and lacks `[-webkit-app-region:drag]`.

- [ ] **Step 3: Implement the minimal topbar contract**

Change the toolbar props to:

```tsx
<Toolbar
  data-testid="branch-workspace-terminal-toolbar"
  variant="detail"
  chrome="topbar"
  tone="topbar"
  className={cn('[-webkit-app-region:drag]', terminalFocusMode && 'topbar')}
>
```

This leaves the existing global `button` and `[data-interactive]` no-drag rule untouched.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun run test -- "src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx"
```

Expected: all tests pass.

- [ ] **Step 5: Run cross-context terminal topbar regression tests**

Run:

```bash
bun run test -- "src/web/components/branch-detail/BranchDetailToolbar.test.tsx" "src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx" "src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx"
```

Expected: all three test files pass, proving ordinary Git, plain workspace, and branch workspace topbars retain the shared behavior.

- [ ] **Step 6: Run static verification**

Run:

```bash
bun run typecheck
bun run check:architecture
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 7: Prepare an atomic commit after final approval**

Stage only:

```bash
git add -- "src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx" "src/web/components/repo-workspace/BranchWorkspaceTerminalPanel.test.tsx" "docs/superpowers/plans/2026-07-23-terminal-topbar-window-drag.md"
git commit -m "fix: make terminal topbars draggable"
```

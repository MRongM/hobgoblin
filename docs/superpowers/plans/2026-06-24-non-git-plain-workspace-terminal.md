# Non-Git Plain Workspace Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plain non-Git local workspaces immediately usable by auto-creating the first terminal session and removing the stale Git-init placeholder path.

**Architecture:** Keep the existing plain-workspace routing in `RepoView` and `RepoExplorerPane`. Add a one-shot terminal bootstrap effect inside `PlainWorkspaceTerminalPanel` that creates the first session only when the plain workspace has no sessions yet. Remove the dead `NonGitRepoPlaceholder` file and lock the behavior down with regression tests that prove non-Git local workspaces stay on the plain shell path and do not fall back to Git empty states.

**Tech Stack:** TypeScript strip-only mode, React, Zustand, Vitest/jsdom, Bun.

**Safety Note:** Do not add `git commit` steps. The repository instructions say commits are only allowed when the user explicitly asks.

---

## File Structure

- Modify `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`
  - Add the first-session auto-create effect and a guard that prevents duplicate terminal creation on re-render.
- Create `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`
  - Covers auto-create, duplicate suppression, and the no-existing-session case.
- Modify `src/web/components/RepoView.test.tsx`
  - Locks down the plain-workspace path so the non-Git local shell does not surface `branches.empty`.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
  - Verifies the plain workspace still renders the files/terminal shell and not the branch area.
- Delete `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`
  - Removes the obsolete Git-initialization placeholder that the approved design no longer uses.

---

### Task 1: Auto-Create the First Plain-Workspace Terminal Session

**Files:**
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`
- Create: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`

- [ ] **Step 1: Write the failing tests for first-session bootstrap**

Create `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx` with a focused jsdom test that mocks the terminal session hooks and asserts the panel calls `createTerminal` once when the snapshot has no sessions:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'

const createTerminal = vi.fn()
const selectTerminal = vi.fn()
const scrollToBottom = vi.fn()
const closeTerminalAndDismissDetailIfLast = vi.fn()
const reorderSessions = vi.fn()
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
  createTerminal.mockClear()
  selectTerminal.mockClear()
  scrollToBottom.mockClear()
  closeTerminalAndDismissDetailIfLast.mockClear()
  reorderSessions.mockClear()
})

vi.mock('#/web/components/terminal/terminal-session-context.ts', () => ({
  useTerminalSessionContext: () => ({
    createTerminal,
    selectTerminal,
    scrollToBottom,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  }),
}))

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalSnapshot: () => ({ sessions: [], selectedDescriptor: null }),
}))

vi.mock('#/web/components/terminal/TerminalTabs.tsx', () => ({
  EMPTY_TERMINAL_TAB_FOCUS_KEY: 'empty',
  TerminalTabs: () => <div data-testid="terminal-tabs" />,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/components/tab-strip/useFocusRegistry.ts', () => ({
  useFocusRegistry: () => ({ register: () => {}, unregister: () => {} }),
}))

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
  return root!
}

test('auto-creates the first session for a plain workspace', async () => {
  render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

  expect(createTerminal).toHaveBeenCalledTimes(1)
  expect(createTerminal).toHaveBeenCalledWith({
    repoRoot: '/repo',
    branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
    worktreePath: '/repo',
  })
})

test('does not create another first session on rerender', async () => {
  const root = render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

  await act(async () => {
    root.render(<PlainWorkspaceTerminalPanel repoId="/repo" />)
  })

  expect(createTerminal).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
bun run test src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: FAIL because `PlainWorkspaceTerminalPanel` still only renders the empty state when no terminal session exists.

- [ ] **Step 3: Add the one-shot bootstrap effect**

In `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`, add a `useRef` guard and an effect that creates the first session when `snapshot.sessions.length === 0`:

Update the React import to include the hooks used by the bootstrap logic:

```tsx
import { useCallback, useEffect, useMemo, useRef } from 'react'
```

```tsx
const bootstrappedRef = useRef(false)

useEffect(() => {
  if (bootstrappedRef.current) return
  if (snapshot.sessions.length > 0) return
  bootstrappedRef.current = true
  void createTerminal(terminalBase)
}, [createTerminal, snapshot.sessions.length, terminalBase])
```

Reset the guard when the workspace identity changes so a different plain workspace can bootstrap its own first session:

```tsx
useEffect(() => {
  bootstrappedRef.current = false
}, [terminalWorktreeKey])
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
bun run test src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: PASS.

---

### Task 2: Remove the Obsolete Placeholder and Lock Plain-Workspace Routing

**Files:**
- Modify: `src/web/components/RepoView.test.tsx`
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Delete: `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`

- [ ] **Step 1: Add regression assertions for the plain shell path**

Extend `src/web/components/RepoView.test.tsx` so the non-Git local workspace test also asserts that the Git empty-state copy is absent:

```tsx
expect(container?.querySelector('[data-testid="branch-detail"]')).toBeNull()
expect(container?.querySelector('[data-testid="repo-explorer-pane"]')).not.toBeNull()
expect(container?.textContent).not.toContain('branches.empty')
```

Extend `src/web/components/repo-workspace/RepoExplorerPane.test.tsx` so the plain-workspace test keeps asserting the files/terminal shell and also rejects the old placeholder path:

```tsx
expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
expect(container.querySelector('[data-testid="branch-list"]')).toBeNull()
expect(container.querySelector('[data-testid="branch-area-toolbar"]')).toBeNull()
expect(container.textContent).toContain('terminal.label')
expect(container.textContent).not.toContain('branches.empty')
```

- [ ] **Step 2: Remove the stale placeholder file**

Delete `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`.

- [ ] **Step 3: Run the targeted regression tests**

Run:

```bash
bun run test src/web/components/RepoView.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx
```

Expected: PASS, with no references to `NonGitRepoPlaceholder` or `branches.empty` in the plain-workspace path.

- [ ] **Step 4: Verify the placeholder is fully gone**

Run:

```bash
rg -n "NonGitRepoPlaceholder" src
```

Expected: no results.

---

## Final Verification

- Run `bun run test src/web/components/RepoView.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`
- Run `rg -n "branches.empty|NonGitRepoPlaceholder" src`
- Confirm plain non-Git local workspaces still open with files plus terminal, and the first terminal session appears automatically without a manual click.

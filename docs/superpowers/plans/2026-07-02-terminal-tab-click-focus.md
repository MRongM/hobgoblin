# Terminal Tab Click Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking any terminal session tab focuses the corresponding xterm input once while preserving existing tab selection and scroll behavior.

**Architecture:** Add a narrow `focusTerminal(key)` command to the terminal session context. `TerminalTabs` emits that command after existing click handling, and `ManagedTerminalSession` stores a one-shot pending focus when the view is not yet visible so focus is applied after attach/open.

**Tech Stack:** React 19, TypeScript strip-only mode, Zustand-backed React context, xterm.js, Vitest jsdom, Bun scripts.

---

## Scope Check

This plan covers one subsystem: terminal tab click focus. It does not change terminal canvas pointer focus, keyboard tab navigation, IME handling, paste, drag/drop, search, custom buttons, or mobile toolbar behavior.

## File Structure

- Modify `src/web/components/terminal/TerminalTabs.tsx`: add an optional `onFocusTerminal` click callback and call it after existing select/scroll logic.
- Modify `src/web/components/terminal/ManagedTerminalSession.ts`: add public `focus()` and one-shot pending focus handling for hidden or not-yet-open views.
- Modify `src/web/components/terminal/TerminalSessionRegistry.ts`: expose `focusTerminal(key)`.
- Modify `src/web/components/terminal/TerminalSessionProvider.tsx`: publish `focusTerminal` through command context.
- Modify `src/web/components/terminal/types.ts`: add `focusTerminal` and `focus` to the relevant interfaces.
- Modify `src/web/components/branch-detail/BranchDetailToolbar.tsx`: pass context `focusTerminal` into `TerminalTabs`.
- Modify `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`: pass context `focusTerminal` into `TerminalTabs`.
- Modify `src/web/components/terminal/TerminalTabs.test.tsx`: cover selected and unselected tab click focus emission.
- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`: cover immediate focus and pending focus after reattach.
- Modify `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`: cover production branch toolbar wiring.
- Modify `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`: cover plain workspace wiring.
- Modify terminal context fixture literals in `src/web/components/terminal/TerminalSlot.test.tsx` and `src/web/components/terminal/TerminalDeepLinkConsumer.test.tsx` so typecheck stays green.

Git operations are intentionally excluded from this plan because `AGENTS.md` says not to plan or execute commits unless the user explicitly asks.

### Task 1: TerminalTabs Click Contract

**Files:**
- Modify: `src/web/components/terminal/TerminalTabs.test.tsx`
- Modify: `src/web/components/terminal/TerminalTabs.tsx`

- [ ] **Step 1: Write failing tests for selected and unselected tab clicks**

Add these tests near the existing `TerminalTabs` click and keyboard tests in `src/web/components/terminal/TerminalTabs.test.tsx`:

```tsx
  test('focuses the selected terminal after scrolling it to bottom', () => {
    const onScrollToBottom = vi.fn()
    const onSelect = vi.fn()
    const onFocusTerminal = vi.fn()

    render(
      <TerminalTabs
        worktreeTerminalKey="/repo\0/repo/worktree"
        detailId="detail"
        panelActive
        sessions={[session({ key: 't1', selected: true, title: 'term-1' })]}
        onNew={() => {}}
        onSelect={onSelect}
        onScrollToBottom={onScrollToBottom}
        onFocusTerminal={onFocusTerminal}
        onClose={() => {}}
        onReorder={() => {}}
      />,
    )

    const tab = document.body.querySelector('#detail-terminal-tab')
    if (!(tab instanceof HTMLButtonElement)) throw new Error('missing selected terminal tab')

    act(() => {
      tab.click()
    })

    expect(onScrollToBottom).toHaveBeenCalledWith('t1')
    expect(onSelect).not.toHaveBeenCalled()
    expect(onFocusTerminal).toHaveBeenCalledTimes(1)
    expect(onFocusTerminal).toHaveBeenCalledWith('t1')
  })

  test('focuses an unselected terminal after selecting it', () => {
    const onScrollToBottom = vi.fn()
    const onSelect = vi.fn()
    const onFocusTerminal = vi.fn()

    render(
      <TerminalTabs
        worktreeTerminalKey="/repo\0/repo/worktree"
        detailId="detail"
        panelActive
        sessions={[
          session({ key: 't1', selected: true, title: 'term-1' }),
          session({ key: 't2', selected: false, title: 'term-2', terminalId: 'terminal-2', index: 2 }),
        ]}
        onNew={() => {}}
        onSelect={onSelect}
        onScrollToBottom={onScrollToBottom}
        onFocusTerminal={onFocusTerminal}
        onClose={() => {}}
        onReorder={() => {}}
      />,
    )

    const tab = document.body.querySelector('#detail-terminal-tab-t2')
    if (!(tab instanceof HTMLButtonElement)) throw new Error('missing unselected terminal tab')

    act(() => {
      tab.click()
    })

    expect(onSelect).toHaveBeenCalledWith('/repo\0/repo/worktree', 't2')
    expect(onScrollToBottom).not.toHaveBeenCalled()
    expect(onFocusTerminal).toHaveBeenCalledTimes(1)
    expect(onFocusTerminal).toHaveBeenCalledWith('t2')
  })
```

- [ ] **Step 2: Run the focused TerminalTabs tests and verify failure**

Run:

```bash
bun run test "src/web/components/terminal/TerminalTabs.test.tsx" -t "focuses"
```

Expected: both new tests fail because `onFocusTerminal` is not called.

- [ ] **Step 3: Implement the minimal TerminalTabs callback**

In `src/web/components/terminal/TerminalTabs.tsx`, add the prop:

```ts
  onFocusTerminal?: (key: string) => void
```

Destructure it with a no-op default in `TerminalTabs`:

```ts
  onFocusTerminal = () => {},
```

Update `handleSelect`:

```ts
  const handleSelect = useCallback(
    (key: string) => {
      const session = sessions.find((s) => s.key === key)
      if (!session) return
      if (session.selected && panelActive) {
        onScrollToBottom(key)
      } else {
        onSelect(worktreeTerminalKey, key)
      }
      onFocusTerminal(key)
    },
    [sessions, onSelect, onScrollToBottom, onFocusTerminal, worktreeTerminalKey, panelActive],
  )
```

- [ ] **Step 4: Run the focused TerminalTabs tests and verify pass**

Run:

```bash
bun run test "src/web/components/terminal/TerminalTabs.test.tsx" -t "focuses"
```

Expected: the two new tests pass.

### Task 2: Managed Session Focus Command

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/types.ts`

- [ ] **Step 1: Write failing tests for immediate and pending session focus**

Add these tests near the existing focus tests in `src/web/components/terminal/ManagedTerminalSession.test.ts`:

```ts
  test('focus delegates to the visible xterm view', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')
    const term = xtermMocks.terminals[0]!
    term.focus.mockClear()

    session.focus()

    expect(term.focus).toHaveBeenCalledTimes(1)
  })

  test('applies one pending focus after a parked session reattaches', async () => {
    const host = document.createElement('div')
    const parking = document.createElement('div')
    document.body.append(host, parking)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')
    const term = xtermMocks.terminals[0]!
    term.focus.mockClear()

    session.detach(host, parking)
    session.focus()

    expect(term.focus).not.toHaveBeenCalled()

    session.attach(host)

    expect(term.focus).toHaveBeenCalledTimes(1)

    session.attach(host)

    expect(term.focus).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: Run the ManagedTerminalSession focus tests and verify failure**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "focus"
```

Expected: the new tests fail because `ManagedTerminalSession.focus` does not exist.

- [ ] **Step 3: Implement one-shot focus in ManagedTerminalSession**

In `src/web/components/terminal/ManagedTerminalSession.ts`, add a field near the other private state:

```ts
  private pendingFocus = false
```

Add the public method after `detach()`:

```ts
  focus(): void {
    if (this.disposed) return
    if (!this.view.isVisible() || !this.view.currentTerminal()) {
      this.pendingFocus = true
      return
    }
    this.pendingFocus = false
    this.view.focus()
  }
```

Add a private helper near `focus()` or before `start()`:

```ts
  private flushPendingFocus(): void {
    if (!this.pendingFocus) return
    if (!this.view.isVisible() || !this.view.currentTerminal()) return
    this.pendingFocus = false
    this.view.focus()
  }
```

Call it at the end of `attach()` after the existing start/fit branch:

```ts
    this.flushPendingFocus()
```

Call it at the end of `finalizePhase()` after `notify('metadata')`:

```ts
    this.flushPendingFocus()
```

In `src/web/components/terminal/types.ts`, add `focus` to `ManagedTerminalSessionLike`:

```ts
  focus: () => void
```

- [ ] **Step 4: Run the ManagedTerminalSession focus tests and verify pass**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "focus"
```

Expected: the new focus tests pass, and existing focus tests still pass.

### Task 3: Terminal Context Focus API

**Files:**
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalDeepLinkConsumer.test.tsx`

- [ ] **Step 1: Add the context type member**

In `src/web/components/terminal/types.ts`, add this member to `TerminalSessionContextValue` after `scrollToBottom`:

```ts
  focusTerminal: (key: string) => void
```

- [ ] **Step 2: Add registry command**

In `src/web/components/terminal/TerminalSessionRegistry.ts`, add this method after `scrollToBottom`:

```ts
  focusTerminal = (key: string): void => {
    this.sessions.get(key)?.focus()
  }
```

- [ ] **Step 3: Publish the command through provider context**

In `src/web/components/terminal/TerminalSessionProvider.tsx`, add this property to `commandValue` near `scrollToBottom`:

```ts
      focusTerminal: registry.focusTerminal,
```

- [ ] **Step 4: Update terminal context test fixtures**

In every `TerminalSessionContextValue` literal in `src/web/components/terminal/TerminalSlot.test.tsx`, add:

```ts
      focusTerminal: vi.fn(),
```

In the `terminalContext()` helper in `src/web/components/terminal/TerminalSlot.test.tsx`, add:

```ts
    focusTerminal: vi.fn(),
```

In the `commandContext` literal in `src/web/components/terminal/TerminalDeepLinkConsumer.test.tsx`, add:

```ts
    focusTerminal: vi.fn(),
```

- [ ] **Step 5: Run typecheck for context shape**

Run:

```bash
bun run typecheck
```

Expected: no missing `focusTerminal` property errors remain.

### Task 4: Branch Toolbar Wiring

**Files:**
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`
- Modify: `src/web/components/branch-detail/BranchDetailToolbar.tsx`

- [ ] **Step 1: Extend BranchDetailToolbar test fixture with focusTerminal**

In `src/web/components/branch-detail/BranchDetailToolbar.test.tsx`, add the mock near `scrollToBottom` in `renderToolbar()`:

```ts
  const focusTerminal = vi.fn()
```

Add it to `commandContext` near `scrollToBottom`:

```ts
    focusTerminal,
```

Add it to the returned `mocks` object type:

```ts
    focusTerminal: ReturnType<typeof vi.fn>
```

Add it to the returned `mocks` value:

```ts
      focusTerminal,
```

- [ ] **Step 2: Add failing expectations to existing click tests**

In `clicking a selected session tab when not in terminal panel navigates to terminal`, add:

```ts
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t1')
```

In `clicking a selected session tab in terminal panel scrolls to bottom`, add:

```ts
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t1')
```

In `clicking an unselected session tab navigates and selects it`, add:

```ts
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t2')
```

- [ ] **Step 3: Run BranchDetailToolbar tests and verify failure**

Run:

```bash
bun run test "src/web/components/branch-detail/BranchDetailToolbar.test.tsx"
```

Expected: the edited tests fail because `BranchDetailToolbar` does not pass `focusTerminal` into `TerminalTabs`.

- [ ] **Step 4: Wire focusTerminal in BranchDetailToolbar**

In `src/web/components/branch-detail/BranchDetailToolbar.tsx`, change the context destructuring to include `focusTerminal`:

```ts
  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()
```

Pass it to `TerminalTabs`:

```tsx
            onFocusTerminal={focusTerminal}
```

- [ ] **Step 5: Run BranchDetailToolbar tests and verify pass**

Run:

```bash
bun run test "src/web/components/branch-detail/BranchDetailToolbar.test.tsx"
```

Expected: all BranchDetailToolbar tests pass.

### Task 5: Plain Workspace Wiring

**Files:**
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`
- Modify: `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`

- [ ] **Step 1: Capture TerminalTabs props in the plain workspace test**

In `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx`, add these hoisted values near the existing command mocks:

```ts
const focusTerminal = vi.fn()
const terminalTabsProps: Array<Record<string, unknown>> = []
```

Add `focusTerminal` to the mocked `useTerminalSessionContext` return value:

```ts
    focusTerminal,
```

Change the `TerminalTabs` mock to capture props:

```tsx
vi.mock('#/web/components/terminal/TerminalTabs.tsx', () => ({
  EMPTY_TERMINAL_TAB_FOCUS_KEY: 'empty',
  TerminalTabs: (props: Record<string, unknown>) => {
    terminalTabsProps.push(props)
    return <div data-testid="terminal-tabs" />
  },
}))
```

In `beforeEach`, clear the new mock state:

```ts
  focusTerminal.mockClear()
  terminalTabsProps.length = 0
```

- [ ] **Step 2: Write failing plain workspace wiring test**

Add this test in `PlainWorkspaceTerminalPanel`:

```tsx
  test('passes terminal focus command to terminal tabs', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    expect(terminalTabsProps[0]?.onFocusTerminal).toBe(focusTerminal)
  })
```

- [ ] **Step 3: Run PlainWorkspaceTerminalPanel tests and verify failure**

Run:

```bash
bun run test "src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx"
```

Expected: the new test fails because `PlainWorkspaceTerminalPanel` does not pass `onFocusTerminal`.

- [ ] **Step 4: Wire focusTerminal in PlainWorkspaceTerminalPanel**

In `src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx`, change the context destructuring to include `focusTerminal`:

```ts
  const {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  } = useTerminalSessionContext()
```

Pass it to `TerminalTabs`:

```tsx
            onFocusTerminal={focusTerminal}
```

- [ ] **Step 5: Run PlainWorkspaceTerminalPanel tests and verify pass**

Run:

```bash
bun run test "src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx"
```

Expected: all PlainWorkspaceTerminalPanel tests pass.

### Task 6: Targeted Regression Run

**Files:**
- No file edits.

- [ ] **Step 1: Run terminal tab tests**

Run:

```bash
bun run test "src/web/components/terminal/TerminalTabs.test.tsx"
```

Expected: all TerminalTabs tests pass.

- [ ] **Step 2: Run managed terminal session tests**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: all ManagedTerminalSession tests pass.

- [ ] **Step 3: Run branch toolbar tests**

Run:

```bash
bun run test "src/web/components/branch-detail/BranchDetailToolbar.test.tsx"
```

Expected: all BranchDetailToolbar tests pass.

- [ ] **Step 4: Run plain workspace panel tests**

Run:

```bash
bun run test "src/web/components/repo-workspace/PlainWorkspaceTerminalPanel.test.tsx"
```

Expected: all PlainWorkspaceTerminalPanel tests pass.

### Task 7: Full Verification

**Files:**
- No file edits.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes.

- [ ] **Step 2: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: architecture guard passes.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: full Vitest suite passes.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git diff --stat
```

Expected: changes are limited to the planned terminal, branch toolbar, plain workspace, tests, and planning files.

## Self-Review

- Spec coverage: every goal maps to a task. Tab clicks emit focus in Task 1, session focus is reliable across attach/open in Task 2, command plumbing is implemented in Task 3, Git workspace wiring is covered in Task 4, plain workspace wiring is covered in Task 5, and verification is covered in Tasks 6 and 7.
- Placeholder scan: no unfinished requirements and no generic "add tests" steps.
- Type consistency: the API name is consistently `focusTerminal(key: string): void`; the session method is consistently `focus(): void`.
- Scope check: the plan does not restore terminal canvas pointer focus and does not alter keyboard navigation, IME, paste, drag/drop, search, or mobile toolbar behavior.

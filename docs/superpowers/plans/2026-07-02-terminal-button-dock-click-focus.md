# Terminal Button Dock Click Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking any terminal bottom-dock custom button returns focus to the active xterm input once, while manual terminal input and Enter remain unchanged.

**Architecture:** Keep the behavior at the `TerminalSlot` dock button click boundary. Reuse the existing `focusTerminal(key)` context command, which already delegates to `ManagedTerminalSession.focus()` and its pending-focus semantics.

**Tech Stack:** React 19, TypeScript strip-only mode, xterm.js session context, Vitest jsdom, Bun scripts.

---

## Scope Check

This plan covers one narrow interaction: terminal bottom dock custom button clicks. It does not modify xterm manual input, xterm Enter handling, `ManagedTerminalSession.writeInput()`, pointer focus, search Enter, mobile toolbar, paste, drag/drop, or terminal protocol attribution.

There are unrelated dirty files in the worktree under branch action components. Do not edit, format, revert, or include them in this task.

## File Structure

- Modify `src/web/components/terminal/TerminalSlot.test.tsx`: add focus assertions for custom button `execute` and `input` actions.
- Modify `src/web/components/terminal/TerminalSlot.tsx`: destructure `focusTerminal` from terminal session context and call it once after dock button writes.

Git operations are intentionally excluded because `AGENTS.md` says not to plan or execute commits unless the user explicitly asks.

### Task 1: Button Dock Focus Tests

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [x] **Step 1: Add failing focus assertions for the existing input-mode custom button test**

In `src/web/components/terminal/TerminalSlot.test.tsx`, update the existing `sends input-mode custom button text without enter` test.

Find:

```ts
    const writeInput = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput })
```

Replace with:

```ts
    const writeInput = vi.fn()
    const focusTerminal = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput, focusTerminal })
```

After the existing write assertions:

```ts
      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git commit -m ""')
      expect(writeInput.mock.calls[0]![1]).not.toContain('\r')
```

Add:

```ts
      expect(focusTerminal).toHaveBeenCalledTimes(1)
      expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
```

- [x] **Step 2: Add a failing execute-mode custom button test**

Add this test near the input-mode custom button test in `src/web/components/terminal/TerminalSlot.test.tsx`:

```tsx
  test('focuses terminal after execute-mode custom button sends enter', async () => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    runtimeSettingsMocks.terminalCustomButtons = [{ label: 'status', value: 'git status', action: 'execute' }]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const writeInput = vi.fn()
    const focusTerminal = vi.fn()
    const { worktreeSnapshot, snapshot } = controllerFixture()
    const context = terminalContext({ writeInput, focusTerminal })
    const readContext: TerminalSessionReadContextValue = {
      worktreeSnapshot: () => worktreeSnapshot,
      subscribeWorktree: () => () => {},
      repoSyncReady: () => true,
      subscribeRepoSync: () => () => {},
      snapshot: () => snapshot,
      subscribeSnapshot: () => () => {},
    }

    await act(async () => {
      root.render(
        <TerminalSessionContext.Provider value={context}>
          <TerminalSessionReadContext.Provider value={readContext}>
            <TerminalSlot repoRoot="/repo" branch="feature" worktreePath="/worktree" />
          </TerminalSessionReadContext.Provider>
        </TerminalSessionContext.Provider>,
      )
    })

    try {
      const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === 'status')
      expect(button).toBeInstanceOf(HTMLButtonElement)

      await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(writeInput).toHaveBeenCalledWith('terminal-1', 'git status\r')
      expect(focusTerminal).toHaveBeenCalledTimes(1)
      expect(focusTerminal).toHaveBeenCalledWith('terminal-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
```

- [x] **Step 3: Run TerminalSlot tests and verify RED**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSlot.test.tsx" -t "custom button"
```

Expected: the changed/new custom button tests fail because `focusTerminal` is not called by dock button clicks.

### Task 2: Button Dock Focus Implementation

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

- [x] **Step 1: Destructure focusTerminal from context**

In `src/web/components/terminal/TerminalSlot.tsx`, find the terminal session context destructuring:

```ts
    scrollLines,
    isTerminalFocusTarget,
```

Change it to:

```ts
    scrollLines,
    focusTerminal,
    isTerminalFocusTarget,
```

- [x] **Step 2: Focus after custom button writes**

In the custom button `onClick`, replace:

```tsx
                  onClick={() => {
                    if (action === 'input') writeInput(key, button.value)
                    else writeInput(key, `${button.value}\r`)
                  }}
```

With:

```tsx
                  onClick={() => {
                    if (action === 'input') writeInput(key, button.value)
                    else writeInput(key, `${button.value}\r`)
                    focusTerminal(key)
                  }}
```

This keeps both existing write behaviors unchanged and adds one explicit focus request after the dock button click.

- [x] **Step 3: Run TerminalSlot custom button tests and verify GREEN**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSlot.test.tsx" -t "custom button"
```

Expected: the custom button tests pass.

### Task 3: Targeted Regression

**Files:**
- No file edits.

- [x] **Step 1: Run full TerminalSlot tests**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSlot.test.tsx"
```

Expected: all `TerminalSlot` tests pass.

- [x] **Step 2: Run session focus tests**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "focus"
```

Expected: existing session focus and pending-focus tests pass. This confirms the reused `focusTerminal` path remains valid.

### Task 4: Full Verification

**Files:**
- No file edits.

- [x] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes.

- [x] **Step 2: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: architecture guard passes.

- [x] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: full Vitest suite passes.

- [x] **Step 4: Inspect changed files**

Run:

```bash
git diff -- src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/TerminalSlot.test.tsx docs/superpowers/specs/2026-07-02-terminal-enter-submit-focus-design.md docs/superpowers/plans/2026-07-02-terminal-button-dock-click-focus.md
```

Expected: terminal dock focus changes are limited to `TerminalSlot`, `TerminalSlot.test`, the approved spec, and this plan.

## Self-Review

- Spec coverage: Task 1 covers execute and input dock buttons; Task 2 implements the single focus call; Task 3 and Task 4 verify targeted and full behavior.
- Placeholder scan: no unfinished requirements and no generic "add tests" steps.
- Type consistency: the API is consistently `focusTerminal(key: string): void`; no `TerminalInput` type changes are planned.
- Scope check: the plan does not modify manual xterm input, xterm Enter handling, `ManagedTerminalSession.writeInput()`, search Enter, pointer focus, or mobile toolbar behavior.

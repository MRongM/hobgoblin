# Terminal Pointer Focus Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Hobgoblin's custom terminal `pointerdown -> term.focus()` behavior while keeping explicit terminal focus calls intact.

**Architecture:** This is a narrow deletion in `TerminalSessionView`: remove the frame-level pointer handler, its constructor registration, and its dispose cleanup. Test coverage changes from "mobile tap focuses terminal" to "mobile tap does not call the application-level focus hook", protecting the desired absence of this wrapper behavior.

**Tech Stack:** TypeScript, React-adjacent DOM code, xterm.js, Vitest, Bun.

---

## File Structure

- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Owns terminal session behavior tests and the xterm test double.
  - The mobile tap focus test will become a negative regression test.
- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Owns the terminal DOM frame, xterm host, explicit `focus()`, attach/detach cleanup, and xterm integration.
  - The only behavior removed here is the frame-level pointer listener that calls `term.focus()`.
- No new source files.
- No git commit step is included because repository instructions say not to plan or execute commits unless the user explicitly requests them.

## Task 1: Replace The Mobile Tap Focus Test With A Negative Regression Test

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Replace the positive mobile tap focus test**

Replace the existing test named `focuses xterm when the mobile user taps the terminal` with this exact test:

```ts
  test('does not focus xterm when the mobile user taps the terminal', async () => {
    const restoreUserAgent = setMobileUserAgent()
    try {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const session = new ManagedTerminalSession(descriptor, vi.fn())
      hydrateManagedSession(session)

      session.attach(host)
      await flushTerminalStart()
      await flushUntil(() => session.snapshot().phase === 'open')
      const term = xtermMocks.terminals[0]!
      term.focus.mockClear()

      host.querySelector('.xterm')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))

      expect(term.focus).not.toHaveBeenCalled()
    } finally {
      restoreUserAgent()
    }
  })
```

- [ ] **Step 2: Run the terminal session test and verify the new test fails before implementation**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result before implementation:

```text
FAIL src/web/components/terminal/ManagedTerminalSession.test.ts
expected "spy" to not be called
```

The failure proves the current `pointerdown` listener still calls `term.focus()`.

## Task 2: Remove The Frame-Level Pointer Focus Listener

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Delete the pointerdown handler field**

Remove this field from `TerminalSessionView`:

```ts
  private readonly handleTerminalPointerDown = (event: Event) => {
    if (!(event.target instanceof Node)) return
    if (!this.xtermHost.contains(event.target)) return
    if ('button' in event && typeof event.button === 'number' && event.button !== 0) return
    this.term?.focus()
  }
```

After removal, the class field section should flow directly from the keyboard resolver into the constructor:

```ts
  private readonly safariShiftKeyResolver = new SafariShiftKeyResolver()

  constructor(
    handlers: {
      onInput: (data: TerminalInput) => void
      onBell: () => void
      onResize: (size: { cols: number; rows: number }) => void
      onSearchResult: (event: ISearchResultChangeEvent) => void
      onProgress: (state: number, value: number) => void
      onOpenExternalLink: (uri: string) => void
      onRenderRecoveryRequest: () => void
    },
    options: { fontSize?: number; terminalThemeMode?: () => TerminalThemeMode } = {},
  ) {
```

- [ ] **Step 2: Remove the constructor listener registration**

In the constructor, remove:

```ts
    this.frame.addEventListener('pointerdown', this.handleTerminalPointerDown)
```

The surrounding constructor body should become:

```ts
    this.frame = document.createElement('div')
    this.frame.className = 'goblin-managed-terminal-frame'
    this.xtermHost = document.createElement('div')
    this.xtermHost.className = 'goblin-managed-terminal-host'
    this.frame.appendChild(this.xtermHost)
    this.parkingElement = document.createElement('div')
    this.parkingElement.className = 'goblin-terminal-parking__item'
    this.handlers = handlers
```

- [ ] **Step 3: Remove the dispose cleanup for the deleted listener**

In `disposeFrame()`, remove:

```ts
    this.frame.removeEventListener('pointerdown', this.handleTerminalPointerDown)
```

The method should become:

```ts
  disposeFrame(): void {
    this.parkingElement.remove()
    this.frame.remove()
  }
```

- [ ] **Step 4: Keep explicit focus behavior unchanged**

Verify this method remains present and unchanged:

```ts
  focus(): void {
    this.term?.focus()
  }
```

Also verify `ManagedTerminalSession.autoFocusView()` remains unchanged:

```ts
  private autoFocusView(): void {
    if (isMobileDevice()) return
    if (this.view.isVisible()) this.view.focus()
  }
```

- [ ] **Step 5: Run the terminal session test and verify it passes**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result:

```text
Test Files  1 passed (1)
```

## Task 3: Verify No Pointer Focus Logic Remains

**Files:**
- Inspect: `src/web/components/terminal/terminal-session-view.ts`
- Inspect: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Inspect: `src/web/components/terminal/**`

- [ ] **Step 1: Search for deleted pointer focus symbols**

Run:

```bash
rg -n "handleTerminalPointerDown|frame\\.addEventListener\\('pointerdown'|frame\\.removeEventListener\\('pointerdown'|pointerdown.*term\\.focus|focuses xterm when the mobile user taps the terminal" "src/web/components/terminal"
```

Expected result:

```text
```

The command should exit with code `1` because there are no matches.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun run test
```

Expected result:

```text
Test Files  249 passed
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result:

```text
[typecheck] all projects passed
```

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected result:

```text
[architecture] import boundaries passed
```

- [ ] **Step 5: Check working tree summary**

Run:

```bash
git status --short
```

Expected result:

```text
 M src/web/components/terminal/ManagedTerminalSession.test.ts
 M src/web/components/terminal/terminal-session-view.ts
?? docs/superpowers/plans/2026-07-02-terminal-pointer-focus-removal.md
?? docs/superpowers/specs/2026-07-02-terminal-pointer-focus-removal-design.md
```

Additional lines from earlier approved work may also appear. Do not revert unrelated changes.

## Plan Self-Review

- Spec coverage: Task 1 covers test semantics, Task 2 removes the wrapper-level pointer listener, and Task 3 verifies the deleted symbols plus test/type/architecture health.
- Scope control: The plan keeps `TerminalSessionView.focus()` and `ManagedTerminalSession.autoFocusView()` unchanged, so explicit focus paths remain intact.
- Type consistency: All referenced symbols match current code names: `handleTerminalPointerDown`, `xtermHost`, `disposeFrame()`, `focus()`, and `autoFocusView()`.
- Regression protection: The negative mobile tap test fails before implementation and passes after deleting the listener.

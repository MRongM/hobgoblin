# Terminal Render Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the front-end xterm render path so high-frequency Codex output leaves scrollback history readable without restarting Codex or closing the terminal session.

**Architecture:** Keep server PTY, replay, snapshot, and realtime output unchanged. Add render stabilization inside `TerminalSessionView`, with `ManagedTerminalSession` only handling front-end view recovery when repaint calls fail. Tests live in the existing terminal session test file and extend the local xterm mock to simulate viewport scrolling.

**Tech Stack:** TypeScript, React renderer runtime, xterm.js 6, Vitest with jsdom, Bun scripts.

---

## File Structure

- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Owns xterm instance lifecycle, viewport scroll listener, output-settle repaint timer, visible-row refresh, and repaint failure reporting.
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
  - Receives a render recovery request from `TerminalSessionView`, destroys only the front-end xterm instance, and reattaches the same server session.
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Extends `MockTerminal` with a real `.xterm-viewport`, `scrollLines`, `scrollToLine`, and test helpers.
  - Adds regression tests for output-settle repaint, scroll-time repaint, scroll position preservation, and front-end-only recovery.

Do not modify server terminal files for this issue. The confirmed failure is render-layer-only because replaying or resuming the same session shows complete content.

## Preflight

- [ ] **Step 1: Confirm the current worktree before editing**

Run:

```bash
git status --short
```

Expected: existing terminal-related modified files may already be present. Do not revert them. When committing during this plan, stage only the files changed by the current task.

- [ ] **Step 2: Re-read the approved design**

Run:

```bash
sed -n '1,180p' "docs/superpowers/specs/2026-06-28-terminal-render-stability-design.md"
```

Expected: the design states that this fix stays in the front-end xterm render layer and does not change server transport.

---

### Task 1: Add xterm Viewport Test Support

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Write the mock viewport support**

In `MockTerminal`, add `viewportElement`, `scrollLines`, `scrollToLine`, `emitViewportScroll`, and make `open()` create `.xterm-viewport`.

```ts
viewportElement: HTMLDivElement | null = null
scrollLines = vi.fn((amount: number) => {
  const active = this.buffer.active
  const nextViewportY = Math.max(0, Math.min(active.baseY, active.viewportY + amount))
  active.viewportY = nextViewportY
  this.dispatchViewportScroll()
})
scrollToLine = vi.fn((line: number) => {
  const active = this.buffer.active
  active.viewportY = Math.max(0, Math.min(active.baseY, line))
  this.dispatchViewportScroll()
})

open(host: HTMLElement) {
  this.element = document.createElement('div')
  this.element.className = 'xterm'
  this.viewportElement = document.createElement('div')
  this.viewportElement.className = 'xterm-viewport'
  this.textarea = document.createElement('textarea')
  this.element.append(this.viewportElement, this.textarea)
  host.appendChild(this.element)
}

emitViewportScroll(viewportY: number): void {
  this.buffer.active.viewportY = Math.max(0, Math.min(this.buffer.active.baseY, viewportY))
  this.dispatchViewportScroll()
}

private dispatchViewportScroll(): void {
  this.viewportElement?.dispatchEvent(new Event('scroll'))
}
```

- [ ] **Step 2: Run the existing terminal tests to catch mock regressions**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: existing tests pass before behavior tests are added. If a test fails because it assumed the textarea was the first child of `.xterm`, update the assertion to query for `textarea` directly instead of relying on child order.

- [ ] **Step 3: Commit the test mock support**

```bash
git add "src/web/components/terminal/ManagedTerminalSession.test.ts"
git commit -m "test: add terminal viewport mock support"
```

---

### Task 2: TDD Output-Settle Repaint

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Add failing tests for settle repaint**

Add these tests near the existing output batching tests in `ManagedTerminalSession.test.ts`.

```ts
  test('settle-repaints visible rows after high-frequency output grows scrollback', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    term.buffer.active.baseY = 20
    term.buffer.active.viewportY = 20
    term.refresh.mockClear()
    term.scrollToBottom.mockClear()
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      term.buffer.active.baseY = 96
      term.buffer.active.viewportY = 96
      queueMicrotask(() => callback?.())
    })

    session.handleOutput({ sessionId: 'session-1', data: 'line-1\r\nline-2\r\n', seq: 1, processName: 'zsh' })
    session.handleOutput({ sessionId: 'session-1', data: 'line-3\r\nline-4\r\n', seq: 2, processName: 'zsh' })
    await flushTerminalRenderSettle()

    expect(term.refresh).toHaveBeenCalledWith(0, term.rows - 1)
    expect(term.scrollToBottom).not.toHaveBeenCalled()
  })

  test('settle repaint preserves a scrolled history viewport', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    term.buffer.active.baseY = 80
    term.buffer.active.viewportY = 24
    term.refresh.mockClear()
    term.scrollToBottom.mockClear()
    term.scrollToLine.mockClear()
    term.write.mockImplementation((_data: string, callback?: () => void) => {
      term.buffer.active.baseY = 140
      term.buffer.active.viewportY = 24
      queueMicrotask(() => callback?.())
    })

    session.handleOutput({ sessionId: 'session-1', data: 'many-lines\r\n', seq: 1, processName: 'zsh' })
    await flushTerminalRenderSettle()

    expect(term.refresh).toHaveBeenCalledWith(0, term.rows - 1)
    expect(term.scrollToBottom).not.toHaveBeenCalled()
    expect(term.buffer.active.viewportY).toBe(24)
  })
```

Add this helper near the existing flush helpers.

```ts
async function flushTerminalRenderSettle(): Promise<void> {
  await flushTerminalStart()
  await new Promise((resolve) => setTimeout(resolve, 120))
  await Promise.resolve()
}
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "settle"
```

Expected: FAIL because `TerminalSessionView` does not yet schedule output-settle repaint after `baseY` growth.

- [ ] **Step 3: Implement output-settle repaint in `terminal-session-view.ts`**

Add constants and state fields.

```ts
const OUTPUT_RENDER_SETTLE_MS = 80

interface TerminalViewportSnapshot {
  viewportY: number | null
  baseY: number | null
  rows: number
  atBottom: boolean
}
```

```ts
  private outputSettleTimer: number | null = null
  private scrollbackRenderDirty = false
```

Update `writeOutput()`.

```ts
  writeOutput(data: string, callback?: () => void): void {
    const term = this.term
    if (!term) {
      callback?.()
      return
    }
    const before = readTerminalViewportSnapshot(term)
    this.outputWriteDepth += 1
    term.write(data, () => {
      this.outputWriteDepth = Math.max(0, this.outputWriteDepth - 1)
      this.handleOutputWriteParsed(term, before)
      callback?.()
    })
  }

  private handleOutputWriteParsed(term: XTermTerminal, before: TerminalViewportSnapshot): void {
    if (this.term !== term) return
    const after = readTerminalViewportSnapshot(term)
    if (before.baseY !== null && after.baseY !== null && after.baseY > before.baseY) {
      this.scrollbackRenderDirty = true
    }
    if (this.scrollbackRenderDirty) this.scheduleOutputSettleRepaint()
  }

  private scheduleOutputSettleRepaint(): void {
    this.cancelOutputSettleRepaint()
    this.outputSettleTimer = window.setTimeout(() => {
      this.outputSettleTimer = null
      this.repaintVisibleRowsPreservingViewport()
      this.scrollbackRenderDirty = false
    }, OUTPUT_RENDER_SETTLE_MS)
  }

  private cancelOutputSettleRepaint(): void {
    if (this.outputSettleTimer === null) return
    window.clearTimeout(this.outputSettleTimer)
    this.outputSettleTimer = null
  }

  private repaintVisibleRowsPreservingViewport(): void {
    const term = this.term
    if (!term) return
    const before = readTerminalViewportSnapshot(term)
    refreshVisibleRows(term)
    restoreTerminalViewport(term, before.viewportY)
  }
```

Add helper functions near `isTerminalAtBottom()`.

```ts
function readTerminalViewportSnapshot(term: XTermTerminal): TerminalViewportSnapshot {
  const active = term.buffer?.active as { viewportY?: number; baseY?: number } | undefined
  const viewportY = typeof active?.viewportY === 'number' ? active.viewportY : null
  const baseY = typeof active?.baseY === 'number' ? active.baseY : null
  return {
    viewportY,
    baseY,
    rows: term.rows,
    atBottom: baseY === null || viewportY === null ? true : viewportY >= baseY,
  }
}

function refreshVisibleRows(term: XTermTerminal): void {
  term.refresh(0, Math.max(0, term.rows - 1))
}

function restoreTerminalViewport(term: XTermTerminal, viewportY: number | null): void {
  if (viewportY === null) return
  const active = term.buffer?.active as { viewportY?: number } | undefined
  if (active?.viewportY === viewportY) return
  term.scrollToLine(viewportY)
}
```

Update `destroyTerminal()` to cancel the settle timer.

```ts
    this.cancelFontFit()
    this.cancelPinToBottom()
    this.cancelOutputSettleRepaint()
```

- [ ] **Step 4: Run settle tests and existing output tests**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "settle|output"
```

Expected: PASS for settle tests and existing output batching tests.

- [ ] **Step 5: Commit output-settle repaint**

```bash
git add "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/web/components/terminal/terminal-session-view.ts"
git commit -m "fix: repaint terminal scrollback after output settles"
```

---

### Task 3: TDD Scroll-Time Repaint

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Add failing scroll repaint tests**

Add these tests near the existing resize/font scroll preservation tests.

```ts
  test('refreshes visible rows when the user scrolls rendered terminal history', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    term.buffer.active.baseY = 200
    term.buffer.active.viewportY = 200
    term.refresh.mockClear()
    term.scrollToBottom.mockClear()

    term.emitViewportScroll(64)
    await flushTerminalStart()

    expect(term.refresh).toHaveBeenCalledWith(0, term.rows - 1)
    expect(term.scrollToBottom).not.toHaveBeenCalled()
    expect(term.buffer.active.viewportY).toBe(64)
  })

  test('coalesces rapid terminal viewport scroll repaint into one animation frame', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const term = xtermMocks.terminals[0]!
    term.buffer.active.baseY = 200
    term.refresh.mockClear()

    term.emitViewportScroll(150)
    term.emitViewportScroll(120)
    term.emitViewportScroll(90)
    await flushTerminalStart()

    expect(term.refresh).toHaveBeenCalledTimes(1)
    expect(term.refresh).toHaveBeenCalledWith(0, term.rows - 1)
    expect(term.buffer.active.viewportY).toBe(90)
  })
```

- [ ] **Step 2: Run the new scroll tests and verify they fail**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "viewport scroll|scrolls rendered"
```

Expected: FAIL because no `.xterm-viewport` scroll listener schedules repaint.

- [ ] **Step 3: Implement viewport scroll listener and repaint**

Add state fields.

```ts
  private viewportElement: HTMLElement | null = null
  private viewportRefreshFrame: number | null = null
  private readonly handleViewportScroll = () => this.scheduleViewportRefresh()
```

Install the listener after `term.open(this.xtermHost)`.

```ts
    term.open(this.xtermHost)
    this.installViewportScrollListener(term)
```

Add listener and frame helpers.

```ts
  private installViewportScrollListener(term: XTermTerminal): void {
    this.disconnectViewportScrollListener()
    const viewportElement = term.element?.querySelector<HTMLElement>('.xterm-viewport') ?? null
    if (!viewportElement) return
    this.viewportElement = viewportElement
    viewportElement.addEventListener('scroll', this.handleViewportScroll, { passive: true })
  }

  private disconnectViewportScrollListener(): void {
    this.viewportElement?.removeEventListener('scroll', this.handleViewportScroll)
    this.viewportElement = null
    this.cancelViewportRefresh()
  }

  private scheduleViewportRefresh(): void {
    if (!this.term || this.viewportRefreshFrame !== null) return
    this.viewportRefreshFrame = requestAnimationFrame(() => {
      this.viewportRefreshFrame = null
      this.repaintVisibleRowsPreservingViewport()
    })
  }

  private cancelViewportRefresh(): void {
    if (this.viewportRefreshFrame === null) return
    cancelScheduledAnimationFrame(this.viewportRefreshFrame)
    this.viewportRefreshFrame = null
  }
```

Update `destroyTerminal()`.

```ts
    this.disconnectResizeObserver()
    this.disconnectViewportScrollListener()
    this.cancelFitFlush()
```

- [ ] **Step 4: Run scroll tests**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "viewport scroll|scrolls rendered"
```

Expected: PASS.

- [ ] **Step 5: Run full terminal session test file**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: PASS.

- [ ] **Step 6: Commit scroll-time repaint**

```bash
git add "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/web/components/terminal/terminal-session-view.ts"
git commit -m "fix: refresh terminal history while scrolling"
```

---

### Task 4: TDD Front-End-Only Render Recovery

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Add a failing recovery test**

Add this test near the other output/render tests.

```ts
  test('recovers a failed repaint by rebuilding only the front-end terminal view', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const session = new ManagedTerminalSession(descriptor, vi.fn())
    hydrateManagedSession(session)
    session.attach(host)
    await flushTerminalStart()
    await flushUntil(() => session.snapshot().phase === 'open')

    const firstTerm = xtermMocks.terminals[0]!
    firstTerm.buffer.active.baseY = 120
    firstTerm.buffer.active.viewportY = 40
    firstTerm.refresh.mockImplementationOnce(() => {
      throw new Error('render refresh failed')
    })
    firstTerm.dispose.mockClear()
    terminalCalls.close.mockClear()
    terminalCalls.attach.mockClear()

    firstTerm.emitViewportScroll(40)
    await flushTerminalStart()

    expect(firstTerm.dispose).toHaveBeenCalled()
    expect(xtermMocks.terminals).toHaveLength(2)
    expect(terminalCalls.attach).toHaveBeenCalledWith({ sessionId: 'session-1', cols: 100, rows: 30 })
    expect(terminalCalls.close).not.toHaveBeenCalled()
    expect(session.currentSessionId()).toBe('session-1')
  })
```

- [ ] **Step 2: Run the recovery test and verify it fails**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "recovers a failed repaint"
```

Expected: FAIL because `TerminalSessionView` does not catch repaint failures or request a front-end rebuild.

- [ ] **Step 3: Add a recovery callback from view to session**

In `TerminalSessionView` constructor handler type, add:

```ts
      onRenderRecoveryRequest: () => void
```

In `ManagedTerminalSession` construction of `TerminalSessionView`, pass:

```ts
      onRenderRecoveryRequest: () => this.recoverActiveView(),
```

Add this method to `ManagedTerminalSession`.

```ts
  private recoverActiveView(): void {
    if (this.disposed) return
    const sessionId = this.runtime.currentSessionId()
    if (!sessionId) return
    if (!this.view.isConnected()) return
    this.destroyActiveView({ preserveTransientState: true })
    this.start()
  }
```

- [ ] **Step 4: Catch repaint failures and request recovery**

In `TerminalSessionView`, add a repaint helper that catches exceptions.

```ts
  private safeRefreshVisibleRows(term: XTermTerminal): boolean {
    try {
      refreshVisibleRows(term)
      return true
    } catch (err) {
      console.warn('[terminal] failed to repaint terminal viewport', err)
      this.handlers.onRenderRecoveryRequest()
      return false
    }
  }
```

Update `repaintVisibleRowsPreservingViewport()`.

```ts
  private repaintVisibleRowsPreservingViewport(): void {
    const term = this.term
    if (!term) return
    const before = readTerminalViewportSnapshot(term)
    if (!this.safeRefreshVisibleRows(term)) return
    restoreTerminalViewport(term, before.viewportY)
  }
```

Keep existing direct `term.refresh(...)` calls in theme/fit paths unchanged unless they already need the same recovery behavior. This recovery path is for scrollback render stabilization.

- [ ] **Step 5: Run the recovery test**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts" -t "recovers a failed repaint"
```

Expected: PASS. The old xterm instance is disposed, a new xterm instance is created, `attach` is called for the same session, and `close` is not called.

- [ ] **Step 6: Run all terminal session tests**

Run:

```bash
bun run test -- "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: PASS.

- [ ] **Step 7: Commit front-end-only recovery**

```bash
git add "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/web/components/terminal/ManagedTerminalSession.ts" "src/web/components/terminal/terminal-session-view.ts"
git commit -m "fix: recover terminal renderer without closing sessions"
```

---

### Task 5: Verification and Architecture Guard

**Files:**
- Modify only if a previous task exposed a type or architecture issue:
  - `src/web/components/terminal/ManagedTerminalSession.ts`
  - `src/web/components/terminal/terminal-session-view.ts`
  - `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS. If TypeScript reports `scrollToLine` or event listener type issues, use the public xterm `Terminal.scrollToLine(line: number)` API and keep event listener targets typed as `HTMLElement | null`.

- [ ] **Step 2: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS. The implementation should not import server modules into `src/web/**`.

- [ ] **Step 3: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff -- "src/web/components/terminal/ManagedTerminalSession.ts" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected: only front-end terminal render stabilization and tests are changed. No server terminal protocol changes appear.

- [ ] **Step 5: Commit verification fixes if needed**

Only run this commit if Step 1, 2, or 3 required additional code changes.

```bash
git add "src/web/components/terminal/ManagedTerminalSession.ts" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
git commit -m "test: verify terminal render stability"
```

## Self-Review Checklist

- Spec coverage:
  - Output-settle repaint covers high-frequency output that creates scrollback before the user scrolls.
  - Scroll-time repaint covers missing rendered lines discovered while browsing history.
  - Front-end recovery keeps the PTY/session alive and avoids `terminalBridge.close()`.
  - Server protocol remains unchanged.
- Placeholder scan:
  - No task uses unresolved placeholder tokens or unspecified "add tests" language.
  - Each code-changing step includes concrete TypeScript snippets.
- Type consistency:
  - `TerminalViewportSnapshot`, `readTerminalViewportSnapshot`, `refreshVisibleRows`, and `restoreTerminalViewport` are defined before use.
  - `onRenderRecoveryRequest` is added to the `TerminalSessionView` handler type and supplied by `ManagedTerminalSession`.
  - Tests call methods added to `MockTerminal`: `emitViewportScroll`, `scrollToLine`, and `scrollLines`.

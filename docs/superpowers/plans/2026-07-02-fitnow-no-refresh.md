# fitNow No Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TerminalSessionView.fitNow()` resize via `fitAddon.fit()` without forcing `term.refresh(...)`.

**Architecture:** Keep terminal theme and font-load refresh paths unchanged. Narrow only the resize fit path by removing the full visible-row refresh from `fitNow()`, and update the existing resize-refit test to assert the new behavior.

**Tech Stack:** TypeScript strip-only mode, xterm, Vitest, Bun.

**Repository Constraint:** Do not add git commit steps. Project instructions say not to plan or execute commits unless the user explicitly asks.

---

## File Structure

- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Update the resize-refit test name and assertion so it expects `fitAddon.fit()` but no `term.refresh(...)`.
  - Leave font and theme refresh tests unchanged.
- Modify `src/web/components/terminal/terminal-session-view.ts`
  - Remove the `this.term.refresh(0, Math.max(0, this.term.rows - 1))` call from `fitNow()`.
  - Keep `this.fitAddon.fit()` and `this.pinToBottomSoon()`.

### Task 1: Encode the New resize fit Contract

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Update the existing resize-refit test**

Replace this test name and assertion:

```ts
test('refreshes visible rows after resize refit while preserving scrolled history', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  const fitAddon = xtermMocks.fitAddons[0]!
  const observer = MockResizeObserver.instances.at(-1)!

  term.buffer.active.baseY = 80
  term.buffer.active.viewportY = 24
  fitAddon.proposeDimensions.mockReturnValue({ cols: 100, rows: 28 })
  fitAddon.fit.mockImplementationOnce(() => term.resize(100, 28))
  fitAddon.fit.mockClear()
  term.refresh.mockClear()
  term.scrollToBottom.mockClear()

  observer.cb([], observer)
  await flushResizeDebounce()

  expect(fitAddon.fit).toHaveBeenCalledTimes(1)
  expect(term.refresh).toHaveBeenCalledWith(0, term.rows - 1)
  expect(term.scrollToBottom).not.toHaveBeenCalled()
})
```

with this version:

```ts
test('refits after resize without refreshing visible rows while preserving scrolled history', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  const fitAddon = xtermMocks.fitAddons[0]!
  const observer = MockResizeObserver.instances.at(-1)!

  term.buffer.active.baseY = 80
  term.buffer.active.viewportY = 24
  fitAddon.proposeDimensions.mockReturnValue({ cols: 100, rows: 28 })
  fitAddon.fit.mockImplementationOnce(() => term.resize(100, 28))
  fitAddon.fit.mockClear()
  term.refresh.mockClear()
  term.scrollToBottom.mockClear()

  observer.cb([], observer)
  await flushResizeDebounce()

  expect(fitAddon.fit).toHaveBeenCalledTimes(1)
  expect(term.refresh).not.toHaveBeenCalled()
  expect(term.scrollToBottom).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the targeted test to confirm the old implementation fails**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -- -t "refits after resize without refreshing visible rows while preserving scrolled history"
```

Expected result before implementation: FAIL because `fitNow()` still calls `term.refresh(...)`.

### Task 2: Remove `fitNow()` Forced Refresh

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Remove the forced refresh from `fitNow()`**

Replace:

```ts
fitNow(): void {
  if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
  this.fitAddon.fit()
  this.term.refresh(0, Math.max(0, this.term.rows - 1))
  this.pinToBottomSoon()
}
```

with:

```ts
fitNow(): void {
  if (!this.term || !this.fitAddon || !hasMeasurableBox(this.xtermHost)) return
  this.fitAddon.fit()
  this.pinToBottomSoon()
}
```

- [ ] **Step 2: Run the targeted test**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -- -t "refits after resize without refreshing visible rows while preserving scrolled history"
```

Expected result after implementation: PASS.

### Task 3: Verify Related Behavior

**Files:**
- Verify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Verify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Run the full terminal session test file**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result: PASS. Font refit and theme mode tests should still pass, proving those refresh paths remain intact.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result: PASS.

- [ ] **Step 3: Inspect the resulting diff**

Run:

```bash
git diff -- "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "docs/superpowers/specs/2026-07-02-fitnow-no-refresh-design.md" "docs/superpowers/plans/2026-07-02-fitnow-no-refresh.md"
```

Expected result:

- `fitNow()` no longer contains `term.refresh(...)`.
- The resize-refit test expects no `term.refresh(...)`.
- Font and theme refresh tests are unchanged.

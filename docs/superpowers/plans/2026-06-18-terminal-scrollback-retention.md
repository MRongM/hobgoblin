# Terminal Scrollback Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase and unify terminal scrollback retention so long terminal output remains available when users scroll history.

**Architecture:** Define one shared scrollback constant in `src/shared/terminal.ts` and use it in both the renderer xterm instance and the server headless xterm instance. Keep existing attach, replay, snapshot, and realtime output protocols unchanged, and add regression coverage for ordinary output not resetting or recreating the visible terminal.

**Tech Stack:** TypeScript, React renderer terminal code, `@xterm/xterm`, `@xterm/headless`, Vitest, Bun.

**Git safety:** Commit steps are intentionally omitted because this repository's `AGENTS.md` says not to plan or execute git commits unless the user explicitly asks.

---

## File Structure

- Modify: `src/shared/terminal.ts`
  - Owns terminal shared protocol types and validation. Add `TERMINAL_SCROLLBACK_LINES` here so both server and renderer can import the same value without crossing layering boundaries.
- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Creates the visible `@xterm/xterm` instance. Replace its hardcoded `scrollback: 10_000` with the shared constant.
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Existing jsdom coverage for visible terminal lifecycle. Extend the xterm mock to record `scrollback`, then assert the visible xterm uses the shared constant and ordinary output does not reset or recreate the terminal.
- Modify: `src/server/terminal/terminal-render-state.ts`
  - Creates the server-side `@xterm/headless` render model. Replace hardcoded `scrollback: 10000` with the shared constant.
- Modify: `src/server/terminal/terminal-render-state.test.ts`
  - Existing tests for terminal render state. Add coverage that the headless render model uses the shared scrollback constant.

## Task 1: Use Shared Scrollback in the Visible Renderer Terminal

**Files:**

- Modify: `src/shared/terminal.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Add the failing renderer scrollback test**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, update the shared import near the top:

```ts
import { TERMINAL_SCROLLBACK_LINES } from '#/shared/terminal.ts'
```

Extend the `MockTerminal.options` type with `scrollback?: number`:

```ts
    options: {
      allowProposedApi?: boolean
      cursorBlink?: boolean
      cursorStyle?: string
      fontFamily?: string
      fontSize?: number
      lineHeight?: number
      macOptionIsMeta?: boolean
      minimumContrastRatio?: number
      rescaleOverlappingGlyphs?: boolean
      scrollback?: number
      theme?: { background?: string; foreground?: string }
      scrollOnUserInput?: boolean
    }
```

Extend the `MockTerminal` constructor input type with `scrollback?: number`:

```ts
    constructor(options: {
      allowProposedApi?: boolean
      cols: number
      rows: number
      cursorBlink?: boolean
      cursorStyle?: string
      fontFamily?: string
      fontSize?: number
      lineHeight?: number
      macOptionIsMeta?: boolean
      minimumContrastRatio?: number
      rescaleOverlappingGlyphs?: boolean
      scrollback?: number
      theme?: { background?: string; foreground?: string }
      scrollOnUserInput?: boolean
    }) {
```

Store the option in `this.options`:

```ts
this.options = {
  allowProposedApi: options.allowProposedApi,
  cursorBlink: options.cursorBlink,
  cursorStyle: options.cursorStyle,
  fontFamily: options.fontFamily,
  fontSize: options.fontSize,
  lineHeight: options.lineHeight,
  macOptionIsMeta: options.macOptionIsMeta,
  minimumContrastRatio: options.minimumContrastRatio,
  rescaleOverlappingGlyphs: options.rescaleOverlappingGlyphs,
  scrollback: options.scrollback,
  theme: options.theme,
  scrollOnUserInput: options.scrollOnUserInput,
}
```

Add this test near the other lifecycle tests, before `test('forwards user input while replay is being written', ...)`:

```ts
test('configures visible terminal scrollback from the shared retention constant', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host)
  await flushUntil(() => xtermMocks.terminals.length > 0)

  expect(xtermMocks.terminals[0]!.options.scrollback).toBe(TERMINAL_SCROLLBACK_LINES)
})
```

- [ ] **Step 2: Run the focused renderer test and verify it fails**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts -- -t "configures visible terminal scrollback"
```

Expected: FAIL because `TERMINAL_SCROLLBACK_LINES` is not exported from `src/shared/terminal.ts` yet.

- [ ] **Step 3: Add the shared terminal scrollback constant**

In `src/shared/terminal.ts`, add the constant after the imports and before the first exported type:

```ts
export const TERMINAL_SCROLLBACK_LINES = 50_000
```

- [ ] **Step 4: Apply the constant in the renderer terminal constructor**

In `src/web/components/terminal/terminal-session-view.ts`, add this import with the other shared imports:

```ts
import { TERMINAL_SCROLLBACK_LINES } from '#/shared/terminal.ts'
```

In `openTerminal()`, replace:

```ts
      scrollback: 10_000,
```

with:

```ts
      scrollback: TERMINAL_SCROLLBACK_LINES,
```

- [ ] **Step 5: Run the focused renderer test and verify it passes**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts -- -t "configures visible terminal scrollback"
```

Expected: PASS.

## Task 2: Use Shared Scrollback in the Server Headless Terminal

**Files:**

- Modify: `src/server/terminal/terminal-render-state.test.ts`
- Modify: `src/server/terminal/terminal-render-state.ts`

- [ ] **Step 1: Add the failing headless scrollback test**

In `src/server/terminal/terminal-render-state.test.ts`, replace the imports with:

```ts
import { describe, expect, test } from 'vitest'
import { TERMINAL_SCROLLBACK_LINES } from '#/shared/terminal.ts'
import {
  appendTerminalReplayData,
  createEmptyTerminalRenderState,
  createTerminalRenderModel,
} from '#/server/terminal/terminal-render-state.ts'
```

Add this `describe` block before `describe('appendTerminalReplayData', () => {`:

```ts
describe('createTerminalRenderModel', () => {
  test('configures headless terminal scrollback from the shared retention constant', () => {
    const model = createTerminalRenderModel(80, 24)

    try {
      expect((model.term as unknown as { options: { scrollback: number } }).options.scrollback).toBe(
        TERMINAL_SCROLLBACK_LINES,
      )
    } finally {
      model.term.dispose()
    }
  })
})
```

- [ ] **Step 2: Run the focused headless test and verify it fails**

Run:

```bash
bun run test src/server/terminal/terminal-render-state.test.ts -- -t "configures headless terminal scrollback"
```

Expected: FAIL with received value `10000` and expected value `50000`.

- [ ] **Step 3: Apply the constant in the headless terminal constructor**

In `src/server/terminal/terminal-render-state.ts`, update the import from `#/shared/terminal.ts`:

```ts
import { TERMINAL_SCROLLBACK_LINES, type TerminalSessionSnapshot } from '#/shared/terminal.ts'
```

In `createTerminalRenderModel()`, replace:

```ts
const term = new HeadlessTerminal({ cols, rows, scrollback: 10000, allowProposedApi: true })
```

with:

```ts
const term = new HeadlessTerminal({ cols, rows, scrollback: TERMINAL_SCROLLBACK_LINES, allowProposedApi: true })
```

- [ ] **Step 4: Run the focused headless test and verify it passes**

Run:

```bash
bun run test src/server/terminal/terminal-render-state.test.ts -- -t "configures headless terminal scrollback"
```

Expected: PASS.

## Task 3: Guard Against Ordinary Output Resetting or Recreating the Visible Terminal

**Files:**

- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Add the renderer lifecycle regression test**

In `src/web/components/terminal/ManagedTerminalSession.test.ts`, add this test immediately after `test('batches terminal output writes on animation frames', ...)`:

```ts
test('keeps the same terminal instance and does not reset while flushing ordinary multi-line output', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)
  session.attach(host)
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  term.reset.mockClear()
  term.dispose.mockClear()
  term.write.mockClear()

  const output = Array.from({ length: 300 }, (_, index) => `line-${index + 1}\r\n`).join('')
  session.handleOutput({ sessionId: 'session-1', data: output, seq: 1, processName: 'zsh' })
  await flushTerminalStart()

  expect(xtermMocks.terminals).toHaveLength(1)
  expect(xtermMocks.terminals[0]).toBe(term)
  expect(term.reset).not.toHaveBeenCalled()
  expect(term.dispose).not.toHaveBeenCalled()
  expect(term.write).toHaveBeenCalledWith(output)
})
```

- [ ] **Step 2: Run the regression test**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts -- -t "keeps the same terminal instance"
```

Expected: PASS. This is a characterization guard for the observed few-hundred-line symptom; it should pass unless ordinary output currently resets or recreates the visible terminal.

## Task 4: Full Verification

**Files:**

- Validate touched terminal files and architecture boundaries.

- [ ] **Step 1: Run focused terminal tests**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts src/server/terminal/terminal-render-state.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 4: Run formatting check on touched files**

Run:

```bash
./node_modules/.bin/prettier --check "src/shared/terminal.ts" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/server/terminal/terminal-render-state.ts" "src/server/terminal/terminal-render-state.test.ts" "docs/superpowers/specs/2026-06-18-terminal-scrollback-retention-design.md" "docs/superpowers/plans/2026-06-18-terminal-scrollback-retention.md"
```

Expected: PASS.

If formatting fails, run:

```bash
./node_modules/.bin/prettier --write "src/shared/terminal.ts" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "src/server/terminal/terminal-render-state.ts" "src/server/terminal/terminal-render-state.test.ts" "docs/superpowers/specs/2026-06-18-terminal-scrollback-retention-design.md" "docs/superpowers/plans/2026-06-18-terminal-scrollback-retention.md"
```

Then repeat Steps 1 through 4.

- [ ] **Step 5: Manual smoke check**

Run the app:

```bash
bun run dev
```

Open a local terminal in the app, then run:

```bash
for i in $(seq 1 2000); do echo "scrollback-line-$i"; done
```

Expected:

- Scrolling upward can still find early lines such as `scrollback-line-1`.
- Switching away from the terminal tab and back does not clear the history.
- Running more than `50000` output lines may still evict the oldest lines, which is expected for the fixed scrollback limit.

# Terminal Repaint Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the terminal scroll-triggered repaint, output-settle repaint, and xterm private renderer cache invalidation paths.

**Architecture:** `TerminalSessionView` should return to xterm's default render behavior for output and scroll events. Keep unrelated refresh paths for theme, resize, and font refit. Keep IME composition output deferral, terminal lifecycle, scrollback retention, and custom terminal button behavior unchanged.

**Tech Stack:** React renderer code, TypeScript strip-only mode, xterm, Vitest, Bun.

**Repository Constraint:** Do not add git commit steps. AGENTS.md says not to plan or execute commits unless the user explicitly asks. Use `git status --short` as checkpoints instead.

---

## File Structure

- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Remove tests that assert scroll-triggered repaint, output-settle repaint, and renderer cache invalidation.
  - Remove mock-only `clearTextureAtlas` and `_core._renderService.clear` fields after all references are gone.
  - Keep tests for terminal lifecycle, fit/theme refresh, scrollback constant, explicit scroll APIs, and IME deferred output.
- Modify `src/web/components/terminal/terminal-session-view.ts`
  - Remove repaint state, timers, scroll listeners, repaint helpers, and private renderer cache helpers.
  - Keep `term.refresh(...)` in `applyTerminalTheme()`, `fitNow()`, and `fitForFontLoad()`.
  - Keep `scrollToBottom()`, `scrollLines()`, output write depth tracking, and deferred output composition handling.

## Task 1: Remove Obsolete Repaint Tests

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Delete scroll repaint tests**

  In `src/web/components/terminal/ManagedTerminalSession.test.ts`, delete the full `test(...)` block whose first line exactly matches each line below:

  ```ts
  test('refreshes visible rows when the user scrolls rendered terminal history', async () => {
  test('invalidates renderer cache before repainting scrolled terminal history', async () => {
  test('coalesces rapid terminal viewport scroll repaint into one animation frame', async () => {
  test('refreshes visible rows from xterm scroll events even without DOM viewport scroll', async () => {
  ```

- [ ] **Step 2: Delete output-settle repaint tests**

  In the same file, delete the full `test(...)` block whose first line exactly matches each line below:

  ```ts
  test('settle-repaints visible rows after high-frequency output grows scrollback', async () => {
  test('defers output-settle repaint while xterm text input is composing', async () => {
  test('invalidates renderer cache before settle repainting offscreen scrollback growth', async () => {
  test('settle repaint preserves a scrolled history viewport', async () => {
  test('recovers a failed repaint by rebuilding only the front-end terminal view', async () => {
  test('does not leak output write state into a recovered terminal view', async () => {
  ```

- [ ] **Step 3: Remove mock private renderer cache fields**

  In the `MockTerminal` class near the top of `ManagedTerminalSession.test.ts`, remove:

  ```ts
  clearTextureAtlas = vi.fn()
  ```

  Also remove the private `_core` mock block:

  ```ts
  _core = {
    _renderService: { clear: vi.fn() },
  }
  ```

- [ ] **Step 4: Verify target test file after deleting obsolete tests**

  Run:

  ```bash
  bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
  ```

  Expected: PASS. The exact test count will be lower than before because obsolete repaint tests were removed.

- [ ] **Step 5: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: `src/web/components/terminal/ManagedTerminalSession.test.ts` is modified. Do not commit.

## Task 2: Remove Repaint and Renderer Cache Logic

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Remove repaint-only types and constants**

  In `src/web/components/terminal/terminal-session-view.ts`, delete:

  ```ts
  const OUTPUT_RENDER_SETTLE_MS = 80

  interface TerminalViewportSnapshot {
    viewportY: number | null
    baseY: number | null
  }

  interface TerminalWithPrivateRenderService {
    _core?: {
      _renderService?: {
        clear?: () => void
      }
    }
  }
  ```

- [ ] **Step 2: Remove repaint-only class fields**

  Delete these fields from `TerminalSessionView`:

  ```ts
  private outputSettleTimer: number | null = null
  private viewportRefreshFrame: number | null = null
  private scrollbackRenderDirty = false
  private viewportElement: HTMLElement | null = null
  private viewportRefreshNeeded = false
  ```

  Keep these fields:

  ```ts
  private outputWriteDepth = 0
  private deferredOutput: string[] = []
  private deferredOutputCallbacks: Array<() => void> = []
  private textInputElement: HTMLTextAreaElement | null = null
  private textInputComposing = false
  ```

- [ ] **Step 3: Remove viewport repaint event hooks**

  Delete this class field:

  ```ts
  private readonly handleViewportScroll = () => this.scheduleViewportRefresh()
  ```

  In `openTerminal(...)`, remove the xterm scroll repaint subscription:

  ```ts
  this.disposables.push(term.onScroll(() => this.scheduleViewportRefresh()))
  ```

  Also remove this call:

  ```ts
  this.installViewportScrollListener(term)
  ```

- [ ] **Step 4: Simplify IME composition end handling**

  Replace `handleTextInputCompositionEnd` with:

  ```ts
  private readonly handleTextInputCompositionEnd = () => {
    this.textInputComposing = false
    window.setTimeout(() => {
      if (this.textInputComposing) return
      this.flushDeferredOutput()
    }, 0)
  }
  ```

- [ ] **Step 5: Simplify output write callback**

  In `writeOutput(...)`, replace the current non-composition write path with:

  ```ts
  this.outputWriteDepth += 1
  term.write(data, () => {
    this.outputWriteDepth = Math.max(0, this.outputWriteDepth - 1)
    callback?.()
  })
  ```

  Delete this local variable from the same method:

  ```ts
  const before = readTerminalViewportSnapshot(term)
  ```

- [ ] **Step 6: Delete output write repaint detection**

  Delete the entire method:

  ```ts
  private handleOutputWriteParsed(term: XTermTerminal, before: TerminalViewportSnapshot): void {
    if (this.term !== term) return
    const after = readTerminalViewportSnapshot(term)
    if (before.baseY !== null && after.baseY !== null && after.baseY > before.baseY) {
      this.scrollbackRenderDirty = true
    }
    if (this.scrollbackRenderDirty) this.scheduleOutputSettleRepaint()
  }
  ```

- [ ] **Step 7: Remove destroy cleanup for deleted repaint state**

  In `destroyTerminal()`, remove:

  ```ts
  this.disconnectViewportScrollListener()
  this.cancelOutputSettleRepaint()
  this.scrollbackRenderDirty = false
  ```

  Keep cleanup for resize observer, text input composition guard, fit timer, font timer, pin-to-bottom frame, deferred output, and disposables.

- [ ] **Step 8: Delete viewport scroll listener methods**

  Delete:

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
  ```

- [ ] **Step 9: Delete repaint scheduling and helper methods**

  Delete all of these methods by removing each method declaration and its full body:

  ```ts
  private scheduleOutputSettleRepaint(): void
  private cancelOutputSettleRepaint(): void
  private scheduleViewportRefresh(): void
  private cancelViewportRefresh(): void
  private repaintVisibleRowsPreservingViewport(options: { clearRendererCache?: boolean; viewportY?: number | null } = {}): void
  private safeRefreshVisibleRows(term: XTermTerminal, options: { clearRendererCache?: boolean }): boolean
  ```

- [ ] **Step 10: Delete repaint-only module helpers**

  Near the bottom of `terminal-session-view.ts`, delete:

  ```ts
  function readTerminalViewportSnapshot(term: XTermTerminal): TerminalViewportSnapshot {
    const active = term.buffer?.active as { viewportY?: number; baseY?: number } | undefined
    return {
      viewportY: typeof active?.viewportY === 'number' ? active.viewportY : null,
      baseY: typeof active?.baseY === 'number' ? active.baseY : null,
    }
  }

  function refreshVisibleRows(term: XTermTerminal): void {
    term.refresh(0, Math.max(0, term.rows - 1))
  }

  function clearTerminalRendererCache(term: XTermTerminal): void {
    term.clearTextureAtlas()
    const renderService = (term as unknown as TerminalWithPrivateRenderService)._core?._renderService
    renderService?.clear?.()
  }

  function restoreTerminalViewport(term: XTermTerminal, viewportY: number | null): void {
    if (viewportY === null) return
    const active = term.buffer?.active as { viewportY?: number } | undefined
    if (active?.viewportY === viewportY) return
    term.scrollToLine(viewportY)
  }
  ```

  Keep `scrollTerminalToBottom()`, `isTerminalAtBottom()`, `stripTerminalProtocolReplies()`, and `cancelScheduledAnimationFrame()`.

- [ ] **Step 11: Run focused search**

  Run:

  ```bash
  rg -n "clearTextureAtlas|_renderService|scrollbackRenderDirty|scheduleOutputSettleRepaint|scheduleViewportRefresh|outputSettleTimer|viewportRefreshFrame|viewportRefreshNeeded|repaintVisibleRowsPreservingViewport|safeRefreshVisibleRows|clearTerminalRendererCache|restoreTerminalViewport|readTerminalViewportSnapshot" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 12: Verify target test file**

  Run:

  ```bash
  bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
  ```

  Expected: PASS.

- [ ] **Step 13: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: `terminal-session-view.ts` and `ManagedTerminalSession.test.ts` are modified. Do not commit.

## Task 3: Final Verification

**Files:**
- Verify: `src/web/components/terminal/terminal-session-view.ts`
- Verify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Verify: full repo checks

- [ ] **Step 1: Verify deleted identifiers do not remain in terminal source**

  Run:

  ```bash
  rg -n "clearTextureAtlas|_renderService|scrollbackRenderDirty|scheduleOutputSettleRepaint|scheduleViewportRefresh|output-settle repaint|settle repaint|renderer cache invalidation" "src/web/components/terminal"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 2: Verify unrelated terminal external input removal remains clean**

  Run:

  ```bash
  rg -n "terminalExternalInputEnabled|TerminalExternalInput|terminal-external-input|fillExternalInput|fillTerminalExternalInput|setTerminalExternalInputFillHandler|terminal\\.external-input|settings\\.terminal-external-input|settings\\.terminal-input|merge-conflict-ai-external-input-required" "src"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 3: Run full test suite**

  Run:

  ```bash
  bun run test
  ```

  Expected: PASS. jsdom may print existing "Not implemented" warnings for canvas or focus; those warnings are acceptable only if the command exits 0.

- [ ] **Step 4: Run typecheck**

  Run:

  ```bash
  bun run typecheck
  ```

  Expected: PASS with `all projects passed`.

- [ ] **Step 5: Run architecture guard**

  Run:

  ```bash
  bun run check:architecture
  ```

  Expected: PASS with `import boundaries passed`.

- [ ] **Step 6: Final status**

  Run:

  ```bash
  git status --short
  ```

  Expected: shows the repaint removal changes plus the pre-existing external-input-removal changes. Do not commit.

# Terminal IME Composition Guard Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the terminal IME composition guard and deferred-output branch so terminal output always writes directly to xterm.

**Architecture:** `TerminalSessionView.writeOutput()` becomes a single output path: direct `term.write(data, callback)` with existing output write depth tracking. `TerminalSessionView` no longer observes xterm textarea or composition events. Tests remove the old deferred-output contract and verify no composition/deferred-output symbols remain.

**Tech Stack:** TypeScript strip-only mode, xterm, Vitest, Bun.

**Repository Constraint:** Do not add git commit steps. Project instructions say not to plan or execute commits or branch operations unless the user explicitly asks. Use `git status --short` as checkpoints instead.

---

## File Structure

- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Delete the composition defer-output test.
  - Remove the query-selector-only textarea from the xterm mock DOM.
  - Keep `MockTerminal.textarea` if `focus()` still uses it.
- Modify `src/web/components/terminal/terminal-session-view.ts`
  - Delete IME composition state, event handlers, listener install/disconnect methods, and deferred-output queue methods.
  - Keep output write depth tracking and direct `term.write(...)`.
  - Keep unrelated terminal lifecycle cleanup.

## Task 1: Remove Composition-Defer Test Coverage

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Delete the composition defer-output test**

  In `src/web/components/terminal/ManagedTerminalSession.test.ts`, delete the full `test(...)` block whose first line is:

  ```ts
  test('defers terminal output writes while xterm text input is composing', async () => {
  ```

- [ ] **Step 2: Remove query-selector-only textarea from the mock DOM**

  In `MockTerminal.open(host)`, replace:

  ```ts
  const querySelectorOnlyTextarea = document.createElement('textarea')
  this.textarea = document.createElement('textarea')
  this.element.append(querySelectorOnlyTextarea, this.viewportElement, this.textarea)
  ```

  with:

  ```ts
  this.textarea = document.createElement('textarea')
  this.element.append(this.viewportElement, this.textarea)
  ```

  Keep this public field because `focus()` uses it:

  ```ts
  textarea: HTMLTextAreaElement | undefined = undefined
  ```

- [ ] **Step 3: Run focused test file**

  Run:

  ```bash
  bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
  ```

  Expected: PASS. The test count is lower because the composition defer-output test was removed.

- [ ] **Step 4: Checkpoint**

  Run:

  ```bash
  git status --short
  ```

  Expected: `src/web/components/terminal/ManagedTerminalSession.test.ts` is modified. Do not commit.

## Task 2: Remove Composition Guard and Deferred Output from TerminalSessionView

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Remove composition/deferred-output fields**

  In `src/web/components/terminal/terminal-session-view.ts`, delete:

  ```ts
  private deferredOutput: string[] = []
  private deferredOutputCallbacks: Array<() => void> = []
  private textInputElement: HTMLTextAreaElement | null = null
  private textInputComposing = false
  ```

  Keep:

  ```ts
  private outputWriteDepth = 0
  ```

- [ ] **Step 2: Remove composition event handlers**

  Delete these class fields:

  ```ts
  private readonly handleTextInputCompositionStart = () => {
    this.textInputComposing = true
  }

  private readonly handleTextInputCompositionEnd = () => {
    this.textInputComposing = false
    window.setTimeout(() => {
      if (this.textInputComposing) return
      this.flushDeferredOutput()
    }, 0)
  }
  ```

- [ ] **Step 3: Remove guard installation**

  In `openTerminal(...)`, delete:

  ```ts
  this.installTextInputCompositionGuard(term)
  ```

- [ ] **Step 4: Simplify `writeOutput()`**

  Replace the current `writeOutput(...)` method with:

  ```ts
  writeOutput(data: string, callback?: () => void): void {
    const term = this.term
    if (!term) {
      callback?.()
      return
    }
    this.outputWriteDepth += 1
    term.write(data, () => {
      this.outputWriteDepth = Math.max(0, this.outputWriteDepth - 1)
      callback?.()
    })
  }
  ```

- [ ] **Step 5: Remove destroy cleanup for deleted state**

  In `destroyTerminal()`, delete:

  ```ts
  this.disconnectTextInputCompositionGuard()
  this.clearDeferredOutput(true)
  this.textInputComposing = false
  ```

  Keep cleanup for resize observer, fit timer, font observer, pin-to-bottom frame, disposables, theme observer, and xterm dispose.

- [ ] **Step 6: Delete composition guard methods**

  Delete these methods:

  ```ts
  private installTextInputCompositionGuard(term: XTermTerminal): void {
    this.disconnectTextInputCompositionGuard()
    const input = term.textarea ?? null
    if (!input) return
    this.textInputElement = input
    input.addEventListener('compositionstart', this.handleTextInputCompositionStart)
    input.addEventListener('compositionend', this.handleTextInputCompositionEnd)
    input.addEventListener('compositioncancel', this.handleTextInputCompositionEnd)
  }

  private disconnectTextInputCompositionGuard(): void {
    const input = this.textInputElement
    if (!input) return
    input.removeEventListener('compositionstart', this.handleTextInputCompositionStart)
    input.removeEventListener('compositionend', this.handleTextInputCompositionEnd)
    input.removeEventListener('compositioncancel', this.handleTextInputCompositionEnd)
    this.textInputElement = null
  }
  ```

- [ ] **Step 7: Delete deferred-output methods**

  Delete:

  ```ts
  private deferOutput(data: string, callback?: () => void): void {
    this.deferredOutput.push(data)
    if (callback) this.deferredOutputCallbacks.push(callback)
  }

  private flushDeferredOutput(): void {
    if (this.textInputComposing || this.deferredOutput.length === 0) return
    const data = this.deferredOutput.join('')
    const callbacks = this.deferredOutputCallbacks.splice(0)
    this.deferredOutput = []
    this.writeOutput(
      data,
      callbacks.length > 0
        ? () => {
            for (const callback of callbacks) callback()
          }
        : undefined,
    )
  }

  private clearDeferredOutput(runCallbacks = false): void {
    this.deferredOutput = []
    const callbacks = this.deferredOutputCallbacks.splice(0)
    if (runCallbacks) {
      for (const callback of callbacks) callback()
    }
  }
  ```

- [ ] **Step 8: Run focused symbol search**

  Run:

  ```bash
  rg -n "compositionstart|compositionend|compositioncancel|textInputComposing|deferredOutput|installTextInputCompositionGuard|disconnectTextInputCompositionGuard|flushDeferredOutput|deferOutput|clearDeferredOutput" "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 9: Run focused test file**

  Run:

  ```bash
  bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
  ```

  Expected: PASS.

- [ ] **Step 10: Checkpoint**

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

- [ ] **Step 1: Verify no composition/deferred-output symbols remain in terminal source**

  Run:

  ```bash
  rg -n "compositionstart|compositionend|compositioncancel|textInputComposing|deferredOutput|installTextInputCompositionGuard|disconnectTextInputCompositionGuard|flushDeferredOutput|deferOutput|clearDeferredOutput" "src/web/components/terminal"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 2: Verify repaint/cache removal remains clean**

  Run:

  ```bash
  rg -n "clearTextureAtlas|_renderService|scrollbackRenderDirty|scheduleOutputSettleRepaint|scheduleViewportRefresh|output-settle repaint|settle repaint|renderer cache invalidation" "src/web/components/terminal"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 3: Verify external input removal remains clean**

  Run:

  ```bash
  rg -n "terminalExternalInputEnabled|TerminalExternalInput|terminal-external-input|fillExternalInput|fillTerminalExternalInput|setTerminalExternalInputFillHandler|terminal\\.external-input|settings\\.terminal-external-input|settings\\.terminal-input|merge-conflict-ai-external-input-required" "src"
  ```

  Expected: no output and exit code 1.

- [ ] **Step 4: Run full test suite**

  Run:

  ```bash
  bun run test
  ```

  Expected: PASS. Existing jsdom warnings about unsupported canvas or focus APIs are acceptable only if the command exits 0.

- [ ] **Step 5: Run typecheck**

  Run:

  ```bash
  bun run typecheck
  ```

  Expected: PASS with `all projects passed`.

- [ ] **Step 6: Run architecture guard**

  Run:

  ```bash
  bun run check:architecture
  ```

  Expected: PASS with `import boundaries passed`.

- [ ] **Step 7: Final status**

  Run:

  ```bash
  git status --short
  ```

  Expected: shows the IME guard removal changes plus the pre-existing terminal cleanup changes. Do not commit.

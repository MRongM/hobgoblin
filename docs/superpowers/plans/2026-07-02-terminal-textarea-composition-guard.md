# Terminal Textarea Composition Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the terminal IME composition guard attach to xterm's public `term.textarea` instead of querying xterm's DOM.

**Architecture:** Keep the existing composition event handlers and deferred-output flow unchanged. Update the test double so `term.textarea` is distinguishable from `term.element.querySelector('textarea')`, then switch production code to the public xterm API.

**Tech Stack:** TypeScript strip-only mode, xterm, Vitest, Bun.

**Repository Constraint:** Do not add git commit steps. Project instructions say not to plan or execute commits or branch operations unless the user explicitly asks.

---

## File Structure

- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Expose `MockTerminal.textarea` as a public field matching xterm's public API shape.
  - Make the mock DOM contain a query-selector-only textarea before the public `term.textarea`, so the test fails if production code still uses `querySelector('textarea')`.
  - Update the composition defer-output test to dispatch composition events through `term.textarea`.
- Modify `src/web/components/terminal/terminal-session-view.ts`
  - Change `installTextInputCompositionGuard(term)` to use `term.textarea ?? null`.
  - Keep listener registration and disconnect behavior unchanged.

### Task 1: Encode the `term.textarea` Contract in Tests

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Expose `MockTerminal.textarea` as public**

Replace this field:

```ts
private textarea: HTMLTextAreaElement | null = null
```

with:

```ts
textarea: HTMLTextAreaElement | undefined = undefined
```

- [ ] **Step 2: Make DOM query and `term.textarea` distinguishable**

Replace the body of `MockTerminal.open(host)`:

```ts
open(host: HTMLElement) {
  this.element = document.createElement('div')
  this.element.className = 'xterm'
  this.viewportElement = document.createElement('div')
  this.viewportElement.className = 'xterm-viewport'
  this.textarea = document.createElement('textarea')
  this.element.append(this.viewportElement, this.textarea)
  host.appendChild(this.element)
}
```

with:

```ts
open(host: HTMLElement) {
  this.element = document.createElement('div')
  this.element.className = 'xterm'
  this.viewportElement = document.createElement('div')
  this.viewportElement.className = 'xterm-viewport'
  const querySelectorOnlyTextarea = document.createElement('textarea')
  this.textarea = document.createElement('textarea')
  this.element.append(querySelectorOnlyTextarea, this.viewportElement, this.textarea)
  host.appendChild(this.element)
}
```

This makes old production code attach composition listeners to `querySelectorOnlyTextarea`, while the updated test dispatches events on `term.textarea`.

- [ ] **Step 3: Update the composition defer-output test**

Replace this block:

```ts
const term = xtermMocks.terminals[0]!
const input = host.querySelector('textarea')
expect(input).toBeInstanceOf(HTMLTextAreaElement)
term.write.mockClear()

input?.dispatchEvent(new Event('compositionstart'))
session.handleOutput({ sessionId: 'session-1', data: 'streaming output', seq: 1, processName: 'codex' })
await flushTerminalStart()

expect(term.write).not.toHaveBeenCalled()

input?.dispatchEvent(new Event('compositionend'))
await flushTerminalStart()
```

with:

```ts
const term = xtermMocks.terminals[0]!
const input = term.textarea
expect(input).toBeInstanceOf(HTMLTextAreaElement)
term.write.mockClear()

input?.dispatchEvent(new Event('compositionstart'))
session.handleOutput({ sessionId: 'session-1', data: 'streaming output', seq: 1, processName: 'codex' })
await flushTerminalStart()

expect(term.write).not.toHaveBeenCalled()

input?.dispatchEvent(new Event('compositionend'))
await flushTerminalStart()
```

- [ ] **Step 4: Run the targeted test to confirm the old implementation fails**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -- -t "defers terminal output writes while xterm text input is composing"
```

Expected result before production implementation: FAIL because `installTextInputCompositionGuard()` still attaches listeners to the query-selected textarea instead of `term.textarea`.

### Task 2: Use `term.textarea` in the Composition Guard

**Files:**
- Modify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Update `installTextInputCompositionGuard(term)`**

Replace:

```ts
private installTextInputCompositionGuard(term: XTermTerminal): void {
  this.disconnectTextInputCompositionGuard()
  const input = term.element?.querySelector<HTMLTextAreaElement>('textarea') ?? null
  if (!input) return
  this.textInputElement = input
  input.addEventListener('compositionstart', this.handleTextInputCompositionStart)
  input.addEventListener('compositionend', this.handleTextInputCompositionEnd)
  input.addEventListener('compositioncancel', this.handleTextInputCompositionEnd)
}
```

with:

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
```

- [ ] **Step 2: Run the targeted test**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts" -- -t "defers terminal output writes while xterm text input is composing"
```

Expected result after production implementation: PASS.

### Task 3: Verify Related Behavior

**Files:**
- Verify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Verify: `src/web/components/terminal/terminal-session-view.ts`

- [ ] **Step 1: Run the full terminal session test file**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected result: PASS.

- [ ] **Step 3: Inspect the resulting diff**

Run:

```bash
git diff -- "src/web/components/terminal/terminal-session-view.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts" "docs/superpowers/specs/2026-07-02-terminal-textarea-composition-guard-design.md" "docs/superpowers/plans/2026-07-02-terminal-textarea-composition-guard.md"
```

Expected result:

- `installTextInputCompositionGuard()` uses `term.textarea ?? null`.
- The composition defer-output test dispatches events on `term.textarea`.
- `MockTerminal.textarea` is public and available after `open(host)`.
- Existing listener cleanup remains unchanged.

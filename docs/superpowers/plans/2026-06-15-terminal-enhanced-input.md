# Terminal Enhanced Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop current-line editing to the managed terminal: selection, copy, cut, replacement, deletion, word navigation, select-all, undo, and redo for ordinary shell single-line input.

**Architecture:** Build a renderer-only light line editor behind the existing xterm input boundary. Keep the edit model pure and heavily tested, then attach it to `TerminalSessionView` through a small controller and DOM overlay. All terminal writes still go through `ManagedTerminalSession.writeInput()` and `terminalBridge.write()`.

**Tech Stack:** React, TypeScript in Node strip-only mode, `@xterm/xterm`, Vitest jsdom, existing terminal session runtime.

**Git Safety:** This plan intentionally contains no commit steps. The project instructions require explicit user confirmation before planning or executing git commits or branch operations.

---

## File Structure

- Create `src/web/components/terminal/terminal-enhanced-input-model.ts`
  - Pure edit model for text, cursor, selection, undo, redo, and safe string offsets.
- Create `src/web/components/terminal/terminal-enhanced-input-model.test.ts`
  - Unit tests for model behavior. No DOM and no xterm mocks.
- Create `src/web/components/terminal/terminal-enhanced-input-keyboard.ts`
  - Keyboard event classification and platform-aware shortcut mapping.
- Create `src/web/components/terminal/terminal-enhanced-input-keyboard.test.ts`
  - Unit tests for macOS and Windows/Linux shortcut behavior.
- Create `src/web/components/terminal/terminal-enhanced-input-controller.ts`
  - Small controller that binds model operations to terminal write sequences, clipboard calls, safety gates, and overlay rendering.
- Create `src/web/components/terminal/terminal-enhanced-input-controller.test.ts`
  - Unit tests with a fake host adapter. No real xterm instance.
- Create `src/web/components/terminal/terminal-enhanced-input-overlay.ts`
  - DOM overlay and hit testing for current input-line selection.
- Create `src/web/components/terminal/terminal-enhanced-input-overlay.test.ts`
  - jsdom tests for overlay rectangles and mouse hit clamping.
- Modify `src/web/components/terminal/types.ts`
  - Extend terminal attach handlers with an optional enhanced-input enable flag.
- Modify `src/web/components/terminal/terminal-session-view.ts`
  - Instantiate the controller, forward keyboard/mouse events, expose terminal safety checks, and clear state on destroy/detach/output invalidation.
- Modify `src/web/components/terminal/ManagedTerminalSession.ts`
  - Notify the view about terminal output before it is written, so unsafe output can invalidate local input state.
- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Extend the xterm mock just enough for enhanced-input tests and add integration coverage.
- Modify `src/web/components/terminal/TerminalSlot.tsx`
  - Pass `enhancedInput` through attach handlers only for writable controller sessions and not while search is open.
- Modify `src/web/components/terminal/TerminalSlot.test.tsx`
  - Assert attach handlers include the enhanced-input flag for controller sessions and exclude it for readonly/search cases.
- Modify `src/web/components/terminal/terminal-session.css`
  - Style the current-input selection overlay without affecting terminal layout.

---

### Task 1: Add Pure Current-Line Edit Model

**Files:**
- Create: `src/web/components/terminal/terminal-enhanced-input-model.ts`
- Create: `src/web/components/terminal/terminal-enhanced-input-model.test.ts`

- [ ] **Step 1: Write failing model tests**

Create `src/web/components/terminal/terminal-enhanced-input-model.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  createTerminalInputBuffer,
  deleteBackward,
  deleteForward,
  insertText,
  moveCursor,
  redoInputEdit,
  selectAllInput,
  selectedText,
  undoInputEdit,
} from '#/web/components/terminal/terminal-enhanced-input-model.ts'

describe('terminal enhanced input model', () => {
  test('inserts text, moves the cursor, and replaces a selection', () => {
    let buffer = createTerminalInputBuffer()
    buffer = insertText(buffer, 'git status')
    buffer = moveCursor(buffer, 4, { select: false })
    buffer = moveCursor(buffer, 10, { select: true })

    expect(selectedText(buffer)).toBe('status')

    buffer = insertText(buffer, 'diff')

    expect(buffer.text).toBe('git diff')
    expect(buffer.cursor).toBe(8)
    expect(selectedText(buffer)).toBe('')
  })

  test('deletes the selected range before deleting adjacent characters', () => {
    let buffer = insertText(createTerminalInputBuffer(), 'abcdef')
    buffer = moveCursor(buffer, 2, { select: false })
    buffer = moveCursor(buffer, 5, { select: true })
    buffer = deleteBackward(buffer)

    expect(buffer.text).toBe('abf')
    expect(buffer.cursor).toBe(2)

    buffer = deleteForward(buffer)

    expect(buffer.text).toBe('ab')
    expect(buffer.cursor).toBe(2)
  })

  test('selects the full current line without selecting prompt or output', () => {
    const buffer = selectAllInput(insertText(createTerminalInputBuffer(), 'npm run test'))

    expect(selectedText(buffer)).toBe('npm run test')
    expect(buffer.selectionAnchor).toBe(0)
    expect(buffer.selectionFocus).toBe(12)
  })

  test('undoes and redoes current-line edits', () => {
    let buffer = insertText(createTerminalInputBuffer(), 'git status')
    buffer = insertText(buffer, ' --short')

    buffer = undoInputEdit(buffer)
    expect(buffer.text).toBe('git status')
    expect(buffer.cursor).toBe(10)

    buffer = redoInputEdit(buffer)
    expect(buffer.text).toBe('git status --short')
    expect(buffer.cursor).toBe(18)
  })

  test('does not split surrogate pairs when deleting around emoji', () => {
    let buffer = insertText(createTerminalInputBuffer(), 'echo 😀')
    buffer = deleteBackward(buffer)

    expect(buffer.text).toBe('echo ')
    expect(buffer.cursor).toBe(5)
  })
})
```

- [ ] **Step 2: Run model tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-model.test.ts
```

Expected: fail because `terminal-enhanced-input-model.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Create `src/web/components/terminal/terminal-enhanced-input-model.ts`:

```ts
export interface TerminalInputEditSnapshot {
  text: string
  cursor: number
  selectionAnchor: number | null
  selectionFocus: number | null
}

export interface TerminalInputBuffer extends TerminalInputEditSnapshot {
  undoStack: TerminalInputEditSnapshot[]
  redoStack: TerminalInputEditSnapshot[]
}

export interface MoveCursorOptions {
  select: boolean
}

export function createTerminalInputBuffer(): TerminalInputBuffer {
  return {
    text: '',
    cursor: 0,
    selectionAnchor: null,
    selectionFocus: null,
    undoStack: [],
    redoStack: [],
  }
}

export function hasSelection(buffer: TerminalInputBuffer): boolean {
  return selectionRange(buffer) !== null
}

export function selectionRange(buffer: TerminalInputBuffer): { start: number; end: number } | null {
  if (buffer.selectionAnchor === null || buffer.selectionFocus === null) return null
  const start = clampOffset(buffer.text, Math.min(buffer.selectionAnchor, buffer.selectionFocus))
  const end = clampOffset(buffer.text, Math.max(buffer.selectionAnchor, buffer.selectionFocus))
  return start === end ? null : { start, end }
}

export function selectedText(buffer: TerminalInputBuffer): string {
  const range = selectionRange(buffer)
  return range ? buffer.text.slice(range.start, range.end) : ''
}

export function insertText(buffer: TerminalInputBuffer, text: string): TerminalInputBuffer {
  if (!text) return buffer
  const before = snapshot(buffer)
  const range = selectionRange(buffer)
  const start = range?.start ?? buffer.cursor
  const end = range?.end ?? buffer.cursor
  const nextText = buffer.text.slice(0, start) + text + buffer.text.slice(end)
  const nextCursor = clampOffset(nextText, start + text.length)
  return withUndo(before, {
    ...buffer,
    text: nextText,
    cursor: nextCursor,
    selectionAnchor: null,
    selectionFocus: null,
  })
}

export function deleteBackward(buffer: TerminalInputBuffer): TerminalInputBuffer {
  const range = selectionRange(buffer)
  if (range) return deleteRange(buffer, range.start, range.end)
  const end = clampOffset(buffer.text, buffer.cursor)
  if (end === 0) return buffer
  return deleteRange(buffer, previousOffset(buffer.text, end), end)
}

export function deleteForward(buffer: TerminalInputBuffer): TerminalInputBuffer {
  const range = selectionRange(buffer)
  if (range) return deleteRange(buffer, range.start, range.end)
  const start = clampOffset(buffer.text, buffer.cursor)
  if (start >= buffer.text.length) return buffer
  return deleteRange(buffer, start, nextOffset(buffer.text, start))
}

export function deleteRange(buffer: TerminalInputBuffer, rawStart: number, rawEnd: number): TerminalInputBuffer {
  const start = clampOffset(buffer.text, Math.min(rawStart, rawEnd))
  const end = clampOffset(buffer.text, Math.max(rawStart, rawEnd))
  if (start === end) return buffer
  const before = snapshot(buffer)
  const nextText = buffer.text.slice(0, start) + buffer.text.slice(end)
  return withUndo(before, {
    ...buffer,
    text: nextText,
    cursor: start,
    selectionAnchor: null,
    selectionFocus: null,
  })
}

export function moveCursor(buffer: TerminalInputBuffer, rawCursor: number, options: MoveCursorOptions): TerminalInputBuffer {
  const cursor = clampOffset(buffer.text, rawCursor)
  if (!options.select) return { ...buffer, cursor, selectionAnchor: null, selectionFocus: null }
  const anchor = buffer.selectionAnchor ?? buffer.cursor
  return { ...buffer, cursor, selectionAnchor: anchor, selectionFocus: cursor }
}

export function selectAllInput(buffer: TerminalInputBuffer): TerminalInputBuffer {
  return {
    ...buffer,
    cursor: buffer.text.length,
    selectionAnchor: 0,
    selectionFocus: buffer.text.length,
  }
}

export function undoInputEdit(buffer: TerminalInputBuffer): TerminalInputBuffer {
  const previous = buffer.undoStack.at(-1)
  if (!previous) return buffer
  return {
    ...previous,
    undoStack: buffer.undoStack.slice(0, -1),
    redoStack: [...buffer.redoStack, snapshot(buffer)],
  }
}

export function redoInputEdit(buffer: TerminalInputBuffer): TerminalInputBuffer {
  const next = buffer.redoStack.at(-1)
  if (!next) return buffer
  return {
    ...next,
    undoStack: [...buffer.undoStack, snapshot(buffer)],
    redoStack: buffer.redoStack.slice(0, -1),
  }
}

export function moveByWord(buffer: TerminalInputBuffer, direction: 'left' | 'right', options: MoveCursorOptions): TerminalInputBuffer {
  const cursor = direction === 'left' ? previousWordOffset(buffer.text, buffer.cursor) : nextWordOffset(buffer.text, buffer.cursor)
  return moveCursor(buffer, cursor, options)
}

export function deleteWordBackward(buffer: TerminalInputBuffer): TerminalInputBuffer {
  if (hasSelection(buffer)) return deleteBackward(buffer)
  return deleteRange(buffer, previousWordOffset(buffer.text, buffer.cursor), buffer.cursor)
}

export function deleteWordForward(buffer: TerminalInputBuffer): TerminalInputBuffer {
  if (hasSelection(buffer)) return deleteForward(buffer)
  return deleteRange(buffer, buffer.cursor, nextWordOffset(buffer.text, buffer.cursor))
}

export function snapshot(buffer: TerminalInputBuffer): TerminalInputEditSnapshot {
  return {
    text: buffer.text,
    cursor: buffer.cursor,
    selectionAnchor: buffer.selectionAnchor,
    selectionFocus: buffer.selectionFocus,
  }
}

function withUndo(before: TerminalInputEditSnapshot, buffer: TerminalInputBuffer): TerminalInputBuffer {
  return {
    ...buffer,
    undoStack: [...buffer.undoStack, before],
    redoStack: [],
  }
}

function previousWordOffset(text: string, rawCursor: number): number {
  let cursor = clampOffset(text, rawCursor)
  while (cursor > 0 && /\s/u.test(text.slice(previousOffset(text, cursor), cursor))) cursor = previousOffset(text, cursor)
  while (cursor > 0 && !/\s/u.test(text.slice(previousOffset(text, cursor), cursor))) cursor = previousOffset(text, cursor)
  return cursor
}

function nextWordOffset(text: string, rawCursor: number): number {
  let cursor = clampOffset(text, rawCursor)
  while (cursor < text.length && /\s/u.test(text.slice(cursor, nextOffset(text, cursor)))) cursor = nextOffset(text, cursor)
  while (cursor < text.length && !/\s/u.test(text.slice(cursor, nextOffset(text, cursor)))) cursor = nextOffset(text, cursor)
  return cursor
}

function clampOffset(text: string, rawOffset: number): number {
  const offset = Math.max(0, Math.min(text.length, rawOffset))
  if (offset > 0 && offset < text.length && isLowSurrogate(text.charCodeAt(offset))) return offset + 1
  return offset
}

function previousOffset(text: string, offset: number): number {
  const previous = Math.max(0, offset - 1)
  return previous > 0 && isLowSurrogate(text.charCodeAt(previous)) ? previous - 1 : previous
}

function nextOffset(text: string, offset: number): number {
  const next = Math.min(text.length, offset + 1)
  return next < text.length && isLowSurrogate(text.charCodeAt(next)) ? next + 1 : next
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}
```

- [ ] **Step 4: Run model tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-model.test.ts
```

Expected: pass.

---

### Task 2: Add Keyboard Mapping

**Files:**
- Create: `src/web/components/terminal/terminal-enhanced-input-keyboard.ts`
- Create: `src/web/components/terminal/terminal-enhanced-input-keyboard.test.ts`

- [ ] **Step 1: Write failing keyboard tests**

Create `src/web/components/terminal/terminal-enhanced-input-keyboard.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { terminalEnhancedInputActionForKeyEvent } from '#/web/components/terminal/terminal-enhanced-input-keyboard.ts'

function key(input: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...input })
}

describe('terminalEnhancedInputActionForKeyEvent', () => {
  test('maps selection and cursor movement keys', () => {
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'ArrowLeft', shiftKey: true }), { isMac: true })).toEqual({
      type: 'move',
      unit: 'character',
      direction: 'left',
      select: true,
    })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'ArrowRight', altKey: true }), { isMac: false })).toEqual({
      type: 'move',
      unit: 'word',
      direction: 'right',
      select: false,
    })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'End', shiftKey: true }), { isMac: false })).toEqual({
      type: 'move',
      unit: 'line',
      direction: 'end',
      select: true,
    })
  })

  test('maps edit shortcuts', () => {
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'a', metaKey: true }), { isMac: true })).toEqual({ type: 'selectAll' })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'c', ctrlKey: true }), { isMac: false })).toEqual({ type: 'copy' })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'x', metaKey: true }), { isMac: true })).toEqual({ type: 'cut' })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'z', metaKey: true }), { isMac: true })).toEqual({ type: 'undo' })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'z', metaKey: true, shiftKey: true }), { isMac: true })).toEqual({
      type: 'redo',
    })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'y', ctrlKey: true }), { isMac: false })).toEqual({ type: 'redo' })
  })

  test('passes terminal control shortcuts through when they do not target a selection', () => {
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'c', ctrlKey: true }), { isMac: true })).toEqual({ type: 'passthrough' })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'Escape' }), { isMac: true })).toEqual({ type: 'escape' })
    expect(terminalEnhancedInputActionForKeyEvent(key({ key: 'r', ctrlKey: true }), { isMac: false })).toEqual({ type: 'passthrough' })
  })
})
```

- [ ] **Step 2: Run keyboard tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-keyboard.test.ts
```

Expected: fail because `terminal-enhanced-input-keyboard.ts` does not exist.

- [ ] **Step 3: Implement keyboard mapping**

Create `src/web/components/terminal/terminal-enhanced-input-keyboard.ts`:

```ts
export type TerminalEnhancedInputAction =
  | { type: 'insert'; text: string }
  | { type: 'move'; unit: 'character' | 'word' | 'line'; direction: 'left' | 'right' | 'start' | 'end'; select: boolean }
  | { type: 'delete'; unit: 'character' | 'word'; direction: 'backward' | 'forward' }
  | { type: 'selectAll' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'enter' }
  | { type: 'escape' }
  | { type: 'passthrough' }

export function terminalEnhancedInputActionForKeyEvent(
  event: KeyboardEvent,
  options: { isMac: boolean },
): TerminalEnhancedInputAction {
  if (event.type !== 'keydown') return { type: 'passthrough' }
  const command = options.isMac ? event.metaKey : event.ctrlKey
  const wordModifier = options.isMac ? event.altKey : event.altKey || event.ctrlKey
  const key = event.key
  const lower = key.toLowerCase()

  if (command && !event.altKey) {
    if (lower === 'a') return { type: 'selectAll' }
    if (lower === 'c') return { type: 'copy' }
    if (lower === 'x') return { type: 'cut' }
    if (lower === 'v') return { type: 'paste' }
    if (lower === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' }
    if (!options.isMac && lower === 'y') return { type: 'redo' }
  }

  if (key === 'ArrowLeft') {
    return { type: 'move', unit: wordModifier ? 'word' : 'character', direction: 'left', select: event.shiftKey }
  }
  if (key === 'ArrowRight') {
    return { type: 'move', unit: wordModifier ? 'word' : 'character', direction: 'right', select: event.shiftKey }
  }
  if (key === 'Home') return { type: 'move', unit: 'line', direction: 'start', select: event.shiftKey }
  if (key === 'End') return { type: 'move', unit: 'line', direction: 'end', select: event.shiftKey }
  if (key === 'Backspace') return { type: 'delete', unit: wordModifier ? 'word' : 'character', direction: 'backward' }
  if (key === 'Delete') return { type: 'delete', unit: wordModifier ? 'word' : 'character', direction: 'forward' }
  if (key === 'Enter') return { type: 'enter' }
  if (key === 'Escape') return { type: 'escape' }

  if (!event.ctrlKey && !event.metaKey && key.length === 1) return { type: 'insert', text: key }
  return { type: 'passthrough' }
}
```

- [ ] **Step 4: Run keyboard tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-keyboard.test.ts
```

Expected: pass.

---

### Task 3: Add Controller And Terminal Sync Sequences

**Files:**
- Create: `src/web/components/terminal/terminal-enhanced-input-controller.ts`
- Create: `src/web/components/terminal/terminal-enhanced-input-controller.test.ts`

- [ ] **Step 1: Write failing controller tests**

Create `src/web/components/terminal/terminal-enhanced-input-controller.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { TerminalEnhancedInputController } from '#/web/components/terminal/terminal-enhanced-input-controller.ts'

function key(input: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...input })
}

function controllerFixture() {
  const writes: string[] = []
  const copied: string[] = []
  const host = {
    isEnabled: vi.fn(() => true),
    isSafeToEdit: vi.fn(() => true),
    currentCursorColumn: vi.fn(() => 5),
    write: vi.fn((data: string) => writes.push(data)),
    renderSelection: vi.fn(),
    copyText: vi.fn(async (text: string) => copied.push(text)),
    readText: vi.fn(async () => 'diff'),
  }
  return { controller: new TerminalEnhancedInputController(host, { isMac: true }), host, writes, copied }
}

describe('TerminalEnhancedInputController', () => {
  test('mirrors printable input and submits once on enter', async () => {
    const { controller, writes } = controllerFixture()

    expect(controller.handleKeyDown(key({ key: 'g' }))).toBe(false)
    expect(controller.handleKeyDown(key({ key: 'i' }))).toBe(false)
    expect(controller.handleKeyDown(key({ key: 't' }))).toBe(false)
    expect(controller.handleKeyDown(key({ key: 'Enter' }))).toBe(false)

    expect(writes).toEqual(['g', 'i', 't', '\r'])
    expect(controller.snapshot().text).toBe('')
  })

  test('replaces selected text and redraws the shell line', async () => {
    const { controller, writes } = controllerFixture()

    controller.handleKeyDown(key({ key: 'g' }))
    controller.handleKeyDown(key({ key: 'i' }))
    controller.handleKeyDown(key({ key: 't' }))
    controller.handleKeyDown(key({ key: 'ArrowLeft', shiftKey: true }))
    controller.handleKeyDown(key({ key: 'X' }))

    expect(controller.snapshot().text).toBe('giX')
    expect(writes.at(-1)).toBe('\x01\x0bgiX')
  })

  test('copies and cuts only when a selection exists', async () => {
    const { controller, writes, copied } = controllerFixture()

    controller.handleKeyDown(key({ key: 'a' }))
    controller.handleKeyDown(key({ key: 'b' }))
    controller.handleKeyDown(key({ key: 'c' }))
    controller.handleKeyDown(key({ key: 'ArrowLeft', shiftKey: true }))
    controller.handleKeyDown(key({ key: 'c', metaKey: true }))

    expect(copied).toEqual(['c'])

    controller.handleKeyDown(key({ key: 'x', metaKey: true }))

    expect(copied).toEqual(['c', 'c'])
    expect(controller.snapshot().text).toBe('ab')
    expect(writes.at(-1)).toBe('\x01\x0bab')
  })

  test('passes through unsafe modes without mutating local state', async () => {
    const { controller, host, writes } = controllerFixture()
    host.isSafeToEdit.mockReturnValue(false)

    expect(controller.handleKeyDown(key({ key: 'a' }))).toBe(true)
    expect(controller.snapshot().text).toBe('')
    expect(writes).toEqual([])
  })

  test('invalidates on unsafe output', async () => {
    const { controller } = controllerFixture()

    controller.handleKeyDown(key({ key: 'a' }))
    controller.handleTerminalOutput('\r\n')

    expect(controller.snapshot().text).toBe('')
  })
})
```

- [ ] **Step 2: Run controller tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-controller.test.ts
```

Expected: fail because `terminal-enhanced-input-controller.ts` does not exist.

- [ ] **Step 3: Implement controller**

Create `src/web/components/terminal/terminal-enhanced-input-controller.ts`:

```ts
import {
  createTerminalInputBuffer,
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  insertText,
  moveByWord,
  moveCursor,
  redoInputEdit,
  selectAllInput,
  selectedText,
  undoInputEdit,
  type TerminalInputBuffer,
} from '#/web/components/terminal/terminal-enhanced-input-model.ts'
import {
  terminalEnhancedInputActionForKeyEvent,
  type TerminalEnhancedInputAction,
} from '#/web/components/terminal/terminal-enhanced-input-keyboard.ts'

export interface TerminalEnhancedInputHost {
  isEnabled: () => boolean
  isSafeToEdit: () => boolean
  currentCursorColumn: () => number | null
  write: (data: string) => void
  renderSelection: (state: TerminalEnhancedInputRenderState | null) => void
  copyText: (text: string) => Promise<void>
  readText: () => Promise<string>
}

export interface TerminalEnhancedInputRenderState {
  text: string
  cursor: number
  originColumn: number
  selectionStart: number
  selectionEnd: number
}

export class TerminalEnhancedInputController {
  private buffer: TerminalInputBuffer = createTerminalInputBuffer()
  private originColumn: number | null = null
  private readonly host: TerminalEnhancedInputHost
  private readonly options: { isMac: boolean }

  constructor(host: TerminalEnhancedInputHost, options: { isMac: boolean }) {
    this.host = host
    this.options = options
  }

  snapshot(): TerminalInputBuffer {
    return this.buffer
  }

  inputOriginColumn(): number | null {
    return this.originColumn
  }

  reset(): void {
    this.buffer = createTerminalInputBuffer()
    this.originColumn = null
    this.host.renderSelection(null)
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.host.isEnabled() || !this.host.isSafeToEdit()) {
      this.reset()
      return true
    }
    const action = terminalEnhancedInputActionForKeyEvent(event, this.options)
    if (action.type === 'passthrough') return true
    const handled = this.applyAction(action)
    if (!handled) return true
    event.preventDefault()
    event.stopPropagation()
    this.render()
    return false
  }

  handleTerminalOutput(data: string): void {
    if (!this.buffer.text) return
    if (/[\r\n]|\x1bc|\x1b\[2J|\x1b\[\?1049[hl]|\x1b\[\?100[0-6][hl]/u.test(data)) this.reset()
  }

  private applyAction(action: TerminalEnhancedInputAction): boolean {
    switch (action.type) {
      case 'insert': {
        this.ensureOrigin()
        const hadSelection = selectedText(this.buffer).length > 0
        this.buffer = insertText(this.buffer, action.text)
        if (!hadSelection) this.host.write(action.text)
        else this.redraw()
        return true
      }
      case 'move':
        this.buffer = this.move(action)
        if (!this.buffer.text) return false
        this.redraw()
        return true
      case 'delete':
        this.buffer =
          action.unit === 'word'
            ? action.direction === 'backward'
              ? deleteWordBackward(this.buffer)
              : deleteWordForward(this.buffer)
            : action.direction === 'backward'
              ? deleteBackward(this.buffer)
              : deleteForward(this.buffer)
        this.redraw()
        return true
      case 'selectAll':
        if (!this.buffer.text) return false
        this.buffer = selectAllInput(this.buffer)
        return true
      case 'copy':
        return this.copySelection()
      case 'cut':
        return this.cutSelection()
      case 'paste':
        return this.pasteText()
      case 'undo':
        this.buffer = undoInputEdit(this.buffer)
        this.redraw()
        return true
      case 'redo':
        this.buffer = redoInputEdit(this.buffer)
        this.redraw()
        return true
      case 'enter':
        this.host.write('\r')
        this.reset()
        return true
      case 'escape':
        if (this.buffer.selectionAnchor === null) return false
        this.buffer = { ...this.buffer, selectionAnchor: null, selectionFocus: null }
        return true
    }
  }

  private move(action: Extract<TerminalEnhancedInputAction, { type: 'move' }>): TerminalInputBuffer {
    if (action.unit === 'word') return moveByWord(this.buffer, action.direction === 'left' ? 'left' : 'right', { select: action.select })
    if (action.unit === 'line') return moveCursor(this.buffer, action.direction === 'start' ? 0 : this.buffer.text.length, { select: action.select })
    return moveCursor(this.buffer, this.buffer.cursor + (action.direction === 'left' ? -1 : 1), { select: action.select })
  }

  private copySelection(): boolean {
    const text = selectedText(this.buffer)
    if (!text) return false
    void this.host.copyText(text).catch(() => {})
    return true
  }

  private cutSelection(): boolean {
    const text = selectedText(this.buffer)
    if (!text) return false
    void this.host.copyText(text).catch(() => {})
    this.buffer = deleteBackward(this.buffer)
    this.redraw()
    return true
  }

  private pasteText(): boolean {
    void this.host
      .readText()
      .then((text) => {
        if (!text || /[\r\n]/u.test(text)) return
        this.ensureOrigin()
        this.buffer = insertText(this.buffer, text)
        this.redraw()
        this.render()
      })
      .catch(() => {})
    return true
  }

  private ensureOrigin(): void {
    if (this.originColumn !== null) return
    this.originColumn = this.host.currentCursorColumn()
  }

  private redraw(): void {
    if (this.originColumn === null) return
    const left = Math.max(0, this.buffer.text.length - this.buffer.cursor)
    this.host.write(clearInputLineSequence() + this.buffer.text + '\x1b[D'.repeat(left))
  }

  private render(): void {
    if (this.originColumn === null || this.buffer.selectionAnchor === null || this.buffer.selectionFocus === null) {
      this.host.renderSelection(null)
      return
    }
    this.host.renderSelection({
      text: this.buffer.text,
      cursor: this.buffer.cursor,
      originColumn: this.originColumn,
      selectionStart: Math.min(this.buffer.selectionAnchor, this.buffer.selectionFocus),
      selectionEnd: Math.max(this.buffer.selectionAnchor, this.buffer.selectionFocus),
    })
  }
}

export function clearInputLineSequence(): string {
  return '\x01\x0b'
}
```

- [ ] **Step 4: Run controller tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-controller.test.ts
```

Expected: pass.

---

### Task 4: Add Selection Overlay And Mouse Hit Testing

**Files:**
- Create: `src/web/components/terminal/terminal-enhanced-input-overlay.ts`
- Create: `src/web/components/terminal/terminal-enhanced-input-overlay.test.ts`
- Modify: `src/web/components/terminal/terminal-session.css`

- [ ] **Step 1: Write failing overlay tests**

Create `src/web/components/terminal/terminal-enhanced-input-overlay.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, test } from 'vitest'
import {
  TerminalEnhancedInputOverlay,
  inputOffsetForMouseEvent,
} from '#/web/components/terminal/terminal-enhanced-input-overlay.ts'

describe('terminal enhanced input overlay', () => {
  test('renders selection rectangles for a single input row', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const overlay = new TerminalEnhancedInputOverlay(host)

    overlay.render({
      text: 'git status',
      originColumn: 5,
      row: 3,
      cellWidth: 8,
      cellHeight: 18,
      selectionStart: 4,
      selectionEnd: 10,
    })

    const selection = host.querySelector('.goblin-terminal-input-selection')
    expect(selection).not.toBeNull()
    expect((selection as HTMLElement).style.left).toBe('64px')
    expect((selection as HTMLElement).style.width).toBe('48px')

    overlay.dispose()
    expect(host.querySelector('.goblin-terminal-input-selection')).toBeNull()
  })

  test('maps mouse x position to a clamped input offset', () => {
    const event = new MouseEvent('mousedown', { clientX: 108, clientY: 20 })
    const offset = inputOffsetForMouseEvent(event, {
      hostLeft: 60,
      originColumn: 5,
      cellWidth: 8,
      textLength: 12,
    })

    expect(offset).toBe(2)
  })
})
```

- [ ] **Step 2: Run overlay tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-overlay.test.ts
```

Expected: fail because `terminal-enhanced-input-overlay.ts` does not exist.

- [ ] **Step 3: Implement overlay helper**

Create `src/web/components/terminal/terminal-enhanced-input-overlay.ts`:

```ts
export interface TerminalInputOverlayRenderState {
  text: string
  originColumn: number
  row: number
  cellWidth: number
  cellHeight: number
  selectionStart: number
  selectionEnd: number
}

export interface TerminalInputMouseGeometry {
  hostLeft: number
  originColumn: number
  cellWidth: number
  textLength: number
}

export class TerminalEnhancedInputOverlay {
  private readonly layer: HTMLDivElement

  constructor(host: HTMLElement) {
    this.layer = document.createElement('div')
    this.layer.className = 'goblin-terminal-input-selection-layer'
    host.appendChild(this.layer)
  }

  render(state: TerminalInputOverlayRenderState | null): void {
    this.layer.replaceChildren()
    if (!state || state.selectionStart === state.selectionEnd) return
    const selection = document.createElement('div')
    selection.className = 'goblin-terminal-input-selection'
    const start = Math.min(state.selectionStart, state.selectionEnd)
    const end = Math.max(state.selectionStart, state.selectionEnd)
    selection.style.left = `${(state.originColumn + start - 1) * state.cellWidth}px`
    selection.style.top = `${(state.row - 1) * state.cellHeight}px`
    selection.style.width = `${(end - start) * state.cellWidth}px`
    selection.style.height = `${state.cellHeight}px`
    this.layer.appendChild(selection)
  }

  dispose(): void {
    this.layer.remove()
  }
}

export function inputOffsetForMouseEvent(event: MouseEvent, geometry: TerminalInputMouseGeometry): number {
  const inputStart = geometry.hostLeft + (geometry.originColumn - 1) * geometry.cellWidth
  const raw = Math.round((event.clientX - inputStart) / geometry.cellWidth)
  return Math.max(0, Math.min(geometry.textLength, raw))
}
```

Modify `src/web/components/terminal/terminal-session.css`:

```css
.goblin-terminal-input-selection-layer {
  position: absolute;
  inset: 6px;
  z-index: 1;
  pointer-events: none;
}

.goblin-terminal-input-selection {
  position: absolute;
  background: var(--color-terminal-selection-background);
}
```

- [ ] **Step 4: Run overlay tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-overlay.test.ts
```

Expected: pass.

---

### Task 5: Integrate Controller Into TerminalSessionView

**Files:**
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Extend attach handler types**

Modify `src/web/components/terminal/types.ts`:

```ts
export interface TerminalSessionAttachHandlers {
  onRevealPath?: (relativePath: string) => void
  enhancedInput?: boolean
}
```

- [ ] **Step 2: Add failing integration tests**

Modify `src/web/components/terminal/ManagedTerminalSession.test.ts` by extending `MockTerminal`:

```ts
modes = {
  applicationCursorKeysMode: false,
  bracketedPasteMode: false,
  mouseTrackingMode: false,
}
buffer = {
  active: {
    type: 'normal',
    cursorX: 4,
    cursorY: 2,
    getLine: (index: number) => {
      const text = this.bufferLines[index]
      return typeof text === 'string' ? { translateToString: () => text } : undefined
    },
  },
}
```

Add tests near the existing keyboard handler tests:

```ts
test('enhanced input replaces selected current-line text through redraw sequence', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host, { enhancedInput: true })
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'g', cancelable: true }))).toBe(false)
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'i', cancelable: true }))).toBe(false)
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 't', cancelable: true }))).toBe(false)
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, cancelable: true }))).toBe(false)
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'X', cancelable: true }))).toBe(false)
  await flushTerminalStart()

  expect(terminalCalls.write).toHaveBeenLastCalledWith({ sessionId: 'session-1', data: '\x01\x0bgiX' })
})

test('enhanced input is disabled for alternate screen mode', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host, { enhancedInput: true })
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  term.buffer.active.type = 'alternate'

  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'a', cancelable: true }))).toBe(true)
  expect(terminalCalls.write).not.toHaveBeenCalled()
})

test('terminal output newline invalidates enhanced input state', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host, { enhancedInput: true })
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'a', cancelable: true }))).toBe(false)
  terminalOutput(session, { data: '\r\n', seq: 2 })
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true }))).toBe(true)
})
```

Use the existing helper style in the file for `hydrateManagedSession`, `flushTerminalStart`, and output handling. If there is no `terminalOutput` helper, call `session.handleOutput({ sessionId: 'session-1', data: '\r\n', seq: 2, processName: 'zsh' })`.

- [ ] **Step 3: Run integration tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: fail because `TerminalSessionView` does not instantiate enhanced input.

- [ ] **Step 4: Integrate controller into `terminal-session-view.ts`**

Modify imports:

```ts
import { TerminalEnhancedInputController } from '#/web/components/terminal/terminal-enhanced-input-controller.ts'
import { TerminalEnhancedInputOverlay } from '#/web/components/terminal/terminal-enhanced-input-overlay.ts'
```

Add fields to `TerminalSessionView`:

```ts
private enhancedInputAllowed = false
private enhancedInputController: TerminalEnhancedInputController | null = null
private enhancedInputOverlay: TerminalEnhancedInputOverlay | null = null
```

Add methods:

```ts
setEnhancedInputAllowed(value: boolean): void {
  this.enhancedInputAllowed = value
  if (!value) this.enhancedInputController?.reset()
}

handleTerminalOutput(data: string): void {
  this.enhancedInputController?.handleTerminalOutput(data)
}
```

In `attach(host)`, create the overlay after `host.replaceChildren(this.frame)`:

```ts
this.enhancedInputOverlay?.dispose()
this.enhancedInputOverlay = new TerminalEnhancedInputOverlay(this.frame)
```

In `detach()` and `destroyTerminal()`, reset controller and dispose overlay:

```ts
this.enhancedInputController?.reset()
this.enhancedInputOverlay?.dispose()
this.enhancedInputOverlay = null
```

Inside `openTerminal()`, instantiate the controller after `this.term = term`:

```ts
this.enhancedInputController = new TerminalEnhancedInputController(
  {
    isEnabled: () => this.enhancedInputAllowed,
    isSafeToEdit: () => this.isEnhancedInputSafe(term),
    currentCursorColumn: () => currentTerminalCursorColumn(term),
    write: (data) => this.handlers.onInput(data),
    renderSelection: (state) => {
      const geometry = this.enhancedInputGeometry(term)
      this.enhancedInputOverlay?.render(state && geometry ? { ...geometry, ...state } : null)
    },
    copyText: (text) => navigator.clipboard.writeText(text),
    readText: () => navigator.clipboard.readText(),
  },
  { isMac: isMacNavigatorPlatform(globalThis.navigator?.platform ?? '') },
)
```

In `installKeyboardHandlers()`, let enhanced input run after existing Safari workaround and before returning true:

```ts
const enhancedInputResult = this.enhancedInputController?.handleKeyDown(event)
if (enhancedInputResult === false) return false
```

`handleKeyDown()` must stay synchronous because xterm expects `attachCustomKeyEventHandler()` to return immediately. Clipboard reads and writes run through background promises inside the controller after the key has been consumed.

Add helper methods in the same file:

```ts
private isEnhancedInputSafe(term: XTermTerminal): boolean {
  const activeBuffer = term.buffer.active as { type?: string }
  const modes = term.modes as { bracketedPasteMode?: boolean; mouseTrackingMode?: boolean | string }
  return activeBuffer.type !== 'alternate' && !modes.bracketedPasteMode && !modes.mouseTrackingMode
}

private enhancedInputGeometry(term: XTermTerminal) {
  const rect = this.xtermHost.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0 || term.cols <= 0 || term.rows <= 0) return null
  return {
    row: currentTerminalCursorRow(term),
    cellWidth: rect.width / term.cols,
    cellHeight: rect.height / term.rows,
  }
}
```

Add top-level helpers:

```ts
function currentTerminalCursorColumn(term: XTermTerminal): number | null {
  const active = term.buffer.active as { cursorX?: number }
  return typeof active.cursorX === 'number' ? active.cursorX + 1 : null
}

function currentTerminalCursorRow(term: XTermTerminal): number {
  const active = term.buffer.active as { cursorY?: number }
  return typeof active.cursorY === 'number' ? active.cursorY + 1 : 1
}
```

- [ ] **Step 5: Notify view about terminal output**

Modify `ManagedTerminalSession.queueOutput()` before pushing pending output:

```ts
this.view.handleTerminalOutput(data)
```

- [ ] **Step 6: Run integration tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: pass.

---

### Task 6: Gate Enhanced Input From TerminalSlot

**Files:**
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`

- [ ] **Step 1: Write failing TerminalSlot tests**

Add tests to `src/web/components/terminal/TerminalSlot.test.tsx`:

```ts
test('enables enhanced input for writable controller sessions', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const attach = vi.fn()
  const { worktreeSnapshot, snapshot } = controllerFixture('controller')
  const context = terminalContext({ attach })
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
    expect(attach).toHaveBeenCalledWith(expect.any(Object), expect.any(HTMLElement), expect.objectContaining({ enhancedInput: true }))
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

test('does not enable enhanced input for readonly sessions', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const attach = vi.fn()
  const { worktreeSnapshot, snapshot } = controllerFixture('viewer')
  const context = terminalContext({ attach })
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
    expect(attach).toHaveBeenCalledWith(expect.any(Object), expect.any(HTMLElement), expect.objectContaining({ enhancedInput: false }))
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
```

- [ ] **Step 2: Run TerminalSlot tests and verify failure**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: fail because `TerminalSlot` does not pass `enhancedInput`.

- [ ] **Step 3: Pass enhanced-input flag through attach**

In `src/web/components/terminal/TerminalSlot.tsx`, compute:

```ts
const enhancedInput = isController && !searchOpen
```

Change the attach effect:

```ts
useLayoutEffect(() => {
  const host = hostRef.current
  if (!host || !descriptor) return
  attach(descriptor, host, { onRevealPath, enhancedInput })
  return () => detach(descriptor.key, host)
}, [attach, descriptor, detach, enhancedInput, onRevealPath])
```

Keep `isController` based on the existing snapshot/attachment role:

```ts
const isController = hasSessions && snapshot.phase === 'open' && attachment?.role === 'controller'
```

If `isController` is currently declared below the attach effect, move the declaration above the effect. Do not change viewer overlay behavior.

- [ ] **Step 4: Run TerminalSlot tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: pass.

---

### Task 7: Add Mouse Selection Wiring

**Files:**
- Modify: `src/web/components/terminal/terminal-enhanced-input-controller.ts`
- Modify: `src/web/components/terminal/terminal-enhanced-input-controller.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Add failing mouse controller tests**

Add to `terminal-enhanced-input-controller.test.ts`:

```ts
test('updates selection from mouse offsets inside the current input line', async () => {
  const { controller } = controllerFixture()

  controller.handleKeyDown(key({ key: 'a' }))
  controller.handleKeyDown(key({ key: 'b' }))
  controller.handleKeyDown(key({ key: 'c' }))

  expect(controller.startMouseSelection(1)).toBe(true)
  expect(controller.updateMouseSelection(3)).toBe(true)

  expect(controller.snapshot().selectionAnchor).toBe(1)
  expect(controller.snapshot().selectionFocus).toBe(3)
})
```

- [ ] **Step 2: Implement controller mouse methods**

Add methods to `TerminalEnhancedInputController`:

```ts
startMouseSelection(offset: number): boolean {
  if (!this.host.isEnabled() || !this.host.isSafeToEdit() || !this.buffer.text) return false
  this.buffer = moveCursor(this.buffer, offset, { select: false })
  this.buffer = { ...this.buffer, selectionAnchor: this.buffer.cursor, selectionFocus: this.buffer.cursor }
  this.render()
  return true
}

updateMouseSelection(offset: number): boolean {
  if (!this.buffer.text || this.buffer.selectionAnchor === null) return false
  this.buffer = moveCursor(this.buffer, offset, { select: true })
  this.render()
  return true
}

finishMouseSelection(): void {
  this.render()
}
```

- [ ] **Step 3: Wire mouse events in `TerminalSessionView`**

In `openTerminal()`, after `term.open(this.xtermHost)`, add listeners to `this.frame`:

```ts
const mouseDown = (event: MouseEvent) => {
  const offset = this.inputOffsetForMouseEvent(term, event)
  if (offset === null || !this.enhancedInputController?.startMouseSelection(offset)) return
  event.preventDefault()
  event.stopPropagation()
}
const mouseMove = (event: MouseEvent) => {
  const offset = this.inputOffsetForMouseEvent(term, event)
  if (offset === null || !this.enhancedInputController?.updateMouseSelection(offset)) return
  event.preventDefault()
  event.stopPropagation()
}
const mouseUp = () => this.enhancedInputController?.finishMouseSelection()
this.frame.addEventListener('mousedown', mouseDown)
this.frame.addEventListener('mousemove', mouseMove)
window.addEventListener('mouseup', mouseUp)
this.disposables.push({
  dispose: () => {
    this.frame.removeEventListener('mousedown', mouseDown)
    this.frame.removeEventListener('mousemove', mouseMove)
    window.removeEventListener('mouseup', mouseUp)
  },
})
```

Add helper method:

```ts
private inputOffsetForMouseEvent(term: XTermTerminal, event: MouseEvent): number | null {
  const state = this.enhancedInputController?.snapshot()
  const originColumn = this.enhancedInputController?.inputOriginColumn() ?? null
  const rect = this.xtermHost.getBoundingClientRect()
  if (!state?.text || originColumn === null || rect.width <= 0 || term.cols <= 0) return null
  const cellWidth = rect.width / term.cols
  const inputStart = rect.left + (originColumn - 1) * cellWidth
  const raw = Math.round((event.clientX - inputStart) / cellWidth)
  return Math.max(0, Math.min(state.text.length, raw))
}
```

- [ ] **Step 4: Add an integration smoke test for mouse selection**

Add to `ManagedTerminalSession.test.ts`:

```ts
test('mouse drag over current input updates enhanced selection overlay', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const session = new ManagedTerminalSession(descriptor, vi.fn())
  hydrateManagedSession(session)

  session.attach(host, { enhancedInput: true })
  await flushTerminalStart()
  await flushUntil(() => session.snapshot().phase === 'open')

  const term = xtermMocks.terminals[0]!
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'a', cancelable: true }))).toBe(false)
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'b', cancelable: true }))).toBe(false)
  expect(term.customKeyEventHandler?.(new KeyboardEvent('keydown', { key: 'c', cancelable: true }))).toBe(false)

  host.querySelector('.goblin-managed-terminal-frame')?.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 40, clientY: 20 }),
  )
  host.querySelector('.goblin-managed-terminal-frame')?.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 80, clientY: 20 }),
  )

  expect(host.querySelector('.goblin-terminal-input-selection')).not.toBeNull()
})
```

- [ ] **Step 5: Run mouse-related tests and verify pass**

Run:

```bash
bun run test src/web/components/terminal/terminal-enhanced-input-controller.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: pass.

---

### Task 8: Verification And Scope Guards

**Files:**
- Modify only if a previous task exposed a missing test in the listed files.

- [ ] **Step 1: Run focused terminal tests**

Run:

```bash
bun run test src/web/components/terminal
```

Expected: pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Run architecture check**

Run:

```bash
bun run check:architecture
```

Expected: pass. The new files must remain under `src/web/components/terminal/**` and must not import `src/main/**`, `src/server/**`, or `electron`.

- [ ] **Step 4: Run full test suite**

Run:

```bash
bun run test
```

Expected: pass.

- [ ] **Step 5: Manual desktop smoke test**

Start the app through the repo's normal development command, then verify:

```bash
bun run dev
```

Expected:

- In a local zsh terminal, type `git status`, use `Shift+ArrowLeft` to select characters, type replacement text, and confirm the shell line redraws once.
- Use mouse drag over the current input text and confirm only current input text is highlighted.
- Use `Cmd+C` on a selection and paste into another text field to confirm selected command text is copied.
- Use `Cmd+X` on a selection and confirm the terminal line redraws with the selection removed.
- Use `Cmd+A` and confirm only the current input line is selected.
- Use `Cmd+Z` and `Shift+Cmd+Z` to undo and redo current-line edits.
- Press Enter and confirm the command submits once.
- Open `vim` or `less` and confirm enhanced input does not intercept normal terminal input.
- In a remote managed terminal, repeat selection, replacement, and Enter submit on an ordinary shell prompt.

---

## Self-Review Notes

- Spec coverage: the plan covers renderer-only implementation, current-line model, keyboard selection, mouse selection, clipboard actions, undo/redo, readonly gating, xterm fallback, local/remote shared path, and verification.
- Intentional exclusions: output-history selection, multiline editing, REPL/TUI support, shell plugins, server/PTY protocol changes, persistence, and logging are not implemented.
- Type consistency: attach handler uses `enhancedInput?: boolean`; controller host methods use `write`, `copyText`, `readText`, `renderSelection`, `isEnabled`, and `isSafeToEdit` consistently across tasks.
- Project constraint: no commit steps are included.

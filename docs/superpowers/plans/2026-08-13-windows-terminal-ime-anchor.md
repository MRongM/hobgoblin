# Windows Terminal IME Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Windows 11 Microsoft Pinyin candidate UI at the logical terminal input cursor while Codex continues rendering, including the TSF path that emits no browser composition events.

**Architecture:** Extend the renderer-local terminal IME adapter with an opaque-TSF state inferred from unmatched printable `keyup` events. Replace asynchronous MutationObserver restoration with a CSS-priority layout lock so xterm may update inline coordinates without ever changing the textarea's computed position while an IME anchor is active.

**Tech Stack:** TypeScript strip-only mode, `@xterm/xterm@6.0.0`, DOM keyboard/input events, CSS custom properties, Vitest/jsdom, Electron 42.

---

## File Structure

- Modify `src/web/components/terminal/terminal-ime-position.test.ts`: encode the observed no-composition TSF event sequence and lock lifecycle.
- Modify `src/web/components/terminal/terminal-ime-position.ts`: own standard-composition and opaque-TSF anchor state, key pairing, CSS lock application, and cleanup.
- Modify `src/web/components/terminal/terminal-session.css`: add the synchronous `!important` position contract.
- Modify `src/web/components/terminal/terminal-session-css.test.ts`: verify the lock selector and both priority declarations.
- Modify `src/web/components/terminal/ManagedTerminalSession.test.ts`: verify the adapter is installed after xterm opens and survives terminal output without relying on composition events.

### Task 1: Encode The Real Windows TSF Reproduction

**Files:**
- Modify: `src/web/components/terminal/terminal-ime-position.test.ts`
- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Add a unit test for an unmatched printable keyup**

Add a test that starts with xterm's textarea at `84px/168px`, dispatches only `keyup(KeyX)`, mutates xterm's ordinary inline position to `896px/658px`, and expects the lock class and anchor variables to remain `84px/168px`:

```ts
test('locks the Windows TSF candidate anchor when the IME consumes printable keydown', () => {
  const fixture = terminalFixture()
  moveImeElements(fixture.textarea, fixture.compositionView, 84, 168)
  const disposable = stabilizeTerminalImePosition(fixture.terminal, 'Win32')

  fixture.textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))
  moveImeElements(fixture.textarea, fixture.compositionView, 896, 658)

  expect(fixture.textarea.classList.contains('goblin-terminal-ime-anchor')).toBe(true)
  expect(fixture.compositionView.classList.contains('goblin-terminal-ime-anchor')).toBe(true)
  expect(fixture.textarea.style.getPropertyValue('--goblin-terminal-ime-anchor-left')).toBe('84px')
  expect(fixture.textarea.style.getPropertyValue('--goblin-terminal-ime-anchor-top')).toBe('168px')
  expect([fixture.textarea.style.left, fixture.textarea.style.top]).toEqual(['896px', '658px'])

  disposable.dispose()
})
```

- [ ] **Step 2: Add opaque-state lifecycle tests**

Add separate tests proving:

```ts
// A matched ordinary key pair does not lock.
textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' }))
textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }))

// A Chinese commit releases, then the next orphan keyup anchors at the new cursor.
textarea.dispatchEvent(new InputEvent('beforeinput', { data: '今天', inputType: 'insertText' }))
moveImeElements(textarea, compositionView, 112, 168)
textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))

// Backspace retains the current opaque anchor; Escape releases it.
textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'Backspace', key: 'Backspace' }))
textarea.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' }))
```

Each test must assert both lock-class state and custom-property values, not restored inline coordinates.

- [ ] **Step 3: Add the CSS contract test**

Add to `terminal-session-css.test.ts`:

```ts
test('locks the Windows IME anchor before xterm inline position updates reach layout', () => {
  expect(css).toMatch(
    /\.goblin-managed-terminal-host \.goblin-terminal-ime-anchor\s*\{[^}]*left:\s*var\(--goblin-terminal-ime-anchor-left\)\s*!important;[^}]*top:\s*var\(--goblin-terminal-ime-anchor-top\)\s*!important;/,
  )
})
```

- [ ] **Step 4: Change the terminal integration test to the no-composition path**

Replace the existing integration scenario's `compositionstart` with an unmatched printable `keyup`. Assert the adapter adds the class and anchor variables, terminal render mutations may change ordinary inline `left/top`, and `beforeinput` removes the class.

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```powershell
bun run test terminal-ime-position.test.ts terminal-session-css.test.ts ManagedTerminalSession.test.ts
```

Expected: FAIL because the current implementation has no orphan-`keyup` state and `terminal-session.css` has no priority lock rule.

### Task 2: Implement Synchronous Standard And Opaque Anchoring

**Files:**
- Modify: `src/web/components/terminal/terminal-ime-position.ts`
- Modify: `src/web/components/terminal/terminal-session.css`

- [ ] **Step 1: Add the CSS priority rule**

Insert after the `.goblin-managed-terminal-host .xterm` rule:

```css
.goblin-managed-terminal-host .goblin-terminal-ime-anchor {
  left: var(--goblin-terminal-ime-anchor-left) !important;
  top: var(--goblin-terminal-ime-anchor-top) !important;
}
```

- [ ] **Step 2: Replace observer restoration with lock helpers**

Use these constants and helpers in `terminal-ime-position.ts`:

```ts
const IME_ANCHOR_CLASS = 'goblin-terminal-ime-anchor'
const IME_ANCHOR_LEFT = '--goblin-terminal-ime-anchor-left'
const IME_ANCHOR_TOP = '--goblin-terminal-ime-anchor-top'

type TerminalImeMode = 'standard' | 'opaque'

function inlinePixelPosition(value: string): string | null {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d+)?px$/.test(normalized)) return null
  return normalized
}

function textareaAnchor(textarea: HTMLTextAreaElement): TerminalImeAnchor | null {
  const left = inlinePixelPosition(textarea.style.left)
  const top = inlinePixelPosition(textarea.style.top)
  return left && top ? { left, top } : null
}

function keyIdentity(event: KeyboardEvent): string {
  return event.code || event.key
}

function isOpaqueImeStart(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}
```

The adapter state becomes:

```ts
let anchor: TerminalImeAnchor | null = null
let mode: TerminalImeMode | null = null
const pressedKeys = new Set<string>()
```

Apply and release the layout contract synchronously. Standard composition may begin before a measurable anchor exists, so `mode` is set by the event handlers and `applyAnchor` only installs a non-null position:

```ts
const applyAnchor = (nextAnchor: TerminalImeAnchor): void => {
  anchor = nextAnchor
  for (const element of [textarea, compositionView]) {
    element.style.setProperty(IME_ANCHOR_LEFT, nextAnchor.left)
    element.style.setProperty(IME_ANCHOR_TOP, nextAnchor.top)
    element.classList.add(IME_ANCHOR_CLASS)
  }
}

const release = (): void => {
  anchor = null
  mode = null
  pressedKeys.clear()
  for (const element of [textarea, compositionView]) {
    element.classList.remove(IME_ANCHOR_CLASS)
    element.style.removeProperty(IME_ANCHOR_LEFT)
    element.style.removeProperty(IME_ANCHOR_TOP)
  }
}
```

- [ ] **Step 3: Implement standard composition event handling**

`compositionstart` releases stale state, sets `mode = 'standard'`, and applies `terminalCursorAnchor(term, screen)` when measurable. `compositionupdate` supplies the textarea/fallback anchor only when standard composition began without a measurable cursor. `compositionend` releases.

- [ ] **Step 4: Implement opaque TSF key pairing**

Use this event behavior:

```ts
const handleKeyDown = (event: KeyboardEvent): void => {
  const identity = keyIdentity(event)
  if (mode === 'standard') {
    if (!compositionView.classList.contains('active')) release()
  } else if (mode === 'opaque') {
    release()
  }
  pressedKeys.add(identity)
}

const handleKeyUp = (event: KeyboardEvent): void => {
  if (pressedKeys.delete(keyIdentity(event))) return
  if (event.key === 'Escape') {
    release()
    return
  }
  if (mode !== null || !isOpaqueImeStart(event)) return
  const nextAnchor = textareaAnchor(textarea) ?? terminalCursorAnchor(term, screen)
  if (nextAnchor) {
    mode = 'opaque'
    applyAnchor(nextAnchor)
  }
}

const handleBeforeInput = (): void => {
  if (mode === 'opaque') release()
}
```

Register `keyup`, `beforeinput`, and `input` alongside the existing events. Remove the render listener, MutationObserver, restore timers, and their cleanup. Blur and disposal call `release()`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
bun run test terminal-ime-position.test.ts terminal-session-css.test.ts ManagedTerminalSession.test.ts
```

Expected: PASS, including standard composition regressions and the no-composition TSF scenario.

### Task 3: Tighten Edge Cases And Regression Coverage

**Files:**
- Modify: `src/web/components/terminal/terminal-ime-position.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Verify normal Windows input is unaffected**

Add or retain tests for matched keydown/keyup, Ctrl+V custom-handler veto, modifier keys, focus retention, non-Windows no-op behavior, and unavailable xterm DOM elements.

- [ ] **Step 2: Verify cleanup**

Assert blur and `dispose()` remove both classes and both variables, and a later xterm position update is no longer locked.

- [ ] **Step 3: Verify standard composition still follows pre-edit width**

Set `textarea.style.width` during standard composition and assert the adapter does not define or restore a width custom property. Only `left/top` are locked.

- [ ] **Step 4: Run terminal tests**

Run:

```powershell
bun run test terminal-ime-position.test.ts terminal-session-css.test.ts ManagedTerminalSession.test.ts
```

Expected: all targeted tests pass with no timer leaks or unhandled jsdom errors.

### Task 4: Repository Verification And Unpacked Build

**Files:**
- Verify: all modified source and test files
- Build: `release-ime-unpack-v2/win-unpacked/Hobgoblin.exe`

- [ ] **Step 1: Run static and architecture checks**

Run:

```powershell
bun run typecheck
bun run check:architecture
```

Expected: all TypeScript projects pass and `import boundaries passed`.

- [ ] **Step 2: Run the complete test suite**

Run:

```powershell
bun run test
```

Expected: exit code 0. Existing documented jsdom warnings are acceptable only when the suite passes.

- [ ] **Step 3: Build web assets with the requested proxy/mirrors**

Set the same proxy and npmmirror variables used by `install.ts` and the fast Windows build script:

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7890'
$env:HTTPS_PROXY='http://127.0.0.1:7890'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
bun run build:web
```

- [ ] **Step 4: Build a fresh unpacked x64 app without native rebuild/download**

Run:

```powershell
bun run build:electron -- --win --x64 --dir --config.directories.output=release-ime-unpack-v2 --config.npmRebuild=false --config.electronDist="$PWD\node_modules\electron\dist"
```

Expected: `release-ime-unpack-v2/win-unpacked/Hobgoblin.exe` exists.

- [ ] **Step 5: Verify packaged web bytes and hash the executable**

Compare the packaged asar's web bundle with `dist/web`, then run:

```powershell
Get-FileHash release-ime-unpack-v2\win-unpacked\Hobgoblin.exe -Algorithm SHA256
```

Expected: the asar contains the new IME class/variable symbols and an executable SHA-256 is reported.

- [ ] **Step 6: Launch the new unpack and perform Windows 11 UAT**

Open the new unpack with a fresh remote-debugging port. In Codex, submit a long-running prompt and slowly enter multiple Pinyin phrases while output continues. Verify the candidate UI never jumps to the output cursor and advances after each committed phrase.

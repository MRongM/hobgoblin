# Telegram Terminal TUI Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert raw full-screen terminal output into a readable Telegram excerpt without leaking VT control bytes or changing native printable content.

**Architecture:** Extend the existing per-session streaming collector into a bounded VT text projector whose parser state survives chunk boundaries. Keep server-side normalization as defense in depth for Unicode frame edges, whitespace folding, long horizontal-rule compaction, and authoritative suffix truncation.

**Tech Stack:** TypeScript 6 in Node.js strip-only mode, Vitest, Bun.

## Global Constraints

- Keep the existing `TerminalOutputTail` and Telegram notification interfaces unchanged.
- Work for background and never-attached terminal sessions; do not read an xterm buffer or add a headless terminal dependency.
- Preserve commands, paths, URLs, versions, punctuation, and every other native printable value without masking or redaction.
- Treat the result as a best-effort linear stream projection, not an exact terminal-screen reconstruction.
- Keep the configured 1–4096 output-tail limit, default 400, whitespace folding, and whole-message 4096-character budget unchanged.
- Keep parsing linear in input size and compact output before applying the character limit.
- Do not stage, commit, branch, or push.

---

### Task 1: Specify complete streaming VT control handling

**Files:**

- Modify: `src/web/components/terminal/terminal-output-tail.test.ts`

**Interfaces:**

- Consumes: `createTerminalOutputTail(maxCharacters?: number): TerminalOutputTail`.
- Produces: regression coverage for split charset designators, DEC Special Graphics, CSI semantic boundaries, and 7-bit/C1 string controls.

- [x] **Step 1: Add failing parser regression tests**

Add tests with these assertions:

```ts
const charset = createTerminalOutputTail()
charset.push('left\u001b(')
charset.push('Bright')
expect(charset.value()).toBe('leftright')

const cursor = createTerminalOutputTail()
cursor.push('first\u001b[2;1Hsecond\u001b[31mred\u001b[0mtext')
expect(cursor.value()).toBe('first secondredtext')

const strings = createTerminalOutputTail()
strings.push('one\u001bPdrop\u001b')
strings.push('\\two\u001b_drop\u001b\\three\u0090drop\u009cfour')
expect(strings.value()).toBe('onetwothreefour')

const graphics = createTerminalOutputTail()
graphics.push('\u001b(0lqqqqk\u001b(B text')
expect(graphics.value()).toBe('─── text')
```

Also assert `reset()` clears an in-flight string control and restores the ASCII G0/G1 selection.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-output-tail.test.ts
```

Expected: the new cases fail because `ESC(B` leaks `B`, DCS/APC payloads leak, cursor positioning glues text, and DEC Special Graphics is not decoded.

---

### Task 2: Implement the streaming VT text projector

**Files:**

- Modify: `src/web/components/terminal/terminal-output-tail.ts`

**Interfaces:**

- Consumes: raw PTY string chunks passed to `TerminalOutputTail.push(data)`.
- Produces: the same `TerminalOutputTail` interface, with parser and G0/G1 state retained across calls.

- [x] **Step 1: Add the minimal parser states and DEC mapping**

Use explicit string-union states for `plain`, `escape`, `escape-intermediate`, `csi`, `osc`, `string`, and `string-escape`. Track the ESC intermediate bytes, whether a string is OSC, G0/G1 as `'ascii' | 'dec-special'`, and the active charset selected by SI/SO.

Use this DEC Special Graphics mapping for native terminal glyph projection:

```ts
const DEC_SPECIAL_GRAPHICS: Readonly<Record<string, string>> = {
  '`': '◆',
  a: '▒',
  f: '°',
  g: '±',
  h: '␤',
  j: '┘',
  k: '┐',
  l: '┌',
  m: '└',
  n: '┼',
  o: '⎺',
  p: '⎻',
  q: '─',
  r: '⎼',
  s: '⎽',
  t: '├',
  u: '┤',
  v: '┴',
  w: '┬',
  x: '│',
  y: '≤',
  z: '≥',
  '{': 'π',
  '|': '≠',
  '}': '£',
  '~': '·',
}
```

- [x] **Step 2: Consume complete control families**

Recognize CSI, OSC, DCS, SOS, PM, and APC through both ESC and C1 introducers. End OSC on BEL or ST; end the other string controls only on ST; support split `ESC \\`; cancel in-flight sequences on CAN or SUB. Consume ESC intermediate/final sequences such as `ESC(B` completely and apply G0/G1 charset designators for `(` and `)` with final `0` or `B`.

- [x] **Step 3: Project command semantics conservatively**

Insert one pending whitespace for CSI cursor movement, tab movement, scrolling, and erase final bytes:

```ts
const CSI_TEXT_BOUNDARY_FINALS = new Set([
  '@',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'S',
  'T',
  'Z',
  '`',
  'a',
  'd',
  'e',
  'f',
  'u',
])
```

Do not insert text for SGR styling or mode-setting sequences. Drop remaining C0/C1 controls, convert CR/LF/tab/backspace motion to the existing pending-whitespace representation, and map printable bytes through the active DEC charset before appending.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-output-tail.test.ts
```

Expected: all existing and new collector tests pass, including the one-slice performance assertion.

---

### Task 3: Remove Unicode frame edges before character counting

**Files:**

- Modify: `src/shared/telegram-notifications.ts`
- Modify: `src/shared/telegram-notifications.test.ts`
- Modify: `src/web/components/terminal/terminal-output-tail.ts`
- Modify: `src/web/components/terminal/terminal-output-tail.test.ts`

**Interfaces:**

- Consumes: direct Unicode terminal text in both shared normalization and the streaming collector.
- Produces: exported `TELEGRAM_OUTPUT_FRAME_CHARACTERS` shared by both layers; unchanged `normalizeTelegramOutput()` and collector return types.

- [x] **Step 1: Add failing Unicode frame tests**

Assert both layers transform:

```text
╭────╮
│ OpenAI Codex │
╰────╯
```

to `─── OpenAI Codex ───`, while preserving native `--flag`, `±`, and ordinary letters. Include an example containing repeated `ESC(B` designators and assert no standalone `B` bytes leak into the result.

- [x] **Step 2: Run both focused test files and verify RED**

Run:

```bash
bun run test -- src/shared/telegram-notifications.test.ts src/web/components/terminal/terminal-output-tail.test.ts
```

Expected: Unicode corners and vertical edges remain in output.

- [x] **Step 3: Implement shared frame-character classification**

Export the immutable character string:

```ts
export const TELEGRAM_OUTPUT_FRAME_CHARACTERS = '╭╮╰╯│┌┐└┘├┤┬┴┼'
```

In `normalizeTelegramOutput()`, replace runs made from those characters with a space before folding whitespace and compacting `/─{4,}/gu`. In the streaming collector, treat the same characters as pending whitespace before horizontal-rule tracking so decoration does not consume the tail budget.

- [x] **Step 4: Run both focused test files and verify GREEN**

Run:

```bash
bun run test -- src/shared/telegram-notifications.test.ts src/web/components/terminal/terminal-output-tail.test.ts
```

Expected: all selected tests pass.

---

### Task 4: Verify notification integration and repository invariants

**Files:**

- Verify: `src/server/modules/telegram-notification-write-paths.test.ts`
- Verify: all modified source, test, context, design, and plan files.

**Interfaces:**

- Consumes: the completed collector and shared normalizer.
- Produces: evidence that Telegram formatting, TypeScript constraints, architecture boundaries, and repository tests remain valid.

- [x] **Step 1: Run Telegram-focused integration coverage**

Run:

```bash
bun run test -- src/shared/telegram-notifications.test.ts src/web/components/terminal/terminal-output-tail.test.ts src/server/modules/telegram-notification-write-paths.test.ts
```

Expected: all selected files pass.

- [x] **Step 2: Run static verification**

Run:

```bash
bun run typecheck
bun run check:architecture
git diff --check
```

Expected: every command exits zero.

- [x] **Step 3: Run the full suite and classify only evidence-backed baseline failures**

Run:

```bash
bun run test
```

Expected: no new failure related to terminal output or Telegram notifications. If the known detached-file-area `window.localStorage.clear is not a function` environment failure remains, report it explicitly with its exact count; do not describe the entire suite as passing.

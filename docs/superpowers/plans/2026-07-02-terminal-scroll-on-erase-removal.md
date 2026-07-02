# Terminal Scroll On Erase Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Hobgoblin's explicit `scrollOnEraseInDisplay` xterm option from both web and server headless terminal construction.

**Architecture:** The current option is centralized through `TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY`, then passed into web xterm and server-side headless xterm. The implementation deletes that shared constant, removes both constructor option entries, and updates terminal tests so the option is absent instead of asserted as `true`.

**Tech Stack:** TypeScript, xterm.js, @xterm/headless, Vitest, Bun.

---

## File Structure

- Modify: `src/shared/terminal.ts`
  - Owns shared terminal constants and types.
  - Remove the unused `TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY` constant.
- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Owns browser xterm construction.
  - Remove the `scrollOnEraseInDisplay` constructor option and its shared constant import.
- Modify: `src/server/terminal/terminal-render-state.ts`
  - Owns server-side headless xterm render model construction.
  - Remove the `scrollOnEraseInDisplay` constructor option, its local option type entry, and its shared constant import.
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Owns the xterm browser mock and terminal session behavior assertions.
  - Add a negative assertion that the option is absent, then remove the mock's storage/type support for that deleted option.
- No git commit step is included because repository instructions say not to plan or execute commits unless the user explicitly requests them.

## Task 1: Add A Negative Web Constructor Assertion

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Replace the positive option assertion**

In the test named `opens xterm and attaches the primary terminal session with fitted dimensions`, replace:

```ts
    expect(xtermMocks.terminals[0]!.options.scrollOnEraseInDisplay).toBe(true)
```

with:

```ts
    expect(xtermMocks.terminals[0]!.options).not.toHaveProperty('scrollOnEraseInDisplay')
```

- [ ] **Step 2: Run the terminal session test and verify it fails before implementation**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result before implementation:

```text
FAIL src/web/components/terminal/ManagedTerminalSession.test.ts
expected { ... } to not have property "scrollOnEraseInDisplay"
```

The failure proves the browser xterm constructor mock still receives or stores the deleted option.

## Task 2: Remove The Shared Constant And Production Constructor Options

**Files:**
- Modify: `src/shared/terminal.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/server/terminal/terminal-render-state.ts`

- [ ] **Step 1: Remove the shared constant**

In `src/shared/terminal.ts`, delete:

```ts
export const TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY = true
```

The file should keep:

```ts
export const TERMINAL_SCROLLBACK_LINES = 50_000
```

- [ ] **Step 2: Update the browser terminal import**

In `src/web/components/terminal/terminal-session-view.ts`, replace:

```ts
import { TERMINAL_SCROLLBACK_LINES, TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY } from '#/shared/terminal.ts'
```

with:

```ts
import { TERMINAL_SCROLLBACK_LINES } from '#/shared/terminal.ts'
```

- [ ] **Step 3: Remove the browser xterm option**

In `src/web/components/terminal/terminal-session-view.ts`, remove this entry from the `new Terminal({ ... })` options:

```ts
      scrollOnEraseInDisplay: TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY,
```

The surrounding options should read:

```ts
      minimumContrastRatio: 4.5,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      macOptionIsMeta: true,
      rescaleOverlappingGlyphs: true,
      scrollOnUserInput: true,
      theme,
```

- [ ] **Step 4: Update the server render-state import**

In `src/server/terminal/terminal-render-state.ts`, replace:

```ts
import {
  TERMINAL_SCROLLBACK_LINES,
  TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY,
  type TerminalSessionSnapshot,
} from '#/shared/terminal.ts'
```

with:

```ts
import { TERMINAL_SCROLLBACK_LINES, type TerminalSessionSnapshot } from '#/shared/terminal.ts'
```

- [ ] **Step 5: Remove the server headless option type entry**

In `src/server/terminal/terminal-render-state.ts`, remove this property from the local `HeadlessTerminal` constructor option type:

```ts
    scrollOnEraseInDisplay?: boolean
```

The type should keep:

```ts
    cols?: number
    rows?: number
    scrollback?: number
    allowProposedApi?: boolean
```

- [ ] **Step 6: Remove the server headless constructor option**

In `src/server/terminal/terminal-render-state.ts`, remove this entry from `new HeadlessTerminal({ ... })`:

```ts
    scrollOnEraseInDisplay: TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY,
```

The constructor options should read:

```ts
  const term = new HeadlessTerminal({
    cols,
    rows,
    scrollback: TERMINAL_SCROLLBACK_LINES,
    allowProposedApi: true,
  })
```

## Task 3: Remove Test Mock Support For The Deleted Option

**Files:**
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Remove the mock options field**

In the mock terminal `options` type, remove:

```ts
      scrollOnEraseInDisplay?: boolean
```

The nearby option keys should keep:

```ts
      rescaleOverlappingGlyphs?: boolean
      scrollback?: number
      theme?: { background?: string; foreground?: string }
      scrollOnUserInput?: boolean
```

- [ ] **Step 2: Remove the mock constructor input field**

In the `MockTerminal` constructor parameter type, remove:

```ts
      scrollOnEraseInDisplay?: boolean
```

The nearby constructor fields should keep:

```ts
      rescaleOverlappingGlyphs?: boolean
      scrollback?: number
      theme?: { background?: string; foreground?: string }
      scrollOnUserInput?: boolean
```

- [ ] **Step 3: Remove stored mock option assignment**

In the `this.options = { ... }` block, remove:

```ts
        scrollOnEraseInDisplay: options.scrollOnEraseInDisplay,
```

The nearby assignments should keep:

```ts
        minimumContrastRatio: options.minimumContrastRatio,
        rescaleOverlappingGlyphs: options.rescaleOverlappingGlyphs,
        scrollback: options.scrollback,
        theme: options.theme,
        scrollOnUserInput: options.scrollOnUserInput,
```

- [ ] **Step 4: Run the terminal session test and verify it passes**

Run:

```bash
bun run test "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result:

```text
Test Files  1 passed (1)
```

## Task 4: Verify No Scroll-On-Erase Configuration Remains

**Files:**
- Inspect: `src/shared/terminal.ts`
- Inspect: `src/web/components/terminal/terminal-session-view.ts`
- Inspect: `src/server/terminal/terminal-render-state.ts`
- Inspect: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Search for deleted symbols**

Run:

```bash
rg -n "scrollOnEraseInDisplay|TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY" "src"
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

Expected result includes:

```text
 M src/shared/terminal.ts
 M src/server/terminal/terminal-render-state.ts
 M src/web/components/terminal/ManagedTerminalSession.test.ts
 M src/web/components/terminal/terminal-session-view.ts
?? docs/superpowers/plans/2026-07-02-terminal-scroll-on-erase-removal.md
?? docs/superpowers/specs/2026-07-02-terminal-scroll-on-erase-removal-design.md
```

Additional lines from earlier approved work may also appear. Do not revert unrelated changes.

## Plan Self-Review

- Spec coverage: Task 1 creates a failing negative assertion, Task 2 removes web/server/shared production configuration, Task 3 removes test mock support, and Task 4 verifies deleted symbols plus test/type/architecture health.
- Scope control: The plan does not alter `scrollback`, `scrollOnUserInput`, replay, serialize, resize, theme, focus, IME, custom buttons, or toolbar behavior.
- Type consistency: All referenced names match current code: `TERMINAL_SCROLL_ON_ERASE_IN_DISPLAY`, `scrollOnEraseInDisplay`, `HeadlessTerminal`, `TERMINAL_SCROLLBACK_LINES`, and `ManagedTerminalSession.test.ts`.
- Old Goblin alignment: The resulting web and server constructors both omit `scrollOnEraseInDisplay`, matching the referenced old Goblin code path.

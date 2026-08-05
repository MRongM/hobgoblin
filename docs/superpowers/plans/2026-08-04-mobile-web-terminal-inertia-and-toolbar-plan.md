# Mobile Web Terminal Command Deck and Inertia Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mobile Web floating terminal keys with an Android/Termux-inspired bottom command deck, add its Web-relevant third-row actions, and continue manual terminal scrolling with cancelable inertia.

**Architecture:** Keep UI-only deck state in `MobileTerminalCommandDeck` and `TerminalSlot`, route mode-aware extra keys through the existing terminal session facade to `TerminalSessionView`, and reuse the measured bottom dock for layout clearance. `TerminalSlot` owns the pointer velocity and animation-frame loop; the existing `scrollByTouch` path remains authoritative for normal buffers, alternate buffers, and mouse tracking.

**Tech Stack:** React 19, TypeScript strip-only mode, Vitest/jsdom, xterm 6, CSS.

## Global Constraints

- Execute inline in the current worktree; do not create a branch, commit, or dispatch subagents.
- Preserve controller/viewer/unowned touch routing and terminal authority checks.
- Do not scroll the Hobgoblin page, synthesize local echo, add dependencies, or persist command-deck state.
- Use the exact Android rows `ESC / - HOME ↑ END PGUP` and `TAB CTRL ALT ← ↓ → PGDN`.
- Use a 720-pixel original-width surface; fit width remains the default.
- Inertia uses a 50 px/s stop threshold, 0.92 decay per 60 Hz frame, a 32 ms maximum frame interval, cancellation, and no bounce.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.

---

### Task 1: Mode-aware Termux extra keys

**Files:**

- Create: `src/web/components/terminal/terminal-extra-keys.test.ts`
- Create: `src/web/components/terminal/terminal-extra-keys.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: terminal-context fixtures reported by `bun run typecheck`

**Interfaces:**

```ts
export type TerminalExtraKey =
  | 'escape'
  | 'slash'
  | 'minus'
  | 'home'
  | 'arrow-up'
  | 'end'
  | 'page-up'
  | 'tab'
  | 'arrow-left'
  | 'arrow-down'
  | 'arrow-right'
  | 'page-down'

export interface TerminalExtraKeyInput {
  key: TerminalExtraKey
  ctrlPressed: boolean
  altPressed: boolean
}

export function terminalInputForExtraKey(
  input: TerminalExtraKeyInput,
  options: { applicationCursorKeysMode: boolean },
): string
```

- [ ] Add pure tests for exact row order; normal/application cursor sequences; Page Up/Down; and Ctrl/Alt navigation, slash, and minus input.
- [ ] Run `bun run test -- "src/web/components/terminal/terminal-extra-keys.test.ts"` and confirm RED because the module does not exist.
- [ ] Implement the exact immutable row definitions and VT input translation. Cursor keys without modifiers use `ESC O` in application mode and `ESC [` otherwise; modified cursor keys use CSI `1;<modifier>`; Page Up/Down use CSI `5~`/`6~`; Alt prefixes text; Ctrl+slash/minus emits unit separator.
- [ ] Add required `writeExtraKey(key, input)` routing to `TerminalSessionContextValue`, registry, managed session, and view; the managed session sends the translated non-empty value through its existing user-intent write path.
- [ ] Run the focused test and `bun run typecheck`; add `writeExtraKey: vi.fn()` beside existing `writeInput` fixtures until both are GREEN.

### Task 2: Bottom command deck behavior

**Files:**

- Create: `src/web/components/terminal/mobile-terminal-command-deck.test.tsx`
- Modify: `src/web/components/terminal/mobile-terminal-toolbar.tsx` (export `MobileTerminalCommandDeck`)
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

**Interfaces:**

```ts
interface MobileTerminalCommandDeckProps {
  terminalCount: number
  fitToWidth: boolean
  onExtraKey: (input: TerminalExtraKeyInput) => void
  onInput: (data: string) => void
  onCycleTerminal: (direction: -1 | 1) => void
  onFitToWidthChange: (fitToWidth: boolean) => void
}
```

- [ ] Replace the prior two-button test with RED tests requiring the exact first two rows; toggled `CTRL ON`/`ALT ON` one-shot state; `ENTER`, `⌫`, `CTRL+C`, and `CTRL+L`; terminal cycling; Compose submission of `${draft}\r`; and fit-width toggling.
- [ ] Add a `TerminalSlot` RED test requiring the deck to be inside `.goblin-terminal-bottom-dock`, outside `.goblin-terminal-float-group`, and visible only for a Mobile Web controller.
- [ ] Implement the three horizontally scrollable rows and optional single-line composer. Prevent terminal-key pointer-down from stealing the current terminal focus; remount the deck by terminal key so draft and modifiers reset on session selection.
- [ ] Replace the separate selected-descriptor/count subscriptions with `useWorktreeTerminalSnapshot`, cycle through its stable `sessions` order with wraparound, and route extra keys through `writeExtraKey`.
- [ ] Make `hasBottomDock` true when either valid custom buttons or the controller command deck exists, then render both in one measured dock and remove all mobile keys from the top-right float group.
- [ ] Run `bun run test -- "src/web/components/terminal/mobile-terminal-command-deck.test.tsx" "src/web/components/terminal/TerminalSlot.test.tsx"` until GREEN.

### Task 3: Command deck layout and width presentation

**Files:**

- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

- [ ] Add RED CSS contract tests requiring a full-width, non-absolute command deck; horizontally scrollable rows; pointer-enabled dock contents; dynamic bottom clearance; and `min-width: 720px` only in original-width mode.
- [ ] Add a RED DOM behavior test requiring the width action to toggle `goblin-terminal-slot__host--original-width` and restore the host's horizontal offset when returning to fit.
- [ ] Implement the restrained Android instrument-rail styling with the existing terminal/control palette, 36–40 px key height, strong active modifier state, hidden row scrollbars, and safe-area-aware dock padding.
- [ ] Toggle the host's original-width class from renderer-local state and reset `scrollLeft` to zero when fitting; rely on the existing xterm resize observer to refit and publish controller geometry.
- [ ] Run the focused component and CSS tests until GREEN.

### Task 4: Manual-scroll inertia

**Files:**

- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

- [ ] Add a controlled-animation-frame RED test proving a recent fast vertical drag continues calling `scrollByTouch` after `pointerup`, decays, and eventually leaves no scheduled frame.
- [ ] Add RED cancellation tests proving a new primary touch cancels pending inertia, `pointercancel` never starts inertia, and a role/session change cancels the active frame.
- [ ] Extend the touch gesture with timestamp and smoothed, bounded pixel velocity. On `pointerup`, preserve the remainder and schedule the same `scrollByTouch` route only when release data is recent and at least 50 px/s.
- [ ] Decay velocity by `Math.pow(0.92, elapsedMs / (1000 / 60))`, cap elapsed time at 32 ms, convert accumulated pixels to whole rows, and stop without bounce below threshold.
- [ ] Cancel animation on a new primary touch, `pointercancel`, key/role/mobile-state change, terminal closure, and unmount.
- [ ] Run the focused touch tests until GREEN.

### Task 5: Documentation, verification, and review

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-08-04-mobile-web-terminal-interaction-performance-design.md`
- Modify only implementation files implicated by review findings.

- [ ] Format changed source, test, and Markdown files with the repository Prettier command; run `git diff --check`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run check:architecture`.
- [ ] Review the complete working-tree diff for authority leaks, stale floating-toolbar code, touch-frame leaks, ambiguous copy, and unrelated changes. Fix any finding and repeat every affected verification command.
- [ ] Report automated results separately from iOS Safari/Android Chrome real-device acceptance, which remains manual.

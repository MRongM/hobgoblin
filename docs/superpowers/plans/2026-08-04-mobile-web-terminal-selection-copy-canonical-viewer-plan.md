# Mobile Web Terminal Selection Copy and Canonical Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix read-only tmux redraw corruption by parsing at canonical geometry, and add renderer-local Mobile Web long-press selection with explicit clipboard copy for controller, viewer, and unowned attachments.

**Architecture:** `ManagedTerminalSession` decides controller-fit versus canonical read-only geometry; `TerminalSessionView` owns xterm resize and selection mechanics; the registry/context exposes narrow renderer-only selection operations; `TerminalSlot` owns the touch state machine and transient Copy UI; one terminal clipboard helper serves explicit copy and OSC 52. No server, realtime, PTY, ownership, or persistence contract changes.

**Tech Stack:** React 19, TypeScript strip-only mode, xterm.js 6, Vitest/jsdom, Bun.

## Global Constraints

- Follow strict red-green-refactor cycles: add or change a focused test, run it and observe the expected failure, then implement only enough production code to pass.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions and avoid TypeScript runtime syntax unsupported by Node strip-only mode.
- Keep selection and Copy UI state renderer-local and ephemeral; never send it through terminal input, resize, takeover, realtime, or persistence paths.
- Preserve ordinary tap, vertical terminal scrolling/inertia, horizontal panning, edge scrubbing, focus, and TUI mouse behavior.
- Do not add dependencies.
- Do not commit or push during execution. Git mutation is deferred until the final explicit user confirmation.

---

### Task 1: Restore canonical read-only parsing and local horizontal presentation

**Files:**

- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Create: `src/web/components/terminal/terminal-viewer-canonical-geometry.test.ts`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/terminal-session.css`

**Step 1: Add failing canonical-geometry tests**

- Replace the local-fit viewer assertions with these contracts:
  - a hydrated viewer opens xterm at `canonicalCols` / `canonicalRows` before the hydrated snapshot is written;
  - an attach result that changes controller assumptions to viewer resizes xterm to canonical geometry before authoritative replay;
  - controller-to-viewer keeps the xterm instance and applies canonical geometry;
  - viewer ownership size updates apply locally without a bridge resize;
  - ResizeObserver, buffer changes, and font events never call `FitAddon.fit()` for a viewer;
  - viewer-to-controller enables fitting again.
- Add a headless-xterm regression that demonstrates repeated canonical final-row redraws keep `baseY` stable when parsed at canonical geometry and grow scrollback when parsed at a smaller geometry.
- Add UI/CSS assertions that read-only hosts expose horizontal overflow through a dedicated canonical-surface class while keeping controller width-toggle behavior intact.

**Step 2: Verify RED**

Run:

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/terminal-viewer-canonical-geometry.test.ts src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/terminal-session-css.test.ts
```

Expected: viewer tests fail because current code fits read-only xterm to local geometry and lacks the canonical presentation class.

**Step 3: Implement authority-aware geometry**

- Restore an `autoFitEnabled` gate in `TerminalSessionView`, cancel pending fit/font timers when disabled, guard every FitAddon path, and add idempotent `resizeTo(cols, rows)`.
- In `ManagedTerminalSession`, validate canonical sizes with `normalizeTerminalSize()` before applying them.
- Select canonical geometry before `openTerminal()` for a known viewer/unowned attachment, so hydrated VT is never parsed at local geometry.
- If attach resolves to viewer/unowned, disable fitting and apply canonical geometry before replay.
- On ownership updates, always apply changed canonical geometry to read-only xterm and never enqueue a bridge resize.
- On takeover, re-enable local fitting and retain the existing controller resize publication path.

**Step 4: Implement the read-only horizontal surface**

- Add a read-only host modifier in `TerminalSlot` independent of Mobile-only touch handling.
- Make that modifier the outer horizontal scroll container and allow the canonical-width xterm screen to contribute overflow through the managed frame/host without changing font size or xterm columns.
- Keep vertical overflow and touch gestures under the existing terminal scroll model.

**Step 5: Verify GREEN**

Run the focused command from Step 2 and require all tests to pass.

---

### Task 2: Add an xterm-backed Mobile Web selection adapter and narrow session plumbing

**Files:**

- Create: `src/web/components/terminal/terminal-mobile-selection.test.ts`
- Create: `src/web/components/terminal/terminal-mobile-selection.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionProvider.tsx`
- Modify: `src/web/components/terminal/types.ts`

**Step 1: Add failing selection-adapter tests**

- Specify a synthetic `detail: 2` primary mousedown at the xterm DOM boundary to reuse xterm word selection.
- Specify document-level mousemove and mouseup dispatch for extension and completion.
- Specify rejection outside `.xterm-screen`.
- Specify conditional force-selection modifiers only when terminal mouse tracking is active: Shift off macOS; temporary `macOptionClickForcesSelection` plus Alt on macOS, restored immediately after mousedown.
- Specify cancel completion plus `clearSelection()`, and narrow read/clear behavior.

**Step 2: Verify RED**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-mobile-selection.test.ts
```

Expected: the new module/API does not exist.

**Step 3: Implement the adapter**

- Create small functions for begin, extend, finish, cancel, selected-text read, and clear.
- Dispatch real `MouseEvent`s against xterm's public DOM boundary; do not parse terminal text or reimplement Unicode/wrapped-line rules.
- Make begin return `false` when the terminal/screen/coordinates are unavailable.

**Step 4: Add failing plumbing tests**

- Add registry/session tests proving each operation reaches only the selected `TerminalSessionView` operation and does not call terminal write, resize, or takeover bridges.

**Step 5: Implement narrow plumbing**

- Add a shared `{ clientX, clientY }` input type.
- Delegate synchronously through `TerminalSessionView` -> `ManagedTerminalSession` -> `TerminalSessionRegistry` -> `TerminalSessionContextValue` / provider.
- Clear active selection when the terminal view is destroyed.

**Step 6: Verify GREEN**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-mobile-selection.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalSessionProvider.test.tsx
```

---

### Task 3: Extract one reliable terminal clipboard writer

**Files:**

- Create: `src/web/components/terminal/terminal-clipboard.test.ts`
- Create: `src/web/components/terminal/terminal-clipboard.ts`
- Modify: `src/web/components/terminal/terminal-osc52-clipboard.ts`
- Modify: `src/web/components/terminal/terminal-osc52-clipboard.test.ts`

**Step 1: Add failing clipboard tests**

- Clipboard API success resolves `true` without creating a textarea.
- Clipboard API rejection falls back to a hidden read-only textarea and resolves `true` when `execCommand('copy')` succeeds.
- Missing API plus failed/throwing `execCommand` resolves `false`.
- Every fallback removes the textarea and restores the previously focused element with `preventScroll`.
- OSC 52 remains best-effort/non-blocking and still refuses clipboard read-back queries.

**Step 2: Verify RED**

Run:

```bash
bun run test -- src/web/components/terminal/terminal-clipboard.test.ts src/web/components/terminal/terminal-osc52-clipboard.test.ts
```

Expected: the shared clipboard writer does not exist.

**Step 3: Implement and refactor**

- Export `writeTerminalClipboardText(text): Promise<boolean>` from the focused helper.
- Prefer `navigator.clipboard.writeText`; on absence or rejection, use and always clean up the textarea fallback.
- Make OSC 52 invoke the same helper with `void` while preserving dependency injection used by its tests.

**Step 4: Verify GREEN**

Run the focused command from Step 2 and require all tests to pass.

---

### Task 4: Implement long-press gesture arbitration and explicit Copy UI

**Files:**

- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/shared/i18n/dictionaries.test.ts`
- Modify: `src/shared/i18n/en.ts`
- Modify: `src/shared/i18n/zh.ts`
- Modify: `src/shared/i18n/ja.ts`
- Modify: `src/shared/i18n/ko.ts`

**Step 1: Add failing gesture/UI tests**

- For controller, viewer, and unowned roles, a 500 ms hold within 8 px begins selection; movement after commitment extends it; release finishes it and shows Copy only for non-empty selected text.
- A short tap, within-slop movement, pre-timeout vertical drag, and pre-timeout horizontal drag never begin selection.
- Vertical drag still scrolls/inertias; horizontal drag remains unprevented; no selection path calls write or takeover.
- Pointer cancellation, a new touch, key/role/phase changes, and unmount cancel timers/capture and clear selection/action state.
- Copy re-reads current selection. Success clears selection and dismisses the action; total failure retains both and emits the localized error toast.
- Copy action uses localized `menu.edit.copy`, has a minimum 44 px target, is viewport-clamped above the release point, and is layered away from the command dock, viewer status, and scrubber.

**Step 2: Verify RED**

Run:

```bash
bun run test -- src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/terminal-session-css.test.ts src/shared/i18n/dictionaries.test.ts
```

Expected: selection callbacks, Copy UI/styles, and failure localization are absent.

**Step 3: Implement the touch state machine**

- Extend the existing gesture record with `pending | scrolling | selecting` mode and a cancellable long-press timer.
- On pointerdown, cancel inertia and any prior copy action/selection, then arm the timer.
- Before timeout, keep current vertical and horizontal arbitration unchanged while cancelling the timer when either wins.
- On timeout, call begin-selection, capture the pointer, and suppress only the committed selection gesture.
- Route later moves to selection extension; release to finish/read/show; cancel to cancel/clear.
- Prevent the synthetic/native context menu only while explicit terminal selection is committed.

**Step 4: Implement Copy behavior and styles**

- Render one fixed, theme-token Button above the release point, clamped within viewport safe margins.
- On click, re-read selected text and invoke `writeTerminalClipboardText()`.
- Clear/dismiss only on success; retain and toast `terminal.selection-copy-failed` on failure.
- Add localized failure text in all dictionaries and a dictionary contract test.

**Step 5: Verify GREEN**

Run the focused command from Step 2 and require all tests to pass.

---

### Task 5: Documentation consistency and complete verification

**Files:**

- Review: `CONTEXT.md`
- Review: `docs/superpowers/specs/2026-08-04-mobile-web-terminal-selection-copy-canonical-viewer-design.md`
- Review: all files changed above

**Step 1: Run focused terminal suite**

```bash
bun run test -- src/web/components/terminal
```

**Step 2: Run required repository gates**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

**Step 3: Inspect the final diff**

```bash
git diff --check
git status --short
git diff --stat
```

- Confirm no protocol/server/settings/dependency changes.
- Confirm no real identities, private paths, secrets, or internal identifiers were added to examples/tests/docs.
- Confirm every production behavior was preceded by an observed failing test.

**Step 4: Stop before Git mutation**

- Summarize implementation and verification evidence.
- Request one explicit confirmation for `git commit` and `git push`; do not perform either operation before that confirmation.

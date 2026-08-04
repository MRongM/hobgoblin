# Mobile Web Terminal Scroll and Command Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project explicitly requires inline execution without subagents for this change.

**Goal:** Add a non-persistent Mobile Web terminal history scrubber, complete the compact controller command deck with Android-like Focus, and keep read-only viewing scrollable without invoking the system keyboard.

**Architecture:** `TerminalSlot` owns the local Mobile Web interaction presentation: it renders a semantic, visually dormant right-edge scrubber, toggles the selected controller's bottom dock, and routes return-to-bottom. `TerminalSessionView` maps pointer position to normal-buffer history and owns xterm's read-only input mode; `ManagedTerminalSession` projects current attachment authority into that view. None of these states enter React scroll metrics, persistence, realtime, or server protocols.

**Tech Stack:** React 19, TypeScript strip-only mode, Vitest/jsdom, xterm 6, CSS.

## Global Constraints

- Execute inline in the current feature worktree; do not create a branch, commit, or dispatch subagents.
- The scrubber is available to controller, viewer, and unowned Mobile Web attachments and never requests takeover.
- Hide the scrubber outside normal-buffer scrollback and render no idle track or thumb.
- Cancel active touch inertia before edge scrubbing or returning to bottom.
- Keep xterm scroll metrics out of React state and out of all server/realtime protocols.
- Keep `Back to bottom` first in the third command-deck row and use sentence-case localized copy.
- Keep read-only `Back to bottom` immediately left of takeover without changing takeover authority.
- Keep Focus local to the selected controller terminal, hide the complete bottom dock, and leave a top-right exit handle.
- Keep read-only xterm stdin disabled with a non-editable, `inputmode=none` textarea until takeover succeeds.
- Use 32-pixel command-deck control height and a 14-pixel transient scrubber percentage.
- Use repository-alias imports with explicit `.ts`/`.tsx` extensions and add no dependencies.

---

### Task 1: Command-deck return-to-bottom action

**Files:**

- Modify: `src/web/components/terminal/mobile-terminal-command-deck.test.tsx`
- Modify: `src/web/components/terminal/mobile-terminal-toolbar.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/shared/i18n/{en,zh,ja,ko}.ts`
- Modify: `src/shared/i18n/dictionaries.test.ts`

**Interfaces:**

- Consumes: `TerminalSessionContextValue.scrollToBottom(key: string): void`.
- Produces: `MobileTerminalCommandDeckProps.onScrollToBottom(): void`.

- [ ] Add a command-deck test whose exact third-row labels begin with `Back to bottom`, followed by `ENTER`, `⌫`, `CTRL+C`, `CTRL+L`, `T↑`, `T↓`, `Compose`, and `Original width`; clicking the first button must call `onScrollToBottom` once.
- [ ] Run `bun run test -- "src/web/components/terminal/mobile-terminal-command-deck.test.tsx"` and confirm RED because the action is absent.
- [ ] Add `onScrollToBottom` to the component interface and render one secondary action button before `DIRECT_INPUT_ACTIONS`, using `terminal.command-deck.scroll-to-bottom`, `preserveTerminalFocus`, and the callback directly so it does not mutate one-shot modifiers.
- [ ] In `TerminalSlot`, pass a callback that clears the current gesture, cancels the inertia animation frame, and calls `scrollToBottom(key)`.
- [ ] Add the same translation key to every dictionary with user-facing equivalents: `Back to bottom`, `回到底部`, `一番下へ`, and `맨 아래로`.
- [ ] Run the focused component and dictionary tests until GREEN.

### Task 2: Absolute right-edge history scrubber

**Files:**

- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/terminal-session.css`

**Interfaces:**

- Produces: optional `TerminalSessionAttachHandlers.mobileScrollScrubber?: HTMLElement` passed through `ManagedTerminalSession.attach()` to `TerminalSessionView.setMobileScrollScrubber(scrubber)`.
- Keeps absolute pointer mapping and semantic percentage synchronization inside `TerminalSessionView`; no new context, registry, bridge, or server command is introduced.

- [ ] Add a managed-session test binding an edge element before attachment, then setting a normal buffer with `baseY = 120` and `viewportY = 45`; assert a 38% semantic position, parsed-output growth to `baseY = 140`, direct midpoint drag to line 70, clamping at both edges, active-state cleanup, alternate-buffer hiding, and listener removal on detach.
- [ ] Add a `TerminalSlot` role matrix test asserting the scrubber exists for controller, viewer, and unowned Mobile Web roles, no range input exists, and the element is delivered through selected-session attach handlers. Add a fake-animation-frame assertion that pointer-down cancels active inertia.
- [ ] Add a CSS contract test requiring absolute right-edge positioning, a 32-pixel touch width, transparent idle presentation, `touch-action: none`, transient tick/readout feedback, reduced-motion handling, and command-deck/read-only bottom clearance.
- [ ] Run the three focused test files and confirm RED due to the missing scrubber and routes.
- [ ] Add optional `mobileScrollScrubber` to `TerminalSessionAttachHandlers`. Bind it during managed-session attachment, remove every native listener during detachment, and keep pointer events bubbling so `TerminalSlot` can cancel inertia.
- [ ] In `TerminalSessionView`, map the scrubber's clamped pointer Y ratio to integer `baseY` lines, call `scrollToLine()`, and synchronize ARIA percentage plus CSS position imperatively. Hide it outside normal scrollback and synchronize after binding, terminal open, xterm scroll, buffer change, resize, relative/bottom scrolling, and parsed output writes.
- [ ] Render a semantic scrollbar-role `<div>` only for Mobile Web, label it with `terminal.mobile-scroll-scrubber`, and initialize its view-owned attributes through its ref so React rerenders cannot reset high-frequency metrics.
- [ ] Style only a transient terminal-cursor-like tick and percentage readout inside the invisible edge zone. Derive color from current theme tokens, reserve overlay clearance, expose visible keyboard focus, and remove motion under `prefers-reduced-motion`.
- [ ] Run the focused tests and `bun run typecheck` until GREEN without widening the terminal context or changing server protocols.

### Task 3: Read-only return-to-bottom action

**Files:**

- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

- [ ] Extend the viewer-status test to require exact button order: `Back to bottom`, then takeover; verify both routes.
- [ ] Run the focused test and confirm RED because viewer status exposes takeover only.
- [ ] Pass the existing local return-to-bottom handler into `ViewerStatus` and render a ghost action before the secondary takeover action. Keep it available while takeover is pending and disable it only when no selected terminal exists.
- [ ] Run the focused test until GREEN.

### Task 4: Focus, compact controls, and read-only input mode

**Files:**

- Modify: `src/web/components/terminal/mobile-terminal-command-deck.test.tsx`
- Modify: `src/web/components/terminal/mobile-terminal-toolbar.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/terminal-session-css.test.ts`
- Modify: `src/web/components/terminal/terminal-session.css`
- Modify: `src/shared/i18n/{en,zh,ja,ko}.ts`

- [ ] Add failing tests for third-row Focus, complete dock hiding/restoration, 32-pixel controls, a 14-pixel scrubber percentage, viewer stdin suppression, and takeover restoration.
- [ ] Append localized Focus to the third row and keep a compact top-right Exit focus handle visible while the bottom dock is hidden.
- [ ] Reset Focus on terminal, role, or mobile-presentation changes; do not persist or synchronize it and do not alter the Web topbar.
- [ ] Project write authority through `ManagedTerminalSession` into xterm `disableStdin`, textarea read-only state, and `inputmode=none`; restore all three after takeover.
- [ ] Reduce command-deck button/composer height to 32 pixels without reducing the 44-pixel minimum key width. Increase the transient percentage from 10 to 14 pixels and resize its bubble.
- [ ] Run focused component, session, CSS, and dictionary tests until GREEN.

### Task 5: Documentation, verification, and review

**Files:**

- Modify: `CONTEXT.md`
- Modify: `docs/superpowers/specs/2026-08-04-mobile-web-terminal-interaction-performance-design.md`
- Modify only implementation files implicated by review findings.

- [ ] Format changed TypeScript, CSS, and Markdown files with the repository formatter and run `git diff --check`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run check:architecture`.
- [ ] Review the complete diff for authority leaks, React scroll-state churn, stale inertia or pointer capture, inaccessible scrubber semantics, persistent slider remnants, overlay overlap, missing translations, and unrelated edits. Fix every finding and repeat affected checks.
- [ ] Report automated verification separately from iOS Safari and Android Chrome real-device acceptance, which remains manual.

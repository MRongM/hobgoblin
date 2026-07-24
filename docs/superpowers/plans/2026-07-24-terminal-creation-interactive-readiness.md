# Terminal Creation Interactive Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep terminal loading visible until xterm attach, first-frame replay, and the first post-replay paint opportunity complete, with desktop focus established before the ready state paints.

**Architecture:** `ManagedTerminalSession` owns renderer readiness and projects pending state through the existing `TerminalSnapshot`. `TerminalSlot` combines server-session opening, creation-request pending, and renderer pending into one loading presentation without changing server or persistence contracts.

**Tech Stack:** React 19, TypeScript 6 strip-only mode, xterm 6, CSS, Vitest, Bun.

## Global Constraints

- Do not detect readiness from cursor DOM or terminal output text.
- Do not add a minimum loading duration, timeout, server field, or persisted state.
- Preserve mobile non-auto-focus behavior.
- Preserve the existing localized `terminal.opening` copy and accessibility attributes.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not execute `git commit`; the project requires explicit user authorization.

---

### Task 1: Publish managed terminal render pending state

**Files:**

- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/types.ts`

**Interfaces:**

- Consumes: the existing xterm open, attach, replay, and `waitForTerminalLayout()` lifecycle.
- Produces: optional `TerminalSnapshot.renderPending?: boolean`, present only while a live renderer view has not completed final paint readiness.

- [x] **Step 1: Write the failing managed-session test**

Create a hydrated managed session, assert `renderPending === true` before
attachment, attach it, wait for the terminal start pipeline, and assert the
property is absent after readiness:

```ts
expect(session.snapshot().renderPending).toBe(true)
session.attach(host)
await flushTerminalStart()
await flushUntil(() => session.snapshot().renderPending !== true)
expect(session.snapshot().renderPending).toBeUndefined()
```

- [x] **Step 2: Run the focused test and verify RED**

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts
```

Expected: FAIL because `TerminalSnapshot` and `ManagedTerminalSession` do not
publish render readiness.

- [x] **Step 3: Implement the minimal managed-session state**

Add the optional snapshot property, initialize managed sessions as render
pending, await one final `waitForTerminalLayout()` after attach and replay, then
clear the flag and notify. Omit the property for ready, error, closed, or
disposed snapshots. Reset pending when an active xterm view is replaced.

- [x] **Step 4: Run the focused test and verify GREEN**

Run the same focused command and expect all managed-session tests to pass.

### Task 2: Keep loading visible through renderer readiness

**Files:**

- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

**Interfaces:**

- Consumes: `TerminalSnapshot.renderPending`, existing creation pending, session count, and attachment ownership.
- Produces: continuous loading presentation until readiness, centered for zero or one session, and desktop focus before the ready commit paints.

- [x] **Step 1: Write the failing slot test**

Render one open selected session with `renderPending: true` and have the attach
mock append a textarea to the terminal host. Assert loading remains visible and
the textarea is unfocused. Rerender without `renderPending`; assert loading is
removed and the textarea owns focus.

- [x] **Step 2: Run the focused test and verify RED**

```bash
bun run test -- src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: FAIL because the status currently ignores render pending.

- [x] **Step 3: Implement the combined loading projection**

Use the numeric terminal count and derive:

```ts
const renderPending = hasSessions && snapshot.renderPending === true
const opening = creationPending || (hasSessions && snapshot.phase === 'opening') || renderPending
const initialOpening =
  (creationPending && !hasSessions) || (terminalCount === 1 && (snapshot.phase === 'opening' || renderPending))
```

Render the status from `opening`, apply the initial modifier from
`initialOpening`, and prevent the desktop focus effect from consuming its
one-shot key until `renderPending` clears. Keep mobile auto-focus disabled.

- [x] **Step 4: Run focused terminal tests and verify GREEN**

```bash
bun run test -- src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSlot.test.tsx
```

Expected: both test files pass.

### Task 3: Full verification

**Files:**

- Verify only; no planned source changes.

**Interfaces:**

- Consumes: Tasks 1–2.
- Produces: fresh evidence that rendering, types, formatting, and architecture remain valid.

- [x] **Step 1: Run project verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
./node_modules/.bin/prettier --check src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/ManagedTerminalSession.ts src/web/components/terminal/TerminalSlot.test.tsx src/web/components/terminal/TerminalSlot.tsx src/web/components/terminal/terminal-session.css src/web/components/terminal/types.ts docs/superpowers/specs/2026-07-24-terminal-creation-interactive-readiness-design.md docs/superpowers/plans/2026-07-24-terminal-creation-interactive-readiness.md
git diff --check
```

Expected: every command exits zero with no new failures.

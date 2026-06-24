# Terminal Stability Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the reference Goblin terminal stability improvements into Hobgoblin without replacing the current terminal UX: measured first geometry, authoritative first frame, server-owned control, renderer authority gating, and replay-safe input handling.

**Architecture:** Keep Hobgoblin's existing module boundaries. Shared protocol remains in `src/shared/terminal.ts`; server lifecycle remains under `src/server/terminal/**`; renderer projection remains under `src/web/components/terminal/**`; transport remains in the existing bridge files. Do not migrate the reference workspace-pane model or rename the worker-backed runtime to the reference `pty-supervisor` model.

**Tech Stack:** TypeScript strip-only mode, Valibot validation, Bun, Vitest, React renderer terminal code, `@xterm/xterm`, `@xterm/headless`.

**Git safety:** Branch and history-write steps are intentionally omitted because this repository's `AGENTS.md` says not to plan or execute those operations unless the user explicitly asks.

---

## File Structure

- Modify: `src/shared/terminal.ts`
  - Extend the terminal protocol with session phase/message and required first-frame fields.
  - Remove active `grace` ownership semantics from shared status types and validation.
  - Keep this as the only shared terminal protocol file.
- Add: `src/shared/terminal.test.ts`
  - Cover protocol normalization for phase/message, first-frame create payloads, ownership events, and `grace` rejection.
- Modify: `src/server/terminal/terminal-ownership.ts`
  - Replace single-attachment ownership with multi-attachment ownership and an explicit authority helper.
- Modify: `src/server/terminal/terminal-ownership.test.ts`
  - Rewrite current grace-era tests around connected attachment maps, immediate controller release, auto-claim, and denial reasons.
- Modify: `src/server/terminal/terminal-session-manager.ts`
  - Add session phase/message, apply the authority helper to write/resize/restart/takeover, and return first-frame data consistently.
- Modify: `src/server/terminal/terminal-catalog.ts`
  - Return create-time first-frame data from `ensureOrRestore()`/`create()`.
- Modify: `src/server/terminal/terminal.ts`
  - Preserve the existing realtime request bridge while adapting result types and snapshot enrichment.
- Modify: `src/server/terminal/terminal.test.ts`
  - Add catalog/session integration coverage for measured create geometry, create first frame, restart failure phase, and takeover authority.
- Add: `src/web/components/terminal/terminal-geometry.ts`
  - Measure terminal geometry from the visible host and current font size.
- Add: `src/web/components/terminal/terminal-geometry.test.ts`
  - Cover measurable host, unmeasurable host, and font-size-sensitive calculation.
- Add: `src/web/components/terminal/authority-gate.ts`
  - Centralize renderer-side write/takeover authority.
- Add: `src/web/components/terminal/authority-gate.test.ts`
  - Cover controller writes, viewer promotion, takeover rejection, and missing-session denial.
- Add: `src/web/components/terminal/terminal-input.ts`
  - Define a tiny input envelope for user-intent versus terminal-emulator input.
- Modify: `src/web/components/terminal/terminal-session-view.ts`
  - Open xterm with measured geometry and classify xterm input with conservative fallback.
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
  - Route writes through the authority gate, drop emulator-origin input during replay/hydration, apply phase/message first-frame data, and apply takeover responses synchronously.
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
  - Add focused coverage for replay-safe input, authority-gated writes, measured attach, and phase/message projection.
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
  - Register visible hosts, create terminals with measured geometry, and hydrate the created session from the create response's first frame.
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
  - Add create first-frame and measured geometry tests.
- Modify: `src/web/components/terminal/types.ts`
  - Align renderer phase/status types with shared protocol.
- Modify: `src/web/renderer-bridge-types.ts`
  - Type bridge methods against the updated shared terminal result shapes.
- Modify: `src/web/terminal.ts`
  - Keep the forwarding bridge typed after shared result updates.

Do not modify unrelated dirty port-forwarding files during this plan.

## Task 1: Update the Shared Terminal Protocol

**Files:**

- Add: `src/shared/terminal.test.ts`
- Modify: `src/shared/terminal.ts`

- [ ] **Step 1: Add failing protocol tests**

Create `src/shared/terminal.test.ts` with focused validation coverage:

```ts
import { describe, expect, test } from 'vitest'
import {
  normalizeTerminalClientMessage,
  normalizeTerminalRealtimeMessage,
  normalizeTerminalSessionSummaryList,
  normalizeTerminalSocketServerMessage,
} from '#/shared/terminal.ts'

describe('terminal protocol normalization', () => {
  test('accepts phase and message on session summaries', () => {
    expect(
      normalizeTerminalSessionSummaryList([
        {
          sessionId: 'term_abcdefghijklmnop',
          key: '/repo\0/repo\0terminal-1',
          cwd: '/repo',
          controller: { attachmentId: 'attachment_a', status: 'connected' },
          processName: 'bash',
          canonicalTitle: null,
          cols: 132,
          rows: 41,
          displayOrder: 0,
          phase: 'open',
          message: null,
        },
      ]),
    ).toHaveLength(1)
  })

  test('rejects grace controller status', () => {
    expect(
      normalizeTerminalSessionSummaryList([
        {
          sessionId: 'term_abcdefghijklmnop',
          key: '/repo\0/repo\0terminal-1',
          cwd: '/repo',
          controller: { attachmentId: 'attachment_a', status: 'grace' },
          processName: 'bash',
          canonicalTitle: null,
          cols: 80,
          rows: 24,
          displayOrder: 0,
          phase: 'open',
          message: null,
        },
      ]),
    ).toBeNull()
  })

  test('accepts ownership events with phase', () => {
    expect(
      normalizeTerminalRealtimeMessage({
        type: 'ownership',
        event: {
          sessionId: 'term_abcdefghijklmnop',
          controller: { attachmentId: 'attachment_a', status: 'connected' },
          cols: 120,
          rows: 36,
          phase: 'open',
        },
      }),
    ).toMatchObject({ type: 'ownership' })
  })

  test('accepts create responses with first-frame payload', () => {
    expect(
      normalizeTerminalSocketServerMessage({
        type: 'response',
        requestId: 'request_a',
        ok: true,
        action: 'create',
        payload: {
          ok: true,
          action: 'created',
          key: '/repo\0/repo\0terminal-1',
          sessionId: 'term_abcdefghijklmnop',
          processName: 'bash',
          canonicalTitle: null,
          snapshot: '\u001b[H',
          snapshotSeq: 0,
          controller: { attachmentId: 'attachment_a', status: 'connected' },
          canonicalCols: 132,
          canonicalRows: 41,
          phase: 'open',
          message: null,
          sessions: [],
        },
      }),
    ).toMatchObject({ type: 'response', ok: true, action: 'create' })
  })

  test('validates measured create geometry from clients', () => {
    expect(
      normalizeTerminalClientMessage({
        type: 'request',
        requestId: 'request_a',
        action: 'create',
        input: {
          repoRoot: '/repo',
          branch: 'main',
          worktreePath: '/repo',
          kind: 'primary',
          cols: 132,
          rows: 41,
          attachmentId: 'attachment_a',
        },
      }),
    ).toMatchObject({ action: 'create' })
  })
})
```

- [ ] **Step 2: Run the focused protocol test**

Run:

```bash
bun run test "src/shared/terminal.test.ts"
```

Expected result: the new tests fail because the protocol does not yet expose phase/message first-frame fields and still accepts `grace`.

- [ ] **Step 3: Extend shared types and schemas**

In `src/shared/terminal.ts`, add shared lifecycle types:

```ts
export type TerminalSessionPhase = 'opening' | 'restarting' | 'open' | 'error' | 'closed'
export type TerminalControllerStatus = 'connected' | 'none'
```

Update result and event types so successful attach/restart/create paths include first-frame fields:

```ts
export interface TerminalFirstFrame {
  sessionId: string
  processName: string
  canonicalTitle: string | null
  snapshot: string
  snapshotSeq: number
  controller: TerminalController | null
  canonicalCols: number
  canonicalRows: number
  phase: TerminalSessionPhase
  message: string | null
}
```

Apply `TerminalFirstFrame` to `TerminalAttachResult` and `TerminalCatalogMutationResult`. Keep `replay`, `replaySeq`, and `replayTruncated` on attach/restart for compatibility with existing replay paths.

Update `TerminalTakeoverResult` to return `role`, `controllerStatus`, `controller`, `canonicalCols`, `canonicalRows`, and `phase`.

Update `TerminalSessionSummary` and `TerminalOwnershipEvent` with `phase` and `message` where applicable. `TerminalOwnershipEvent` only needs `phase`; message remains session/list/attach metadata.

Update Valibot schemas with:

```ts
const TERMINAL_SESSION_PHASE_VALUES = ['opening', 'restarting', 'open', 'error', 'closed'] as const
const TERMINAL_CONNECTED_CONTROLLER_STATUS_VALUES = ['connected'] as const
const TerminalSessionPhaseSchema = v.picklist(TERMINAL_SESSION_PHASE_VALUES)
```

- [ ] **Step 4: Run the focused protocol test again**

Run:

```bash
bun run test "src/shared/terminal.test.ts"
```

Expected result: the protocol tests pass.

## Task 2: Replace Server Ownership with Multi-Attachment Authority

**Files:**

- Modify: `src/server/terminal/terminal-ownership.test.ts`
- Modify: `src/server/terminal/terminal-ownership.ts`

- [ ] **Step 1: Rewrite ownership tests around the new model**

Replace grace-era fixtures with a state that owns multiple attachments:

```ts
function createState(): TerminalOwnershipState {
  return {
    attachments: new Map(),
    controller: null,
    claimedByOwner: false,
    cols: 80,
    rows: 24,
  }
}
```

Cover these cases:

- first connected attachment auto-claims an unclaimed session
- disconnected controller clears `controller` immediately
- second connected attachment can auto-claim when no controller exists and owner has already claimed the session
- viewer write/resize/restart is denied with `not-controller`
- takeover by a connected attachment replaces the existing controller
- unknown attachment is denied with `unknown-attachment`

- [ ] **Step 2: Run the focused ownership test**

Run:

```bash
bun run test "src/server/terminal/terminal-ownership.test.ts"
```

Expected result: tests fail against the current single-attachment/grace implementation.

- [ ] **Step 3: Implement the ownership state and helper**

In `src/server/terminal/terminal-ownership.ts`, replace `attachmentId`/`attachment`/`allowImplicitAttachControl` with:

```ts
export interface TerminalOwnershipState {
  attachments: Map<string, TerminalAttachmentState>
  controller: TerminalController | null
  claimedByOwner: boolean
  cols: number
  rows: number
}
```

Add an explicit helper:

```ts
export type TerminalAuthorityAction = 'write' | 'resize' | 'restart' | 'takeover'
export type TerminalAuthorityReason = 'not-controller' | 'session-unowned' | 'unknown-attachment'

export type TerminalAuthorityResult =
  | { ok: true }
  | { ok: false; reason: TerminalAuthorityReason }
```

Use these rules:

- `write`, `resize`, and `restart` require `controller?.attachmentId === attachmentId`.
- `takeover` requires the attachment to exist and be connected.
- registering a connected attachment auto-claims only when no controller exists.
- disconnecting the controller attachment sets `controller = null`.
- `claimedByOwner` becomes true when any attachment claims control and stays true until the session closes.

- [ ] **Step 4: Run the focused ownership test again**

Run:

```bash
bun run test "src/server/terminal/terminal-ownership.test.ts"
```

Expected result: ownership tests pass and no status value is `grace`.

## Task 3: Apply Authority and Lifecycle Phases in the Server Session Manager

**Files:**

- Modify: `src/server/terminal/terminal-session-manager.ts`
- Modify: `src/server/terminal/terminal.test.ts`

- [ ] **Step 1: Add failing manager/catalog tests**

In `src/server/terminal/terminal.test.ts`, add coverage for:

- `createServerTerminal()` passes requested `cols`/`rows` to the spawned PTY and returns `snapshot`, `snapshotSeq`, `phase: 'open'`, `message: null`, `canonicalCols`, and `canonicalRows`.
- `writeServerTerminal()` returns false for a viewer attachment.
- `resizeServerTerminal()` returns false for a viewer attachment.
- `takeoverServerTerminal()` returns role/status/canonical geometry and lets the new controller write.
- restart spawn failure leaves an existing session summarized with `phase: 'error'` and a non-empty `message`.

Keep the tests inside the existing mocked `node-pty` harness so no real PTY is spawned.

- [ ] **Step 2: Run the focused server terminal tests**

Run:

```bash
bun run test "src/server/terminal/terminal.test.ts"
```

Expected result: the new tests fail until lifecycle and authority are wired through the manager.

- [ ] **Step 3: Update `TerminalSession` state**

In `src/server/terminal/terminal-session-manager.ts`, replace the single attachment fields with the new ownership fields and add lifecycle fields:

```ts
phase: TerminalSessionPhase
message: string | null
attachments: Map<string, TerminalAttachmentState>
claimedByOwner: boolean
```

Session lifecycle:

- new session starts as `opening`
- successful spawn sets `phase = 'open'` and `message = null`
- restart sets `phase = 'restarting'` before disposal/spawn
- restart failure keeps the session, sets `phase = 'error'`, and stores the spawn error message
- create spawn failure closes the new session as the current code does
- close sets `phase = 'closed'` before resource disposal

- [ ] **Step 4: Gate server mutations through ownership authority**

Apply the ownership helper consistently:

- `writeSession`: require controller authority before queueing input.
- `resizeSession`: require controller authority before resizing PTY.
- `restartSession`: require controller authority before resetting resources.
- `takeoverSession`: use the takeover rule, then emit ownership.

Map server denials to existing return types:

- boolean mutation APIs return `false`
- attach/restart/takeover result APIs return `{ ok: false, message: 'error.not-controller' }` where a message is required

- [ ] **Step 5: Return phase and first-frame fields**

Update `attachResult()`, `takeoverResult()`, `emitOwnership()`, and `listSessions()` to include the new fields:

```ts
phase: session.phase,
message: session.message,
canonicalCols: session.cols,
canonicalRows: session.rows,
```

Keep `replay` fields for attach/restart compatibility. Snapshot enrichment still happens through `withSessionSnapshot()` in `src/server/terminal/terminal.ts`.

- [ ] **Step 6: Run focused server tests again**

Run:

```bash
bun run test "src/server/terminal/terminal-ownership.test.ts" "src/server/terminal/terminal.test.ts"
```

Expected result: ownership and server terminal tests pass.

## Task 4: Return Create-Time First Frames from the Catalog

**Files:**

- Modify: `src/server/terminal/terminal-catalog.ts`
- Modify: `src/server/terminal/terminal.ts`
- Modify: `src/server/terminal/terminal.test.ts`

- [ ] **Step 1: Add failing create response assertions**

Extend the `createServerTerminal()` tests so `result.ok === true` implies:

```ts
expect(result).toMatchObject({
  key: expect.any(String),
  sessionId: expect.any(String),
  processName: expect.any(String),
  canonicalTitle: null,
  snapshot: expect.any(String),
  snapshotSeq: expect.any(Number),
  controller: { attachmentId: expect.any(String), status: 'connected' },
  canonicalCols: 132,
  canonicalRows: 41,
  phase: 'open',
  message: null,
})
expect(result.sessions.some((session) => session.sessionId === result.sessionId)).toBe(true)
```

- [ ] **Step 2: Thread `EnsureTerminalCatalogResult` into `TerminalCatalogMutationResult`**

In `src/server/terminal/terminal-catalog.ts`, keep the current `withSessionSnapshot()` path and copy the first-frame fields into `create()`:

```ts
return {
  ok: true,
  action: createResult.action,
  key: createResult.key,
  sessionId: createResult.sessionId,
  processName: createResult.processName,
  canonicalTitle: createResult.canonicalTitle,
  snapshot: createResult.snapshot ?? '',
  snapshotSeq: createResult.snapshotSeq ?? createResult.replaySeq,
  controller: createResult.controller,
  canonicalCols: createResult.canonicalCols ?? input.cols ?? 80,
  canonicalRows: createResult.canonicalRows ?? input.rows ?? 24,
  phase: createResult.phase,
  message: createResult.message,
  sessions: await this.options.manager.listSessions(input.repoRoot),
}
```

Prefer preserving exact values from the manager over deriving fallbacks.

- [ ] **Step 3: Validate catalog consistency**

After loading `sessions`, verify that the returned `sessionId` is present. If not, return:

```ts
{ ok: false, message: 'error.terminal-create-failed' }
```

- [ ] **Step 4: Run focused catalog/server tests**

Run:

```bash
bun run test "src/server/terminal/terminal.test.ts"
```

Expected result: create returns a usable first frame without waiting for `sessions-changed`.

## Task 5: Add Renderer Geometry Measurement

**Files:**

- Add: `src/web/components/terminal/terminal-geometry.ts`
- Add: `src/web/components/terminal/terminal-geometry.test.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`

- [ ] **Step 1: Add focused geometry tests**

Create `terminal-geometry.test.ts` with cases for:

- measured host `1320x820` and cell size `10x20` yields `132x41`
- unmeasurable host returns `null`
- larger configured font size produces fewer columns/rows
- values are clamped by shared terminal size validation

Use controlled `getBoundingClientRect()` and a test-only cell measurer injection instead of relying on browser font rendering.

- [ ] **Step 2: Implement geometry helpers**

In `terminal-geometry.ts`, export:

```ts
export interface TerminalGeometry {
  cols: number
  rows: number
}

export function measureTerminalGeometry(input: {
  host: HTMLElement
  fontSize: number
  measureCell?: (fontSize: number) => { width: number; height: number } | null
}): TerminalGeometry | null
```

Keep the helper small:

- read the host box with `getBoundingClientRect()`
- measure or derive cell size from current font settings
- floor cols/rows
- validate with `normalizeTerminalSize()`

- [ ] **Step 3: Open visible terminals with measured geometry**

Change `TerminalSessionView.openTerminal()` from fixed defaults to:

```ts
openTerminal(geometry: { cols: number; rows: number }, onMacOptionInput: (input: TerminalInput) => void): XTermTerminal
```

Use `geometry.cols` and `geometry.rows` for the xterm constructor. Keep the existing add-ons, scrollback, theme, path links, keyboard handlers, and font-size behavior intact.

- [ ] **Step 4: Use measured geometry in `ManagedTerminalSession.openPhase()`**

Before opening xterm, measure the attached host. If the host is not measurable, fail the attach attempt with a clear error message and keep the session retryable.

After opening xterm, `fitNow()` may still refine size, but the server attach/restart request should use the measured initial size rather than `80x24`.

- [ ] **Step 5: Run focused renderer lifecycle tests**

Run:

```bash
bun run test "src/web/components/terminal/terminal-geometry.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result: geometry helpers pass and visible xterm instances are constructed with measured dimensions.

## Task 6: Centralize Renderer Authority and Input Attribution

**Files:**

- Add: `src/web/components/terminal/authority-gate.ts`
- Add: `src/web/components/terminal/authority-gate.test.ts`
- Add: `src/web/components/terminal/terminal-input.ts`
- Modify: `src/web/components/terminal/terminal-session-view.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/types.ts`

- [ ] **Step 1: Add authority gate tests**

Cover:

- controller input calls `terminalBridge.write()` once
- viewer input first calls `terminalBridge.takeover()`, applies the successful takeover result, then writes
- failed takeover does not write
- no current session does not write
- manual takeover and automatic write promotion use the same gate path

- [ ] **Step 2: Implement `authority-gate.ts`**

Export a small class or pure function group. Keep it independent from xterm:

```ts
export type TerminalWriteAuthority =
  | { ok: true }
  | { ok: false; message: string }
```

The gate receives:

- current session id
- current ownership snapshot
- bridge methods
- apply-takeover callback
- write payload

It must not cache stale session IDs across calls; read current state from callbacks.

- [ ] **Step 3: Define input envelopes**

In `terminal-input.ts`:

```ts
export type TerminalInput =
  | { origin: 'user-intent'; source: 'keyboard' | 'paste' | 'drop' | 'toolbar' | 'command' | 'xterm'; data: string }
  | { origin: 'terminal-emulator'; source: 'data'; data: string }
```

Keep the type minimal and do not add unused fields.

- [ ] **Step 4: Classify xterm input in `TerminalSessionView`**

Update `onData`/`onBinary` and custom keyboard handlers to send `TerminalInput` rather than raw strings.

Conservative rule:

- keyboard/paste/custom key handlers produce `origin: 'user-intent'`
- input emitted while replay/hydration is actively writing into xterm is treated as `origin: 'terminal-emulator'`
- when attribution is ambiguous, keep user keyboard/paste usable and let `ManagedTerminalSession` drop only known emulator-origin data during replay

- [ ] **Step 5: Route all managed writes through the gate**

Change `ManagedTerminalSession.writeInput()` to accept either a string compatibility overload or a `TerminalInput`; immediately wrap strings as:

```ts
{ origin: 'user-intent', source: 'command', data }
```

Drop emulator-origin input while replay or hydration is active. For user-intent input, call the authority gate before buffering bridge writes.

- [ ] **Step 6: Apply takeover responses synchronously**

Update `takeover()` so a successful response updates runtime ownership immediately. Realtime ownership events remain idempotent.

- [ ] **Step 7: Run focused authority/input tests**

Run:

```bash
bun run test "src/web/components/terminal/authority-gate.test.ts" "src/web/components/terminal/ManagedTerminalSession.test.ts"
```

Expected result: user input paths are authority-gated and replay/hydration does not echo emulator input into the PTY.

## Task 7: Hydrate Create Responses in the Registry

**Files:**

- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.test.ts`
- Modify: `src/web/components/terminal/types.ts`

- [ ] **Step 1: Add failing registry tests**

Add tests for:

- `createTerminal()` sends measured `cols`/`rows` to the bridge.
- successful create response builds a snapshot map containing the returned `snapshot`/`snapshotSeq`.
- `reconcileServerSessions()` hydrates the created local session from that first frame.
- malformed successful create responses throw `error.terminal-create-failed`.

Use the existing registry pattern with private session inspection only where the current tests already do so.

- [ ] **Step 2: Track visible hosts for worktree terminals**

Extend registry/context with a narrow host registration method if no direct host lookup exists:

```ts
registerWorktreeHost(worktreeTerminalKey: string, host: HTMLElement | null): void
```

Use it from the existing terminal slot/detail component that owns the actual terminal host. Keep the API scoped to measuring create geometry; do not make the registry a DOM abstraction layer.

- [ ] **Step 3: Measure before create**

In `TerminalSessionRegistry.createTerminal()`:

1. Resolve the worktree terminal key.
2. Measure geometry from the registered host and current terminal font size.
3. Call `terminalBridge.create()` with `cols`, `rows`, and `attachmentId`.
4. Validate first-frame fields on `result.ok === true`.
5. Build a `Map<string, TerminalSessionSnapshot>` using `result.sessionId`.
6. Reconcile `result.sessions` with the snapshot map.

If geometry or first-frame validation fails, throw a normal `Error` with the shared message key.

- [ ] **Step 4: Keep current UX behavior intact**

Verify these existing registry/session paths still work:

- selected terminal preservation
- tab display order
- reattach snapshot cache
- bell state
- external input fill
- custom button writes

- [ ] **Step 5: Run focused registry tests**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSessionRegistry.test.ts"
```

Expected result: create first-frame hydration passes without relying on a subsequent snapshot fetch.

## Task 8: Align Renderer Phases and UI Projection

**Files:**

- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/terminal-session-runtime.ts`
- Modify: `src/web/components/terminal/TerminalSlot.test.tsx`
- Modify: `src/web/components/terminal/TerminalSlot.tsx`

- [ ] **Step 1: Add renderer phase tests**

Cover:

- `phase: 'restarting'` renders as a restarting state, not a blank terminal.
- `phase: 'error'` surfaces `message`.
- `phase: 'closed'` removes or disables the session consistently with existing close behavior.
- `phase: 'open'` with viewer ownership keeps the current output summary behavior.

- [ ] **Step 2: Align renderer phase types**

Replace local phase literals with the shared `TerminalSessionPhase` where possible. Keep renderer-only projection fields in `types.ts`, but avoid duplicating protocol strings.

- [ ] **Step 3: Apply phase/message in runtime hydration**

Update `terminal-session-runtime.ts` so attach/create hydration stores:

- phase
- message
- process name
- canonical title
- canonical cols/rows
- ownership role/status

Keep existing output summary and search/progress transient state.

- [ ] **Step 4: Run focused UI projection tests**

Run:

```bash
bun run test "src/web/components/terminal/TerminalSlot.test.tsx" "src/web/components/terminal/terminal-session-runtime.test.ts"
```

Expected result: phase projection is explicit and existing viewer UX stays intact.

## Task 9: Full Terminal Verification

**Files:** terminal-related files only.

- [ ] **Step 1: Run all terminal test files**

Run:

```bash
bun run test \
  "src/shared/terminal.test.ts" \
  "src/server/terminal/terminal-ownership.test.ts" \
  "src/server/terminal/terminal.test.ts" \
  "src/server/terminal/terminal-render-state.test.ts" \
  "src/server/terminal/terminal-realtime-broker.test.ts" \
  "src/server/terminal/terminal-worker-host.test.ts" \
  "src/server/terminal/terminal-worker-runtime.test.ts" \
  "src/server/terminal/terminal-pty-runtime.test.ts" \
  "src/web/components/terminal/terminal-geometry.test.ts" \
  "src/web/components/terminal/authority-gate.test.ts" \
  "src/web/components/terminal/ManagedTerminalSession.test.ts" \
  "src/web/components/terminal/TerminalSessionRegistry.test.ts" \
  "src/web/components/terminal/TerminalSessionProvider.test.tsx" \
  "src/web/components/terminal/TerminalSlot.test.tsx" \
  "src/web/components/terminal/TerminalTabs.test.tsx" \
  "src/web/components/terminal/TerminalTabs.keyboard.test.tsx" \
  "src/web/terminal.test.ts"
```

- [ ] **Step 2: Run project verification**

Run:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected result: typecheck, test suite, and architecture guard pass.

- [ ] **Step 3: Inspect worktree changes**

Run:

```bash
git status --short
git diff --stat
```

Confirm the diff is limited to terminal files and the plan/spec documents. Do not revert unrelated pre-existing user changes.

## Implementation Notes

- Preserve existing terminal features: external input, custom buttons, path links, scrollback, viewer output summaries, search, progress indicator, and configurable font size.
- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Do not introduce TypeScript enums, namespaces with runtime code, constructor parameter properties, or import aliases.
- Use exact package versions only if a package change becomes necessary; this plan is designed to avoid dependency changes.
- Keep comments sparse and in the existing codebase language.
- Prefer small helpers over large abstractions. The intended complexity boundary is ownership authority, geometry measurement, and input attribution only.

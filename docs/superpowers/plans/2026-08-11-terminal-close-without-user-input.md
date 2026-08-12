# Terminal Close Without User Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user close an untouched internal terminal without a confirmation dialog while preserving confirmation for input-bearing, unknown, and bulk-close cases.

**Architecture:** The server terminal session owns a monotonic `hasUserInput` fact and exposes it through the existing catalog. The renderer attributes terminal batches, updates its projection immediately, and converges through one `sessions-changed` invalidation on first user input. `TerminalTabs` skips confirmation only for explicit `false` and reuses one close executor.

**Tech Stack:** TypeScript in Node strip-only mode, React, Vitest, Valibot, Bun, existing WebSocket terminal bridge.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-11-terminal-close-without-user-input-design.md`.
- Count only non-empty, accepted user-intent data; do not count protocol replies, rejected viewer writes, or empty data.
- Missing input state is unknown and must still require confirmation.
- Keep “close other terminals” and “close all terminals” confirmation behavior unchanged.
- Use repo-alias imports with explicit `.ts`/`.tsx` extensions; use no strip-only-incompatible TypeScript syntax.
- Add no dependency, persistence, setting, new realtime message type, or UI copy.
- Do not commit, push, create branches, or mutate Git history; the user did not request Git operations.

---

### Task 1: Authoritative Terminal Input State

**Files:**

- Modify: `src/shared/terminal.ts`
- Test: `src/shared/terminal.test.ts`
- Modify: `src/server/terminal/terminal-session-manager.ts`
- Test: `src/server/terminal/terminal-session-manager.test.ts`
- Modify: `src/server/terminal/terminal.ts`
- Test: `src/server/terminal/terminal.test.ts`

**Interfaces:**

- Produces: `TerminalWriteInput.userIntent?: boolean`; omitted means user intent.
- Produces: `TerminalSessionSummary.hasUserInput?: boolean`; missing means unknown to clients.
- Produces: `TerminalEventSink.onUserInput?(ownerId, { sessionId })`, fired once per server session.
- Produces: `TerminalSessionManager.writeSession(ownerId, sessionId, data, attachmentId?, userIntent?)`.

- [x] **Step 1: Add failing shared-protocol tests**

Extend summary normalization with `hasUserInput: false`, then add this write request test:

```ts
test('preserves terminal input state and validates write attribution', () => {
  const request = {
    type: 'request' as const,
    requestId: 'request_write',
    action: 'write' as const,
    input: {
      sessionId: 'term_abcdefghijklmnop',
      data: '\x1b[1;1R',
      attachmentId: 'attachment_a',
      userIntent: false,
    },
  }
  expect(normalizeTerminalClientMessage(request)).toMatchObject({
    action: 'write',
    input: { userIntent: false },
  })
  expect(
    normalizeTerminalClientMessage({
      ...request,
      input: { ...request.input, userIntent: 'false' },
    }),
  ).toBeNull()
})
```

- [x] **Step 2: Add a failing manager lifecycle test**

Create a controlled session and prove false → true is monotonic and emits once:

```ts
test('tracks the first accepted user input as a monotonic session fact', async () => {
  const onUserInput = vi.fn()
  const manager = new TerminalSessionManager<string>({
    onOutput: vi.fn(),
    onExit: vi.fn(),
    onUserInput,
  })
  const created = manager.ensureSession({
    ownerId: 'client_a',
    scope: '/workspace',
    key: '/workspace\0/workspace/feature\0terminal-1',
    cwd: '/workspace/feature',
    cols: 80,
    rows: 24,
    attachmentId: 'attachment_local',
  })
  expect(created.ok).toBe(true)
  if (!created.ok) return

  await expect(manager.listSessions('/workspace')).resolves.toEqual([expect.objectContaining({ hasUserInput: false })])
  expect(manager.writeSession('client_a', created.sessionId, '\x1b[1;1R', 'attachment_local', false)).toBe(true)
  await expect(manager.listSessions('/workspace')).resolves.toEqual([expect.objectContaining({ hasUserInput: false })])
  expect(manager.writeSession('client_a', created.sessionId, 'pwd', 'attachment_local')).toBe(true)
  expect(manager.writeSession('client_a', created.sessionId, '\r', 'attachment_local')).toBe(true)
  await expect(manager.listSessions('/workspace')).resolves.toEqual([expect.objectContaining({ hasUserInput: true })])
  expect(onUserInput).toHaveBeenCalledTimes(1)
  expect(onUserInput).toHaveBeenCalledWith('client_a', { sessionId: created.sessionId })
})
```

- [x] **Step 3: Add a failing server invalidation test**

Add this test beside the input-queue coverage:

```ts
test('broadcasts one catalog invalidation on first user input', async () => {
  const socket = { send: vi.fn(), close: vi.fn() }
  registerTerminalSocket('client_1', 'attachment_a', socket)
  const sessionId = await createTerminalSession('client_1', { cols: 80, rows: 24 })
  await attachServerTerminal('client_1', {
    sessionId,
    cols: 80,
    rows: 24,
    attachmentId: 'attachment_a',
  })
  socket.send.mockClear()

  expect(
    writeServerTerminal('client_1', {
      sessionId,
      data: '\x1b[1;1R',
      attachmentId: 'attachment_a',
      userIntent: false,
    }),
  ).toBe(true)
  const invalidations = () =>
    socket.send.mock.calls.filter(([payload]) => {
      const parsed = JSON.parse(String(payload))
      return parsed.type === 'sessions-changed' && parsed.repoRoot === '/repo'
    })
  expect(invalidations()).toHaveLength(0)

  expect(writeServerTerminal('client_1', { sessionId, data: 'p', attachmentId: 'attachment_a' })).toBe(true)
  expect(writeServerTerminal('client_1', { sessionId, data: 'wd', attachmentId: 'attachment_a' })).toBe(true)
  expect(invalidations()).toHaveLength(1)
  unregisterTerminalSocket('client_1', 'attachment_a', socket)
})
```

- [x] **Step 4: Run focused tests and verify RED**

```bash
bun run test src/shared/terminal.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts
```

Expected: failures identify missing `userIntent`, `hasUserInput`, and `onUserInput` behavior.

- [x] **Step 5: Implement the shared contract**

Insert `userIntent?: boolean` after `TerminalWriteInput.attachmentId` and `hasUserInput?: boolean` after `TerminalSessionSummary.message`. Add `userIntent: v.optional(v.boolean())` to `TerminalWriteInputSchema` and `hasUserInput: v.optional(v.boolean())` to `TerminalSessionSummarySchema`.

- [x] **Step 6: Implement manager state and one-time event**

Add `hasUserInput: boolean` after the internal session's `message`, initialize it to `false` in the new-session object, do not change it in `resetSessionState`, and include `hasUserInput: session.hasUserInput` in `listSessions`. Insert this callback in `TerminalEventSink`:

```ts
onUserInput?(ownerId: TOwner, event: { sessionId: string }): void
```

Append `userIntent = true` to the `writeSession` parameters. After the existing attachment authorization succeeds and before `session.inputQueue.push(data)`, insert:

```ts
if (userIntent && data && !session.hasUserInput) {
  session.hasUserInput = true
  this.sink.onUserInput?.(ownerId, { sessionId: session.id })
}
```

- [x] **Step 7: Wire server invalidation**

Handle the event beside output/title/exit:

```ts
onUserInput(clientId, event) {
  const repoRoot = manager.getSession(clientId, event.sessionId)?.scope
  if (repoRoot) broker.broadcastGlobal({ type: 'sessions-changed', repoRoot })
},
```

Add `(input.userIntent !== undefined && typeof input.userIntent !== 'boolean')` to the invalid-input condition in `writeServerTerminal`, then pass `input.userIntent !== false` as the final `manager.writeSession` argument.

- [x] **Step 8: Run the Step 4 command and verify GREEN**

Expected: all three files pass.

---

### Task 2: Renderer Attribution and Projection

**Files:**

- Modify: `src/web/components/terminal/types.ts`
- Modify: `src/web/components/terminal/authority-gate.ts`
- Test: `src/web/components/terminal/authority-gate.test.ts`
- Modify: `src/web/components/terminal/ManagedTerminalSession.ts`
- Test: `src/web/components/terminal/ManagedTerminalSession.test.ts`
- Modify: `src/web/components/terminal/TerminalSessionRegistry.ts`
- Test: `src/web/components/terminal/TerminalSessionRegistry.test.ts`

**Interfaces:**

- Consumes: Task 1's optional wire fields.
- Produces: `writeWithTerminalAuthority({ data, userIntent?, ... })` forwarding false attribution.
- Produces: web session summaries with a conservative `hasUserInput` projection.

- [x] **Step 1: Add failing batch-attribution tests**

Extend authority-gate coverage so a controller forwards `userIntent: false`. In `ManagedTerminalSession.test.ts`, assert protocol-only input writes this payload and does not notify input:

```ts
session.writeInput({ origin: 'terminal-emulator', source: 'data', data: '\x1b[1;1R' })
await flushTerminalStart()
expect(terminalCalls.write).toHaveBeenCalledWith({
  sessionId: 'session-1',
  data: '\x1b[1;1R',
  userIntent: false,
})
expect(onInput).not.toHaveBeenCalled()
```

Queue a protocol reply and user input in the same microtask; assert one combined write omits `userIntent` and `onInput` fires once. Assert empty input neither notifies nor writes.

- [x] **Step 2: Add failing registry projection tests**

Cover explicit server false, immediate local transition, unknown state, protocol replies, and session-ID replacement:

```ts
expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.hasUserInput).toBe(false)
registry.writeInput(key, 'a')
expect(registry.worktreeSnapshot(WORKTREE_KEY).sessions[0]?.hasUserInput).toBe(true)
```

Missing server state must project true. Reconciliation with a new session ID and explicit false must reset a prior true projection.

- [x] **Step 3: Run focused tests and verify RED**

```bash
bun run test src/web/components/terminal/authority-gate.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts
```

Expected: failures identify missing batch attribution and projection state.

- [x] **Step 4: Implement batch attribution**

```ts
private pendingWriteHasUserIntent = false

writeInput(input: string | TerminalInput): void {
  const isUserIntentInput = typeof input === 'string' || !isTerminalEmulatorInput(input)
  if (!isUserIntentInput && this.runtime.isReplaying()) return
  const data = typeof input === 'string' ? input : input.data
  const sessionId = this.runtime.currentSessionId()
  if (!data || !sessionId || !this.runtime.canWrite()) return
  if (isUserIntentInput) {
    this.prioritizeNextOutput = true
    this.pendingWriteHasUserIntent = true
    this.onInput?.(this.descriptor)
  }
  this.pendingWriteBuffer += data
  this.scheduleInputFlush()
}
```

In `flushInput`, snapshot and clear both pending fields. Pass `userIntent: false` only when the batch has no user intent. Extend `writeWithTerminalAuthority` to forward that optional field while leaving ordinary user-write payloads unchanged.

- [x] **Step 5: Implement registry projection**

Add `hasUserInputByKey: Map<string, boolean>`. During reconciliation use the incoming session ID to avoid carrying truth across a replacement:

```ts
const previousSessionId = this.sessionIdByKey.get(descriptor.key)
const previousHasUserInput = this.hasUserInputByKey.get(descriptor.key)
const hasUserInput =
  serverSession.hasUserInput === true ||
  (previousSessionId === serverSession.sessionId && previousHasUserInput === true)
    ? true
    : serverSession.hasUserInput === false
      ? false
      : true
this.hasUserInputByKey.set(descriptor.key, hasUserInput)
```

Add this optional field to the web `TerminalSessionSummary` before changing the registry:

```ts
/** False only when the server confirms that no user input was accepted. */
hasUserInput?: boolean
```

Project `hasUserInput: this.hasUserInputByKey.get(key) !== false`. Update `noteTerminalInput` to set true and invalidate the worktree snapshot on first transition. Delete entries on session removal and clear the map on destroy.

- [x] **Step 6: Run the Step 3 command and verify GREEN**

Expected: all three files pass.

---

### Task 3: Confirmation-Free Single Close

**Files:**

- Modify: `src/web/components/terminal/TerminalTabs.tsx`
- Test: `src/web/components/terminal/TerminalTabs.test.tsx`

**Interfaces:**

- Consumes: Task 2's projected `hasUserInput`.
- Produces: immediate ordinary close only for `hasUserInput === false`.
- Preserves: existing `onClose(key, options?)`, tmux error handling, focus, and bulk confirmation.

- [x] **Step 1: Add failing direct-close tests**

Keep the helper default omitted so existing tests cover unknown state. Add regular, compact, and tmux-backed cases with `hasUserInput: false`:

```ts
expect(onClose).toHaveBeenCalledWith('t1')
expect(document.body.textContent).not.toContain('terminal.close-confirm-title')
```

For tmux, assert ordinary `onClose('t1')`, never `{ closeTmuxSession: true }`.

- [x] **Step 2: Add failing context and bulk tests**

With all sessions explicitly false, “close current” must close immediately. “Close others” and “close all” must still show their existing bulk dialogs before any `onClose` call.

- [x] **Step 3: Add a failing focus test**

Render selected `t1` and adjacent `t2`, both false. Close `t1` and assert the tab button for `t2` becomes `document.activeElement`.

- [x] **Step 4: Run focused tests and verify RED**

```bash
bun run test src/web/components/terminal/TerminalTabs.test.tsx
```

Expected: explicit-false sessions still show the single-close confirmation.

- [x] **Step 5: Centralize single-close execution**

Extract the existing confirmed-close body into `closeSingleSession(key, options?)`. It must compute the adjacent key, call `onClose`, preserve tmux failure toasts, clear dialog state after success, and focus the adjacent tab when the closed tab was active. Have `confirmClose` delegate to it.

- [x] **Step 6: Route single-close requests**

```ts
const requestSingleClose = useCallback(
  (key: string) => {
    const session = sessions.find((candidate) => candidate.key === key)
    if (!session) return
    if (session.hasUserInput === false) {
      void closeSingleSession(key)
      return
    }
    setCloseTmuxSession(false)
    setPendingCloseKey(key)
  },
  [closeSingleSession, sessions],
)
```

Use it from regular/compact close buttons and context “close current”. Leave bulk callbacks unchanged.

- [x] **Step 7: Run the Step 4 command and verify GREEN**

Expected: all `TerminalTabs` tests pass.

---

### Task 4: Integrated Verification

**Files:**

- Verify: all files changed in Tasks 1–3.
- Update: this plan's checkboxes as steps complete.

**Interfaces:**

- Consumes: the complete server-to-UI flow.
- Produces: verified implementation without Git history mutation.

- [x] **Step 1: Run focused terminal tests together**

```bash
bun run test src/shared/terminal.test.ts src/server/terminal/terminal-session-manager.test.ts src/server/terminal/terminal.test.ts src/web/components/terminal/authority-gate.test.ts src/web/components/terminal/ManagedTerminalSession.test.ts src/web/components/terminal/TerminalSessionRegistry.test.ts src/web/components/terminal/TerminalTabs.test.tsx
```

Expected: all focused tests pass.

- [x] **Step 2: Run type checking**

```bash
bun run typecheck
```

Expected: exit code 0.

- [x] **Step 3: Run the architecture guard**

```bash
bun run check:architecture
```

Expected: exit code 0 with no forbidden cross-layer import.

- [x] **Step 4: Run the full test suite**

```bash
bun run test
```

Expected: exit code 0. Existing jsdom/browser capability warnings may remain, but no test may fail.

- [x] **Step 5: Inspect the final diff**

```bash
git diff --check
git diff -- src/shared/terminal.ts src/server/terminal/terminal-session-manager.ts src/server/terminal/terminal.ts src/web/components/terminal/authority-gate.ts src/web/components/terminal/ManagedTerminalSession.ts src/web/components/terminal/TerminalSessionRegistry.ts src/web/components/terminal/types.ts src/web/components/terminal/TerminalTabs.tsx
```

Expected: no whitespace errors; changes remain within terminal feature boundaries. Do not stage or commit.

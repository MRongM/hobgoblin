# Windows App Backend Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal Windows desktop-app exit gracefully stop every app-owned backend process, with a bounded exact-PID process-tree fallback.

**Architecture:** Electron main and the embedded server communicate over a private Node IPC shutdown message. Async teardown propagates from server bootstrap through server runtime to the terminal worker; a reusable system helper waits for an owned child and, on timeout, uses `taskkill.exe /PID <pid> /T /F` only for that captured child PID.

**Tech Stack:** Electron 42, Node.js child processes and IPC, TypeScript strip-only mode, Vitest, Bun.

---

## File Structure

- Create `src/shared/server-lifecycle.ts`: canonical cross-process shutdown message and validator.
- Create `src/shared/server-lifecycle.test.ts`: protocol validation coverage.
- Create `src/system/owned-process-shutdown.ts`: bounded graceful request and exact-PID Windows tree termination.
- Create `src/system/owned-process-shutdown.test.ts`: graceful, timeout, and exact `taskkill` behavior.
- Modify `src/main/server-manager.ts`: spawn the embedded server with IPC and stop it through the shared helper.
- Modify `src/main/server-manager.test.ts`: assert embedded-server spawn options expose IPC.
- Modify `src/server/bootstrap.ts`: consume the IPC message and await runtime teardown before exit.
- Modify `src/server/bootstrap.test.ts`: prove IPC drives the existing idempotent shutdown path.
- Modify `src/server/runtime.ts`: make runtime shutdown await terminal-host teardown.
- Modify `src/server/runtime.test.ts`: prove async teardown ordering and idempotency.
- Modify `src/server/terminal/terminal-host.ts`: permit asynchronous host shutdown.
- Modify `src/server/terminal/terminal-worker-host.ts`: await graceful worker exit and use the owned-process fallback on timeout.
- Modify `src/server/terminal/terminal-worker-host.test.ts`: cover graceful and timed-out worker shutdown.

### Task 1: Define the embedded-server lifecycle protocol

**Files:**
- Create: `src/shared/server-lifecycle.ts`
- Create: `src/shared/server-lifecycle.test.ts`

- [ ] **Step 1: Write the failing protocol test**

```ts
import { describe, expect, test } from 'vitest'
import {
  EMBEDDED_SERVER_SHUTDOWN_MESSAGE,
  isEmbeddedServerShutdownMessage,
} from '#/shared/server-lifecycle.ts'

describe('embedded server lifecycle protocol', () => {
  test('accepts only the explicit shutdown message', () => {
    expect(isEmbeddedServerShutdownMessage(EMBEDDED_SERVER_SHUTDOWN_MESSAGE)).toBe(true)
    expect(isEmbeddedServerShutdownMessage({ type: 'shutdown' })).toBe(false)
    expect(isEmbeddedServerShutdownMessage(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun run test -- src/shared/server-lifecycle.test.ts`

Expected: FAIL because `#/shared/server-lifecycle.ts` does not exist.

- [ ] **Step 3: Add the minimal protocol**

```ts
export const EMBEDDED_SERVER_SHUTDOWN_MESSAGE = { type: 'embedded-server-shutdown' } as const

export function isEmbeddedServerShutdownMessage(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === EMBEDDED_SERVER_SHUTDOWN_MESSAGE.type
  )
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `bun run test -- src/shared/server-lifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/shared/server-lifecycle.ts src/shared/server-lifecycle.test.ts
git commit -m "feat(server): define embedded shutdown protocol"
```

### Task 2: Add bounded owned-process shutdown

**Files:**
- Create: `src/system/owned-process-shutdown.ts`
- Create: `src/system/owned-process-shutdown.test.ts`

- [ ] **Step 1: Write failing tests for graceful exit and timeout fallback**

Use an `EventEmitter` fake child with `send`, `kill`, `pid`, `exitCode`, and `signalCode`. Assert that:

```ts
const graceful = shutdownOwnedProcess(child, {
  message: { type: 'stop' },
  timeoutMs: 100,
  platform: 'win32',
  terminateProcessTree,
})
child.emit('exit', 0, null)
await graceful
expect(child.send).toHaveBeenCalledWith({ type: 'stop' })
expect(terminateProcessTree).not.toHaveBeenCalled()
```

For the timeout case, use fake timers, advance by the configured timeout, and assert `terminateProcessTree` receives the exact positive child PID. Add a separate mocked-`spawn` assertion that Windows termination runs:

```ts
expect(spawn).toHaveBeenCalledWith(
  'taskkill.exe',
  ['/PID', '4321', '/T', '/F'],
  { stdio: 'ignore', windowsHide: true },
)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun run test -- src/system/owned-process-shutdown.test.ts`

Expected: FAIL because the owned-process shutdown module does not exist.

- [ ] **Step 3: Implement the focused lifecycle helper**

Define a minimal child contract and `shutdownOwnedProcess(child, options)`. Register the exit listener before sending the message, short-circuit an already-exited child, and race the exit event against the timeout. If IPC cannot be requested, or the timeout wins:

```ts
if (platform === 'win32' && child.pid && child.pid > 0) {
  await terminateProcessTree(child.pid)
} else {
  child.kill('SIGKILL')
}
```

Implement `terminateWindowsProcessTree(pid)` by spawning `taskkill.exe` with the exact argument vector above and resolving when it exits. Reject a spawn error so the caller can still use direct-child `SIGKILL` as its final fallback.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `bun run test -- src/system/owned-process-shutdown.test.ts`

Expected: PASS with no unhandled timer or process events.

- [ ] **Step 5: Commit**

```sh
git add src/system/owned-process-shutdown.ts src/system/owned-process-shutdown.test.ts
git commit -m "feat(system): stop owned process trees"
```

### Task 3: Make server teardown await its owned resources

**Files:**
- Modify: `src/server/terminal/terminal-host.ts`
- Modify: `src/server/runtime.ts`
- Modify: `src/server/runtime.test.ts`
- Modify: `src/server/bootstrap.ts`
- Modify: `src/server/bootstrap.test.ts`

- [ ] **Step 1: Write a failing async runtime teardown test**

Make the terminal-host stub return a pending promise from `shutdown()`. Call `runtime.shutdown()` twice and assert both calls return the same work, while background sync and port forwarding stop once. Before resolving the terminal promise, assert the runtime shutdown promise is still pending; after resolving, await both promises successfully.

- [ ] **Step 2: Write a failing server IPC shutdown test**

Provide a fake process-message source to `bootstrapServer`, emit `EMBEDDED_SERVER_SHUTDOWN_MESSAGE`, and assert `runtime.shutdown()` is awaited before the injected `exit(0)` callback runs.

- [ ] **Step 3: Run both tests and verify RED**

Run: `bun run test -- src/server/runtime.test.ts src/server/bootstrap.test.ts`

Expected: FAIL because runtime shutdown is synchronous and bootstrap does not consume process IPC.

- [ ] **Step 4: Propagate asynchronous shutdown**

Change the terminal-host contract to:

```ts
shutdown(): MaybePromise<void>
```

Store one shutdown promise in `createServerRuntime` and return it from every call:

```ts
shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = (async () => {
    stopBackgroundSync()
    shutdownPortForwarding()
    await terminalHost.shutdown()
  })()
  return shutdownPromise
}
```

In server bootstrap, await `runtime.shutdown()`. Register a process-message listener that accepts only `isEmbeddedServerShutdownMessage(message)` and invokes the same `shutdownAndExit()` used by signal handlers. Remove the message listener during shutdown so stopped in-process servers do not retain it.

- [ ] **Step 5: Run both tests and verify GREEN**

Run: `bun run test -- src/server/runtime.test.ts src/server/bootstrap.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add src/server/terminal/terminal-host.ts src/server/runtime.ts src/server/runtime.test.ts src/server/bootstrap.ts src/server/bootstrap.test.ts
git commit -m "feat(server): await graceful runtime shutdown"
```

### Task 4: Wire graceful shutdown into the server and terminal worker processes

**Files:**
- Modify: `src/main/server-manager.ts`
- Modify: `src/main/server-manager.test.ts`
- Modify: `src/server/terminal/terminal-worker-host.ts`
- Modify: `src/server/terminal/terminal-worker-host.test.ts`

- [ ] **Step 1: Write failing worker-host shutdown tests**

Update `FakeWorker` with a positive PID and observable `send`/`kill`. Add one test where `host.shutdown()` sends `{ type: 'shutdown' }`, the worker emits `exit`, and the injected tree terminator is not called. Add a timeout test using fake timers where the terminator receives only that worker PID.

- [ ] **Step 2: Write the failing embedded-server spawn-option test**

Extract or expose the focused spawn options and assert `stdio` is exactly:

```ts
['ignore', 'pipe', 'pipe', 'ipc']
```

This ensures `stopEmbeddedServer()` can use the private lifecycle protocol.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `bun run test -- src/main/server-manager.test.ts src/server/terminal/terminal-worker-host.test.ts`

Expected: FAIL because the server lacks IPC stdio and worker shutdown returns immediately after direct kill.

- [ ] **Step 4: Integrate the owned-process helper**

In `server-manager.ts`, spawn with IPC and replace direct `SIGTERM`/`SIGKILL` handling with:

```ts
await shutdownOwnedProcess(proc, {
  message: EMBEDDED_SERVER_SHUTDOWN_MESSAGE,
  timeoutMs: SERVER_STOP_TIMEOUT_MS,
})
```

In `WorkerBackedTerminalHost.shutdown()`, preserve the existing state and pending-request cleanup, then await `shutdownOwnedProcess(worker, { message: { type: 'shutdown' }, timeoutMs: ... })`. Do not disconnect or kill the worker immediately after queueing its shutdown message.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `bun run test -- src/main/server-manager.test.ts src/server/terminal/terminal-worker-host.test.ts`

Expected: PASS.

- [ ] **Step 6: Run all lifecycle regression tests**

Run: `bun run test -- src/shared/server-lifecycle.test.ts src/system/owned-process-shutdown.test.ts src/main/main.test.ts src/main/server-manager.test.ts src/server/bootstrap.test.ts src/server/runtime.test.ts src/server/terminal/terminal-worker-host.test.ts src/server/terminal/terminal-worker-runtime.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```sh
git add src/main/server-manager.ts src/main/server-manager.test.ts src/server/terminal/terminal-worker-host.ts src/server/terminal/terminal-worker-host.test.ts
git commit -m "fix(windows): stop app-owned backend processes"
```

### Task 5: Verify the complete change

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Check formatting and accidental changes**

Run: `git diff --check HEAD~3..HEAD && git status --short`

Expected: no whitespace errors; only intentional implementation changes remain.

- [ ] **Step 2: Run the full test suite**

Run: `bun run test`

Expected: all Vitest suites pass.

- [ ] **Step 3: Run type checking**

Run: `bun run typecheck`

Expected: all configured TypeScript projects pass with no errors.

- [ ] **Step 4: Run architecture enforcement**

Run: `bun run check:architecture`

Expected: architecture checks pass; main and server share only the lifecycle protocol and the system process helper.

- [ ] **Step 5: Review the final diff against the design**

Confirm the final code targets only captured child PIDs, keeps standalone server mode untouched, preserves persistent tmux sessions, performs graceful teardown first, and bounds every fallback wait.

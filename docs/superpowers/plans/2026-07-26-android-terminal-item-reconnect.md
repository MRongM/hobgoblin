# Android Terminal Item Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direct, status-aware Reconnect shortcut to every Android retained-terminal Item.

**Architecture:** A pure record-status policy controls button enablement in both list surfaces. Both screens emit a `TerminalSessionRecord` to one app-level reconnect function that resolves fresh Host/session data and delegates to `TerminalSessionManager.reconnect` on the IO dispatcher.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, Kotlin coroutines, JUnit 4, Gradle.

## Global Constraints

- Reconnect is visible on every Terminals-tab and Project terminal Item.
- Reconnect is enabled only for Exited, Failed, and Disconnected records.
- Reconnect reuses the existing record, list order, terminal slot, and valid tmux identity.
- Reconnect does not navigate, create a duplicate Item, close/delete anything, or clean up remote tmux.
- Existing Open, Close, Delete, swipe, background navigation, and Project tmux-delete behavior remain unchanged.
- Do not create a Git commit unless the user separately requests it.

---

### Task 1: Define and expose reconnect availability

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionState.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionStateTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`

**Interfaces:**
- Produces: `terminalSessionReconnectAvailable(session: TerminalSessionRecord): Boolean`.
- Adds: `onReconnectTerminalSession: (TerminalSessionRecord) -> Unit` to both public list composables.

- [x] **Step 1: Write failing policy and source-contract tests**

```kotlin
assertFalse(terminalSessionReconnectAvailable(record(status = TerminalSessionStatus.Starting)))
assertFalse(terminalSessionReconnectAvailable(record(status = TerminalSessionStatus.Running)))
assertTrue(terminalSessionReconnectAvailable(record(status = TerminalSessionStatus.Exited)))
assertTrue(terminalSessionReconnectAvailable(record(status = TerminalSessionStatus.Failed)))
assertTrue(terminalSessionReconnectAvailable(record(status = TerminalSessionStatus.Disconnected)))
```

Require both screen sources to contain `onReconnectTerminalSession`, `Text("Reconnect")`, and `enabled = terminalSessionReconnectAvailable(session)`.

- [x] **Step 2: Run focused tests and verify RED**

From `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalInteractionStateTest" --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalsScreenStateTest" --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest"
```

Expected: compilation or source-contract failure because the shared policy and shortcuts do not exist.

- [x] **Step 3: Implement the policy and both Item buttons**

Add the pure status policy. Thread the same record callback through each screen hierarchy and render a first-position `TextButton`:

```kotlin
TextButton(
    enabled = terminalSessionReconnectAvailable(session),
    onClick = { onReconnectTerminalSession(session) },
) {
    Text("Reconnect")
}
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

### Task 2: Reconnect through the app boundary

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`

**Interfaces:**
- Produces: local `reconnectRetainedTerminal(session: TerminalSessionRecord)` orchestration.
- Consumes: `resolveHostForTerminalRoute`, `RemoteTarget.fromHostProfile`, `TerminalSessionManager.reconnect`, and `TerminalForegroundBridge.sync`.

- [x] **Step 1: Write a failing app-wiring source contract**

Require `reconnectRetainedTerminal`, fresh `terminalSessionManager.session(session.id)` resolution, `terminalSessionManager.reconnect(`, and both `onReconnectTerminalSession = ::reconnectRetainedTerminal` call sites.

- [x] **Step 2: Run the focused test and verify RED**

Run `TerminalsScreenStateTest`; expect the source contract to fail because app orchestration is absent.

- [x] **Step 3: Implement reusable reconnect orchestration**

Resolve the current retained record and Host before launching IO work. Reconnect with its id, remote path, repository id/root, and target label, then synchronize foreground state. Missing session/Host returns without mutation.

- [x] **Step 4: Run the focused test and verify GREEN**

Run `TerminalsScreenStateTest`; expect all tests to pass.

### Task 3: Full verification

**Files:**
- Verify only.

- [x] **Step 1: Run `./gradlew :app:testDebugUnitTest` from `android/`**

- [x] **Step 2: Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` from the repository root**

- [x] **Step 3: Run `git diff --check` and confirm no Close/Delete/tmux/background behavior changed**

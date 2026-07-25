# Android Terminal Close/Delete Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate retained-terminal Close from Delete and expose Close inside Project terminal lists while preserving rightward background navigation.

**Architecture:** `TerminalsScreen` emits distinct confirmed Close and Delete callbacks, changing manual order only for Delete. `RepositoryWorkspaceScreen` adds confirmed Close beside its existing Delete flow, while `HobgoblinAndroidApp` maps Close to `TerminalSessionManager.close` and Delete to `removeSession`.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, JUnit 4, Gradle.

## Global Constraints

- Close always requires confirmation, stops the selected Android controller, and retains its record and order.
- Delete always requires confirmation and removes the selected retained Android session.
- Closing a tmux-backed item never ends the remote tmux session.
- Terminals-tab Delete never ends the remote tmux session; Project Delete keeps its existing opt-in tmux cleanup.
- Rightward swipe backgrounds the terminal to the Terminals tab and never uses the existing Back callback.
- The gesture is limited to the left content edge to preserve terminal scrolling and selection.
- Existing Open, reorder, Back, focus, SSH, persistence-format, desktop, web, and server behavior remains unchanged.
- Do not create a Git commit unless the user separately requests it.

---

### Task 1: Split Close and Delete in the Terminals tab

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`

**Interfaces:**
- Produces: `terminalOverviewCloseConfirmationText(session: TerminalSessionRecord): String`.
- Produces: `terminalOverviewDeleteConfirmationText(session: TerminalSessionRecord): String`.
- Produces: `terminalOverviewOrderAfterDelete(orderedIds: List<String>, deletedId: String): List<String>`.
- Adds: `TerminalsScreen(..., onCloseTerminalSession: (String) -> Unit, onDeleteTerminalSession: (String) -> Unit, ...)`.
- Consumes: `TerminalSessionManager.close(sessionId)`, `TerminalSessionManager.removeSession(sessionId)`, and `TerminalForegroundBridge.sync()`.

- [x] **Step 1: Write failing lifecycle-copy, ordering, and callback contract tests**

Assert Close copy says the record stays available, Delete copy says it is removed, and only the Delete helper changes order:

```kotlin
assertEquals(listOf("session-1", "session-3"), terminalOverviewOrderAfterDelete(
    orderedIds = listOf("session-1", "session-2", "session-3"),
    deletedId = "session-2",
))
assertTrue(terminalOverviewCloseConfirmationText(record()).contains("reconnect"))
assertFalse(terminalOverviewCloseConfirmationText(record()).contains("removes"))
assertTrue(terminalOverviewDeleteConfirmationText(record()).contains("removes"))
```

Require `Close`, `Delete`, `onCloseTerminalSession`, and `onDeleteTerminalSession` in `TerminalsScreen.kt`, plus manager `close` and `removeSession` wiring in `HobgoblinAndroidApp.kt`.

- [x] **Step 2: Run the focused test and verify RED**

From `android/` run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalsScreenStateTest"
```

Expected: compilation or assertions fail because Close still removes and Delete is not exposed separately.

- [x] **Step 3: Implement separate Close and Delete dialogs/actions**

Store a pending action plus session id in `TerminalsScreen`. Close invokes `onCloseTerminalSession` without changing order. Delete computes and persists remaining order, then invokes `onDeleteTerminalSession`. Keep Open behavior unchanged.

Use distinct `Close terminal?` and `Delete terminal?` dialogs so the lifecycle outcome is explicit.

- [x] **Step 4: Wire distinct manager lifecycle operations**

Pass this callback from `HobgoblinAndroidApp`:

```kotlin
onCloseTerminalSession = { sessionId ->
    terminalSessionManager.close(sessionId)
    terminalForegroundBridge.sync()
}
onDeleteTerminalSession = { sessionId ->
    terminalSessionManager.removeSession(sessionId)
    terminalForegroundBridge.sync()
}
```

Neither callback calls remote tmux cleanup or navigates away from the Terminals tab.

- [x] **Step 5: Run the focused test and verify GREEN**

Run the focused Gradle command from Step 2.

Expected: every `TerminalsScreenStateTest` test passes.

### Task 2: Add Close to Project terminal items

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`

**Interfaces:**
- Produces: Project terminal Close confirmation state and action.
- Adds: `RepositoryWorkspaceScreen(..., onCloseTerminalSession: (String) -> Unit, ...)`.
- Preserves: existing `onDeleteTerminalSession: (String, Boolean) -> Unit` and tmux cleanup flow.

- [x] **Step 1: Write a failing Project Close source contract**

Read `RepositorySetupScreen.kt` and assert it contains `onCloseTerminalSession`, `Text("Close")`, and a `Close terminal?` dialog while retaining `onDeleteTerminalSession`.

- [x] **Step 2: Run focused tests and verify RED**

From `android/` run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest"
```

Expected: the source contract fails because Project items do not expose Close.

- [x] **Step 3: Implement Project Close confirmation**

Add a separate pending Close target, confirmation dialog, and Close button to `TerminalSessionRow`. Do not route Close through Delete or change swipe-to-delete.

- [x] **Step 4: Wire Project Close to the manager**

```kotlin
onCloseTerminalSession = { sessionId ->
    terminalSessionManager.close(sessionId)
    terminalForegroundBridge.sync()
}
```

- [x] **Step 5: Run focused tests and verify GREEN**

Expected: every `RepositorySetupStateTest` test passes.

### Task 3: Full verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes all behavior from Tasks 1 and 2.
- Produces final verification evidence.

- [x] **Step 1: Run all Android unit tests**

From `android/`:

```bash
./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 2: Run root repository checks**

From the repository root:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: every command exits successfully.

- [x] **Step 3: Review documentation and diff**

Run `git diff --check`; confirm Close retains records/order, Terminals-tab Delete removes them, Project Delete and remote tmux cleanup are unchanged, and the diff remains Android-scoped plus docs.

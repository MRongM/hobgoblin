# Android Terminal Close and Background Swipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmed Close action to every Android terminal-list item and background an open terminal through a rightward terminal-page swipe.

**Architecture:** `TerminalsScreen` owns destructive confirmation and presentation-order cleanup, while `HobgoblinAndroidApp` performs session removal and foreground synchronization. `TerminalScreen` recognizes an edge swipe through a pure threshold policy and emits a distinct background-navigation callback.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, JUnit 4, Gradle.

## Global Constraints

- Close always requires confirmation and removes only the selected retained Android session.
- Closing a tmux-backed item never ends the remote tmux session.
- Rightward swipe backgrounds the terminal to the Terminals tab and never uses the existing Back callback.
- The gesture is limited to the left content edge to preserve terminal scrolling and selection.
- Existing Open, reorder, Back, focus, SSH, persistence-format, desktop, web, and server behavior remains unchanged.
- Do not create a Git commit unless the user separately requests it.

---

### Task 1: Confirm and close a retained terminal item

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`

**Interfaces:**
- Produces: `terminalOverviewCloseConfirmationText(session: TerminalSessionRecord): String`.
- Produces: `terminalOverviewOrderAfterClose(orderedIds: List<String>, closedId: String): List<String>`.
- Adds: `TerminalsScreen(..., onCloseTerminalSession: (String) -> Unit, ...)`.
- Consumes: `TerminalSessionManager.removeSession(sessionId)` and `TerminalForegroundBridge.sync()`.

- [x] **Step 1: Write failing close-copy and order tests**

Add tests that assert native copy includes the terminal title, stop, and removal; tmux copy states that the remote tmux session keeps running; and order cleanup preserves the remaining ids:

```kotlin
assertEquals(listOf("session-1", "session-3"), terminalOverviewOrderAfterClose(
    orderedIds = listOf("session-1", "session-2", "session-3"),
    closedId = "session-2",
))
assertTrue(terminalOverviewCloseConfirmationText(record(displayName = "release shell")).contains("release shell"))
assertTrue(terminalOverviewCloseConfirmationText(record(tmuxIdentity = tmuxIdentity())).contains("keeps running"))
```

Add a source contract that requires `Close`, `AlertDialog`, and `onCloseTerminalSession` in `TerminalsScreen.kt`.

- [x] **Step 2: Run the focused test and verify RED**

From `android/` run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalsScreenStateTest"
```

Expected: compilation fails because the close helpers do not exist.

- [x] **Step 3: Implement close confirmation and item action**

Store only the pending session id in `TerminalsScreen`. Render an error-colored `Close` button before `Open`. Resolve the current session before showing or confirming the dialog. On confirmation, compute and persist the remaining manual order, clear the pending id, and invoke `onCloseTerminalSession(session.id)`.

Use `AlertDialog` with `Close terminal?`, a `Close terminal` confirm button, and `Cancel`. Keep Card and Open click behavior unchanged.

- [x] **Step 4: Wire session removal at the app boundary**

Pass this callback from `HobgoblinAndroidApp`:

```kotlin
onCloseTerminalSession = { sessionId ->
    terminalSessionManager.removeSession(sessionId)
    terminalForegroundBridge.sync()
}
```

Do not call remote tmux cleanup or navigate away from the Terminals tab.

- [x] **Step 5: Run the focused test and verify GREEN**

Run the focused Gradle command from Step 2.

Expected: every `TerminalsScreenStateTest` test passes.

### Task 2: Add rightward background navigation

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionState.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionStateTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`

**Interfaces:**
- Produces: `terminalBackgroundSwipeTriggered(horizontalDistancePx: Float, thresholdPx: Float): Boolean`.
- Produces: `terminalBackgroundRoute(): AppRoute`, returning `AppRoute.Terminals`.
- Adds: `TerminalScreen(..., onBackground: () -> Unit, ...)`.

- [x] **Step 1: Write failing gesture and route tests**

```kotlin
assertTrue(terminalBackgroundSwipeTriggered(horizontalDistancePx = 96f, thresholdPx = 72f))
assertFalse(terminalBackgroundSwipeTriggered(horizontalDistancePx = 40f, thresholdPx = 72f))
assertFalse(terminalBackgroundSwipeTriggered(horizontalDistancePx = -96f, thresholdPx = 72f))
assertEquals(AppRoute.Terminals, terminalBackgroundRoute())
```

Extend the terminal source contract to require `TerminalBackgroundSwipeEdge(onBackground)` while retaining `BackHandler { navigateBack() }`.

- [x] **Step 2: Run focused tests and verify RED**

From `android/` run:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalInteractionStateTest" --tests "dev.hobgoblin.android.navigation.AppRouteTest"
```

Expected: compilation fails because the swipe and background-route helpers do not exist.

- [x] **Step 3: Implement the pure policies**

Add a positive-distance threshold comparison in `TerminalInteractionState.kt` and return `AppRoute.Terminals` from `terminalBackgroundRoute()` in `AppRoute.kt`. Keep both functions free of Compose and session-manager dependencies.

- [x] **Step 4: Render the edge swipe recognizer**

Add a private `TerminalBackgroundSwipeEdge` composable to `TerminalScreen.kt`. Use a `48.dp` left-edge hit region, a `72.dp` rightward threshold, and `detectHorizontalDragGestures`. Reset accumulated distance on start, cancellation, and completion; call `onBackground` once only when the threshold passes.

Render the edge after the terminal content so it remains available in focus mode. Do not call `navigateBack`, change focus state, or close the active session.

- [x] **Step 5: Wire background navigation**

Pass this callback from `HobgoblinAndroidApp`:

```kotlin
onBackground = {
    terminalForegroundBridge.sync()
    route = terminalBackgroundRoute()
}
```

- [x] **Step 6: Run focused tests and verify GREEN**

Run the focused Gradle command from Step 2.

Expected: every selected test passes.

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

Run `git diff --check`; confirm `CONTEXT.md` matches the implementation, remote tmux cleanup is untouched, and the diff is limited to Android terminal UI/navigation/tests plus design and plan documents.

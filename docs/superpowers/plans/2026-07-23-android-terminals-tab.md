# Android Terminals Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for the user-selected inline implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Android `Terminals` main tab that lists and opens every retained Host temporary terminal and Project terminal.

**Architecture:** Extend the existing main-tab shell with a third retained pane, derive its rows from the application-owned terminal-session snapshot, and carry an opt-in return hint on terminal routes opened from the overview. Keep ordering and labels as pure functions so the behavior is covered by JVM unit tests without adding Compose test dependencies.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, JUnit 4, Android Gradle Plugin.

## Global Constraints

- The overview shows all retained Host temporary terminals and Project terminals, regardless of status.
- The overview opens existing sessions only; it does not create, reconnect, rename, or delete them.
- Active sessions sort before inactive sessions; each group sorts by recent activity.
- Host temporary terminal cleanup semantics remain intact.
- No new dependencies or persistence changes.
- No Git commit is performed without explicit user confirmation.

---

### Task 1: Lock the main-tab and route contracts

**Files:**

- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/navigation/MainTabBarTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/navigation/MainTabBar.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt`

**Interfaces:**

- Produces: `MainTab.Terminals`, `MainTabIconKind.Terminal`, `MainTabSwipeDirection`, and `mainTabAfterSwipe(MainTab, MainTabSwipeDirection): MainTab?`.
- Produces: `AppRoute.Terminals` and `AppRoute.Terminal.returnToTerminals: Boolean`.

- [x] **Step 1: Add failing tab and route tests**

Add assertions that `MainTab.entries` is `[Hosts, Projects, Terminals]`, `MainTab.Terminals` uses `MainTabIconKind.Terminal`, swipe projection follows the three-tab order, `AppRoute.Terminals` exists, and `AppRoute.terminal(record, returnToTerminals = true)` retains the hint.

- [x] **Step 2: Run focused tests and verify RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.ui.navigation.MainTabBarTest" \
  --tests "dev.hobgoblin.android.navigation.AppRouteTest"
```

Expected: compilation fails because the new tab, icon, swipe projection, route, and return hint do not exist.

- [x] **Step 3: Implement the minimal contracts**

Extend the sealed route and enum. Use an explicit pure swipe projection:

```kotlin
internal enum class MainTabSwipeDirection { Previous, Next }

internal fun mainTabAfterSwipe(tab: MainTab, direction: MainTabSwipeDirection): MainTab? {
    val nextIndex = tab.ordinal + if (direction == MainTabSwipeDirection.Next) 1 else -1
    return MainTab.entries.getOrNull(nextIndex)
}
```

Add a hand-built 24dp terminal glyph to the existing dependency-free icon set.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: both test classes pass.

### Task 2: Lock the terminal-overview projection and presentation

**Files:**

- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionStateTest.kt`
- Create: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionState.kt`
- Create: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt`

**Interfaces:**

- Produces: `terminalOverviewOrderedSessions(List<TerminalSessionRecord>): List<TerminalSessionRecord>`.
- Produces: `terminalOverviewTitle(TerminalSessionRecord): String` and `terminalOverviewContext(TerminalSessionRecord): String`.
- Produces: `TerminalsScreen(sessions, onOpenTerminalSession)`.

- [x] **Step 1: Add failing projection tests**

Create records covering Host/Project sources and all five statuses. Assert no record is filtered, starting/running come first, and each status group is recent-first with deterministic ties.

- [x] **Step 2: Add failing presentation tests**

Assert these exact fallbacks:

```kotlin
assertEquals("custom", terminalOverviewTitle(record.copy(displayName = "custom")))
assertEquals("terminal-3", terminalOverviewTitle(record.copy(displayName = "", terminalId = 3)))
assertEquals("Host terminal", terminalOverviewTitle(record.copy(displayName = "", terminalId = null)))
assertEquals("Example - /srv/example", terminalOverviewContext(record))
```

- [x] **Step 3: Run focused tests and verify RED**

```sh
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalInteractionStateTest" \
  --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalsScreenStateTest"
```

Expected: compilation fails because the overview projection and screen helpers do not exist.

- [x] **Step 4: Implement the pure projection and read-only screen**

Reuse the existing active/inactive priority comparator in `TerminalInteractionState.kt`. Render `TerminalsScreen` as a padded `LazyColumn` of clickable Material 3 cards. Each card shows title, target context, the compact lowercase record status, and an `Open` text button. Render `No terminals` plus `Existing Host and Project terminal sessions will appear here.` when empty. Do not add mutation callbacks.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 3. Expected: both test classes pass.

### Task 3: Compose the third tab and preserve its return destination

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/navigation/MainTabShell.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`

**Interfaces:**

- Consumes: `MainTab.Terminals`, `AppRoute.Terminals`, `TerminalsScreen`, and `returnToTerminals` from Tasks 1–2.
- Produces: a third retained `terminalsContent` pane and end-to-end route wiring.

- [x] **Step 1: Add the return-path regression assertions**

Extend route tests to prove the default `AppRoute.terminal(record)` hint remains false and the explicit overview form remains true after switching to another record.

- [x] **Step 2: Run the route test and verify RED**

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.navigation.AppRouteTest"
```

Expected: the preservation assertion fails before application routing is updated.

- [x] **Step 3: Extend `MainTabShell`**

Add `terminalsContent`, title `Terminals`, no add action for that tab, a third `MainTabPane`, and use `mainTabAfterSwipe` from Task 1 instead of two hard-coded swipe branches.

- [x] **Step 4: Wire `HobgoblinAndroidApp`**

Map `MainTab.Terminals` to `AppRoute.Terminals`, render the main shell for all three root routes, and pass the observed `terminalSessions` into `TerminalsScreen`. Before opening, re-read `terminalSessionManager.session(session.id)`; ignore the click if the record disappeared. Touch the retained record, then navigate with `AppRoute.terminal(record, returnToTerminals = true)`.

When switching global sessions, preserve `currentRoute.returnToTerminals`. On back, perform existing Host temporary cleanup first when applicable, then choose `AppRoute.Terminals` when the hint is true; otherwise keep the existing Host/Project/Diagnostics destination.

- [ ] **Step 5: Run focused and full Android verification**

```sh
./gradlew testDebugUnitTest
./gradlew lintDebug
./gradlew assembleDebug
```

Expected: all commands pass.

Execution result: the focused feature tests, `lintDebug`, and `assembleDebug` pass. The full Android suite runs 381 tests and is currently blocked by one unrelated concurrent diagnostics failure in `SshDiagnosticsServiceTest`.

### Task 4: Verify repository-wide boundaries and scope

**Files:**

- Review only: all files changed by Tasks 1–3.

**Interfaces:**

- Consumes: the completed Android feature.
- Produces: verification evidence with no additional feature scope.

- [ ] **Step 1: Run root validation**

From the repository root:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands pass.

Execution result: `bun run typecheck` and `bun run check:architecture` pass. `bun run test` is blocked by the existing Node `--localstorage-file` environment issue and unrelated server/system test timeouts; no failing root test imports or exercises the Android feature.

- [x] **Step 2: Inspect the final diff**

```sh
git diff --check
git status --short
git diff -- CONTEXT.md docs/superpowers android/app/src
```

Expected: no whitespace errors; only the glossary, design/plan documents, and Android navigation/presentation/tests are changed. No dependency, persistence, SSH, tmux, or desktop/web source changes.

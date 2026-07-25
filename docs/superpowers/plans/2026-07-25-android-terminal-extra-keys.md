# Android Terminal Extra Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Termux-compatible Android terminal extra-key rows, retain Hobgoblin actions in a prioritized third row, and start the app on Hosts.

**Architecture:** Keep terminal key definitions and translation pure in `TerminalInteractionState.kt`, while `TerminalScreen.kt` owns transient modifier state and Compose rendering. Route initialization remains a pure navigation decision in `AppRoute.kt`; no state is persisted and no protocol boundary changes.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, Termux terminal `KeyHandler`, JUnit 4, Gradle.

## Global Constraints

- The first two rows are exactly `ESC / - HOME ↑ END PGUP` and `TAB CTRL ALT ← ↓ → PGDN`.
- `CTRL` and `ALT` are visible one-shot modifiers and never persist across terminal destinations.
- Existing Hobgoblin shortcuts and operations remain in a horizontally scrollable third row.
- `Reconnect` is always the first third-row action and is disabled while reconnect is unavailable.
- Ordinary launch always starts on Hosts; explicit retained-terminal navigation still overrides it.
- No new dependencies, persistence, SSH, server, desktop, or web changes.
- Do not create a Git commit unless the user separately requests it.

---

### Task 1: Model and render the three terminal key rows

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionState.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/AndroidTerminalViewport.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/HobgoblinTerminalView.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInputTranslator.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionStateTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInputTranslatorTest.kt`

**Interfaces:**
- Produces: `TerminalExtraKey`, `TerminalTermuxExtraKeyRows`, `terminalExtraKeyLabel`, and `terminalExtraKeyBytes` for rendering and input.
- Produces: modifier-aware text translation that returns the bytes to send and whether sticky modifiers were consumed.
- Consumes: existing `terminalKeyBytes`, terminal emulator cursor/keypad modes, `terminalReconnectAvailable`, and terminal send callbacks.

- [x] **Step 1: Write failing row-order and modifier tests**

Add assertions that the rows are exactly:

```kotlin
assertEquals(
    listOf("ESC", "/", "-", "HOME", "↑", "END", "PGUP"),
    TerminalTermuxExtraKeyRows[0].map { terminalExtraKeyLabel(it, false, false) },
)
assertEquals(
    listOf("TAB", "CTRL", "ALT", "←", "↓", "→", "PGDN"),
    TerminalTermuxExtraKeyRows[1].map { terminalExtraKeyLabel(it, false, false) },
)
assertEquals("CTRL on", terminalExtraKeyLabel(TerminalExtraKey.Control, true, false))
assertEquals("ALT on", terminalExtraKeyLabel(TerminalExtraKey.Alt, false, true))
```

Assert standard sequences and modifiers through `terminalExtraKeyBytes`, including `HOME`, `PGDN`, `CTRL+↑`, and `ALT+→`. Assert modifier-aware software text prefixes Alt with escape and maps Ctrl letters to control bytes.

- [x] **Step 2: Run focused tests and verify failure**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalInteractionStateTest" --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalInputTranslatorTest"
```

Expected: compilation fails because the extra-key model and modifier-aware translator do not exist yet.

- [x] **Step 3: Add the minimal pure key model and translation**

Define the fourteen standard extra keys and the immutable two-row order in `TerminalInteractionState.kt`. Route special keys through `terminalKeyBytes`; route `/` and `-` through the modifier-aware printable translation. Keep label and translation `when` expressions exhaustive.

In `TerminalInputTranslator.kt`, return a small value object containing `bytes` and `consumedStickyModifiers`. Preserve existing `terminalTextBytes` behavior when no sticky modifier is active, prefix Alt input with escape, and reuse `terminalControlCharacter` for Ctrl letters.

- [x] **Step 4: Render standard rows and preserve custom actions in row three**

Replace the parallel label/action arrays in `HelperKeyRow` with an exhaustive `TerminalExtraKey` dispatcher. Keep both standard rows horizontally scrollable.

Create one third action row with this leading order:

```text
Reconnect  ENTER  ⌫  CTRL+C  CTRL+L  Paste
```

Append existing global/workspace switching buttons, Command, Fit width, appearance, and Focus after those input shortcuts. Always render `Reconnect` and bind `enabled = reconnectEnabled`.

- [x] **Step 5: Connect one-shot modifiers to viewport input**

Pass `ctrlModifierActive`, `altModifierActive`, and an `onStickyModifiersConsumed` callback through `AndroidTerminalViewport` into `HobgoblinTerminalView`. Apply sticky modifiers to software-keyboard committed text and clear both after the next input attempt. Physical hardware key events continue to use `KeyEvent` modifier flags and do not mutate sticky state.

Reset both modifiers when the active session or destination changes. Explicit `CTRL+C` and `CTRL+L` clear both after sending.

- [x] **Step 6: Run focused tests and verify pass**

Run the focused Gradle command from Step 2.

Expected: all selected tests pass.

### Task 2: Make Hosts the initial main tab

**Files:**
- Modify: `android/app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`

**Interfaces:**
- Produces: `initialMainRoute(): AppRoute`, which always returns `AppRoute.Hosts`.
- Consumes: the existing terminal navigation request effect, which remains able to replace the initial route.

- [x] **Step 1: Write the failing initial-route test**

```kotlin
@Test
fun `ordinary launch starts on hosts`() {
    assertEquals(AppRoute.Hosts, initialMainRoute())
}
```

- [x] **Step 2: Run the focused test and verify failure**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.navigation.AppRouteTest"
```

Expected: compilation fails because `initialMainRoute` does not exist.

- [x] **Step 3: Implement and consume the initial-route decision**

Add this pure helper to `AppRoute.kt`:

```kotlin
internal fun initialMainRoute(): AppRoute = AppRoute.Hosts
```

Initialize `HobgoblinAndroidApp` route with `remember { mutableStateOf(initialMainRoute()) }`. Keep `initialRepositories` only for repository state loading.

- [x] **Step 4: Run the focused navigation test and verify pass**

Run the command from Step 2.

Expected: all `AppRouteTest` tests pass.

### Task 3: Full verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all Task 1 and Task 2 behavior.
- Produces: verification evidence for Android and repository architecture boundaries.

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

- [x] **Step 3: Review the final diff**

Confirm the diff is limited to the design/plan, Android terminal keyboard behavior/tests, and initial route/tests. Confirm there are no dependency, persistence, SSH, server, desktop, or web changes.

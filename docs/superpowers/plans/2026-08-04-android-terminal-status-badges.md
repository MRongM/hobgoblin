# Android Terminal Status Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pale terminal-card state backgrounds with compact, high-contrast status badges in the Android Terminals tab.

**Architecture:** Keep `TerminalSessionStatus` and all lifecycle behavior unchanged. Project each status into a presentation-only tone in `TerminalsScreen.kt`, render that tone as a filled badge in the existing title row, and return the card body to the normal themed surface.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, JUnit 4, Gradle.

## Global Constraints

- Running is green; disconnected and failed are red; exited is gray; starting is neutral.
- Every badge retains the localized status label so color is not the only signal.
- Do not change terminal lifecycle, persistence, ordering, navigation, or actions.
- Do not add dependencies or new status values.
- Do not create a branch or Git commit because the user did not request Git operations.

---

### Task 1: Correct the status-to-tone projection

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`

**Interfaces:**
- Consumes: `TerminalSessionStatus`.
- Produces: `terminalOverviewTone(status: TerminalSessionStatus): TerminalOverviewTone`, where disconnected and failed share `Alert`, exited remains distinct, and running/starting retain their existing categories.

- [x] **Step 1: Write the failing tone-projection test**

Replace the existing tone test with assertions that require `Disconnected` and `Failed` to share one tone while `Exited` remains different:

```kotlin
@Test
fun `terminal overview badge tone follows lifecycle meaning`() {
    assertEquals(TerminalOverviewTone.Neutral, terminalOverviewTone(TerminalSessionStatus.Starting))
    assertEquals(TerminalOverviewTone.Running, terminalOverviewTone(TerminalSessionStatus.Running))
    val alertTone = terminalOverviewTone(TerminalSessionStatus.Disconnected)
    assertEquals(alertTone, terminalOverviewTone(TerminalSessionStatus.Failed))
    assertFalse(alertTone == terminalOverviewTone(TerminalSessionStatus.Exited))
}
```

- [x] **Step 2: Run the focused test and verify RED**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.terminals.TerminalsScreenStateTest"
```

Expected: FAIL because `Failed` currently shares the exited tone instead of the disconnected alert tone.

- [x] **Step 3: Implement the minimal tone projection**

Use presentation names rather than lifecycle names for the shared visual category:

```kotlin
internal enum class TerminalOverviewTone {
    Neutral,
    Running,
    Alert,
    Exited,
}

internal fun terminalOverviewTone(status: TerminalSessionStatus): TerminalOverviewTone = when (status) {
    TerminalSessionStatus.Starting -> TerminalOverviewTone.Neutral
    TerminalSessionStatus.Running -> TerminalOverviewTone.Running
    TerminalSessionStatus.Disconnected,
    TerminalSessionStatus.Failed,
    -> TerminalOverviewTone.Alert
    TerminalSessionStatus.Exited -> TerminalOverviewTone.Exited
}
```

- [x] **Step 4: Re-run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 2: Render a high-emphasis header badge on a neutral card

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`

**Interfaces:**
- Consumes: `terminalOverviewTone` and `terminalOverviewStatusText`.
- Produces: private composable `TerminalOverviewStatusBadge(session: TerminalSessionRecord)`.

- [x] **Step 1: Write the failing presentation contract**

Replace the obsolete card-background contract with:

```kotlin
@Test
fun `terminal overview uses a status badge on a neutral card`() {
    val source = terminalsScreenSource()

    assertTrue(source.contains("TerminalOverviewStatusBadge(session)"))
    assertTrue(source.contains("containerColor = MaterialTheme.colorScheme.surface"))
    assertFalse(source.contains("terminalOverviewContainerColor("))
}
```

- [x] **Step 2: Run the focused test and verify RED**

Run the focused command from Task 1. Expected: FAIL because the title row still renders plain status text and the card still derives its background from status.

- [x] **Step 3: Implement the status badge**

Import Material 3 `Surface`. Remove `terminalOverviewContainerColor` and render the badge with these semantic pairs:

```kotlin
@Composable
private fun TerminalOverviewStatusBadge(session: TerminalSessionRecord) {
    val (containerColor, contentColor) = when (terminalOverviewTone(session.status)) {
        TerminalOverviewTone.Neutral ->
            MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        TerminalOverviewTone.Running -> HobgoblinColors.Success to Color.White
        TerminalOverviewTone.Alert ->
            MaterialTheme.colorScheme.error to MaterialTheme.colorScheme.onError
        TerminalOverviewTone.Exited -> MaterialTheme.colorScheme.onSurface
            .copy(alpha = 0.18f)
            .compositeOver(MaterialTheme.colorScheme.surface) to MaterialTheme.colorScheme.onSurface
    }

    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            terminalOverviewStatusText(session).resolve(),
            modifier = Modifier.padding(
                horizontal = HobgoblinSpacing.Sm,
                vertical = HobgoblinSpacing.Xs,
            ),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
```

Set the card `containerColor` to `MaterialTheme.colorScheme.surface`, and replace the plain title-row status `Text` with `TerminalOverviewStatusBadge(session)`.

- [x] **Step 4: Re-run the focused test and verify GREEN**

Run the focused command from Task 1. Expected: PASS.

### Task 3: Verify the complete change

**Files:**
- Verify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`
- Verify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-08-04-android-terminal-status-badges-design.md`

**Interfaces:**
- Consumes: the completed status badge implementation.
- Produces: verified Android tests/build and repository checks.

- [x] **Step 1: Run all Android unit tests and assemble the debug APK**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 2: Run repository verification**

Run from the repository root:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: every command exits successfully with no new warning or architecture violation.

- [x] **Step 3: Review the scoped diff**

```bash
git diff -- "CONTEXT.md" "docs/superpowers/specs/2026-08-04-android-terminal-status-badges-design.md" "docs/superpowers/plans/2026-08-04-android-terminal-status-badges.md" "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt" "android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt"
```

Expected: only the documented status presentation, its tests, and supporting documentation changed.

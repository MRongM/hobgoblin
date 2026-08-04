# Android Terminal Recency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort Android Terminals-tab cards by newest retained opened time, show that time on every card, and give neutral cards a clear outline.

**Architecture:** Keep `openedAt` immutable and change only the Terminals-tab presentation projection. Use a dedicated descending comparator, Android's locale-aware relative-time formatter, aligned string resources, and Material 3's outlined-card primitive; do not change the terminal model or store.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Android `DateUtils`, JUnit 4, Gradle.

## Global Constraints

- Sort only the Android main-navigation Terminals tab by `openedAt` descending.
- Use session ID ascending as the deterministic equal-time tie breaker.
- Describe `openedAt`, never `lastActivityAt` or reconnect time.
- Keep Project/workspace terminal ordering and terminal cycling unchanged.
- Preserve the status badge implementation already present in the worktree.
- Add no timestamp field, migration, dependency, refresh timer, setting, or server synchronization.
- Keep English, Simplified Chinese, Japanese, and Korean resources aligned.
- Do not create a branch or Git commit because the user did not request Git operations.

---

### Task 1: Sort the Terminals tab newest-first

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalInteractionStateTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalInteractionState.kt`

**Interfaces:**
- Consumes: `TerminalSessionRecord.openedAt` and `TerminalSessionRecord.id`.
- Produces: `terminalOverviewOrderedSessions(sessions: List<TerminalSessionRecord>): List<TerminalSessionRecord>` ordered by `openedAt` descending then ID ascending.

- [x] **Step 1: Write the failing newest-first assertions**

Rename the overview ordering test and change its expected IDs to:

```kotlin
assertEquals(
    listOf("disconnected", "starting", "failed", "temporary-running", "exited"),
    terminalOverviewOrderedSessions(sessions).map { it.id },
)
```

In the status-stability test, change only the initial expected order to:

```kotlin
assertEquals(listOf("session-b", "session-a"), initialOrder)
assertEquals(initialOrder, changedOrder)
```

Keep the existing equal-time expectation `listOf("session-a", "session-b")` to protect ascending ID tie-breaking.

- [x] **Step 2: Run the focused ordering test and verify RED**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.terminals.TerminalInteractionStateTest"
```

Expected: FAIL because the overview currently sorts `openedAt` ascending.

- [x] **Step 3: Add a Terminals-tab-only descending comparator**

Leave `terminalWorkspaceCreatedSessionComparator` unchanged and add:

```kotlin
private val terminalOverviewOpenedSessionComparator: Comparator<TerminalSessionRecord> =
    compareByDescending<TerminalSessionRecord> { it.openedAt }
        .thenBy { it.id }
```

Use it only in the overview projection:

```kotlin
internal fun terminalOverviewOrderedSessions(
    sessions: List<TerminalSessionRecord>,
): List<TerminalSessionRecord> = sessions.sortedWith(terminalOverviewOpenedSessionComparator)
```

- [x] **Step 4: Re-run the focused ordering test and verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 2: Show relative opened time and outline each card

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`

**Interfaces:**
- Consumes: `TerminalSessionRecord.openedAt`, `System.currentTimeMillis()`, and `DateUtils.getRelativeTimeSpanString`.
- Produces: `terminalOverviewOpenedText(relativeTime: CharSequence): LocalizedText` and an outlined `TerminalOverviewRow` with one opened-time metadata line.

- [x] **Step 1: Write the failing presentation contract**

Add this source contract to `TerminalsScreenStateTest`:

```kotlin
@Test
fun `terminal overview shows opened time on clearly separated cards`() {
    val source = terminalsScreenSource()

    assertTrue(source.contains("internal fun terminalOverviewOpenedText(relativeTime: CharSequence)"))
    assertTrue(source.contains("LocalizedText(R.string.terminals_opened_at"))
    assertTrue(source.contains("DateUtils.getRelativeTimeSpanString("))
    assertTrue(source.contains("session.openedAt"))
    assertTrue(source.contains("OutlinedCard("))
    assertTrue(source.contains("CardDefaults.outlinedCardColors("))
    assertTrue(source.contains("verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)"))
}
```

- [x] **Step 2: Run the focused screen test and verify RED**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.terminals.TerminalsScreenStateTest"
```

Expected: FAIL because there is no opened-time projection or outlined terminal card.

- [x] **Step 3: Add aligned localized copy**

Add `terminals_opened_at` beside the other `terminals_*` metadata resources:

```xml
<!-- values/strings.xml -->
<string name="terminals_opened_at">opened %1$s</string>

<!-- values-b+zh+Hans/strings.xml -->
<string name="terminals_opened_at">打开于%1$s</string>

<!-- values-ja/strings.xml -->
<string name="terminals_opened_at">開始：%1$s</string>

<!-- values-ko/strings.xml -->
<string name="terminals_opened_at">열림: %1$s</string>
```

- [x] **Step 4: Implement the opened-time line and outlined card**

Import `android.text.format.DateUtils` and Material 3 `OutlinedCard`. Replace `Card` with `OutlinedCard`, and replace `CardDefaults.cardColors` with:

```kotlin
colors = CardDefaults.outlinedCardColors(
    containerColor = MaterialTheme.colorScheme.surface,
    contentColor = MaterialTheme.colorScheme.onSurface,
),
```

Add the focused text projection:

```kotlin
internal fun terminalOverviewOpenedText(relativeTime: CharSequence): LocalizedText =
    LocalizedText(R.string.terminals_opened_at, listOf(relativeTime))
```

Below the location row and before `TerminalSessionIdentityDetails`, render:

```kotlin
Text(
    terminalOverviewOpenedText(
        DateUtils.getRelativeTimeSpanString(
            session.openedAt,
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
        ),
    ).resolve(),
    modifier = Modifier.fillMaxWidth(),
    style = MaterialTheme.typography.labelSmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
)
```

- [x] **Step 5: Re-run the focused screen test and verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 3: Verify the complete change

**Files:**
- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-08-04-android-terminal-recency-design.md`
- Verify: all files changed in Tasks 1 and 2.

**Interfaces:**
- Consumes: the completed recency and card presentation implementation.
- Produces: verified Android tests/build, locale alignment, and repository checks.

- [x] **Step 1: Run all Android tests, Lint, and debug assembly**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` with no localization or Compose regression.

- [x] **Step 2: Run root repository verification**

Run from the repository root:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: all commands exit successfully.

- [x] **Step 3: Review the scoped diff**

Confirm the implementation changes only the Terminals-tab comparator, card presentation/tests, four locale files, glossary, and planning documents. Preserve the pre-existing status-badge worktree changes and do not commit.

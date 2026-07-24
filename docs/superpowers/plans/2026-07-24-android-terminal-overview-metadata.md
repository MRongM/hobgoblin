# Android Terminal Overview Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show compact native/tmux identity metadata and useful session identifiers on Android terminal items in both the global overview and Project terminal lists.

**Architecture:** Add terminal-feature presentation projections and a shared Compose renderer, then consume that renderer from both terminal list surfaces without changing the session model or lifecycle. Native and tmux records share one summary line; only tmux records add their full protocol session name.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, JUnit 4, Gradle

## Global Constraints

- Keep the feature read-only and Android-only.
- Render identical identity details in the global `Terminals` overview and Project terminal rows.
- Classify a record as `tmux` only from its retained `tmuxIdentity`; otherwise classify it as `native`.
- Show the first eight characters of the Android record ID and never abbreviate the tmux protocol session name in the projected value.
- Preserve the existing Android tmux protocol v1 public reference vector.
- Preserve existing title, context, status, ordering, navigation, and `Open` behavior.
- Use the platform monospace family for identifier text while preserving the existing Material 3 color and spacing tokens.
- Add no dependencies, persistence fields, remote probes, or lifecycle mutations.
- Do not create a Git commit unless the user explicitly requests it.

---

### Task 1: Project and render shared terminal identity metadata

**Files:**

- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Create: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalSessionDetails.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt`

**Interfaces:**

- Consumes: `TerminalSessionRecord.id: String` and `TerminalSessionRecord.tmuxIdentity: TmuxSessionIdentity?`
- Produces: `terminalSessionIdentitySummary(session: TerminalSessionRecord): String`
- Produces: `terminalSessionTmuxSessionName(session: TerminalSessionRecord): String?`
- Produces: `TerminalSessionIdentityDetails(session: TerminalSessionRecord)`

- [x] **Step 1: Write failing projection tests**

Extend the test fixture with `id` and `tmuxIdentity`, then add these tests:

```kotlin
@Test
fun `terminal overview identity summary shows native kind and short Android session id`() {
    assertEquals(
        "native · session 12345678",
        terminalSessionIdentitySummary(record(id = "12345678-90ab-cdef")),
    )
    assertEquals(
        "native · session short",
        terminalSessionIdentitySummary(record(id = "short")),
    )
}

@Test
fun `terminal overview identity summary classifies retained tmux identity`() {
    assertEquals(
        "tmux · session abcdef12",
        terminalSessionIdentitySummary(
            record(id = "abcdef12-3456", tmuxIdentity = tmuxIdentity()),
        ),
    )
}

@Test
fun `terminal overview exposes full tmux session name only for tmux records`() {
    val identity = tmuxIdentity()

    assertEquals(identity.sessionName, terminalSessionTmuxSessionName(record(tmuxIdentity = identity)))
    assertNull(terminalSessionTmuxSessionName(record()))
}
```

Add `assertNull`, `TmuxSessionIdentity`, and this privacy-safe fixture:

```kotlin
private fun tmuxIdentity(): TmuxSessionIdentity = TmuxSessionIdentity(
    sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
    initialPath = "/srv/example",
)
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```sh
cd android
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.terminals.TerminalsScreenStateTest"
```

Expected: compilation fails because `terminalSessionIdentitySummary` and `terminalSessionTmuxSessionName` do not exist.

- [x] **Step 3: Implement the minimal projections**

Create the terminal-feature presentation file with the pure projections and shared renderer:

```kotlin
internal fun terminalSessionIdentitySummary(session: TerminalSessionRecord): String {
    val kind = if (session.tmuxIdentity == null) "native" else "tmux"
    return "$kind · session ${session.id.take(8)}"
}

internal fun terminalSessionTmuxSessionName(session: TerminalSessionRecord): String? =
    session.tmuxIdentity?.sessionName

@Composable
internal fun TerminalSessionIdentityDetails(session: TerminalSessionRecord) {
    Text(
        terminalSessionIdentitySummary(session),
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontFamily = FontFamily.Monospace,
    )
    terminalSessionTmuxSessionName(session)?.let { sessionName ->
        Text(
            "tmux session: $sessionName",
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
        )
    }
}
```

- [x] **Step 4: Render the projections in the existing card**

After the target context text and before the existing `Open` row, render the shared component:

```kotlin
TerminalSessionIdentityDetails(session = session)
```

Do not add a maximum line count to the tmux name; allow it to wrap so the complete value remains visible.

- [x] **Step 5: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: `BUILD SUCCESSFUL` and all `TerminalsScreenStateTest` tests pass.

### Task 2: Render shared identity details in Project terminal rows

**Files:**

- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreenContractTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`

**Interfaces:**

- Consumes: `TerminalSessionIdentityDetails(session: TerminalSessionRecord)` from Task 1.
- Produces: Project `TerminalSessionRow` cards containing the same identity detail presentation as the global overview.

- [x] **Step 1: Write the failing Project row contract test**

Add:

```kotlin
@Test
fun `project terminal rows render shared terminal identity details`() {
    val source = repositorySetupScreenSource()

    assertTrue(source.contains("TerminalSessionIdentityDetails(session = session)"))
}
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```sh
cd android
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupScreenContractTest"
```

Expected: the new assertion fails because `TerminalSessionRow` does not yet render the shared detail component.

- [x] **Step 3: Render the shared details**

Import `TerminalSessionIdentityDetails`, then insert it after `terminalSessionActivityText(session)` and before the action row:

```kotlin
TerminalSessionIdentityDetails(session = session)
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: `BUILD SUCCESSFUL` and `RepositorySetupScreenContractTest` passes.

### Task 3: Verify the combined Android tmux scan and terminal-list metadata changes

**Files:**

- Verify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt`
- Verify: `android/app/src/test/java/dev/hobgoblin/android/terminals/TmuxSessionProtocolTest.kt`
- Verify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt`
- Verify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalSessionDetails.kt`
- Verify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Verify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Verify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreenContractTest.kt`

**Interfaces:**

- Consumes: the completed Task 1 shared presentation, Task 2 Project integration, and the corrected real-tab tmux listing format.
- Produces: verified Android debug artifacts and final scope evidence.

- [x] **Step 1: Run all Android unit tests**

```sh
cd android
./gradlew testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

The suite must include `TmuxSessionProtocolTest.identity matches the public desktop reference vector`, which expects `hobgoblin-v1-aebf050981ac829e36100020`.

- [x] **Step 2: Run Android lint and debug assembly**

```sh
cd android
./gradlew lintDebug assembleDebug
```

Expected: `BUILD SUCCESSFUL` with no lint errors.

- [x] **Step 3: Inspect the final diff**

```sh
git diff --check
git diff -- android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt android/app/src/test/java/dev/hobgoblin/android/terminals/TmuxSessionProtocolTest.kt android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalSessionDetails.kt android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreen.kt android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalsScreenStateTest.kt android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreenContractTest.kt docs/superpowers/specs/2026-07-24-android-terminal-overview-metadata-design.md docs/superpowers/plans/2026-07-24-android-terminal-overview-metadata.md
```

Expected: no whitespace errors; the diff contains only the tmux scan delimiter fix, shared terminal-list metadata, Project integration, tests, and their design/plan documentation.

# Android tmux Scan Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped button that rescans running, discoverable Hobgoblin tmux sessions and refreshes the existing Android terminal list.

**Architecture:** Keep discovery orchestration in `RepositoryWorkspaceScreen`, where repository action errors and discovery paths already live. Share one guarded suspend function between automatic and manual discovery, and pass only presentation state plus an action callback down to the Remote SSH panel.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Kotlin coroutines, JUnit 4, Gradle.

## Global Constraints

- Keep the existing automatic scan when the Terminals tab becomes available.
- Scan only the current project root and usable worktree paths returned by `repositoryTmuxDiscoveryPaths`.
- Reuse the existing remote discovery and recovery callback; do not expose arbitrary tmux sessions.
- Keep tmux startup and native-shell fallback in mutually exclusive branches.
- Use sentence case for the `Scan tmux` button.
- Do not add dependencies, create a branch, or make Git commits.

---

### Task 1: Define and test scan action presentation state

**Files:**
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`

**Interfaces:**
- Produces: `tmuxScanButtonLabel(isScanning: Boolean): String`
- Produces: `canScanTmux(isScanning: Boolean, discoveryPaths: List<String>?): Boolean`

- [x] **Step 1: Write failing state tests**

```kotlin
@Test
fun `tmux scan action exposes stable ready and pending labels`() {
    assertEquals("Scan tmux", tmuxScanButtonLabel(isScanning = false))
    assertEquals("Scanning...", tmuxScanButtonLabel(isScanning = true))
}

@Test
fun `tmux scan action requires paths and rejects reentry`() {
    assertFalse(canScanTmux(isScanning = false, discoveryPaths = null))
    assertFalse(canScanTmux(isScanning = false, discoveryPaths = emptyList()))
    assertTrue(canScanTmux(isScanning = false, discoveryPaths = listOf("/srv/app")))
    assertFalse(canScanTmux(isScanning = true, discoveryPaths = listOf("/srv/app")))
}
```

- [x] **Step 2: Run the focused test and verify it fails**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest"
```

Expected: compilation fails because `tmuxScanButtonLabel` and `canScanTmux` do not exist.

- [x] **Step 3: Add the minimal pure helpers**

```kotlin
internal fun tmuxScanButtonLabel(isScanning: Boolean): String =
    if (isScanning) "Scanning..." else "Scan tmux"

internal fun canScanTmux(isScanning: Boolean, discoveryPaths: List<String>?): Boolean =
    !isScanning && !discoveryPaths.isNullOrEmpty()
```

- [x] **Step 4: Run the focused test and verify it passes**

Run the same Gradle command. Expected: `BUILD SUCCESSFUL`.

### Task 2: Wire the guarded scan action into the Remote SSH panel

**Files:**
- Create: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreenContractTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`

**Interfaces:**
- Consumes: `onDiscoverTmuxTerminals: (List<String>) -> Unit`
- Consumes: `tmuxScanButtonLabel(isScanning: Boolean): String`
- Consumes: `canScanTmux(isScanning: Boolean, discoveryPaths: List<String>?): Boolean`
- Produces: `RepositoryTerminalPanel(..., tmuxScanPending: Boolean, tmuxScanEnabled: Boolean, onScanTmux: () -> Unit, ...)`
- Produces: `RemoteSshTerminalPanelContent(..., tmuxScanPending: Boolean, tmuxScanEnabled: Boolean, onScanTmux: () -> Unit, ...)`

- [x] **Step 1: Write a failing source contract for the visible action**

```kotlin
package dev.hobgoblin.android.ui.screens.repositories

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class RepositorySetupScreenContractTest {
    @Test
    fun `remote ssh terminal panel exposes guarded tmux scan action`() {
        val source = repositorySetupScreenSource()

        assertTrue(source.contains("onClick = onScanTmux"))
        assertTrue(source.contains("enabled = tmuxScanEnabled"))
        assertTrue(source.contains("tmuxScanButtonLabel(tmuxScanPending)"))
    }

    private fun repositorySetupScreenSource(): String {
        val candidates = listOf(
            File("src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt"),
            File("app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt"),
            File("android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt"),
        )
        return candidates.firstOrNull { it.isFile }?.readText()
            ?: error("RepositorySetupScreen.kt not found from ${File(".").absolutePath}")
    }
}
```

- [x] **Step 2: Run the contract test and verify it fails**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupScreenContractTest"
```

Expected: the assertions fail because the scan button is not wired yet.

- [x] **Step 3: Add one guarded discovery function**

In `RepositoryWorkspaceScreen`, add remembered `tmuxDiscoveryPending` state and a local suspend function:

```kotlin
var tmuxDiscoveryPending by remember(repository.id) { mutableStateOf(false) }

suspend fun discoverTmuxTerminals(paths: List<String>) {
    if (tmuxDiscoveryPending) return
    actionError = null
    tmuxDiscoveryPending = true
    try {
        runCatching {
            withContext(Dispatchers.IO) { onDiscoverTmuxTerminals(paths) }
        }.onFailure {
            actionError = it.message ?: "Tmux terminal discovery failed"
        }
    } finally {
        tmuxDiscoveryPending = false
    }
}
```

Replace the automatic effect body with `discoverTmuxTerminals(tmuxDiscoveryPaths)` and pass a manual action to the terminal panel:

```kotlin
tmuxScanPending = tmuxDiscoveryPending,
tmuxScanEnabled = canScanTmux(tmuxDiscoveryPending, tmuxDiscoveryPaths),
onScanTmux = {
    tmuxDiscoveryPaths?.let { paths ->
        scope.launch { discoverTmuxTerminals(paths) }
    }
},
```

- [x] **Step 4: Render the action in `RemoteSshTerminalPanelContent`**

Thread `tmuxScanPending`, `tmuxScanEnabled`, and `onScanTmux` through `RepositoryTerminalPanel`, then add this action after the existing tmux creation action:

```kotlin
OutlinedButton(
    modifier = Modifier.fillMaxWidth(),
    onClick = onScanTmux,
    enabled = tmuxScanEnabled,
) {
    Text(
        tmuxScanButtonLabel(tmuxScanPending),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}
```

- [x] **Step 5: Run focused Android tests**

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest" --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupScreenContractTest"
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 6: Run complete verification**

From `android/`:

```bash
./gradlew test
```

From the repository root, sequentially:

```bash
bun run typecheck
bun run test
bun run check:architecture
git diff --check
```

Expected: every command exits with status 0.

### Task 3: Prevent tmux startup from reaching the native shell fallback

**Files:**
- Modify: `android/app/src/test/java/dev/hobgoblin/android/terminals/SshTerminalStartupCommandTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/SshTerminalService.kt`

**Interfaces:**
- Consumes: `SshTerminalStartupCommand.initialInputForTarget(target, startupContext)`
- Produces: a tmux startup payload with an explicit native-shell `else` branch

- [x] **Step 1: Write a failing branch-structure regression test**

Extend `explicit tmux launch matches current attach create and mouse command`
with these assertions:

```kotlin
assertTrue(output.contains("else\n  exec \"\${SHELL:-/bin/sh}\" -l\nfi"))
assertFalse(output.contains("fi\nexec \"\${SHELL:-/bin/sh}\" -l"))
```

- [x] **Step 2: Run the focused test and verify it fails**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "dev.hobgoblin.android.terminals.SshTerminalStartupCommandTest"
```

Expected: the new branch-structure assertion fails because the login shell is
currently appended after the tmux `if` block.

- [x] **Step 3: Make the startup branches mutually exclusive**

Generate the tmux payload as:

```kotlin
add("if command -v tmux >/dev/null 2>&1; then")
add("  $tmuxCommand")
add("else")
add("  exec \"${'$'}{SHELL:-/bin/sh}\" -l")
add("fi")
```

Keep the existing unconditional native-shell line only for startup contexts
without a tmux identity.

- [x] **Step 4: Run the focused test and verify it passes**

Run the same Gradle command. Expected: `BUILD SUCCESSFUL`.

- [x] **Step 5: Include this behavior in complete verification**

Run the full verification commands from Task 2 Step 6 after all tasks are
implemented.

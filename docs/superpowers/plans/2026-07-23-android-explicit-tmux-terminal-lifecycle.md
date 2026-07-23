# Android Explicit tmux Terminal Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Android terminal creation and deletion with Hobgoblin's current deterministic tmux protocol while keeping tmux an explicit per-create choice.

**Architecture:** A pure terminal protocol module owns path/name/command rules. `TerminalSessionManager` retains the chosen identity in restorable records, a focused SSH adapter revalidates live name-plus-path association before killing, and the Compose/application write path exposes only explicit launch and close booleans.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, SSHJ, JUnit 4, Android Gradle Plugin.

## Global Constraints

- Ordinary Android terminal creation defaults to the native login shell and performs no tmux probe.
- Only the explicit tmux action uses `tmux-if-available` fallback behavior.
- Current names must match `^hobgoblin-v1-[a-f0-9]{24}$` and the documented SHA-256 serialization.
- Exact close requires both retained session name and normalized initial path to match live tmux state.
- Legacy `hobgoblin-<22 hex>` sessions are never migrated or killed.
- No tmux `session_id` is generated or supplied.
- No new dependencies are permitted.
- No Git commit is performed without the user's final explicit confirmation.

---

### Task 1: Pure Android tmux protocol and startup command

**Files:**

- Create: `android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt`
- Create: `android/app/src/test/java/dev/hobgoblin/android/terminals/TmuxSessionProtocolTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalStartupContext.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/SshTerminalService.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/terminals/SshTerminalStartupCommandTest.kt`

**Interfaces:**

- Produces: `TerminalLaunchMode`, `TmuxSessionDescriptor`, `TmuxSessionIdentity`, `RemoteTmuxSession`, and `TmuxSessionProtocol`.
- Produces: `TerminalStartupContext.tmuxIdentity: TmuxSessionIdentity?`.
- Consumes: the public protocol in `docs/terminal-tmux-protocol.md` and the desktop reference vector.

- [ ] **Step 1: Add failing protocol tests**

Cover these exact expectations before implementation:

```kotlin
assertEquals(
    "hobgoblin-v1-aebf050981ac829e36100020",
    TmuxSessionProtocol.identity(
        TmuxSessionDescriptor(
            projectRoot = "/srv/projects/example",
            workingDirectory = "/srv/projects/example/worktrees/feature",
            terminalNumber = 1,
        ),
    )?.sessionName,
)
assertEquals("/srv/repo/other", TmuxSessionProtocol.normalizePath("/srv//repo/feature/../other/"))
assertNull(TmuxSessionProtocol.normalizePath("srv/repo"))
assertNull(TmuxSessionProtocol.normalizePath("/srv/repo\nfeature"))
```

Also test strict tab-delimited tmux-list parsing, current-name validation, and exact pair matching.

- [ ] **Step 2: Run the focused tests and verify RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.TmuxSessionProtocolTest"
```

Expected: compilation fails because `TmuxSessionProtocol` does not exist.

- [ ] **Step 3: Implement the minimal pure protocol**

Implement these stable signatures:

```kotlin
enum class TerminalLaunchMode { Native, TmuxIfAvailable }

data class TmuxSessionDescriptor(
    val projectRoot: String,
    val workingDirectory: String,
    val terminalNumber: Int,
)

data class TmuxSessionIdentity(
    val sessionName: String,
    val initialPath: String,
)

data class RemoteTmuxSession(
    val sessionName: String,
    val sessionPath: String,
)

object TmuxSessionProtocol {
    fun normalizePath(value: String): String?
    fun identity(descriptor: TmuxSessionDescriptor): TmuxSessionIdentity?
    fun isCurrentSessionName(value: String): Boolean
    fun parseSessionList(output: String): List<RemoteTmuxSession>?
    fun matches(identity: TmuxSessionIdentity, session: RemoteTmuxSession): Boolean
    fun listSessionsScript(): String
    fun killSessionScript(sessionName: String): String?
}
```

Use lexical POSIX segment normalization, a 4,096-character limit, ASCII-control rejection, UTF-8 SHA-256, and safe single-quote shell quoting.

- [ ] **Step 4: Make startup intent explicit**

Extend `TerminalStartupContext` with `tmuxIdentity: TmuxSessionIdentity? = null`. Replace the old Android hash builder in `SshTerminalStartupCommand` with the retained identity. Native project startup must contain no `tmux`; explicit tmux startup must contain:

```text
command -v tmux >/dev/null 2>&1
exec tmux new-session -A -s '<name>' -c '<path>' \; set-option -t '=<name>:' mouse on
```

and then the native login-shell fallback. Keep temporary-terminal behavior unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

```sh
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.terminals.TmuxSessionProtocolTest" \
  --tests "dev.hobgoblin.android.terminals.SshTerminalStartupCommandTest"
```

Expected: both test classes pass.

### Task 2: Retained tmux identity and backward-compatible persistence

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalSessionModels.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalSessionManager.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/data/TerminalSessionStore.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/terminals/TerminalSessionManagerTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/data/TerminalSessionStoreTest.kt`

**Interfaces:**

- Consumes: `TerminalLaunchMode` and `TmuxSessionProtocol.identity` from Task 1.
- Produces: `TerminalSessionRecord.tmuxIdentity: TmuxSessionIdentity?`.
- Produces: `TerminalSessionManager.createNew(..., launchMode: TerminalLaunchMode = TerminalLaunchMode.Native)`.

- [ ] **Step 1: Add failing manager and codec tests**

Prove that:

```kotlin
val native = manager.createNew(...)
assertNull(native.tmuxIdentity)

val tmux = manager.createNew(..., launchMode = TerminalLaunchMode.TmuxIfAvailable)
assertEquals("hobgoblin-v1-...", tmux.tmuxIdentity?.sessionName)
assertEquals("/srv/repo-feature", tmux.tmuxIdentity?.initialPath)
```

Also prove reconnect keeps an identical valid identity, temporary terminals remain native, the codec round-trips both fields, and a legacy 15-field payload decodes with `tmuxIdentity == null`.

- [ ] **Step 2: Run focused tests and verify RED**

```sh
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.terminals.TerminalSessionManagerTest" \
  --tests "dev.hobgoblin.android.data.TerminalSessionStoreTest"
```

Expected: compilation fails because the record and create API do not yet expose launch identity.

- [ ] **Step 3: Implement record allocation and reconnect preservation**

Add `tmuxIdentity` to `TerminalSessionRecord`. In `createNew`, derive it only when all of these are true: the requested mode is `TmuxIfAvailable`, `repositoryRemotePath` is valid, and a positive terminal slot was allocated. Pass the same retained identity to `TerminalStartupContext`.

During reconnect, retain the identity only when recomputing from the normalized repository path, working path, and terminal number yields the exact stored pair; otherwise reconnect natively. Do not infer identity for old records.

- [ ] **Step 4: Extend the codec without breaking old payloads**

Append `tmuxIdentity.sessionName` and `tmuxIdentity.initialPath` as fields 16 and 17. Accept the existing 11-, 12-, 13-, and 15-field versions plus the new 17-field version. Construct an identity only when both new fields pass current-protocol validation.

- [ ] **Step 5: Run focused tests and verify GREEN**

```sh
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.terminals.TerminalSessionManagerTest" \
  --tests "dev.hobgoblin.android.data.TerminalSessionStoreTest"
```

Expected: both test classes pass.

### Task 3: Trusted remote exact-session close adapter

**Files:**

- Create: `android/app/src/main/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionService.kt`
- Create: `android/app/src/test/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionServiceTest.kt`

**Interfaces:**

- Consumes: `SshClientFacade`, `HostKeyTrustStore`, `TmuxSessionIdentity`, and `TmuxSessionProtocol`.
- Produces: `RemoteTmuxCloseResult` and `RemoteTmuxSessionService.closeAssociatedSession(target, identity)`.

- [ ] **Step 1: Add failing close-policy tests**

Use fake SSH and trust stores to cover:

```kotlin
assertEquals(RemoteTmuxCloseResult.Closed, service.closeAssociatedSession(target, identity))
assertEquals(RemoteTmuxCloseResult.Missing, service.closeAssociatedSession(target, wrongPathIdentity))
```

Assert that exact match runs list then kill, a same name at another path is not killed, a different name at the same path is not killed, no-server output becomes `Missing`, malformed output and tmux-unavailable become `Failed`, and kill missing becomes `Missing`.

- [ ] **Step 2: Run the focused test and verify RED**

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.RemoteTmuxSessionServiceTest"
```

Expected: compilation fails because the service does not exist.

- [ ] **Step 3: Implement trusted list-revalidate-kill orchestration**

Implement:

```kotlin
sealed interface RemoteTmuxCloseResult {
    data object Closed : RemoteTmuxCloseResult
    data object Missing : RemoteTmuxCloseResult
    data class Failed(val message: String) : RemoteTmuxCloseResult
}

class RemoteTmuxSessionService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun closeAssociatedSession(
        target: RemoteTarget,
        identity: TmuxSessionIdentity,
    ): RemoteTmuxCloseResult
}
```

Fetch and verify the host fingerprint before both commands. Revalidate the name and normalized initial path before listing. Never accept a name from the UI. Classify common no-server/no-session messages as `Missing`; preserve all other errors as `Failed`.

- [ ] **Step 4: Run the focused test and verify GREEN**

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.RemoteTmuxSessionServiceTest"
```

Expected: the test class passes.

### Task 4: Explicit Android creation controls and guarded deletion

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/MainActivity.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`

**Interfaces:**

- Consumes: `TerminalLaunchMode`, `TerminalSessionRecord.tmuxIdentity`, and `RemoteTmuxSessionService`.
- Changes: `onCreateTerminalAtPath` to `(String, TerminalLaunchMode) -> TerminalSessionRecord`.
- Changes: `onDeleteTerminalSession` to `(String, Boolean) -> Unit`, where the boolean means “also close the retained tmux session”.

- [ ] **Step 1: Add failing UI-policy tests**

Add pure state assertions that native and tmux action models map to distinct launch modes, only records with a current retained identity offer tmux close, and the delete copy describes the exact-session consequence without exposing the name as editable input.

- [ ] **Step 2: Run the focused test and verify RED**

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest"
```

Expected: compilation fails because the new launch/delete policy helpers do not exist.

- [ ] **Step 3: Wire explicit creation**

Keep “New terminal” as the primary `Native` action and add a separate full-width “New terminal with tmux” `OutlinedButton` immediately below it. Pass the selected mode through `RepositoryWorkspaceScreen` and `HobgoblinAndroidApp` into `TerminalSessionManager.createNew`. Do not store a remembered selection.

- [ ] **Step 4: Wire guarded deletion**

Create `RemoteTmuxSessionService` in `MainActivity` and pass it to `HobgoblinAndroidApp`. In the application callback, reload the record by ID. If the boolean is true, require the retained identity, close it through the adapter, and throw on `Failed`; only then call `removeSession`.

In the existing delete dialog, render an unchecked Material 3 `Checkbox` only for `session.tmuxIdentity != null`. Reset it when the target changes or the dialog closes. Disable duplicate submission while the coroutine is running. Keep the dialog and record on failure.

- [ ] **Step 5: Run focused tests and verify GREEN**

```sh
./gradlew testDebugUnitTest \
  --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest" \
  --tests "dev.hobgoblin.android.terminals.TerminalSessionManagerTest" \
  --tests "dev.hobgoblin.android.terminals.RemoteTmuxSessionServiceTest"
```

Expected: all focused test classes pass.

### Task 5: Full verification and documentation consistency

**Files:**

- Modify if required: `docs/terminal-tmux-protocol.md`
- Verify: all changed Android and documentation files.

**Interfaces:**

- Consumes: all previous tasks.
- Produces: a verified Android implementation with no architecture or protocol drift.

- [ ] **Step 1: Run Android tests and assemble**

Run from `android/`:

```sh
./gradlew testDebugUnitTest assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Run root repository checks**

Run from the repository root:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully.

- [ ] **Step 3: Run hygiene checks**

```sh
git diff --check
rg -n "hobgoblin-\[0-9a-f\]\{22\}|TmuxSessionNamePrefix = \"hobgoblin-\"" android/app/src || true
```

Expected: no whitespace errors and no maintained Android code/tests that expect the legacy tmux name format.

- [ ] **Step 4: Review the final diff against the design**

Confirm every creation path has explicit mode ownership, every retained identity has both fields, exact close lists before killing, native creation contains no tmux probe, the UI checkbox defaults false, and no unrelated files changed.

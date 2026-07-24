# Android tmux Session Discovery and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. This repository requires inline execution; do not dispatch subagents.

**Goal:** Let Android discover verified live Hobgoblin tmux sessions for the opened project, restore missing sessions as stable disconnected terminal records, and attach to them through the existing reconnect path.

**Architecture:** Shared launch builders write fixed-identity tmux session metadata. Android's protocol layer parses and verifies remote metadata against known project paths and the deterministic v1 hash; the SSH adapter reads live sessions, the terminal manager merges restorable records, and the project Terminal tab triggers the flow without owning protocol logic.

**Tech Stack:** Kotlin/JVM, Jetpack Compose, SSHJ, JUnit 4, TypeScript 6 in Node strip-only mode, Vitest, Bun.

## Global Constraints

- Preserve all unrelated dirty-worktree changes; edit only the files named by this plan and merge with current content.
- Do not create branches or run `git commit`, `git push`, or destructive Git commands.
- Use no new dependency or storage system.
- Keep tmux metadata untrusted until allowed-path and deterministic-name validation both pass.
- Use repo-alias TypeScript imports with explicit `.ts` extensions and no strip-only-unsupported syntax.
- Keep comments and user-facing copy in the existing English codebase language.
- Follow TDD for every behavior: add one focused test, run it and observe the expected failure, implement minimally, and rerun it to green.
- Run commands from `android/` for Android unit tests and from the repository root for Bun checks.

---

## File Structure

- `src/system/tmux-session.ts`: canonical TypeScript tmux metadata constants and attach-or-create shell command.
- `src/system/local-terminal.ts`: local invocation delegates tmux command construction.
- `src/system/remote-terminal.ts`: SSH invocation delegates the same tmux command construction.
- `android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt`: Android metadata constants, attach command, discovery row parsing, and deterministic verification.
- `android/app/src/main/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionService.kt`: trusted remote tmux listing and discovery result classification.
- `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalSessionModels.kt`: recovery candidate value passed into the manager.
- `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalSessionManager.kt`: idempotent recovered-record merge and persistence.
- `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`: pure trigger-path policy and Terminal-tab effect.
- `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`: compose remote discovery with candidate mapping and manager merge.
- `docs/terminal-tmux-protocol.md`: public metadata and discovery protocol.

---

### Task 1: Write current-protocol tmux metadata from every launch builder

**Files:**

- Modify: `src/system/tmux-session.ts`
- Modify: `src/system/local-terminal.ts`
- Modify: `src/system/remote-terminal.ts`
- Test: `src/system/tmux-session.test.ts`
- Test: `src/system/local-terminal.test.ts`
- Test: `src/system/remote-terminal.test.ts`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/SshTerminalService.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/TmuxSessionProtocolTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/SshTerminalStartupCommandTest.kt`

**Interfaces:**

- Produces TypeScript `buildTmuxAttachShellCommand(input: TmuxSessionDescriptor): { sessionName: string; command: string } | null`.
- Produces Kotlin `TmuxSessionProtocol.attachOrCreateCommand(identity: TmuxSessionIdentity, terminalNumber: Int): String?`.
- Writes `@hobgoblin_init_path` and `@hobgoblin_terminal_number` as exact session options.

- [ ] **Step 1: Add failing TypeScript command tests**

Assert that the public reference descriptor produces one exact command containing:

```text
exec tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature' \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_init_path '/srv/projects/example/worktrees/feature' \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_terminal_number '1'
```

Also assert local and remote builders contain both options and preserve quotes in paths through the existing shell-quoting rules.

- [ ] **Step 2: Run the focused TypeScript tests and observe RED**

Run:

```sh
bun run test -- src/system/tmux-session.test.ts src/system/local-terminal.test.ts src/system/remote-terminal.test.ts
```

Expected: FAIL because `buildTmuxAttachShellCommand` and metadata fragments do not exist.

- [ ] **Step 3: Implement one shared TypeScript command builder**

Add exported constants and the builder in `tmux-session.ts`:

```ts
export const HOBGOBLIN_TMUX_INIT_PATH_OPTION = '@hobgoblin_init_path'
export const HOBGOBLIN_TMUX_TERMINAL_NUMBER_OPTION = '@hobgoblin_terminal_number'

export function buildTmuxAttachShellCommand(
  input: TmuxSessionDescriptor,
): { sessionName: string; command: string } | null {
  const descriptor = normalizeTmuxSessionDescriptor(input)
  const sessionName = descriptor ? buildTmuxSessionName(descriptor) : null
  if (!descriptor || !sessionName) return null
  const paneTarget = `=${sessionName}:`
  return {
    sessionName,
    command: [
      `exec tmux new-session -A -s ${shellQuote(sessionName)} -c ${shellQuote(descriptor.workingDirectory)}`,
      `set-option -t ${shellQuote(paneTarget)} mouse on`,
      `set-option -t ${shellQuote(paneTarget)} ${HOBGOBLIN_TMUX_INIT_PATH_OPTION} ${shellQuote(descriptor.workingDirectory)}`,
      `set-option -t ${shellQuote(paneTarget)} ${HOBGOBLIN_TMUX_TERMINAL_NUMBER_OPTION} ${shellQuote(String(descriptor.terminalNumber))}`,
    ].join(' \\; '),
  }
}
```

Keep `shellQuote` private in the same module. Make local and remote builders consume this result rather than reconstructing the tmux command.

- [ ] **Step 4: Run the focused TypeScript tests and observe GREEN**

Run the Step 2 command. Expected: all selected Vitest files PASS.

- [ ] **Step 5: Add failing Kotlin command tests**

Add assertions for an exact `attachOrCreateCommand` using the public reference vector and for rejection of terminal number `0`. Update the SSH startup expectation so the sent input includes both session options after mouse configuration.

- [ ] **Step 6: Run the focused Android tests and observe RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.TmuxSessionProtocolTest" --tests "dev.hobgoblin.android.terminals.SshTerminalStartupCommandTest"
```

Expected: FAIL because the Kotlin command builder is absent and startup input lacks the options.

- [ ] **Step 7: Implement the Kotlin command builder and delegate startup construction**

Add constants and:

```kotlin
fun attachOrCreateCommand(identity: TmuxSessionIdentity, terminalNumber: Int): String? {
    if (terminalNumber < 1) return null
    val target = "=${identity.sessionName}"
    return listOf(
        "exec tmux new-session -A -s ${shellQuote(identity.sessionName)} -c ${shellQuote(identity.initialPath)}",
        "set-option -t ${shellQuote("$target:")} mouse on",
        "set-option -t ${shellQuote(target)} $InitPathOption ${shellQuote(identity.initialPath)}",
        "set-option -t ${shellQuote(target)} $TerminalNumberOption ${shellQuote(terminalNumber.toString())}",
    ).joinToString(" \\; ")
}
```

Have `SshTerminalStartupCommand` require this builder result using `startupContext.terminalId` and prepend only the existing two-space shell indentation.

- [ ] **Step 8: Run the focused Android tests and observe GREEN**

Run the Step 6 command. Expected: both JUnit classes PASS.

---

### Task 2: Parse and verify discoverable Android tmux sessions

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TmuxSessionProtocol.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/TmuxSessionProtocolTest.kt`

**Interfaces:**

- Produces `data class DiscoveredTmuxSession(val identity: TmuxSessionIdentity, val terminalNumber: Int)`.
- Produces `TmuxSessionProtocol.listDiscoverableSessionsScript(): String`.
- Produces `TmuxSessionProtocol.parseDiscoverableSessions(output: String, projectRoot: String, allowedInitialPaths: Set<String>): List<DiscoveredTmuxSession>?`.

- [ ] **Step 1: Add failing protocol discovery tests**

Cover the reference session, multiple valid rows, duplicate rows, an unrelated user session, missing metadata, noncanonical paths, paths outside the allowed set, `0`, `01`, overflow, malformed fields, and a current-prefix name whose recomputed digest differs.

The valid input shape is:

```text
hobgoblin-v1-aebf050981ac829e36100020\t/srv/projects/example/worktrees/feature\t1
```

Expected valid result:

```kotlin
listOf(
    DiscoveredTmuxSession(
        identity = TmuxSessionIdentity(
            "hobgoblin-v1-aebf050981ac829e36100020",
            "/srv/projects/example/worktrees/feature",
        ),
        terminalNumber = 1,
    ),
)
```

- [ ] **Step 2: Run the protocol test and observe RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.TmuxSessionProtocolTest"
```

Expected: FAIL because discovery parsing and listing APIs do not exist.

- [ ] **Step 3: Implement strict per-row acceptance**

Normalize and validate the project root first; return `null` only for invalid caller input. Normalize allowed paths into a set. For each output line, require exactly three tab-separated fields, canonical path equality, `^[1-9][0-9]*$`, successful `toIntOrNull()`, membership in allowed paths, and exact equality with:

```kotlin
identity(
    TmuxSessionDescriptor(
        projectRoot = normalizedProjectRoot,
        workingDirectory = initialPath,
        terminalNumber = terminalNumber,
    ),
)
```

Ignore invalid rows, deduplicate by session name, and sort by initial path then terminal number. Build the SSH script with the two user-option format expressions.

- [ ] **Step 4: Run the protocol test and observe GREEN**

Run the Step 2 command. Expected: PASS.

---

### Task 3: Discover verified live sessions through trusted SSH

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionService.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/RemoteTmuxSessionServiceTest.kt`

**Interfaces:**

- Produces `RemoteTmuxDiscoveryResult.Found(sessions: List<DiscoveredTmuxSession>)` and `RemoteTmuxDiscoveryResult.Failed(message: String)`.
- Produces `discoverAssociatedSessions(target: RemoteTarget, projectRoot: String, allowedInitialPaths: Set<String>): RemoteTmuxDiscoveryResult`.
- Consumes Task 2 protocol parsing and list script.

- [ ] **Step 1: Add failing SSH discovery tests**

Test trusted-host valid discovery, mixed valid/unrelated rows, no tmux server, `exit 127`, SSH command failure, invalid caller project root, and untrusted host. Assert exactly one trusted `runCommand` call using `listDiscoverableSessionsScript()` and the accepted host fingerprint.

- [ ] **Step 2: Run the remote service test and observe RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.RemoteTmuxSessionServiceTest"
```

Expected: FAIL because the discovery result and method do not exist.

- [ ] **Step 3: Implement remote discovery classification**

Reuse the service's host-fingerprint trust gate. On a successful command, parse through Task 2 and return `Found`. Treat messages matching no-server patterns or exact `exit 127` as `Found(emptyList())`. Return `Failed` for trust, SSH, and caller-input failures. Keep `closeAssociatedSession` behavior unchanged.

- [ ] **Step 4: Run the remote service test and observe GREEN**

Run the Step 2 command. Expected: PASS.

---

### Task 4: Merge discovered sessions into retained Android terminal state

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalSessionModels.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/terminals/TerminalSessionManager.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/TerminalSessionManagerTest.kt`

**Interfaces:**

- Produces `data class TmuxTerminalRecoveryCandidate(val target: RemoteTarget, val repositoryId: String, val repositoryRemotePath: String, val targetLabel: String, val discovery: DiscoveredTmuxSession)`.
- Produces `TerminalSessionManager.recoverTmuxSessions(candidates: List<TmuxTerminalRecoveryCandidate>): List<TerminalSessionRecord>`.

- [ ] **Step 1: Add failing manager merge tests**

Prove that one candidate creates a `Disconnected` `terminal-1` record with no controller, no output, fixed tmux identity, path-specific target ID, and one persisted batch. Prove repeated calls return no new records and keep the stable UUID. Add exact-existing, native-slot-conflict, different-host, invalid descriptor, observer, and two-session batch cases.

- [ ] **Step 2: Run the manager test and observe RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.terminals.TerminalSessionManagerTest"
```

Expected: FAIL because recovery candidates and merge do not exist.

- [ ] **Step 3: Implement deterministic, conflict-safe batch merge**

Under the manager lock, validate each candidate by re-deriving its identity from repository root, target path, and terminal number. Use this stable ID material:

```text
hobgoblin-android-recovered-tmux-v1<NUL><target authority><NUL><tmux session name>
```

Generate the UUID with `UUID.nameUUIDFromBytes(UTF-8 bytes)`. Skip an exact existing tmux slot and any occupied conflicting slot. Add only new records, call `sessionStore.saveSessions(sortedSessionsLocked())` once, release the lock, and notify collection observers once. Set `disconnectedReason` and `disconnectedMessage` to `null` so the UI shows the neutral `disconnected` status.

- [ ] **Step 4: Run the manager test and observe GREEN**

Run the Step 2 command. Expected: PASS.

---

### Task 5: Trigger project-scoped discovery and compose recovery

**Files:**

- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupStateTest.kt`
- Test: `android/app/src/test/java/dev/hobgoblin/android/terminals/TerminalSessionManagerTest.kt`

**Interfaces:**

- Produces pure `repositoryTmuxDiscoveryPaths(repository: RemoteRepositoryProfile, snapshotState: ResourceState<RemoteRepositorySnapshot>): List<String>?`.
- Adds `onDiscoverTmuxTerminals: (List<String>) -> Unit` to `RepositoryWorkspaceScreen`.
- Consumes Tasks 3 and 4 in `HobgoblinAndroidApp`.

- [ ] **Step 1: Add failing trigger-policy tests**

Assert a plain workspace returns its root immediately; a Git repository returns `null` for idle, loading, and error states; loaded and stale snapshots return the root plus normalized non-missing worktree paths with duplicates removed; missing worktrees are excluded.

- [ ] **Step 2: Run the repository state test and observe RED**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest"
```

Expected: FAIL because the discovery-path policy does not exist.

- [ ] **Step 3: Implement the pure path policy and Terminal-tab effect**

Add the callback with a no-op default. Compute the nullable path list with the pure helper. Add:

```kotlin
LaunchedEffect(repository.id, selectedTab, discoveryPaths) {
    if (selectedTab != RepositoryWorkspaceTab.Terminal || discoveryPaths == null) return@LaunchedEffect
    actionError = runCatching {
        withContext(Dispatchers.IO) { onDiscoverTmuxTerminals(discoveryPaths) }
    }.exceptionOrNull()?.message
}
```

Do not construct SSH scripts or tmux identities in Compose.

- [ ] **Step 4: Compose discovery and recovery in the app boundary**

For the opened repository, call `remoteTmuxSessionService.discoverAssociatedSessions` with the repository-root target, repository root, and allowed paths. On `Found`, map each discovery to a `TmuxTerminalRecoveryCandidate` using `RemoteTarget.fromHostProfile(host, discovery.identity.initialPath)`, the current repository ID/root, and `terminalTargetLabel`, then call the manager batch merge. Convert `Failed` to an exception so the screen uses its existing inline error path.

- [ ] **Step 5: Run repository and manager tests and observe GREEN**

Run from `android/`:

```sh
./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.repositories.RepositorySetupStateTest" --tests "dev.hobgoblin.android.terminals.TerminalSessionManagerTest"
```

Expected: PASS.

---

### Task 6: Update protocol documentation and run full verification

**Files:**

- Modify: `docs/terminal-tmux-protocol.md`
- Modify only if contradictory: `docs/superpowers/specs/2026-07-23-android-explicit-tmux-terminal-lifecycle-design.md`
- Verify all files changed by Tasks 1–5.

**Interfaces:**

- Documents the exact metadata names, values, launch sequence, verification rules, and backward compatibility.

- [ ] **Step 1: Update the public protocol**

Document both session options immediately after the descriptor/name sections. Extend the attach-or-create example with exact `set-option` commands. Add Android discovery rules: known path match, canonical positive number, recomputed exact name, ignored legacy/missing metadata, and disconnected record recovery.

- [ ] **Step 2: Run formatting and inspect only task-owned diffs**

Run:

```sh
./node_modules/.bin/prettier --write "src/system/tmux-session.ts" "src/system/tmux-session.test.ts" "src/system/local-terminal.ts" "src/system/local-terminal.test.ts" "src/system/remote-terminal.ts" "src/system/remote-terminal.test.ts" "docs/terminal-tmux-protocol.md"
git diff --check
git diff -- src/system/tmux-session.ts src/system/local-terminal.ts src/system/remote-terminal.ts android/app/src/main/java/dev/hobgoblin/android/terminals android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt docs/terminal-tmux-protocol.md
```

Expected: formatting succeeds, no whitespace errors, and no unrelated user changes are reverted.

- [ ] **Step 3: Run the full Android test suite**

Run from `android/`:

```sh
./gradlew test
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Run repository-wide TypeScript and architecture verification**

Run from the repository root:

```sh
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit successfully with no new warnings.

- [ ] **Step 5: Review final worktree state without committing**

Run:

```sh
git status --short
git diff --check
```

Expected: only the task changes plus the user's pre-existing dirty files are present. Do not stage or commit.

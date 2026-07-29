# Android Default Tmux Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover, display, retain, reconnect, and explicitly close ordinary user-created sessions on an SSH Host's default tmux server without changing their metadata.

**Architecture:** Keep `TmuxSessionIdentity` strict for Hobgoblin v1 and add `TmuxSessionTarget` for exact existing-session attachment. Upgrade Host discovery to classify default-server rows as either Hobgoblin or ordinary, then reuse the retained terminal lifecycle with an ordinary attach command that performs no remote mutation.

**Tech Stack:** Kotlin, Jetpack Compose, SSHJ facade, tmux command protocol, JUnit 4, Gradle.

## Global Constraints

- Execute inline in the current worktree; do not create subagents, branches, commits, or pushes.
- Ordinary sessions are accepted only from `TmuxServerTarget.Default`.
- Never create, rename, configure, or add Hobgoblin metadata to an ordinary session.
- Use exact `=<sessionName>` tmux targets and shell-quote every dynamic value.
- Keep all four Android localization catalogs complete and privacy-safe.
- Verify root architecture boundaries remain green.

---

### Task 1: Host discovery protocol and exact target model

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocol.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocolTest.kt`

**Interfaces:**
- Produces: `TmuxSessionTarget(server: TmuxServerTarget, sessionName: String)`
- Produces: generalized `HostDiscoveredTmuxSession` with `sessionName`, `initialPath`, optional `hobgoblinIdentity`, optional `terminalNumber`, and `attachedClients`
- Produces: `attachExistingCommand(target: TmuxSessionTarget): String?`

- [x] Write failing parser tests using V2 rows for a valid Hobgoblin session, an ordinary default session such as `editor`, and an ordinary project-server row that must be ignored.
- [x] Run `./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.terminals.TmuxSessionProtocolTest"` and confirm the ordinary default assertion fails.
- [x] Add the exact target and generalized discovery invariants:

```kotlin
data class TmuxSessionTarget(
    val server: TmuxServerTarget,
    val sessionName: String,
)

data class HostDiscoveredTmuxSession(
    val server: TmuxServerTarget,
    val sessionName: String,
    val initialPath: String,
    val hobgoblinIdentity: TmuxSessionIdentity?,
    val terminalNumber: Int?,
    val attachedClients: Int,
)
```

- [x] Upgrade the Host command/header/parser to include `#{session_path}` and classify only non-Hobgoblin default-server rows as ordinary.
- [x] Write a failing command test proving ordinary attach contains `has-session` and `attach-session`, but no `new-session`, `set-option`, `@hobgoblin_`, or named `-L` server.
- [x] Implement `attachExistingCommand(target)` with exact target semantics and rerun the focused protocol tests to green.

### Task 2: Retained terminal model, codec, and startup

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionModels.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalStartupContext.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/SshTerminalService.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/data/TerminalSessionStore.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/data/TerminalSessionStoreTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/SshTerminalStartupCommandTest.kt`

**Interfaces:**
- Produces: `TerminalSessionRecord.tmuxSessionTarget: TmuxSessionTarget?`
- Produces: `TerminalStartupContext.tmuxSessionTarget: TmuxSessionTarget?`

- [x] Add failing codec tests for an ordinary target with null `tmuxIdentity`/`terminalId`, plus a legacy 18-field Hobgoblin record deriving its target.
- [x] Add failing startup tests proving an ordinary target attaches exactly and never takes the native-shell or Hobgoblin configure path.
- [x] Extend invariants so exact targets require `AttachExisting`, while only Hobgoblin create/derived attach requires a positive terminal id:

```kotlin
require(tmuxSessionTarget == null || tmuxStartupPolicy == TmuxStartupPolicy.AttachExisting)
require(tmuxIdentity != null || tmuxSessionTarget != null || repositoryRemotePath != null)
```

- [x] Add the codec field for explicit target session name; decode old records by pairing their server marker with `tmuxIdentity.sessionName`.
- [x] Route ordinary startup through `TmuxSessionProtocol.attachExistingCommand(tmuxSessionTarget)` and rerun both focused suites.

### Task 3: Recovery manager and remote close

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionManager.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionService.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TerminalSessionManagerTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionServiceTest.kt`

**Interfaces:**
- Consumes: generalized Host discovery and `TmuxSessionTarget`
- Produces: retained ordinary terminal records and exact close/reconnect behavior

- [x] Add failing manager tests proving an ordinary session creates one deterministic record keyed by authority/default/name, uses its original name as display name, has no terminal id, and is reused on reopen/reconnect.
- [x] Update Host candidate matching to compare exact target rather than Hobgoblin identity/path:

```kotlin
val target = TmuxSessionTarget(discovery.server, discovery.sessionName)
return record.hostId == candidate.target.id && record.tmuxSessionTarget == target
```

- [x] Preserve optional Hobgoblin identity/terminal number only for validated Hobgoblin discoveries and pass exact target into startup context.
- [x] Add failing service tests proving ordinary close relists only default server, matches exact name, treats missing as success, and kills no different name.
- [x] Generalize close validation to compare server/name, retaining stronger metadata checks for Hobgoblin rows, then rerun both focused suites.

### Task 4: Catalog and retained-terminal presentation

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxCatalogPresentation.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalSessionDetails.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxCatalogPresentationTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`

**Interfaces:**
- Consumes: discovery classification and record target
- Produces: type-correct titles/copy/actions for both session kinds

- [x] Add failing presentation tests for `terminal-N` versus raw ordinary session name and for ordinary records being classified as tmux-backed.
- [x] Add pure projection helpers:

```kotlin
internal fun hostTmuxSessionTitle(session: HostDiscoveredTmuxSession): String =
    session.terminalNumber?.let { "terminal-$it" } ?: session.sessionName

internal fun TerminalSessionRecord.isTmuxBacked(): Boolean =
    tmuxIdentity != null || tmuxSessionTarget != null
```

- [x] Render ordinary cards with a default-session label and omit the Hobgoblin hash row; update close/delete/detail copy to use `isTmuxBacked()`.
- [x] Update scan/empty copy in English, Simplified Chinese, Japanese, and Korean; run the four focused UI/localization suites.

### Task 5: Protocol documentation and full verification

**Files:**
- Modify: `docs/terminal-tmux-protocol.md`
- Modify: `docs/superpowers/specs/2026-07-28-android-host-tmux-catalog-design.md`
- Modify: `CONTEXT.md`

**Interfaces:**
- Documents: V2 Host scan classification, exact ordinary attach identity, and non-mutation guarantees

- [x] Update the protocol doc to distinguish protocol identity from exact target and describe default ordinary rows.
- [x] Mark the previous catalog non-goal as superseded by this design; keep the earlier document historically readable.
- [x] Run focused Android tests for protocol, service, manager, codec, startup, tmux UI, terminal UI, and localization.
- [x] Run `./gradlew :app:testDebugUnitTest :app:assembleDebug`.
- [x] Run `bun run typecheck`, `bun run test`, and `bun run check:architecture`.
- [x] Inspect `git diff --check`, `git status --short`, and the final diff; do not commit.

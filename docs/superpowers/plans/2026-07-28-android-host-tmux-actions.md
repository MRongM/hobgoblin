# Android Host tmux Actions Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not create Git commits or branches unless the user explicitly requests them. Follow test-first RED/GREEN cycles for every behavior change.

**Goal:** Add state-aware Open, Reconnect, Close, and Delete actions to the Android Host tmux catalog, with an unchecked option to close the exact remote tmux session during deletion.

**Architecture:** Keep live tmux discovery as the remote read model and project the optional retained Android terminal onto each discovered item without creating records. Reuse `TerminalSessionManager` for local lifecycle actions, and add an exact-server close path to `RemoteTmuxSessionService` that revalidates the scanned identity before killing it.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, JUnit 4, SSH command boundary, tmux.

## Global Constraints

- Remote close is opt-in and unchecked by default.
- Ordinary Close never ends the remote tmux session.
- Remote deletion targets the exact scanned server and session and revalidates identity metadata first.
- A remote-close failure preserves the local retained terminal.
- Discovery never creates a retained terminal record.
- Preserve existing user changes and do not commit or branch.

---

### Task 1: Pure retained-session projection

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TerminalSessionManager.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostTmuxCatalogState.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TerminalSessionManagerTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreenStateTest.kt`

**Interfaces:**
- Produce a read-only lookup for the deterministic Host tmux retained record.
- Produce state-aware card actions derived from an optional `TerminalSessionRecord`.

- [ ] Add failing tests proving lookup does not persist a new record and only returns an exact authority/server/session/path/slot match.
- [ ] Run the focused manager test and verify it fails because the lookup is absent.
- [ ] Add the minimal lookup implementation by reusing the existing deterministic ID and validation rules.
- [ ] Add failing UI-state tests for unopened, active, and inactive action sets.
- [ ] Implement the pure action projection and rerun both focused tests green.

### Task 2: Exact remote Host tmux close

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocol.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionService.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/TmuxSessionProtocolTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/terminals/RemoteTmuxSessionServiceTest.kt`

**Interfaces:**
- Produce exact-server list and kill commands for `TmuxServerTarget`.
- Produce `closeHostSession(target, discovery): RemoteTmuxCloseResult`.

- [ ] Add failing protocol tests for default and named socket targeting and exact session names.
- [ ] Run the focused protocol test and verify expected failures.
- [ ] Implement minimal validated list/kill scripts using the same uid and `TMUX_TMPDIR` socket rules as discovery.
- [ ] Add failing service tests for exact metadata match, attached-count drift, missing session, metadata mismatch, untrusted host, and kill failure.
- [ ] Implement list-validate-kill orchestration and rerun both focused tests green.

### Task 3: Compose actions and safe deletion flow

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreenStateTest.kt`

**Interfaces:**
- Consume discovered groups plus retained sessions.
- Add callbacks for reconnect, close, and `(discovery, closeRemote)` delete.

- [ ] Add failing source/state assertions for visible action callbacks and an unchecked remote-close state.
- [ ] Run focused Host detail tests and verify expected failures.
- [ ] Render state-aware actions and a Material delete dialog with the unchecked dangerous remote option.
- [ ] Wire local lifecycle callbacks in the app; on opt-in deletion, close the exact remote session before removing the local record, surface errors, and refresh the catalog on success.
- [ ] Rerun focused Host detail and app-adjacent tests green.

### Task 4: Preview and full verification

**Files:**
- Modify: `docs/assets/android-host-tmux-catalog-preview.svg`

- [ ] Update the preview to show card actions and the delete confirmation with the unchecked remote-close option.
- [ ] Run `./gradlew :app:testDebugUnitTest :app:assembleDebug` from `android/` and require `BUILD SUCCESSFUL`.
- [ ] Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` from the repository root and require success.
- [ ] Run `git diff --check` and inspect `git diff --stat` plus the final preview.

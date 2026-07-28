# Android List Prompts and Private Key Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Android main-tab lists, add a confirmed private-key export to Edit Host, and expose compact main-tab action/count metadata.

**Architecture:** Keep list simplification inside the existing Compose screens. Keep export interaction state in `AddHostScreen`, but keep decrypted material inside `SecureIdentityStore`; pass only an identity ID and output stream across the callback and zero plaintext bytes in `finally`.

**Tech Stack:** Kotlin 2, Jetpack Compose Material 3, Android Activity Result document contracts, Android Keystore AES-GCM, JUnit 4, Gradle.

## Global Constraints

- Execute inline in the current worktree; do not spawn subagents.
- Do not create a branch or Git commit.
- Preserve loading, error, empty, filtered-Project, and selected-Tmux-Host states.
- Export only raw private-key material after explicit confirmation; do not add public-key export or sharing intents.
- Never log or retain plaintext key bytes; clear them in `finally`.
- Keep English, Simplified Chinese, Japanese, and Korean resources aligned.
- Keep examples and tests privacy-safe with generic identities, hosts, and paths.

---

### Task 1: Remove redundant main-tab prompts

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalInteractionState.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreenStateTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreenStateTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`

**Interfaces:**
- Consumes: Existing non-empty Host, Project, and Tmux Host collections.
- Produces: Direct list presentation while retaining `projects_on_host`, `projects_show_all_short`, and Tmux feedback actions.

- [x] **Step 1: Write failing source-contract assertions**

Assert that `HostsScreen.kt` does not reference `hosts_saved_heading`, the unfiltered Project branch does not reference `projects_saved_heading`, and `TmuxScreen.kt` references neither `tmux_choose_host_title` nor `tmux_choose_host_description`. Retain assertions for Host card navigation, Project filter behavior, `tmux_change_host`, retry, and pull-to-refresh.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd android && ./gradlew :app:testDebugUnitTest \
  --tests 'com.mrongm.hobgoblin.ui.screens.hosts.HostsScreenStateTest' \
  --tests 'com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreenStateTest' \
  --tests 'com.mrongm.hobgoblin.ui.screens.tmux.TmuxScreenContractTest'
```

Expected: FAIL because the redundant resource references still exist.

- [x] **Step 3: Remove only redundant prompt UI and resources**

Delete the Host heading and spacer. Render the Project scope row only when `hostFilterId != null`, retaining the selected-Host label and clear-filter action. Delete the Tmux chooser heading item. Remove the four unused resource keys from every locale.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Add a secure private-key export boundary

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/data/ssh/SecureIdentityStore.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/data/ssh/SecureIdentityStoreTest.kt`

**Interfaces:**
- Consumes: `identityId: String`, `outputStream: OutputStream`.
- Produces: `SecureIdentityStore.exportPrivateKey(identityId: String, outputStream: OutputStream): Unit` and an internal `writePrivateKey` helper whose plaintext buffer is always cleared.

- [x] **Step 1: Write failing export-boundary tests**

Use `ByteArrayOutputStream` and a captured mutable source array. Verify the written output equals a generic OpenSSH fixture and the source array is all zero after success. Add a throwing `OutputStream` case and verify the source array is also zero after failure.

- [x] **Step 2: Run the focused store test and verify RED**

Run:

```bash
cd android && ./gradlew :app:testDebugUnitTest \
  --tests 'com.mrongm.hobgoblin.data.ssh.SecureIdentityStoreTest'
```

Expected: FAIL because the export helper does not exist.

- [x] **Step 3: Implement minimal export writing**

Implement the store method by delegating to a focused helper:

```kotlin
internal fun writePrivateKey(
    outputStream: OutputStream,
    loadPrivateKey: () -> ByteArray,
) {
    val privateKey = loadPrivateKey()
    try {
        outputStream.write(privateKey)
        outputStream.flush()
    } finally {
        privateKey.fill(0)
    }
}
```

`exportPrivateKey` supplies `loadProtectedBytesById(identityId)` without adding the method to the broader SSH authentication interface.

- [x] **Step 4: Run the focused store test and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Add confirmed Edit Host export and app wiring

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Modify: `docs/privacy/index.html`
- Modify: `docs/privacy/zh-cn.html`
- Modify: `docs/privacy/ja.html`
- Modify: `docs/privacy/ko.html`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreenStateTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostConnectionTestContractTest.kt`

**Interfaces:**
- Consumes: Effective identity from `resolveHostIdentityRefId`, `onExportPrivateKey: (String, OutputStream) -> Unit` on Edit Host.
- Produces: `canExportPrivateKey(initialHost, identityRefId)`, a sanitized default filename, warning dialog, `CreateDocument("application/octet-stream")`, and inline result feedback.

- [x] **Step 1: Write failing state and wiring tests**

Verify export is false for Add Host, false for Edit Host without an identity, true for Edit Host with an effective imported/generated/saved identity, and that unsafe filename characters become `_`. Extend the source contract to require the export callback, `CreateDocument`, confirmation, and Edit Host app wiring while proving Add Host passes no export capability.

- [x] **Step 2: Run focused screen tests and verify RED**

Run:

```bash
cd android && ./gradlew :app:testDebugUnitTest \
  --tests 'com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreenStateTest' \
  --tests 'com.mrongm.hobgoblin.ui.screens.addhost.AddHostConnectionTestContractTest'
```

Expected: FAIL because export state, UI, and wiring are missing.

- [x] **Step 3: Implement export interaction**

Add an optional export callback defaulting to `null`. Show `Export private key` only when `initialHost != null`, the effective identity is non-null, and the callback exists. Capture the effective identity when opening the warning, launch `CreateDocument` only after confirmation, open its output stream on `Dispatchers.IO`, invoke the callback, and clear pending state after cancellation, success, or failure. Use generic inline success/error copy and never include the identity ID or key material.

- [x] **Step 4: Wire only Edit Host**

Pass `{ identityId, output -> secureIdentityStore.exportPrivateKey(identityId, output) }` in `AppRoute.EditHost`. Leave `AppRoute.AddHost` unchanged so export is structurally unavailable there.

- [x] **Step 5: Localize and update privacy disclosure**

Add matching resource keys in all four locales. Update each privacy page to state that explicit export sends original private-key bytes to the chosen document provider and that the result is outside Hobgoblin's encrypted private app storage.

- [x] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 4: Compact actions and list counts

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/navigation/MainTabShell.kt`
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/navigation/MainTabCounts.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
- Modify: all four Android string resource files
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/navigation/MainTabCountsTest.kt`
- Test: existing Add Host, main-tab, Host, and Project contract tests

**Interfaces:**
- Consumes: repository and retained-terminal snapshots already owned by the application root.
- Produces: immutable count maps passed into screens; compact trailing localized counts; stable action ordering; compact top bar; stable, state-tinted Terminal cards.

- [x] **Step 1: Write and run failing tests**

Require one equal-width private-key action row, Settings after tab-specific actions, a compact app-bar height, Project grouping by Host, Terminal grouping by non-null Project ID, zero fallback, localized count rendering, stable Terminal creation order, no Terminal drag affordance, and semantic Terminal status tones.

- [x] **Step 2: Implement action layout and ordering**

Extract a focused `PrivateKeyActions` composable and render both buttons with equal weight. Move Settings after the tab-specific action block and set an explicit compact app-bar height.

- [x] **Step 3: Implement aggregation and count presentation**

Derive maps once at the application boundary. Pass them into Host and Project screens. Render localized counts in each title row before any reorder handle, including zero.

- [x] **Step 4: Fix Terminal order and add status backgrounds**

Sort Terminal-tab items by creation time and ID only. Remove Terminal-tab manual-order parameters, storage wiring, gesture modifier, and drag handle. Map running to green, disconnected to yellow, exited/failed to red, and starting to the neutral surface.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the new aggregation test plus the existing Add Host, main-tab, Host, Project, and localization contract tests.

### Task 5: Full verification

**Files:**
- Verify all modified production, test, resource, context, design, plan, and privacy files.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: A verified Android feature with no architecture or desktop regression.

- [x] **Step 1: Run Android unit tests**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: BUILD SUCCESSFUL with all tests passing.

- [x] **Step 2: Run Android lint and assemble**

```bash
cd android && ./gradlew :app:lintDebug :app:assembleDebug
```

Expected: BUILD SUCCESSFUL with no new lint errors.

- [x] **Step 3: Run repository verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit 0.

- [x] **Step 4: Inspect the final diff**

Run `git diff --check` and `git status --short`. Confirm there are no whitespace errors, plaintext private-key fixtures outside tests, accidental secrets, dependency changes, or unrelated edits.

### Task 6: Switch the Terminal connection action by status

**Files:**
- Modify: `CONTEXT.md`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`

**Interfaces:**
- Consumes: the existing retained `TerminalSessionStatus` and `terminalSessionReconnectAvailable` policy.
- Produces: one mutually exclusive action slot that shows Close for active sessions and Reconnect for inactive sessions.

- [x] **Step 1: Write and run failing action-policy tests**

Require Starting/Running to map to Close, Exited/Failed/Disconnected to map to Reconnect, and the action row to render through one state branch without a permanently disabled reconnect button.

- [x] **Step 2: Implement the minimal presentation policy**

Add a small Terminal overview connection-action model derived from the existing reconnect-availability policy. Render either Reconnect or Close from that model while keeping Delete and Open unchanged.

- [x] **Step 3: Run focused and complete verification**

Run the focused Terminal screen state tests, the full Android unit suite, lint/assemble, and final diff checks.

### Task 7: Use Host-first titles and emphasize directories

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreenStateTest.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreenStateTest.kt`

**Interfaces:**
- Consumes: the already-associated `SshHostProfile`, Terminal source metadata, and Project profile.
- Produces: Host-first card presentation with preserved secondary names and emphasized directory paths.

- [x] **Step 1: Write Terminal presentation tests and verify RED**

Require `TerminalOverviewSource` to expose a Host title with saved-Host and persisted-reference fallbacks, preserve terminal/project context below it, and render `source.path` with primary color, monospace type, `FontWeight.SemiBold`, and wrapping.

- [x] **Step 2: Implement Terminal Host-first presentation and verify GREEN**

Derive the Host title while resolving the existing source model. Use it for the card title, move the terminal display name/slot into secondary context, and strengthen the existing path typography without changing state colors or actions.

- [x] **Step 3: Write Project presentation tests and verify RED**

Require a project card title helper to prefer the saved Host title and fall back to `hostProfileId`. Require the row to render a non-blank alias separately and the remote path with primary color, monospace type, `FontWeight.SemiBold`, and wrapping.

- [x] **Step 4: Implement Project Host-first presentation and verify GREEN**

Use the Host title helper in the top row, retain only a non-blank alias as secondary context, and move `remotePath` into its own emphasized line. Keep terminal count, reorder handle, project kind, address, and actions unchanged.

- [x] **Step 5: Run complete verification**

Run focused tests, the full Android unit suite, lint/assemble, `bun run typecheck`, `bun run test`, `bun run check:architecture`, and `git diff --check`.

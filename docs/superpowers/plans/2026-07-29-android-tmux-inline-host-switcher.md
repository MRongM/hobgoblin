# Android tmux Inline Host Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the first-entry Host chooser while switching Hosts directly from the tmux scan detail and automatically scanning the new Host.

**Architecture:** Keep `AppRoute.Tmux(selectedHostId)` and the existing route-driven scan effect as the single source of scan orchestration. Replace the detail-only back-to-chooser callback with a local Compose dropdown that reuses the existing ordered Host list and `onSelectHost` write path.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, JUnit 4, Gradle, Bun

## Global Constraints

- Do not change the remote tmux protocol, session identity, terminal return behavior, or persistence model.
- Keep the first-entry full-screen Host chooser.
- Reuse `ManualItemOrderPolicy` and the existing `onSelectHost(hostId)` path.
- Do not add dependencies or string resources.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Lock the inline-switcher UI contract

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`

**Interfaces:**
- Consumes: `TmuxScreen` source contract and its `onSelectHost: (String) -> Unit` callback.
- Produces: A failing regression contract for an anchored Host dropdown and removal of the back-to-chooser callback.

- [x] **Step 1: Write the failing contract test**

Add assertions that `TmuxScreen.kt` contains `DropdownMenu(`, `DropdownMenuItem(`, `enabled = host.id != selectedHost.id`, and `onSelectHost(host.id)`, while no longer containing `onChangeHost`.

- [x] **Step 2: Verify RED**

Run:

```bash
cd "android" && ./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.tmux.TmuxScreenContractTest"
```

Expected: FAIL because the production screen still uses `onChangeHost` and has no inline Host dropdown.

### Task 2: Implement the detail-local Host dropdown

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Test: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`

**Interfaces:**
- Consumes: ordered `List<SshHostProfile>`, selected `SshHostProfile`, and `onSelectHost(String)`.
- Produces: `SelectedTmuxHost(host, hosts, isRefreshing, onRefresh, onSelectHost)` with local dropdown expansion state.

- [x] **Step 1: Reuse one ordered Host list**

Compute `orderedHosts = ManualItemOrderPolicy.apply(hosts, hostOrder, SshHostProfile::id)` once in `TmuxScreen`, pass it to both the first-entry chooser and `SelectedTmuxHost`.

- [x] **Step 2: Add the minimal Compose dropdown**

Import `DropdownMenu` and `DropdownMenuItem`. In `SelectedTmuxHost`, anchor the existing “Change host” button in a `Box`, disable it when there is no alternate Host, and render ordered Host menu items. Disable the selected Host item and invoke `onSelectHost(host.id)` for an alternate Host after closing the menu.

- [x] **Step 3: Remove the back-to-chooser path**

Remove `onChangeHost` from `TmuxScreen`, `HostTmuxCatalog`, `TmuxErrorState`, `HostTmuxGroups`, and the `HobgoblinAndroidApp` call site. Empty and error states keep only refresh/retry because the persistent header owns Host switching.

- [x] **Step 4: Verify GREEN**

Run the Task 1 command. Expected: PASS.

- [x] **Step 5: Run adjacent state tests**

Run:

```bash
cd "android" && ./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.tmux.TmuxScreenStateTest" --tests "com.mrongm.hobgoblin.ui.screens.tmux.TmuxCatalogPresentationTest"
```

Expected: PASS, proving route-driven scanning, Host snapshot isolation, and catalog presentation remain intact.

### Task 3: Synchronize design docs and verify the repository

**Files:**
- Modify: `docs/superpowers/specs/2026-07-28-android-main-tmux-tab-design.md`
- Reference: `docs/superpowers/specs/2026-07-29-android-tmux-inline-host-switcher-design.md`

**Interfaces:**
- Consumes: the approved interaction delta.
- Produces: architecture documentation that no longer says detail switching returns to the Host chooser.

- [x] **Step 1: Update the prior tmux Tab design**

Replace the old “change Host returns to chooser” detail with the inline dropdown behavior while preserving first-entry explicit selection and invalid-Host fallback.

- [x] **Step 2: Run Android verification**

```bash
cd "android" && ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [x] **Step 3: Run root verification**

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: all commands exit 0.

- [x] **Step 4: Review the final diff**

Confirm no route, remote protocol, persistence, dependency, or unrelated UI changes are present. Do not commit.

# Android Main tmux Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing host tmux catalog into a select-first Android main-navigation tab while simplifying Host detail to its project list.

**Architecture:** Represent a tmux visit as `AppRoute.Tmux(selectedHostId)` and terminal return context as `TmuxReturn(hostId)`. Move Compose catalog ownership from the Hosts feature to a dedicated tmux screen while reusing the existing remote discovery, retained-session, and safe-delete domain paths unchanged.

**Tech Stack:** Kotlin 2.3, Jetpack Compose Material 3, Android SDK 37, JUnit 4, Gradle 9.5.1.

## Global Constraints

- Every entry into the main tmux tab starts without a selected Host; selecting a Host immediately scans it.
- Returning from a terminal opened by the tmux tab restores that visit, while leaving for another main tab clears it.
- Do not change the remote tmux discovery protocol, exact server/session identity, or destructive confirmation semantics.
- Preserve all four Android locales: English, Simplified Chinese, Japanese, and Korean.
- Keep the implementation dependency-free and compatible with Android API 26+.
- Do not create Git commits; the user requested inline execution and project instructions prohibit unsolicited commits.

---

### Task 1: Main navigation and return context

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/navigation/MainTabBarTest.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/navigation/AppRouteTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/navigation/MainTabBar.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/navigation/AppRoute.kt`

**Interfaces:**
- Produces: `MainTab.Tmux`, `MainTabIconKind.Multiplexer`, `AppRoute.Tmux(val selectedHostId: String? = null)`, and `TmuxReturn(val hostId: String)`.
- Preserves: `terminalReturnRoute(...)` precedence for `returnToTerminals` and repository routes.

- [ ] Add failing navigation tests for `[Hosts, Projects, Tmux, Terminals]`, semantic multiplexer icon, swipe order, fresh `AppRoute.Tmux()`, selected-host route, and terminal Back to `AppRoute.Tmux(hostId)`.
- [ ] Run `cd "android" && ./gradlew testDebugUnitTest --tests '*MainTabBarTest' --tests '*AppRouteTest'`; verify failures are caused by missing tmux navigation types.
- [ ] Add the minimal route, enum, icon, label mapping, and return-precedence implementation.
- [ ] Re-run the focused tests and verify they pass.

### Task 2: tmux visit state and host selection contract

**Files:**
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenStateTest.kt`
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenState.kt`
- Delete after migration: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostTmuxCatalogState.kt`
- Replace after migration: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreenStateTest.kt`

**Interfaces:**
- Produces: `tmuxRoute()`, `selectTmuxHost(route, hostId)`, `tmuxNeedsScan(route)`, and the existing catalog presentation helpers under the tmux feature package.
- Consumes: `AppRoute.Tmux`, `HostDiscoveredTmuxSession`, `TerminalSessionRecord`, and `TmuxServerTarget`.

- [ ] Write failing tests proving a fresh route has no selection, scanning requires a nonblank selected Host, selecting a Host creates a selected route, re-entering creates a fresh route, and existing lifecycle/server presentation helpers retain their behavior.
- [ ] Run `cd "android" && ./gradlew testDebugUnitTest --tests '*TmuxScreenStateTest'`; verify the new API is missing.
- [ ] Implement the minimal pure state and presentation helpers in the tmux feature package.
- [ ] Re-run the focused test and verify it passes.

### Task 3: Dedicated select-first tmux screen and simplified Host detail

**Files:**
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreen.kt`
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreenContractTest.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreenStateTest.kt`

**Interfaces:**
- `TmuxScreen` consumes Hosts, the selected Host ID, `ResourceState<List<HostTmuxPathGroup>>`, refresh state, retained-session projection, and host/session callbacks.
- `HostDetailScreen` consumes only Host, Back, and filtered Projects content.

- [ ] Add failing source/UI contract tests for the host chooser, immediate host callback, refresh/change-host actions, loading/empty/error/stale copy, mux rail, monospace technical data, 48dp actions, and absence of `PrimaryTabRow`/tmux state from Host detail.
- [ ] Run the two focused screen test classes and verify they fail against the old layout.
- [ ] Move the catalog and dialogs to `TmuxScreen`, add the select-first and selected-host headers plus actionable feedback states, and reduce `HostDetailScreen` to a single Projects surface.
- [ ] Re-run the focused screen tests and verify they pass.

### Task 4: App orchestration and main shell wiring

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/navigation/MainTabShell.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/navigation/MainTabShellContractTest.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/hosts/HostDetailScreenStateTest.kt`

**Interfaces:**
- Main shell adds `tmuxContent` between Projects and Terminals.
- App orchestration scans only `AppRoute.Tmux(selectedHostId != null)`, keys snapshots by Host ID, opens terminals with `TmuxReturn`, and returns deleted/unavailable Hosts to the chooser.

- [ ] Add failing app-shell and orchestration contract tests covering the fourth pane, selected-host scan gate, stale-snapshot isolation, terminal return, and host-detail project filtering.
- [ ] Run the focused tests and verify the old HostDetail route behavior fails them.
- [ ] Wire the new route through the shell, move discovery/action projection into `AppRoute.Tmux`, remove `HostDetailTab` and old tmux HostDetail arguments, and retain exact remote-close sequencing.
- [ ] Re-run focused tests and all Android unit tests.

### Task 5: Visual tokens, icons, and localized copy

**Files:**
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/theme/HobgoblinTheme.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/theme/HobgoblinThemeTest.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/AndroidLocalizationContractTest.kt`

**Interfaces:**
- Produces role-based colors for relay teal, mux copper, live moss, frost canvas, night ink, and fault red.
- Produces equivalent tmux navigation/chooser/scan/error/empty/action strings in all four locales.

- [ ] Add failing theme and localization contract tests for the new palette roles and complete tmux copy set.
- [ ] Run the focused tests and verify they fail for missing roles/resources.
- [ ] Implement the palette and localized strings without adding a dependency or font asset.
- [ ] Re-run focused tests, then run `cd "android" && ./gradlew testDebugUnitTest`.

### Task 6: Full verification and design critique

**Files:**
- Review: all changed production, test, resource, context, spec, and plan files.

**Interfaces:**
- No new interface; verifies the integrated behavior and architecture.

- [ ] Run `cd "android" && ./gradlew testDebugUnitTest assembleDebug` and require exit code 0.
- [ ] Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` and require exit code 0 for each.
- [ ] Run `git diff --check` and inspect `git diff --stat` plus the full scoped diff for accidental changes, privacy-unsafe fixtures, duplicated tmux implementations, unsupported dependencies, and stale HostDetail tmux terminology.
- [ ] If an Android emulator/device is available, inspect the chooser and result states in light/dark mode; otherwise explicitly report that visual inspection was limited to source contracts and build verification.
- [ ] Re-check the design against KISS, YAGNI, DRY, SOLID, accessibility, and the single-signature-element rule; remove any decorative or redundant control found.

# Android Host and Terminal Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Host diagnostics into Edit Host, make Host selection filter Projects, and redesign Android terminal appearance and focus interactions.

**Architecture:** Keep cross-tab Host filtering as local app-shell state, keep diagnostic state with the editable Host draft, persist only the terminal appearance preference, and keep focus state local to one terminal destination. Apply terminal colors at the Android view boundary so presentation changes never affect SSH or terminal session ownership.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Termux terminal emulator/view 0.118.0, JUnit 4, Gradle.

## Global Constraints

- Do not add dependencies.
- Do not run `git commit`, `git push`, or create branches.
- Preserve the existing English UI copy language and sentence case.
- Keep diagnostics separate from SSH access initialization: diagnostics use the already selected private key and never request a password.
- Keep the project filter and terminal focus mode local and non-persisted.
- Persist terminal appearance through `TerminalSettingsStore`; unknown values fall back to Dark.
- Run production-code changes only after observing the corresponding new tests fail.

---

### Task 1: Host-to-Projects navigation and inline diagnostics

**Files:**
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/projects/ProjectsScreenStateTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/navigation/AppRouteTest.kt`
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/addhost/AddHostConnectionTestContractTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/projects/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/hosts/HostsScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/addhost/AddHostScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/navigation/AppRoute.kt`

**Interfaces:**
- Produces: `projectsForHost(repositories, hostId)` and `filteredProjectsDescription(hostTitle)`.
- Produces: `ProjectsScreen(..., hostFilterId, onClearHostFilter)`.
- Produces: Host row callback `onOpenProjects(hostId)`.

- [x] Add tests asserting only matching `hostProfileId` Projects survive a filter, an unknown Host produces an empty list, and terminal fallback returns to `EditHost`.
- [x] Run the targeted Android tests and verify failures identify missing filtering/routing behavior.
- [x] Implement Host selection, Projects filter presentation/clear behavior, and `EditHost` terminal return routing.
- [x] Extend Edit Host's existing connection-test surface so saved Hosts always expose `Run diagnostics`, detailed SSH/Shell stages, and Host-key trust/retry without introducing a second diagnostics state machine.
- [x] Run targeted tests and verify they pass.

### Task 2: Restorable light/dark terminal appearance

**Files:**
- Create: `android/app/src/main/java/dev/hobgoblin/android/data/TerminalAppearance.kt`
- Create: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalAppearance.kt`
- Create: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalAppearanceTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/data/TerminalSettingsStore.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/HobgoblinTerminalView.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/AndroidTerminalViewport.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalScreen.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt`

**Interfaces:**
- Produces: `TerminalAppearance { Light, Dark }`, `terminalAppearance(value)`, `terminalPalette(appearance)`.
- Produces: `TerminalSettingsStore.loadTerminalAppearance()` and `setTerminalAppearance(appearance)`.
- Produces: `HobgoblinTerminalView.setTerminalAppearance(appearance)`.

- [x] Write tests for persisted-value parsing, fallback to Dark, appearance labels/actions, and exact foreground/background/base ANSI palette entries.
- [x] Run the targeted test and verify failure because the appearance model does not exist.
- [x] Implement the pure appearance model and persistence methods.
- [x] Apply colors to Compose terminal chrome and Termux `mCurrentColors`, invalidating the existing view without reconnecting.
- [x] Wire the appearance action through `HobgoblinAndroidApp` and `TerminalScreen`.
- [x] Run targeted tests and verify they pass.

### Task 3: Command deck and focus mode

**Files:**
- Modify: `android/app/src/test/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionStateTest.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalInteractionState.kt`
- Modify: `android/app/src/main/java/dev/hobgoblin/android/ui/screens/terminals/TerminalScreen.kt`
- Modify: `CONTEXT.md`

**Interfaces:**
- Produces: `TerminalDefaultFocusMode`, `terminalChromeVisible(focusMode)`, and `terminalFocusActionLabel(focusMode)`.
- Replaces the visual meaning of the old maximized state with explicit Android terminal focus mode.

- [x] Replace maximized-state tests with focus-state tests asserting default off, hidden chrome while focused, `Exit focus` copy, and Back-first exit behavior.
- [x] Run the targeted test and verify it fails against the old maximized contract.
- [x] Implement destination-keyed focus state and a full-viewport focused composition with an exit handle.
- [x] Recompose helper keys, command input, fit, appearance, and focus into the command deck; keep reconnect/close in overflow.
- [x] Add the resolved `Android terminal focus mode` term to `CONTEXT.md`.
- [x] Run targeted tests and verify they pass.

### Task 4: Full verification and visual critique

**Files:**
- Modify only files required by failures found in this task.

- [x] Run `./gradlew test` from `android/` and resolve regressions.
- [x] Run `bun run typecheck`, `bun run test`, and `bun run check:architecture` from the repository root.
- [x] Build the Android debug APK with `./gradlew assembleDebug`.
- [x] Review the final diff for unrelated edits, privacy-unsafe fixture data, duplicated state, and terminology drift.
- [x] Skip device/emulator inspection per the user's explicit code-only verification request.

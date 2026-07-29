# Android Key-Only Host Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make Android host diagnostics private-key-only and let users test a newly initialized identity from the add-host screen before saving.

**Architecture:** Enforce the identity requirement in SshDiagnosticsService, remove password initialization from DiagnosticsScreen, and inject the existing diagnostic service into AddHostScreen for an ephemeral draft test. The draft records the existing healthy/unhealthy persistence value so the host list reflects the latest explicit test after save.

**Tech Stack:** Kotlin 2.3.21, Jetpack Compose Material 3, SSHJ 0.40.0, JUnit 4, Gradle 9.5.1

## Global Constraints

- Work only in the existing android linked worktree; do not create branches, commits, pushes, or pull requests.
- Temporary server passwords remain confined to SSH access initialization and must be cleared after use.
- Diagnostics require identityRefId and never fall back to password or ambient/default identities.
- Reuse SshDiagnosticsService; do not duplicate SSH probes in UI code.
- Preserve existing healthy/unhealthy persistence and online/offline presentation.
- Keep Android UI copy in sentence case and follow the existing Material 3 hierarchy.
- Add no dependencies and perform no persistence schema migration.

---

### Task 1: Enforce private-key-only diagnostics

**Files:**
- Modify: android/app/src/test/java/dev/hobgoblin/android/ssh/SshDiagnosticsServiceTest.kt
- Modify: android/app/src/main/java/dev/hobgoblin/android/ssh/SshDiagnosticsService.kt

**Interfaces:**
- Consumes: RemoteTarget.identityRefId
- Produces: runDiagnostics returns AuthFailed without network I/O when no identity is associated.

- [x] **Step 1: Write the failing service test**

Pass target(identityRefId = null), track fingerprint and probe calls, then assert:

    assertFalse(result.ok)
    assertEquals(DiagnosticCategory.AuthFailed, result.category)
    assertEquals("Configure SSH key access before running diagnostics.", result.message)
    assertEquals(0, client.fingerprintRequests)
    assertTrue(client.probes.isEmpty())

- [x] **Step 2: Run the focused test and verify RED**

From android/ run:

    ./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ssh.SshDiagnosticsServiceTest"

Expected: the new assertion fails because current diagnostics contact the client without an explicit identity.

- [x] **Step 3: Add the minimal service invariant**

At the start of runDiagnostics, create stages and return:

    if (target.identityRefId == null) {
        return fail(
            target = target,
            stages = stages,
            failedIndex = 0,
            category = DiagnosticCategory.AuthFailed,
            message = "Configure SSH key access before running diagnostics.",
            details = "",
        )
    }

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: every SshDiagnosticsServiceTest passes.

### Task 2: Remove password initialization from saved-host diagnostics

**Files:**
- Create: android/app/src/test/java/dev/hobgoblin/android/ui/screens/diagnostics/DiagnosticsScreenContractTest.kt
- Modify: android/app/src/main/java/dev/hobgoblin/android/ui/screens/diagnostics/DiagnosticsScreen.kt
- Modify: android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt

**Interfaces:**
- Consumes: onRunDiagnostics: () -> DiagnosticsResult
- Produces: one direct key-based diagnostic path with no password/initialization API.

- [x] **Step 1: Write the failing source-contract test**

Read DiagnosticsScreen.kt using existing contract-test path candidates and assert:

    listOf(
        "Temporary password",
        "onCheckSshInitialization",
        "onInitializeSshAccess",
        "SshInitializationCard",
    ).forEach { forbidden ->
        assertFalse("DiagnosticsScreen must not expose " + forbidden, source.contains(forbidden))
    }

- [x] **Step 2: Run the focused test and verify RED**

    ./gradlew testDebugUnitTest --tests "dev.hobgoblin.android.ui.screens.diagnostics.DiagnosticsScreenContractTest"

Expected: assertion failure because the current screen contains the password initialization surface.

- [x] **Step 3: Simplify DiagnosticsScreen**

Remove initialization imports, parameters, state, helper functions, and SshInitializationCard. Keep one runDiagnostics coroutine that sets Loading, invokes onRunDiagnostics on Dispatchers.IO, and folds to Loaded or Error. Preserve result-level host-key trust handling.

- [x] **Step 4: Remove stale app wiring**

In AppRoute.Diagnostics, remove onCheckSshInitialization and onInitializeSshAccess. Retain onRunDiagnostics, onTrustHostKey, status persistence, and terminal navigation.

- [x] **Step 5: Verify GREEN and compilation**

    ./gradlew testDebugUnitTest \
      --tests "dev.hobgoblin.android.ui.screens.diagnostics.DiagnosticsScreenContractTest" \
      --tests "dev.hobgoblin.android.ssh.SshDiagnosticsServiceTest"

Expected: both test classes pass with no stale callback references.

### Task 3: Add first-time inline connection testing

**Files:**
- Create: android/app/src/test/java/dev/hobgoblin/android/ui/screens/addhost/AddHostConnectionTestContractTest.kt
- Modify: android/app/src/main/java/dev/hobgoblin/android/ui/screens/addhost/AddHostScreen.kt
- Modify: android/app/src/main/java/dev/hobgoblin/android/HobgoblinAndroidApp.kt

**Interfaces:**
- Consumes: onRunDiagnostics: (SshHostProfile) -> DiagnosticsResult
- Produces: Test connection after initialization, ResourceState diagnostic feedback, and a draft lastDiagnosticStatus.

- [x] **Step 1: Write the failing source-contract tests**

Add a source contract asserting AddHostScreen.kt contains Test connection, onRunDiagnostics, lastDiagnosticStatus, and an initializedIdentityRefId non-null gate. Assert HobgoblinAndroidApp.kt wires:

    diagnosticsService.runDiagnostics(RemoteTarget.fromHostProfile(input))

- [x] **Step 2: Run focused tests and verify RED**

    ./gradlew testDebugUnitTest \
      --tests "dev.hobgoblin.android.ui.screens.addhost.AddHostConnectionTestContractTest"

Expected: contract assertions fail because the callback, gate, and action do not exist.

- [x] **Step 3: Add draft diagnostic state**

In AddHostScreen:

- Add onRunDiagnostics accepting the current SshHostProfile draft.
- Track connectionTestState from ResourceState.Idle.
- Track lastDiagnosticStatus from initialHost.
- Copy lastDiagnosticStatus into currentDraftProfile.
- Clear test state and diagnostic status when host, user, port, or identity changes.
- Invoke diagnostics on Dispatchers.IO and record healthy when result.ok, otherwise unhealthy.

- [x] **Step 4: Render inline feedback**

In the Ready branch, only when initializedIdentityRefId is non-null, render:

    Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = connectionTestState !is ResourceState.Loading,
        onClick = onTestConnection,
    ) {
        Text(if (connectionTestState is ResourceState.Loading) "Testing connection…" else "Test connection")
    }

Show online in the existing success color after a successful loaded result. Show offline plus result/error message in the error color after failure.

- [x] **Step 5: Wire add and edit routes**

Pass to both AddHostScreen call sites:

    onRunDiagnostics = { input ->
        diagnosticsService.runDiagnostics(RemoteTarget.fromHostProfile(input))
    }

Only onSaveHost persists the draft and its latest status.

- [x] **Step 6: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: AddHostConnectionTestContractTest passes.

### Task 4: Regression and release verification

**Files:**
- Verify: android/
- Verify: repository architecture and TypeScript surfaces.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: fresh functional, compile, architecture, and diff evidence.

- [x] **Step 1: Run the complete Android suite and assembly**

    ./gradlew testDebugUnitTest assembleDebug

Expected: BUILD SUCCESSFUL with zero failed tests.

- [x] **Step 2: Confirm the Android-only verification scope**

For Android-only changes, do not require the repository TypeScript/Vitest gate. The user confirmed this scope after the broader checks had already completed.

Expected: Android unit tests and assembly are the release gate for this task; use only directly relevant supplemental checks.

- [x] **Step 3: Check formatting and scope**

    git diff --check
    git status --short
    git diff -- android CONTEXT.md docs/superpowers .claude/plan

Expected: no whitespace errors. Review feature files separately from concurrent Android Terminals changes already present in the shared worktree.

- [x] **Step 4: Review acceptance**

Check every criterion in docs/superpowers/specs/2026-07-23-android-key-only-host-diagnostics-design.md against source and fresh output. Record any manual-device check separately.

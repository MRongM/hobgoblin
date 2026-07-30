# Android Host Initialization Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Android Host temporary-password submission automatically apply first-use host trust, install a generated or selected SSH public key, and run key-only connectivity diagnostics.

**Architecture:** `SshInitializationService` owns TOFU and changed-key enforcement before identity preparation. A small Add Host feature-local pipeline composes initialization and diagnostics while preserving the initialized profile when diagnostics fail; Compose owns only ephemeral submission and result projection.

**Tech Stack:** Kotlin 2.3.21, Android Compose Material 3, SSHJ 0.40.0, JUnit 4.13.2, Gradle 9.5.1

## Global Constraints

- Work inline in the current worktree; do not create branches, commits, pushes, or pull requests.
- Use the existing `HostKeyTrustStore`, `SshInitializationService`, and `SshDiagnosticsService`; add no dependency or persistence schema.
- Automatically trust only `HostKeyTrust.Unknown`; matching `Trusted` proceeds, `Changed` fails closed, and `Rejected` remains blocked.
- Keep the temporary password memory-only, clear it on every path, and never pass it to diagnostics.
- Diagnostics must consume the profile returned by initialization and run only after public-key installation succeeds.
- Preserve explicit Host saving, imported/private-key export behavior, saved-Host diagnostics, and single-flight submission handling.
- Keep Android UI copy in sentence case and update all four string dictionaries together.
- Follow test-first RED → GREEN → REFACTOR for every production behavior change.

---

### Task 1: Move first-use host trust into SSH initialization

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ssh/SshInitializationServiceTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ssh/SshInitializationService.kt`

**Interfaces:**
- Consumes: `HostKeyTrustStore.evaluate(target, fingerprint)` and `HostKeyTrustStore.trust(target, fingerprint)`.
- Produces: `SshInitializationService.initialize(profile, password)` with automatic TOFU and `SshHostKeyChangedException(previousFingerprint, currentFingerprint)`.

- [x] **Step 1: Write failing automatic-trust and changed-key tests**

Add test-visible trust-call and key-generation tracking to the existing fakes, then add these behaviors:

```kotlin
@Test
fun `initialize automatically trusts a first seen host key before installing`() {
    val trustStore = FakeHostKeyTrustStore(trustedFingerprint = null)
    val client = FakeInitializationClient(fingerprint = "SHA256:new")
    val password = "temporary-password".toCharArray()
    val result = service(
        hostKeyStore = trustStore,
        client = client,
        fingerprint = "SHA256:new",
    ).initialize(profile(), password)

    assertEquals(listOf("SHA256:new"), trustStore.trustedFingerprints)
    assertEquals("generated-identity", result.profile.identityRefId)
    assertEquals(1, client.installedPublicKeys.size)
    assertTrue(password.all { it == '\u0000' })
}

@Test
fun `initialize does not rewrite matching host trust`() {
    val trustStore = FakeHostKeyTrustStore(trustedFingerprint = "SHA256:new")

    service(
        hostKeyStore = trustStore,
        fingerprint = "SHA256:new",
    ).initialize(profile(), "temporary-password".toCharArray())

    assertTrue(trustStore.trustedFingerprints.isEmpty())
}

@Test
fun `changed host key blocks identity generation and installation`() {
    val identityStore = FakeIdentityStore()
    val client = FakeInitializationClient(fingerprint = "SHA256:new")
    val keyGenerator = FakeSshKeyGenerator()
    val password = "temporary-password".toCharArray()
    val error = assertThrows(SshHostKeyChangedException::class.java) {
        service(
            identityStore = identityStore,
            hostKeyStore = FakeHostKeyTrustStore("SHA256:old"),
            client = client,
            keyGenerator = keyGenerator,
            fingerprint = "SHA256:new",
        ).initialize(profile(), password)
    }

    assertEquals("SHA256:old", error.previousFingerprint)
    assertEquals("SHA256:new", error.currentFingerprint)
    assertTrue(keyGenerator.generatedProfiles.isEmpty())
    assertTrue(identityStore.importedPayloads.isEmpty())
    assertTrue(client.installedPublicKeys.isEmpty())
    assertTrue(password.all { it == '\u0000' })
}

@Test
fun `explicitly rejected host key remains blocked`() {
    val password = "temporary-password".toCharArray()
    val error = assertThrows(SshInitializationException::class.java) {
        service(
            hostKeyStore = FakeHostKeyTrustStore(
                trustedFingerprint = null,
                evaluatedTrust = HostKeyTrust.Rejected("SHA256:new"),
            ),
            fingerprint = "SHA256:new",
        ).initialize(profile(), password)
    }

    assertEquals("Host key rejected", error.message)
    assertTrue(password.all { it == '\u0000' })
}
```

Update the helper signature so tests can supply the fake trust store directly:

```kotlin
private fun service(
    identityStore: FakeIdentityStore = FakeIdentityStore(),
    client: FakeInitializationClient = FakeInitializationClient(fingerprint = "SHA256:new"),
    keyGenerator: SshKeyGenerator = FakeSshKeyGenerator(),
    publicKeyReader: SshPublicKeyReader = FakePublicKeyReader("ssh-ed25519 existing-public-key imported"),
    trustedFingerprint: String? = null,
    fingerprint: String = "SHA256:new",
    hostKeyStore: FakeHostKeyTrustStore = FakeHostKeyTrustStore(trustedFingerprint),
): SshInitializationService = SshInitializationService(
    identityStore = identityStore,
    hostKeyStore = hostKeyStore,
    client = client.also { it.fingerprint = fingerprint },
    keyGenerator = keyGenerator,
    publicKeyReader = publicKeyReader,
)
```

- [x] **Step 2: Run the focused test and verify RED**

Run from `android/`:

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ssh.SshInitializationServiceTest"
```

Expected: the first-use test fails because `initialize` currently requires prior trust; the changed-key test fails because the typed exception does not exist.

- [x] **Step 3: Implement service-owned trust policy**

Add the typed error and enforce trust before `prepareIdentity`:

```kotlin
class SshHostKeyChangedException(
    val previousFingerprint: String,
    val currentFingerprint: String,
) : SshInitializationException("Host key changed")

private fun ensureTrustedHostKey(target: RemoteTarget, fingerprint: String) {
    when (val trust = hostKeyStore.evaluate(target, fingerprint)) {
        HostKeyTrust.Unknown -> hostKeyStore.trust(target, fingerprint)
        is HostKeyTrust.Trusted -> Unit
        is HostKeyTrust.Changed -> throw SshHostKeyChangedException(
            previousFingerprint = trust.previousFingerprint,
            currentFingerprint = trust.currentFingerprint,
        )
        is HostKeyTrust.Rejected -> throw SshInitializationException("Host key rejected")
    }
}
```

Call `ensureTrustedHostKey(target, fingerprint)` inside the existing `try` block before identity preparation. Make `SshInitializationException` `open` so the typed error can extend it. Retain the expected-fingerprint verifier used by `installPublicKey`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all `SshInitializationServiceTest` tests pass, including existing generation, reuse, password clearing, key encoding, and `authorized_keys` deduplication tests.

---

### Task 2: Add a feature-local initialization-and-diagnostic pipeline

**Files:**
- Create: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/addhost/HostInitializationFlowTest.kt`
- Create: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/HostInitializationFlow.kt`

**Interfaces:**
- Consumes: `(SshHostProfile, CharArray) -> SshHostProfile` initialization callback and `(SshHostProfile) -> DiagnosticsResult` diagnostic callback.
- Produces: `runHostInitializationFlow(...) : HostInitializationFlowResult` where both result variants retain the initialized profile.

- [x] **Step 1: Write failing flow tests**

Create the test class with these three behaviors:

```kotlin
class HostInitializationFlowTest {
    @Test
    fun `diagnostics receive the initialized profile after key installation`() {
        val calls = mutableListOf<String>()
        val draft = host(identityRefId = null)
        val initialized = host(identityRefId = "identity-1")

        val result = runHostInitializationFlow(
            draftProfile = draft,
            password = "secret".toCharArray(),
            initialize = { input, _ ->
                calls += "initialize:${input.identityRefId}"
                initialized
            },
            diagnose = { input ->
                calls += "diagnose:${input.identityRefId}"
                diagnostics(input, ok = true)
            },
        )

        assertEquals(listOf("initialize:null", "diagnose:identity-1"), calls)
        assertEquals(initialized, result.profile)
        assertTrue(result is HostInitializationFlowResult.Diagnosed)
    }

    @Test
    fun `initialization failure prevents diagnostics`() {
        var diagnosticCalls = 0

        assertThrows(IllegalStateException::class.java) {
            runHostInitializationFlow(
                draftProfile = host(identityRefId = null),
                password = "secret".toCharArray(),
                initialize = { _, _ -> error("install failed") },
                diagnose = {
                    diagnosticCalls += 1
                    diagnostics(it, ok = true)
                },
            )
        }

        assertEquals(0, diagnosticCalls)
    }

    @Test
    fun `diagnostic exception retains the initialized profile`() {
        val initialized = host(identityRefId = "identity-1")

        val result = runHostInitializationFlow(
            draftProfile = host(identityRefId = null),
            password = "secret".toCharArray(),
            initialize = { _, _ -> initialized },
            diagnose = { error("shell unavailable") },
        )

        assertTrue(result is HostInitializationFlowResult.DiagnosticFailed)
        assertEquals(initialized, result.profile)
        assertEquals("shell unavailable", (result as HostInitializationFlowResult.DiagnosticFailed).error.message)
    }
}
```

Use `SshHostProfile.create` and a two-stage `DiagnosticsResult` fixture with `DiagnosticStage.SSH` and `DiagnosticStage.Shell`; use only generic `example.test` test data.

- [x] **Step 2: Run the focused test and verify RED**

```bash
./gradlew :app:testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.addhost.HostInitializationFlowTest"
```

Expected: compilation fails because `HostInitializationFlowResult` and `runHostInitializationFlow` do not exist.

- [x] **Step 3: Implement the minimal pipeline**

Create `HostInitializationFlow.kt`:

```kotlin
package com.mrongm.hobgoblin.ui.screens.addhost

import com.mrongm.hobgoblin.domain.ssh.DiagnosticsResult
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile

internal sealed interface HostInitializationFlowResult {
    val profile: SshHostProfile

    data class Diagnosed(
        override val profile: SshHostProfile,
        val diagnostics: DiagnosticsResult,
    ) : HostInitializationFlowResult

    data class DiagnosticFailed(
        override val profile: SshHostProfile,
        val error: Throwable,
    ) : HostInitializationFlowResult
}

internal fun runHostInitializationFlow(
    draftProfile: SshHostProfile,
    password: CharArray,
    initialize: (SshHostProfile, CharArray) -> SshHostProfile,
    diagnose: (SshHostProfile) -> DiagnosticsResult,
): HostInitializationFlowResult {
    val initializedProfile = initialize(draftProfile, password)
    return runCatching { diagnose(initializedProfile) }.fold(
        onSuccess = { HostInitializationFlowResult.Diagnosed(initializedProfile, it) },
        onFailure = { HostInitializationFlowResult.DiagnosticFailed(initializedProfile, it) },
    )
}
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all three flow tests pass.

---

### Task 3: Collapse Add Host UI into one initialization pipeline

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreenStateTest.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostConnectionTestContractTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ssh/SshInitializationService.kt`
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ssh/SshInitializationServiceTest.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`

**Interfaces:**
- Consumes: `runHostInitializationFlow`, `SshHostKeyChangedException`, existing initialization/diagnostic/trust callbacks.
- Produces: one-click initialization with automatic diagnostics, explicit changed-key recovery, and unchanged explicit Host persistence.

- [x] **Step 1: Write failing source-contract assertions**

Extend `AddHostConnectionTestContractTest`:

```kotlin
@Test
fun `temporary password submission initializes and diagnoses without a precheck callback`() {
    val screen = sourceFile(
        "src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
        "app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
        "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
    )
    val app = sourceFile(
        "src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
        "app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
        "android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
    )

    assertTrue(screen.contains("runHostInitializationFlow("))
    assertTrue(screen.contains("HostInitializationFlowResult.Diagnosed"))
    assertTrue(screen.contains("HostInitializationFlowResult.DiagnosticFailed"))
    assertTrue(screen.contains("SshHostKeyChangedException"))
    assertFalse(screen.contains("onCheckSshInitialization"))
    assertFalse(app.contains("initializationService.check(input)"))
}
```

Replace the old password-visibility state test with a focused assertion that the single-flight submission still blocks repeated starts; retain all import/export, latest-diagnostic-generation, default-user, and valid-field tests.

- [x] **Step 2: Run UI tests and verify RED**

```bash
./gradlew :app:testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreenStateTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostConnectionTestContractTest"
```

Expected: the new contract test fails because the screen still calls the precheck and does not invoke the pipeline.

- [x] **Step 3: Replace precheck state with pipeline state**

In `AddHostScreen`:

- Remove `onCheckSshInitialization`, `runInitializationCheck`, `SshInitializationCheck`, and normal-path `NeedsHostKeyTrust` / `NeedsServerPassword` UI branches.
- Add `var initializationHostKeyChange by remember(initialHost) { mutableStateOf<SshHostKeyChangedException?>(null) }`.
- Reset the changed-key value inside `clearInitializationState`.
- Retain `onTrustHostKey` for explicit changed-key review and saved diagnostics.
- At submission start, set `connectionTestState = ResourceState.Loading` and run the complete pipeline on `Dispatchers.IO`.

Use this result projection:

```kotlin
val password = initializationPassword.toCharArray()
val result = try {
    runCatching {
        withContext(Dispatchers.IO) {
            runHostInitializationFlow(
                draftProfile = profile,
                password = password,
                initialize = onInitializeSshAccess,
                diagnose = onRunDiagnostics,
            )
        }
    }
} finally {
    password.fill('\u0000')
    initializationPassword = ""
}

result.onSuccess { flow ->
    initializedIdentityRefId = flow.profile.identityRefId
    initializationHostKeyChange = null
    initializationError = null
    when (flow) {
        is HostInitializationFlowResult.Diagnosed -> {
            connectionTestState = ResourceState.Loaded(flow.diagnostics)
            lastDiagnosticStatus = flow.profile
                .withDiagnosticResult(flow.diagnostics)
                .lastDiagnosticStatus
        }
        is HostInitializationFlowResult.DiagnosticFailed -> {
            connectionTestState = ResourceState.Error(
                flow.error.message ?: connectionTestFailed,
                flow.error,
            )
            lastDiagnosticStatus = HOST_DIAGNOSTIC_STATUS_UNHEALTHY
        }
    }
}.onFailure { failure ->
    connectionTestState = ResourceState.Idle
    if (failure is SshHostKeyChangedException) {
        initializationHostKeyChange = failure
    } else {
        initializationError = failure.message ?: initializationFailed
    }
}
```

Keep `SshInitializationSubmission.finish()` in the existing outer `finally` so the button remains disabled until automatic diagnostics settle.

- [x] **Step 4: Simplify the initialization card and changed-key recovery**

Make the card render exactly one of these states:

1. `initializationHostKeyChange != null`: show `host_key_changed`, previous/current fingerprints, and the existing `host_trust_host_key` action. That action calls `onTrustHostKey` on `Dispatchers.IO`, clears the changed-key state on success, and requires a fresh password submission.
2. `initializedIdentityRefId != null`: show initialized identity, automatic diagnostic feedback, the existing explicit test/retry action, and `Set up again`.
3. Otherwise: show the temporary-password explanation, password field, and single initialization action.

Do not render a manual first-use trust action. Keep `HostDiagnosticsContent` for edited saved Hosts unchanged.

- [x] **Step 5: Remove obsolete precheck wiring and API**

Remove both `onCheckSshInitialization` arguments from `HobgoblinAndroidApp`. Once no production call remains, remove `SshInitializationCheck`, `SshInitializationService.check`, and the private `hasUsableIdentity` helper. Remove the five precheck-specific tests from `SshInitializationServiceTest`; retain initialization, trust, identity, password, and installation tests.

Verify no references remain:

```bash
rg -n "SshInitializationCheck|onCheckSshInitialization|initializationService\.check" \
  "android/app/src/main"
```

Expected: no production matches.

- [x] **Step 6: Update localized progress copy and remove dead strings**

Keep the existing `host_initializing_ssh_access` key and change its values to:

```text
English: Initializing and testing SSH access…
简体中文: 正在初始化并测试 SSH 访问…
日本語: SSH アクセスを初期化して接続をテストしています…
한국어: SSH 액세스를 초기화하고 연결을 테스트하는 중…
```

After source changes, use `rg` to confirm and remove these now-unused keys from all four dictionaries: `host_ssh_initialization_check_failed`, `host_setup_ssh_key`, `host_trust_before_initializing`, and `host_install_public_key`. Keep `host_key_trust_failed` for exceptional changed-key review.

- [x] **Step 7: Run focused Add Host and SSH tests and verify GREEN**

```bash
./gradlew :app:testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.ssh.SshInitializationServiceTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.addhost.HostInitializationFlowTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreenStateTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostConnectionTestContractTest" \
  --tests "com.mrongm.hobgoblin.ssh.SshDiagnosticsServiceTest"
```

Expected: every selected test class passes with no compilation or resource errors.

---

### Task 4: Verify the completed pipeline and documentation

**Files:**
- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-07-30-android-host-initialization-pipeline-design.md`
- Verify: all files changed by Tasks 1–3.

**Interfaces:**
- Consumes: completed service, feature flow, Compose projection, localized resources, and domain glossary.
- Produces: fresh build, test, architecture, and diff evidence against every acceptance criterion.

- [x] **Step 1: Run the complete Android unit suite and debug assembly**

From `android/`:

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: `BUILD SUCCESSFUL` with zero failed tests.

- [x] **Step 2: Run repository-required gates**

From repository root, run each command independently:

```bash
bun run typecheck
bun run test
bun run check:architecture
```

Expected: typecheck succeeds, Vitest reports zero failed tests, and architecture boundaries remain green.

- [x] **Step 3: Check formatting, dead references, and diff scope**

```bash
git diff --check
rg -n "SshInitializationCheck|onCheckSshInitialization|initializationService\.check" \
  "android/app/src/main"
git status --short
git diff -- "CONTEXT.md" "android" \
  "docs/superpowers/specs/2026-07-30-android-host-initialization-pipeline-design.md" \
  "docs/superpowers/plans/2026-07-30-android-host-initialization-pipeline.md"
```

Expected: no whitespace errors, no obsolete production precheck references, and only intended Host initialization documentation, Kotlin, tests, wiring, and string resources are changed.

- [x] **Step 4: Review acceptance criteria against fresh evidence**

Confirm all seven criteria in `docs/superpowers/specs/2026-07-30-android-host-initialization-pipeline-design.md` map to a passing service test, flow test, UI contract/state test, or compilation gate. Record device-only SSH validation as optional manual follow-up because automated tests use fakes and no production Host credentials.

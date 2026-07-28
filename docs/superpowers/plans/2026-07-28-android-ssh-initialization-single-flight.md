# Android SSH Initialization Single-Flight Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with strict red-green-refactor cycles. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent repeated SSH initialization submissions from generating multiple identities and make remote public-key installation idempotent across comment-only variants.

**Architecture:** Keep the single-flight guard as local Compose interaction state owned by `AddHostScreen`, covering the complete precheck-and-install coroutine. Keep public-key material parsing and `authorized_keys` script generation at the SSH initialization client boundary, comparing key type and Base64 body while preserving existing entries.

**Tech Stack:** Kotlin 2.3.21, Jetpack Compose Material 3, SSHJ 0.40.0, JUnit 4, Gradle 9.5.1

## Global Constraints

- Do not create Git commits, branches, pushes, or pull requests.
- Add no dependencies and perform no persistence migration.
- Preserve explicit host-key trust and key-only connection diagnostics.
- Keep temporary passwords out of persisted state and clear them after installation attempts.
- Keep Android UI copy localized in every existing locale.
- Do not automatically remove or rewrite existing remote public keys.

---

### Task 1: Make SSH initialization single-flight

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreenStateTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values-b+zh+Hans/strings.xml`
- Modify: `android/app/src/main/res/values-ja/strings.xml`
- Modify: `android/app/src/main/res/values-ko/strings.xml`

**Interfaces:**
- Produces: `SshInitializationSubmission`, a screen-local state holder with `tryStart(): Boolean`, `finish(): Unit`, and observable `inProgress: Boolean`.
- Consumes: the existing `onCheckSshInitialization` and `onInitializeSshAccess` callbacks.

- [ ] **Step 1: Write the failing state tests**

Add tests that express the single-flight lifecycle before the production type exists:

```kotlin
@Test
fun `ssh initialization submission rejects repeated starts until completion`() {
    val submission = SshInitializationSubmission()

    assertTrue(submission.tryStart())
    assertTrue(submission.inProgress)
    assertFalse(submission.tryStart())
}

@Test
fun `ssh initialization submission allows retry after completion`() {
    val submission = SshInitializationSubmission()
    assertTrue(submission.tryStart())

    submission.finish()

    assertFalse(submission.inProgress)
    assertTrue(submission.tryStart())
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `android/`:

```bash
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreenStateTest"
```

Expected: compilation fails because `SshInitializationSubmission` does not exist.

- [ ] **Step 3: Add the minimal single-flight state holder**

Add beside the existing add-host state helpers:

```kotlin
internal class SshInitializationSubmission {
    var inProgress by mutableStateOf(false)
        private set

    fun tryStart(): Boolean {
        if (inProgress) return false
        inProgress = true
        return true
    }

    fun finish() {
        inProgress = false
    }
}
```

Remember one instance per host draft in `AddHostScreen`:

```kotlin
val initializationSubmission = remember(initialHost) { SshInitializationSubmission() }
```

- [ ] **Step 4: Refactor the event flow so the guard covers precheck and installation**

Make `prepareOrInitializeSshAccess` acquire the guard synchronously before launching work. Run validation, the optional precheck, and `onInitializeSshAccess` inside the same coroutine. Release the guard in `finally` for every success, failure, ready, and host-key decision path:

```kotlin
fun prepareOrInitializeSshAccess() {
    if (!initializationSubmission.tryStart()) return
    initializationError = null
    scope.launch {
        try {
            val profile = runCatching { currentDraftProfile() }.getOrElse {
                initializationError = it.message ?: validationError
                return@launch
            }
            val check = if (initializationCheck == SshInitializationCheck.NeedsServerPassword) {
                SshInitializationCheck.NeedsServerPassword
            } else {
                runCatching {
                    withContext(Dispatchers.IO) { onCheckSshInitialization(profile) }
                }.getOrElse {
                    initializationError = it.message ?: initializationCheckFailed
                    return@launch
                }
            }
            when (check) {
                SshInitializationCheck.Ready -> {
                    initializationPassword = ""
                    initializationCheck = SshInitializationCheck.Ready
                    error = null
                }

                SshInitializationCheck.NeedsServerPassword -> {
                    val password = initializationPassword.toCharArray()
                    val result = try {
                        runCatching {
                            withContext(Dispatchers.IO) { onInitializeSshAccess(profile, password) }
                        }
                    } finally {
                        password.fill('\u0000')
                    }
                    result.onSuccess { initializedProfile ->
                        initializationPassword = ""
                        initializedIdentityRefId = initializedProfile.identityRefId
                        initializationCheck = SshInitializationCheck.Ready
                        resetConnectionTestState()
                        error = null
                    }.onFailure {
                        initializationPassword = ""
                        initializationError = it.message ?: initializationFailed
                    }
                }

                is SshInitializationCheck.NeedsHostKeyTrust,
                is SshInitializationCheck.HostKeyChanged,
                -> {
                    initializationCheck = check
                    error = null
                }
            }
        } finally {
            initializationSubmission.finish()
        }
    }
}
```

Remove the old nested `initializeSshAccess` launcher so one user submission owns one coroutine and one release path.

- [ ] **Step 5: Disable the action and show progress**

Thread `initializationInProgress = initializationSubmission.inProgress` through `SshInitializationSection` into `TemporaryPasswordSetup`. Change the button to:

```kotlin
Button(
    modifier = Modifier.fillMaxWidth(),
    enabled = enabled && password.isNotEmpty() && !initializationInProgress,
    onClick = onInitialize,
) {
    Text(
        stringResource(
            if (initializationInProgress) {
                R.string.host_initializing_ssh_access
            } else {
                R.string.host_initialize_ssh_access
            },
        ),
    )
}
```

Add localized resources:

```xml
<!-- values -->
<string name="host_initializing_ssh_access">Initializing SSH access…</string>
<!-- values-b+zh+Hans -->
<string name="host_initializing_ssh_access">正在初始化 SSH 访问…</string>
<!-- values-ja -->
<string name="host_initializing_ssh_access">SSH アクセスを初期化しています…</string>
<!-- values-ko -->
<string name="host_initializing_ssh_access">SSH 액세스를 초기화하는 중…</string>
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreenStateTest"
```

Expected: all `AddHostScreenStateTest` tests pass.

---

### Task 2: Deduplicate authorized keys by key material

**Files:**
- Modify: `android/app/src/test/java/com/mrongm/hobgoblin/ssh/SshInitializationServiceTest.kt`
- Modify: `android/app/src/main/java/com/mrongm/hobgoblin/ssh/SshInitializationService.kt`

**Interfaces:**
- Produces: `authorizedKeysInstallScript(publicKeyLine: String): String`, accessible to same-module tests.
- Consumes: normalized public-key lines produced by `DefaultSshKeyGenerator` or `SshjPublicKeyReader`.

- [ ] **Step 1: Write failing executable-script tests**

Use a temporary HOME and execute the real generated shell script through `/bin/sh`:

```kotlin
@Test
fun `authorized keys installation ignores comment differences for the same key material`() {
    withAuthorizedKeys("ssh-rsa AAAATEST previous-comment\n") { home, authorizedKeys ->
        runInstallScript(home, "ssh-rsa AAAATEST imported")

        assertEquals(
            listOf("ssh-rsa AAAATEST previous-comment"),
            Files.readAllLines(authorizedKeys),
        )
    }
}

@Test
fun `authorized keys installation appends different key material`() {
    withAuthorizedKeys("ssh-rsa AAAAOLD existing\n") { home, authorizedKeys ->
        runInstallScript(home, "ssh-rsa AAAANEW hobgoblin-android")

        assertEquals(
            listOf(
                "ssh-rsa AAAAOLD existing",
                "ssh-rsa AAAANEW hobgoblin-android",
            ),
            Files.readAllLines(authorizedKeys),
        )
    }
}
```

Add these helpers to create `$HOME/.ssh/authorized_keys`, execute the generated script, assert exit code zero, and clean up deterministically:

```kotlin
private inline fun withAuthorizedKeys(
    initialContent: String,
    block: (home: Path, authorizedKeys: Path) -> Unit,
) {
    val home = Files.createTempDirectory("hobgoblin-authorized-keys-test")
    val authorizedKeys = Files.createDirectories(home.resolve(".ssh")).resolve("authorized_keys")
    Files.writeString(authorizedKeys, initialContent)
    try {
        block(home, authorizedKeys)
    } finally {
        home.toFile().deleteRecursively()
    }
}

private fun runInstallScript(home: Path, publicKeyLine: String) {
    val process = ProcessBuilder("/bin/sh", "-c", authorizedKeysInstallScript(publicKeyLine))
        .redirectErrorStream(true)
        .apply { environment()["HOME"] = home.toString() }
        .start()
    val output = process.inputStream.bufferedReader().use { it.readText() }

    assertEquals(output, 0, process.waitFor())
}
```

Import `java.nio.file.Files` and `java.nio.file.Path`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
./gradlew testDebugUnitTest --tests "com.mrongm.hobgoblin.ssh.SshInitializationServiceTest"
```

Expected: compilation fails because the script builder is still private to `SshjInitializationClient`; after exposing it without changing behavior, the comment-variant test fails with two lines.

- [ ] **Step 3: Extract key material and generate a material-aware script**

Move script generation to an internal top-level function. Parse the generated/imported public-key line into its first two tokens and use `awk` to find the same adjacent type/body tokens anywhere in an existing authorized-key line:

```kotlin
internal fun authorizedKeysInstallScript(publicKeyLine: String): String {
    val tokens = publicKeyLine.trim().split(Regex("\\s+"), limit = 3)
    require(tokens.size >= 2) { "Invalid SSH public key" }
    val quotedKey = shellQuote(publicKeyLine)
    val quotedType = shellQuote(tokens[0])
    val quotedBody = shellQuote(tokens[1])
    return """
        umask 077
        mkdir -p "${'$'}HOME/.ssh"
        touch "${'$'}HOME/.ssh/authorized_keys"
        awk -v key_type=$quotedType -v key_body=$quotedBody '
            {
                for (index = 1; index < NF; index++) {
                    if (${ '$' }index == key_type && ${ '$' }(index + 1) == key_body) found = 1
                }
            }
            END { exit(found ? 0 : 1) }
        ' "${'$'}HOME/.ssh/authorized_keys" || printf '%s\n' $quotedKey >> "${'$'}HOME/.ssh/authorized_keys"
        chmod 700 "${'$'}HOME/.ssh"
        chmod 600 "${'$'}HOME/.ssh/authorized_keys"
    """.trimIndent()
}

private fun shellQuote(value: String): String = "'${value.replace("'", "'\\''")}'"
```

Make `SshjInitializationClient.installPublicKey` call this function without changing its SSH session lifecycle or timeout handling.

- [ ] **Step 4: Add the authorization-options edge case**

Add one test with an existing line such as:

```text
from="192.0.2.10" ssh-rsa AAAATEST restricted
```

Installing `ssh-rsa AAAATEST imported` must leave the existing restricted line unchanged and must not append an unrestricted duplicate.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
./gradlew testDebugUnitTest \
  --tests "com.mrongm.hobgoblin.ssh.SshInitializationServiceTest" \
  --tests "com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreenStateTest"
```

Expected: both focused test classes pass.

---

### Task 3: Regression verification

**Files:**
- Verify: `android/`
- Verify: changed Android and design/plan files only.

**Interfaces:**
- Consumes: completed single-flight and material-deduplication changes.
- Produces: fresh unit, assembly, localization, and whitespace evidence.

- [ ] **Step 1: Run the complete Android verification gate**

Run from `android/`:

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: `BUILD SUCCESSFUL` with zero failed tests.

- [ ] **Step 2: Verify repository constraints**

Run from the repository root:

```bash
bun run check:architecture
git diff --check
```

Expected: architecture check passes and no whitespace errors are reported.

- [ ] **Step 3: Review scope and acceptance criteria**

Inspect only the files changed by this fix, keeping the pre-existing Android tmux work untouched. Confirm every acceptance criterion in `docs/superpowers/specs/2026-07-28-android-ssh-initialization-single-flight-design.md` has direct test or source evidence.

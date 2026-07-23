package dev.hobgoblin.android.ui.screens.addhost

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.hobgoblin.android.domain.ResourceState
import dev.hobgoblin.android.domain.ssh.DiagnosticsResult
import dev.hobgoblin.android.domain.ssh.HOST_DIAGNOSTIC_STATUS_UNHEALTHY
import dev.hobgoblin.android.domain.ssh.SshIdentityRef
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.domain.ssh.withDiagnosticResult
import dev.hobgoblin.android.ssh.SshInitializationCheck
import dev.hobgoblin.android.ui.theme.HobgoblinColors
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal fun canOfferSshInitialization(host: String, user: String, port: String): Boolean =
    host.isNotBlank() && user.isNotBlank() && runCatching { SshHostProfile.parsePort(port) }.isSuccess

internal fun initialHostUser(initialHost: SshHostProfile?): String = initialHost?.user ?: DefaultSshUser

internal fun shouldShowSshInitializationPasswordInput(
    enabled: Boolean,
    check: SshInitializationCheck?,
): Boolean = enabled && (check == null || check == SshInitializationCheck.NeedsServerPassword)

internal fun resolveHostIdentityRefId(
    selectedIdentityId: String?,
    initializedIdentityRefId: String?,
    existingIdentityRefId: String?,
): String? = selectedIdentityId ?: initializedIdentityRefId ?: existingIdentityRefId

internal fun isLatestConnectionTest(
    requestGeneration: Int,
    currentGeneration: Int,
): Boolean = requestGeneration == currentGeneration

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddHostScreen(
    initialHost: SshHostProfile? = null,
    onBack: () -> Unit,
    onImportPrivateKey: (displayName: String, bytes: ByteArray) -> SshIdentityRef,
    onCheckSshInitialization: (SshHostProfile) -> SshInitializationCheck = { SshInitializationCheck.Ready },
    onTrustHostKey: (SshHostProfile, String) -> Unit = { _, _ -> },
    onInitializeSshAccess: (SshHostProfile, CharArray) -> SshHostProfile = { profile, _ -> profile },
    onRunDiagnostics: (SshHostProfile) -> DiagnosticsResult,
    onSaveHost: (SshHostProfile) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var alias by remember(initialHost) { mutableStateOf(initialHost?.alias.orEmpty()) }
    var host by remember(initialHost) { mutableStateOf(initialHost?.host.orEmpty()) }
    var user by remember(initialHost) { mutableStateOf(initialHostUser(initialHost)) }
    var port by remember(initialHost) { mutableStateOf(initialHost?.port?.toString() ?: "22") }
    var error by remember { mutableStateOf<String?>(null) }
    var selectedIdentity by remember { mutableStateOf<SshIdentityRef?>(null) }
    var initializationCheck by remember(initialHost) { mutableStateOf<SshInitializationCheck?>(null) }
    var initializationPassword by remember(initialHost) { mutableStateOf("") }
    var initializationError by remember(initialHost) { mutableStateOf<String?>(null) }
    var initializedIdentityRefId by remember(initialHost) { mutableStateOf<String?>(null) }
    var connectionTestState: ResourceState<DiagnosticsResult> by remember(initialHost) {
        mutableStateOf(ResourceState.Idle)
    }
    var lastDiagnosticStatus by remember(initialHost) { mutableStateOf(initialHost?.lastDiagnosticStatus) }
    var connectionTestGeneration by remember(initialHost) { mutableStateOf(0) }

    fun resetConnectionTestState() {
        connectionTestGeneration += 1
        connectionTestState = ResourceState.Idle
        lastDiagnosticStatus = null
    }

    fun clearInitializationState() {
        initializationCheck = null
        initializationPassword = ""
        initializationError = null
        initializedIdentityRefId = null
        resetConnectionTestState()
    }

    val importPrivateKey = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw IllegalArgumentException("Unable to read selected identity")
            val displayName = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "SSH identity"
            onImportPrivateKey(displayName, bytes)
        }.onSuccess {
            selectedIdentity = it
            clearInitializationState()
            error = null
        }.onFailure {
            error = it.message ?: "Identity import failed"
        }
    }

    fun currentIdentityRefId(): String? = resolveHostIdentityRefId(
        selectedIdentityId = selectedIdentity?.id,
        initializedIdentityRefId = initializedIdentityRefId,
        existingIdentityRefId = initialHost?.identityRefId,
    )

    fun currentDraftProfile(identityRefId: String? = currentIdentityRefId()): SshHostProfile =
        buildHostProfile(
            initialHost = initialHost,
            alias = alias,
            host = host,
            user = user,
            port = port,
            identityRefId = identityRefId,
        ).copy(lastDiagnosticStatus = lastDiagnosticStatus)

    fun runInitializationCheck() {
        initializationError = null
        scope.launch {
            runCatching {
                val profile = currentDraftProfile()
                withContext(Dispatchers.IO) { onCheckSshInitialization(profile) }
            }.onSuccess {
                initializationCheck = it
                error = null
            }.onFailure {
                initializationCheck = null
                initializationError = it.message ?: "SSH initialization check failed"
            }
        }
    }

    fun trustHostKey(fingerprint: String) {
        initializationError = null
        scope.launch {
            runCatching {
                val profile = currentDraftProfile()
                withContext(Dispatchers.IO) { onTrustHostKey(profile, fingerprint) }
                withContext(Dispatchers.IO) { onCheckSshInitialization(profile) }
            }.onSuccess {
                initializationCheck = it
                error = null
            }.onFailure {
                initializationError = it.message ?: "Host key trust failed"
            }
        }
    }

    fun initializeSshAccess(profile: SshHostProfile = currentDraftProfile()) {
        val password = initializationPassword.toCharArray()
        initializationError = null
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) { onInitializeSshAccess(profile, password) }
            }
            password.fill('\u0000')
            result.onSuccess { initializedProfile ->
                initializationPassword = ""
                initializedIdentityRefId = initializedProfile.identityRefId
                initializationCheck = SshInitializationCheck.Ready
                resetConnectionTestState()
                error = null
            }.onFailure {
                initializationPassword = ""
                initializationError = it.message ?: "SSH initialization failed"
            }
        }
    }

    fun prepareOrInitializeSshAccess() {
        if (initializationCheck == SshInitializationCheck.NeedsServerPassword) {
            initializeSshAccess()
            return
        }

        initializationError = null
        scope.launch {
            val profile = runCatching { currentDraftProfile() }.getOrElse {
                initializationError = it.message ?: "Validation error"
                return@launch
            }
            val check = runCatching {
                withContext(Dispatchers.IO) { onCheckSshInitialization(profile) }
            }.getOrElse {
                initializationError = it.message ?: "SSH initialization check failed"
                return@launch
            }
            when (check) {
                SshInitializationCheck.Ready -> {
                    initializationPassword = ""
                    initializationCheck = SshInitializationCheck.Ready
                    error = null
                }

                SshInitializationCheck.NeedsServerPassword -> {
                    initializationCheck = check
                    initializeSshAccess(profile)
                }

                is SshInitializationCheck.NeedsHostKeyTrust,
                is SshInitializationCheck.HostKeyChanged,
                -> {
                    initializationCheck = check
                    error = null
                }
            }
        }
    }

    fun testConnection() {
        val profile = runCatching { currentDraftProfile() }.getOrElse {
            connectionTestState = ResourceState.Error(it.message ?: "Validation error", it)
            lastDiagnosticStatus = HOST_DIAGNOSTIC_STATUS_UNHEALTHY
            return
        }
        connectionTestGeneration += 1
        val requestGeneration = connectionTestGeneration
        connectionTestState = ResourceState.Loading
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) { onRunDiagnostics(profile) }
            }
            if (!isLatestConnectionTest(requestGeneration, connectionTestGeneration)) {
                return@launch
            }
            connectionTestState = result.fold(
                onSuccess = { result ->
                    lastDiagnosticStatus = profile.withDiagnosticResult(result).lastDiagnosticStatus
                    ResourceState.Loaded(result)
                },
                onFailure = {
                    lastDiagnosticStatus = HOST_DIAGNOSTIC_STATUS_UNHEALTHY
                    ResourceState.Error(it.message ?: "Connection test failed", it)
                },
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (initialHost == null) "Add host" else "Edit host") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
            )
        },
        bottomBar = {
            Surface(shadowElevation = 2.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = HobgoblinSpacing.Md, vertical = HobgoblinSpacing.Sm),
                    horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onBack) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            runCatching {
                                currentDraftProfile()
                            }.onSuccess {
                                error = null
                                onSaveHost(it)
                            }.onFailure {
                                error = it.message ?: "Validation error"
                            }
                        },
                    ) {
                        Text(if (initialHost == null) "Save host" else "Save changes")
                    }
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(padding)
                .padding(horizontal = HobgoblinSpacing.Md, vertical = HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = alias,
                onValueChange = { alias = it },
                label = { Text("Alias") },
                singleLine = true,
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = host,
                onValueChange = {
                    host = it
                    clearInitializationState()
                },
                label = { Text("Host") },
                singleLine = true,
                isError = error != null && host.isBlank(),
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = user,
                onValueChange = {
                    user = it
                    clearInitializationState()
                },
                label = { Text("User") },
                singleLine = true,
                isError = error != null && user.isBlank(),
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = port,
                onValueChange = {
                    port = it
                    clearInitializationState()
                },
                label = { Text("Port") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            OutlinedButton(onClick = { importPrivateKey.launch(arrayOf("*/*")) }) {
                Text("Import private key")
            }
            val identityLabel = when {
                selectedIdentity != null -> "Identity selected: ${selectedIdentity?.displayName}"
                initializedIdentityRefId != null -> "Generated identity will be saved with this host."
                initialHost?.identityRefId != null -> "Existing identity selected"
                else -> null
            }
            if (identityLabel != null) {
                Text(
                    text = identityLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            SshInitializationSection(
                enabled = canOfferSshInitialization(host = host, user = user, port = port),
                check = initializationCheck,
                password = initializationPassword,
                error = initializationError,
                initializedIdentityRefId = initializedIdentityRefId,
                connectionTestState = connectionTestState,
                onStartCheck = { runInitializationCheck() },
                onPasswordChange = { initializationPassword = it },
                onTrustHostKey = { trustHostKey(it) },
                onInitialize = { prepareOrInitializeSshAccess() },
                onTestConnection = { testConnection() },
                onReset = { clearInitializationState() },
            )
            if (error != null) {
                Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun SshInitializationSection(
    enabled: Boolean,
    check: SshInitializationCheck?,
    password: String,
    error: String?,
    initializedIdentityRefId: String?,
    connectionTestState: ResourceState<DiagnosticsResult>,
    onStartCheck: () -> Unit,
    onPasswordChange: (String) -> Unit,
    onTrustHostKey: (String) -> Unit,
    onInitialize: () -> Unit,
    onTestConnection: () -> Unit,
    onReset: () -> Unit,
) {
    val success = check == SshInitializationCheck.Ready
    val showPasswordInput = shouldShowSshInitializationPasswordInput(enabled = enabled, check = check)
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.outlinedCardColors(
            containerColor = if (success) {
                HobgoblinColors.Success.copy(alpha = 0.06f)
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StatusGlyph(
                    label = if (success) "OK" else "Key",
                    background = if (success) HobgoblinColors.Success.copy(alpha = 0.14f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                    content = if (success) HobgoblinColors.Success else MaterialTheme.colorScheme.primary,
                )
                Text(
                    modifier = Modifier.weight(1f),
                    text = "SSH key setup (optional)",
                    style = MaterialTheme.typography.titleMedium,
                )
                OptionalBadge()
            }
            when (check) {
                null -> {
                    Text(
                        text = "Use the temporary server password once, then connect with the saved private key.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (showPasswordInput) {
                        TemporaryPasswordSetup(
                            password = password,
                            enabled = enabled,
                            onPasswordChange = onPasswordChange,
                            onInitialize = onInitialize,
                        )
                    } else {
                        OutlinedButton(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = false,
                            onClick = onStartCheck,
                        ) {
                            Text("Set up SSH key")
                        }
                    }
                }

                SshInitializationCheck.Ready -> {
                    Text(
                        text = "SSH access is initialized.",
                        style = MaterialTheme.typography.titleSmall,
                        color = HobgoblinColors.Success,
                    )
                    Text(
                        text = "Future connections will use the saved private key.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val identityText = if (initializedIdentityRefId != null) {
                        "Generated identity will be saved with this host."
                    } else {
                        "Saved identity is available for this host."
                    }
                    Text(identityText, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (initializedIdentityRefId != null) {
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = connectionTestState !is ResourceState.Loading,
                            onClick = onTestConnection,
                        ) {
                            Text(
                                if (connectionTestState is ResourceState.Loading) {
                                    "Testing connection…"
                                } else {
                                    "Test connection"
                                },
                            )
                        }
                        ConnectionTestFeedback(connectionTestState)
                    }
                    TextButton(onClick = onReset) {
                        Text("Set up again")
                    }
                }

                is SshInitializationCheck.NeedsHostKeyTrust -> {
                    Text(
                        text = "Trust this host key before initializing SSH access.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(check.fingerprint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { onTrustHostKey(check.fingerprint) }) {
                        Text("Trust host key")
                    }
                }

                SshInitializationCheck.NeedsServerPassword -> {
                    Text(
                        text = "Install Hobgoblin Android's public key using the temporary server password.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TemporaryPasswordSetup(
                        password = password,
                        enabled = enabled,
                        onPasswordChange = onPasswordChange,
                        onInitialize = onInitialize,
                    )
                }

                is SshInitializationCheck.HostKeyChanged -> {
                    Text(
                        "Host key changed. Review this server before trusting it again.",
                        color = MaterialTheme.colorScheme.error,
                    )
                    Text("Previous: ${check.previousFingerprint}", style = MaterialTheme.typography.bodySmall)
                    Text("Current: ${check.currentFingerprint}", style = MaterialTheme.typography.bodySmall)
                }
            }
            if (!enabled) {
                Text(
                    "Enter host, user, and a valid port to enable setup.",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (error != null) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun ConnectionTestFeedback(state: ResourceState<DiagnosticsResult>) {
    when (state) {
        ResourceState.Idle,
        ResourceState.Loading,
        -> Unit

        is ResourceState.Error -> {
            Text(
                text = "offline",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.error,
            )
            Text(state.message, color = MaterialTheme.colorScheme.error)
        }

        is ResourceState.Loaded -> ConnectionTestResultFeedback(state.value)
        is ResourceState.Stale -> ConnectionTestResultFeedback(state.value)
    }
}

@Composable
private fun ConnectionTestResultFeedback(result: DiagnosticsResult) {
    if (result.ok) {
        Text(
            text = "online",
            style = MaterialTheme.typography.labelLarge,
            color = HobgoblinColors.Success,
        )
        Text(
            text = "Private-key connection succeeded. Save this host to keep its online status.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    Text(
        text = "offline",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.error,
    )
    Text(
        text = result.message.ifBlank { result.category?.label ?: "Connection test failed" },
        color = MaterialTheme.colorScheme.error,
    )
}

@Composable
private fun TemporaryPasswordSetup(
    password: String,
    enabled: Boolean,
    onPasswordChange: (String) -> Unit,
    onInitialize: () -> Unit,
) {
    OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = password,
        onValueChange = onPasswordChange,
        enabled = enabled,
        label = { Text("Temporary password") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
    )
    Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled && password.isNotEmpty(),
        onClick = onInitialize,
    ) {
        Text("Initialize SSH access")
    }
    Text(
        text = "After setup, this host will use the saved private key.",
        style = MaterialTheme.typography.labelMedium,
        color = HobgoblinColors.Success,
    )
}

@Composable
private fun StatusGlyph(
    label: String,
    background: Color,
    content: Color,
) {
    Surface(
        modifier = Modifier.padding(end = HobgoblinSpacing.Xs),
        shape = MaterialTheme.shapes.medium,
        color = background,
    ) {
        Box(
            modifier = Modifier.padding(horizontal = HobgoblinSpacing.Sm, vertical = HobgoblinSpacing.Sm),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                color = content,
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun OptionalBadge() {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
    ) {
        Text(
            modifier = Modifier.padding(horizontal = HobgoblinSpacing.Sm, vertical = HobgoblinSpacing.Xs),
            text = "Optional",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun buildHostProfile(
    initialHost: SshHostProfile?,
    alias: String,
    host: String,
    user: String,
    port: String,
    identityRefId: String?,
): SshHostProfile {
    val parsedPort = SshHostProfile.parsePort(port)
    return if (initialHost == null) {
        SshHostProfile.create(
            alias = alias,
            host = host,
            user = user,
            port = parsedPort,
            identityRefId = identityRefId,
        )
    } else {
        SshHostProfile.update(
            existing = initialHost,
            alias = alias,
            host = host,
            user = user,
            port = parsedPort,
            identityRefId = identityRefId,
        )
    }
}

private const val DefaultSshUser = "root"

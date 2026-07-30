package com.mrongm.hobgoblin.ui.screens.addhost

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
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.DiagnosticsResult
import com.mrongm.hobgoblin.domain.ssh.HOST_DIAGNOSTIC_STATUS_UNHEALTHY
import com.mrongm.hobgoblin.domain.ssh.SshIdentityRef
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.domain.ssh.withDiagnosticResult
import com.mrongm.hobgoblin.ssh.SshHostKeyChangedException
import com.mrongm.hobgoblin.ui.screens.diagnostics.HostDiagnosticsContent
import com.mrongm.hobgoblin.ui.theme.HobgoblinColors
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal fun canOfferSshInitialization(host: String, user: String, port: String): Boolean =
    host.isNotBlank() && user.isNotBlank() && runCatching { SshHostProfile.parsePort(port) }.isSuccess

internal fun initialHostUser(initialHost: SshHostProfile?): String = initialHost?.user ?: DefaultSshUser

internal fun shouldShowSavedHostDiagnostics(initialHost: SshHostProfile?): Boolean = initialHost != null

internal fun resolveHostIdentityRefId(
    selectedIdentityId: String?,
    initializedIdentityRefId: String?,
    existingIdentityRefId: String?,
): String? = selectedIdentityId ?: initializedIdentityRefId ?: existingIdentityRefId

internal fun canExportPrivateKey(
    initialHost: SshHostProfile?,
    identityRefId: String?,
    exportAvailable: Boolean,
): Boolean = initialHost != null && !identityRefId.isNullOrBlank() && exportAvailable

internal fun privateKeyExportFileName(initialHost: SshHostProfile): String {
    val safeHostName = (initialHost.alias ?: initialHost.host)
        .trim()
        .replace(Regex("[^\\p{L}\\p{N}._-]+"), "_")
        .trim('.', '_', '-')
        .take(64)
        .ifBlank { "host" }
    return "hobgoblin-$safeHostName-private-key"
}

internal fun isLatestConnectionTest(
    requestGeneration: Int,
    currentGeneration: Int,
): Boolean = requestGeneration == currentGeneration

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddHostScreen(
    initialHost: SshHostProfile? = null,
    onBack: () -> Unit,
    onImportPrivateKey: (displayName: String, bytes: ByteArray) -> SshIdentityRef,
    onExportPrivateKey: ((String, OutputStream) -> Unit)? = null,
    onTrustHostKey: (SshHostProfile, String) -> Unit = { _, _ -> },
    onInitializeSshAccess: (SshHostProfile, CharArray) -> SshHostProfile = { profile, _ -> profile },
    onRunDiagnostics: (SshHostProfile) -> DiagnosticsResult,
    onSaveHost: (SshHostProfile) -> Unit,
) {
    val context = LocalContext.current
    val identityReadFailed = stringResource(R.string.host_identity_read_failed)
    val sshIdentity = stringResource(R.string.host_ssh_identity)
    val identityImportFailed = stringResource(R.string.host_identity_import_failed)
    val privateKeyExportOpenFailed = stringResource(R.string.host_private_key_export_open_failed)
    val privateKeyExportFailed = stringResource(R.string.host_private_key_export_failed)
    val hostKeyTrustFailed = stringResource(R.string.host_key_trust_failed)
    val initializationFailed = stringResource(R.string.host_ssh_initialization_failed)
    val validationError = stringResource(R.string.host_validation_error)
    val connectionTestFailed = stringResource(R.string.host_connection_test_failed)
    val scope = rememberCoroutineScope()
    var alias by remember(initialHost) { mutableStateOf(initialHost?.alias.orEmpty()) }
    var host by remember(initialHost) { mutableStateOf(initialHost?.host.orEmpty()) }
    var user by remember(initialHost) { mutableStateOf(initialHostUser(initialHost)) }
    var port by remember(initialHost) { mutableStateOf(initialHost?.port?.toString() ?: "22") }
    var error by remember { mutableStateOf<String?>(null) }
    var selectedIdentity by remember { mutableStateOf<SshIdentityRef?>(null) }
    var privateKeyExportConfirmationIdentityId by remember(initialHost) { mutableStateOf<String?>(null) }
    var pendingPrivateKeyExportIdentityId by remember(initialHost) { mutableStateOf<String?>(null) }
    var privateKeyExportSucceeded by remember(initialHost) { mutableStateOf(false) }
    var privateKeyExportError by remember(initialHost) { mutableStateOf<String?>(null) }
    var initializationHostKeyChange by remember(initialHost) { mutableStateOf<SshHostKeyChangedException?>(null) }
    var initializationPassword by remember(initialHost) { mutableStateOf("") }
    var initializationError by remember(initialHost) { mutableStateOf<String?>(null) }
    var initializedIdentityRefId by remember(initialHost) { mutableStateOf<String?>(null) }
    val initializationSubmission = remember(initialHost) { SshInitializationSubmission() }
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
        initializationHostKeyChange = null
        initializationPassword = ""
        initializationError = null
        initializedIdentityRefId = null
        resetConnectionTestState()
    }

    val importPrivateKey = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw IllegalArgumentException(identityReadFailed)
            val displayName = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
                ?: sshIdentity
            onImportPrivateKey(displayName, bytes)
        }.onSuccess {
            selectedIdentity = it
            clearInitializationState()
            error = null
            privateKeyExportSucceeded = false
            privateKeyExportError = null
        }.onFailure {
            error = it.message ?: identityImportFailed
        }
    }

    val exportPrivateKey = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri ->
        val identityId = pendingPrivateKeyExportIdentityId
        if (uri == null || identityId == null) {
            pendingPrivateKeyExportIdentityId = null
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri, "wt")?.use { output ->
                        requireNotNull(onExportPrivateKey)(identityId, output)
                    } ?: throw IllegalArgumentException(privateKeyExportOpenFailed)
                }
            }.onSuccess {
                privateKeyExportSucceeded = true
                privateKeyExportError = null
            }.onFailure {
                privateKeyExportSucceeded = false
                privateKeyExportError = it.message ?: privateKeyExportFailed
            }
            pendingPrivateKeyExportIdentityId = null
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

    fun trustChangedHostKey(fingerprint: String) {
        initializationError = null
        scope.launch {
            runCatching {
                val profile = currentDraftProfile()
                withContext(Dispatchers.IO) { onTrustHostKey(profile, fingerprint) }
            }.onSuccess {
                initializationHostKeyChange = null
                error = null
            }.onFailure {
                initializationError = it.message ?: hostKeyTrustFailed
            }
        }
    }

    fun prepareOrInitializeSshAccess() {
        if (!initializationSubmission.tryStart()) return
        initializationError = null
        scope.launch {
            try {
                val profile = runCatching { currentDraftProfile() }.getOrElse {
                    initializationError = it.message ?: validationError
                    return@launch
                }
                connectionTestGeneration += 1
                val requestGeneration = connectionTestGeneration
                connectionTestState = ResourceState.Loading
                initializationHostKeyChange = null
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
                if (!isLatestConnectionTest(requestGeneration, connectionTestGeneration)) {
                    return@launch
                }
                result.onSuccess { flow ->
                    initializedIdentityRefId = flow.profile.identityRefId
                    initializationHostKeyChange = null
                    initializationError = null
                    error = null
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
            } finally {
                initializationSubmission.finish()
            }
        }
    }

    fun testConnection(trustFingerprint: String? = null) {
        val profile = runCatching { currentDraftProfile() }.getOrElse {
            connectionTestState = ResourceState.Error(
                it.message ?: validationError,
                it,
            )
            lastDiagnosticStatus = HOST_DIAGNOSTIC_STATUS_UNHEALTHY
            return
        }
        connectionTestGeneration += 1
        val requestGeneration = connectionTestGeneration
        connectionTestState = ResourceState.Loading
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    if (trustFingerprint != null) {
                        onTrustHostKey(profile, trustFingerprint)
                    }
                    onRunDiagnostics(profile)
                }
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
                    ResourceState.Error(
                        it.message ?: connectionTestFailed,
                        it,
                    )
                },
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(stringResource(if (initialHost == null) R.string.host_add_title else R.string.host_edit_title))
                },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
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
                        Text(stringResource(R.string.common_cancel))
                    }
                    Button(
                        onClick = {
                            runCatching {
                                currentDraftProfile()
                            }.onSuccess {
                                error = null
                                onSaveHost(it)
                            }.onFailure {
                                error = it.message ?: validationError
                            }
                        },
                    ) {
                        Text(
                            stringResource(
                                if (initialHost == null) R.string.host_save else R.string.host_save_changes,
                            ),
                        )
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
                label = { Text(stringResource(R.string.host_alias)) },
                singleLine = true,
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = host,
                onValueChange = {
                    host = it
                    clearInitializationState()
                },
                label = { Text(stringResource(R.string.host_host)) },
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
                label = { Text(stringResource(R.string.host_user)) },
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
                label = { Text(stringResource(R.string.host_port)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            val effectiveIdentityRefId = currentIdentityRefId()
            val exportAvailable = canExportPrivateKey(
                initialHost = initialHost,
                identityRefId = effectiveIdentityRefId,
                exportAvailable = onExportPrivateKey != null,
            )
            PrivateKeyActions(
                canExport = exportAvailable,
                exportPending = pendingPrivateKeyExportIdentityId != null,
                onImport = { importPrivateKey.launch(arrayOf("*/*")) },
                onExport = {
                    effectiveIdentityRefId?.let { identityId ->
                        privateKeyExportSucceeded = false
                        privateKeyExportError = null
                        privateKeyExportConfirmationIdentityId = identityId
                    }
                },
            )
            if (privateKeyExportSucceeded) {
                Text(
                    stringResource(R.string.host_private_key_export_succeeded),
                    color = HobgoblinColors.Success,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            if (privateKeyExportError != null) {
                Text(
                    privateKeyExportError.orEmpty(),
                    color = MaterialTheme.colorScheme.error,
                )
            }
            val identityLabel = when {
                selectedIdentity != null -> stringResource(
                    R.string.host_identity_selected,
                    selectedIdentity?.displayName.orEmpty(),
                )
                initializedIdentityRefId != null -> stringResource(R.string.host_generated_identity_saved)
                initialHost?.identityRefId != null -> stringResource(R.string.host_existing_identity_selected)
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
                password = initializationPassword,
                error = initializationError,
                initializedIdentityRefId = initializedIdentityRefId,
                hostKeyChange = initializationHostKeyChange,
                initializationInProgress = initializationSubmission.inProgress,
                connectionTestState = connectionTestState,
                onPasswordChange = { initializationPassword = it },
                onTrustHostKey = { trustChangedHostKey(it) },
                onInitialize = { prepareOrInitializeSshAccess() },
                onTestConnection = { testConnection() },
                onReset = { clearInitializationState() },
            )
            if (shouldShowSavedHostDiagnostics(initialHost)) {
                OutlinedCard(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.outlinedCardColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
                ) {
                    Column(
                        modifier = Modifier.padding(HobgoblinSpacing.Md),
                        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
                    ) {
                        Text(stringResource(R.string.host_diagnostics), style = MaterialTheme.typography.titleMedium)
                        Text(
                            stringResource(R.string.host_diagnostics_description),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        HostDiagnosticsContent(
                            state = connectionTestState,
                            onRunDiagnostics = { testConnection() },
                            onTrustHostKey = { fingerprint -> testConnection(fingerprint) },
                        )
                    }
                }
            }
            if (error != null) {
                Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
            }
        }
    }

    privateKeyExportConfirmationIdentityId?.let { identityId ->
        AlertDialog(
            onDismissRequest = { privateKeyExportConfirmationIdentityId = null },
            title = { Text(stringResource(R.string.host_export_private_key_confirmation_title)) },
            text = { Text(stringResource(R.string.host_export_private_key_warning)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        privateKeyExportConfirmationIdentityId = null
                        pendingPrivateKeyExportIdentityId = identityId
                        exportPrivateKey.launch(
                            initialHost?.let(::privateKeyExportFileName) ?: "hobgoblin-private-key",
                        )
                    },
                ) {
                    Text(stringResource(R.string.host_export_private_key))
                }
            },
            dismissButton = {
                TextButton(onClick = { privateKeyExportConfirmationIdentityId = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }
}

@Composable
private fun PrivateKeyActions(
    canExport: Boolean,
    exportPending: Boolean,
    onImport: () -> Unit,
    onExport: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        OutlinedButton(
            modifier = Modifier.weight(1f),
            onClick = onImport,
        ) {
            Text(stringResource(R.string.host_import_private_key))
        }
        if (canExport) {
            OutlinedButton(
                modifier = Modifier.weight(1f),
                enabled = !exportPending,
                onClick = onExport,
            ) {
                Text(stringResource(R.string.host_export_private_key))
            }
        }
    }
}

@Composable
private fun SshInitializationSection(
    enabled: Boolean,
    password: String,
    error: String?,
    initializedIdentityRefId: String?,
    hostKeyChange: SshHostKeyChangedException?,
    initializationInProgress: Boolean,
    connectionTestState: ResourceState<DiagnosticsResult>,
    onPasswordChange: (String) -> Unit,
    onTrustHostKey: (String) -> Unit,
    onInitialize: () -> Unit,
    onTestConnection: () -> Unit,
    onReset: () -> Unit,
) {
    val success = initializedIdentityRefId != null
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
                    label = stringResource(
                        if (success) R.string.host_identity_ready_ok else R.string.host_identity_ready_key,
                    ),
                    background = if (success) HobgoblinColors.Success.copy(alpha = 0.14f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                    content = if (success) HobgoblinColors.Success else MaterialTheme.colorScheme.primary,
                )
                Text(
                    modifier = Modifier.weight(1f),
                    text = stringResource(R.string.host_ssh_key_setup_optional),
                    style = MaterialTheme.typography.titleMedium,
                )
                OptionalBadge()
            }
            when {
                hostKeyChange != null -> {
                    Text(
                        stringResource(R.string.host_key_changed),
                        color = MaterialTheme.colorScheme.error,
                    )
                    Text(
                        stringResource(R.string.host_previous_fingerprint, hostKeyChange.previousFingerprint),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        stringResource(R.string.host_current_fingerprint, hostKeyChange.currentFingerprint),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Button(onClick = { onTrustHostKey(hostKeyChange.currentFingerprint) }) {
                        Text(stringResource(R.string.host_trust_host_key))
                    }
                }

                !success -> {
                    Text(
                        text = stringResource(R.string.host_temporary_password_explanation),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TemporaryPasswordSetup(
                        password = password,
                        enabled = enabled,
                        initializationInProgress = initializationInProgress,
                        onPasswordChange = onPasswordChange,
                        onInitialize = onInitialize,
                    )
                }

                else -> {
                    Text(
                        text = stringResource(R.string.host_ssh_access_initialized),
                        style = MaterialTheme.typography.titleSmall,
                        color = HobgoblinColors.Success,
                    )
                    Text(
                        text = stringResource(R.string.host_future_connections_saved_key),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.host_saved_identity_available),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        enabled = connectionTestState !is ResourceState.Loading,
                        onClick = onTestConnection,
                    ) {
                        Text(
                            if (connectionTestState is ResourceState.Loading) {
                                stringResource(R.string.host_testing_connection)
                            } else {
                                stringResource(R.string.host_test_connection)
                            },
                        )
                    }
                    ConnectionTestFeedback(connectionTestState)
                    TextButton(onClick = onReset) {
                        Text(stringResource(R.string.host_setup_again))
                    }
                }
            }
            if (!enabled) {
                Text(
                    stringResource(R.string.host_setup_fields_required),
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
                text = stringResource(R.string.common_status_offline),
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
    val connectionTestFailed = stringResource(R.string.host_connection_test_failed)
    if (result.ok) {
        Text(
            text = stringResource(R.string.common_status_online),
            style = MaterialTheme.typography.labelLarge,
            color = HobgoblinColors.Success,
        )
        Text(
            text = stringResource(R.string.host_private_key_connection_succeeded),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }

    Text(
        text = stringResource(R.string.common_status_offline),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.error,
    )
    Text(
        text = result.message.ifBlank { result.category?.label ?: connectionTestFailed },
        color = MaterialTheme.colorScheme.error,
    )
}

@Composable
private fun TemporaryPasswordSetup(
    password: String,
    enabled: Boolean,
    initializationInProgress: Boolean,
    onPasswordChange: (String) -> Unit,
    onInitialize: () -> Unit,
) {
    OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = password,
        onValueChange = onPasswordChange,
        enabled = enabled,
        label = { Text(stringResource(R.string.host_temporary_password)) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
    )
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
    Text(
        text = stringResource(R.string.host_after_setup_saved_key),
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
            text = stringResource(R.string.host_optional),
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

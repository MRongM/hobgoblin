package com.mrongm.hobgoblin.ui.screens.portforwards

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.HostPortForwardBindAddress
import com.mrongm.hobgoblin.domain.ssh.HostPortForwardRule
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.ssh.HostPortForwardStatus
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing

data class HostPortForwardDraft(
    val name: String = "",
    val bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
    val localPort: String = "",
    val remotePort: String = "",
)

sealed interface PortForwardDraftValidation {
    data class Valid(val rule: HostPortForwardRule) : PortForwardDraftValidation
    data class Invalid(val error: PortForwardDraftError) : PortForwardDraftValidation
}

sealed interface PortForwardDraftError {
    data object LocalPortNotNumber : PortForwardDraftError
    data object RemotePortNotNumber : PortForwardDraftError
    data class InvalidRule(val detail: String?) : PortForwardDraftError
    data class DuplicateLocalEndpoint(val address: String, val port: Int) : PortForwardDraftError
}

internal fun shouldShowLanWarning(bindAddress: HostPortForwardBindAddress): Boolean =
    bindAddress == HostPortForwardBindAddress.AllInterfaces

internal fun portForwardStatusLabelResource(status: HostPortForwardStatus): Int = when (status) {
    HostPortForwardStatus.Stopped -> R.string.ports_status_stopped
    HostPortForwardStatus.Starting -> R.string.ports_status_starting
    is HostPortForwardStatus.Running -> R.string.ports_status_running
    is HostPortForwardStatus.Failed -> R.string.ports_status_failed
}

internal fun validatePortForwardDraft(
    draft: HostPortForwardDraft,
    existingRules: List<HostPortForwardRule>,
    editingRuleId: String?,
): PortForwardDraftValidation {
    val localPort = draft.localPort.trim().toIntOrNull()
        ?: return PortForwardDraftValidation.Invalid(PortForwardDraftError.LocalPortNotNumber)
    val remotePort = draft.remotePort.trim().toIntOrNull()
        ?: return PortForwardDraftValidation.Invalid(PortForwardDraftError.RemotePortNotNumber)
    val rule = runCatching {
        HostPortForwardRule.create(
            name = draft.name,
            localBindAddress = draft.bindAddress,
            localPort = localPort,
            remotePort = remotePort,
        )
    }.getOrElse {
        return PortForwardDraftValidation.Invalid(PortForwardDraftError.InvalidRule(it.message))
    }
    val duplicate = existingRules.any {
        it.id != editingRuleId && it.localBindAddress == rule.localBindAddress && it.localPort == rule.localPort
    }
    if (duplicate) {
        return PortForwardDraftValidation.Invalid(
            PortForwardDraftError.DuplicateLocalEndpoint(rule.localBindAddress.value, rule.localPort),
        )
    }
    return PortForwardDraftValidation.Valid(if (editingRuleId == null) rule else rule.copy(id = editingRuleId))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostPortsScreen(
    host: SshHostProfile,
    statuses: Map<String, HostPortForwardStatus>,
    onBack: () -> Unit,
    onSaveHost: (SshHostProfile) -> Unit,
    onStart: (HostPortForwardRule) -> Unit,
    onStop: (HostPortForwardRule) -> Unit,
) {
    var draft by remember(host.id) { mutableStateOf<HostPortForwardDraft?>(null) }
    var editingRuleId by remember(host.id) { mutableStateOf<String?>(null) }
    var error by remember(host.id) { mutableStateOf<PortForwardDraftError?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ports_title)) },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            Text(host.title, style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.ports_remote_target_description), style = MaterialTheme.typography.bodyMedium)
            Button(
                onClick = {
                    draft = HostPortForwardDraft()
                    editingRuleId = null
                    error = null
                },
            ) {
                Text(stringResource(R.string.ports_add))
            }
            if (host.portForwards.isEmpty()) {
                Text(stringResource(R.string.ports_empty))
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    items(host.portForwards, key = { it.id }) { rule ->
                        PortForwardRow(
                            rule = rule,
                            status = statuses[rule.id] ?: HostPortForwardStatus.Stopped,
                            onStart = { onStart(rule) },
                            onStop = { onStop(rule) },
                            onEdit = {
                                editingRuleId = rule.id
                                draft = HostPortForwardDraft(
                                    name = rule.name,
                                    bindAddress = rule.localBindAddress,
                                    localPort = rule.localPort.toString(),
                                    remotePort = rule.remotePort.toString(),
                                )
                            },
                            onDelete = {
                                onStop(rule)
                                onSaveHost(host.copy(portForwards = host.portForwards.filterNot { it.id == rule.id }))
                            },
                        )
                    }
                }
            }
            draft?.let { currentDraft ->
                PortForwardEditor(
                    draft = currentDraft,
                    error = error,
                    onDraftChange = { draft = it },
                    onCancel = {
                        draft = null
                        editingRuleId = null
                        error = null
                    },
                    onSave = {
                        when (val validation = validatePortForwardDraft(currentDraft, host.portForwards, editingRuleId)) {
                            is PortForwardDraftValidation.Invalid -> error = validation.error
                            is PortForwardDraftValidation.Valid -> {
                                val nextRules = if (editingRuleId == null) {
                                    host.portForwards + validation.rule
                                } else {
                                    host.portForwards.map { if (it.id == editingRuleId) validation.rule else it }
                                }
                                onSaveHost(host.copy(portForwards = nextRules))
                                draft = null
                                editingRuleId = null
                                error = null
                            }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun PortForwardRow(
    rule: HostPortForwardRule,
    status: HostPortForwardStatus,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            Text(rule.displayName, style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.ports_local_summary, rule.localBindAddress.value, rule.localPort))
            Text(stringResource(R.string.ports_remote_summary, rule.remotePort))
            Text(portForwardStatusLabel(status), style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                if (status is HostPortForwardStatus.Running || status == HostPortForwardStatus.Starting) {
                    TextButton(onClick = onStop) { Text(stringResource(R.string.ports_stop)) }
                } else {
                    TextButton(onClick = onStart) { Text(stringResource(R.string.ports_start)) }
                }
                TextButton(onClick = onEdit) { Text(stringResource(R.string.common_edit)) }
                TextButton(onClick = onDelete) { Text(stringResource(R.string.common_delete)) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PortForwardEditor(
    draft: HostPortForwardDraft,
    error: PortForwardDraftError?,
    onDraftChange: (HostPortForwardDraft) -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.name,
                onValueChange = { onDraftChange(draft.copy(name = it)) },
                label = { Text(stringResource(R.string.ports_name)) },
                singleLine = true,
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.localPort,
                onValueChange = { onDraftChange(draft.copy(localPort = it)) },
                label = { Text(stringResource(R.string.ports_local_port)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
            )
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                HostPortForwardBindAddress.entries.forEachIndexed { index, address ->
                    SegmentedButton(
                        selected = draft.bindAddress == address,
                        onClick = { onDraftChange(draft.copy(bindAddress = address)) },
                        shape = SegmentedButtonDefaults.itemShape(
                            index = index,
                            count = HostPortForwardBindAddress.entries.size,
                        ),
                    ) {
                        Text(
                            stringResource(
                                if (address == HostPortForwardBindAddress.Loopback) {
                                    R.string.ports_bind_local_only
                                } else {
                                    R.string.ports_bind_lan
                                },
                            ),
                        )
                    }
                }
            }
            if (shouldShowLanWarning(draft.bindAddress)) {
                Text(
                    stringResource(R.string.ports_lan_warning),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.remotePort,
                onValueChange = { onDraftChange(draft.copy(remotePort = it)) },
                label = { Text(stringResource(R.string.ports_remote_port)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
            )
            error?.let {
                Text(portForwardDraftErrorMessage(it), color = MaterialTheme.colorScheme.error)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                TextButton(onClick = onCancel) { Text(stringResource(R.string.common_cancel)) }
                Button(onClick = onSave) { Text(stringResource(R.string.common_save)) }
            }
        }
    }
}

@Composable
private fun portForwardStatusLabel(status: HostPortForwardStatus): String =
    if (status is HostPortForwardStatus.Failed) {
        stringResource(portForwardStatusLabelResource(status), status.message)
    } else {
        stringResource(portForwardStatusLabelResource(status))
    }

@Composable
private fun portForwardDraftErrorMessage(error: PortForwardDraftError): String = when (error) {
    PortForwardDraftError.LocalPortNotNumber -> stringResource(R.string.ports_local_number_error)
    PortForwardDraftError.RemotePortNotNumber -> stringResource(R.string.ports_remote_number_error)
    is PortForwardDraftError.InvalidRule -> if (error.detail.isNullOrBlank()) {
        stringResource(R.string.ports_invalid)
    } else {
        stringResource(R.string.ports_invalid_detail, error.detail)
    }
    is PortForwardDraftError.DuplicateLocalEndpoint -> stringResource(
        R.string.ports_duplicate,
        error.address,
        error.port,
    )
}

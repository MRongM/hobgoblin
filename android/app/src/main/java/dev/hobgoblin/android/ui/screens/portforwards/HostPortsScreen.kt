package dev.hobgoblin.android.ui.screens.portforwards

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
import androidx.compose.ui.text.input.KeyboardType
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.ssh.HostPortForwardStatus
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

data class HostPortForwardDraft(
    val name: String = "",
    val bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
    val localPort: String = "",
    val remotePort: String = "",
)

sealed interface PortForwardDraftValidation {
    data class Valid(val rule: HostPortForwardRule) : PortForwardDraftValidation
    data class Invalid(val message: String) : PortForwardDraftValidation
}

internal fun shouldShowLanWarning(bindAddress: HostPortForwardBindAddress): Boolean =
    bindAddress == HostPortForwardBindAddress.AllInterfaces

internal fun portForwardStatusLabel(status: HostPortForwardStatus): String = when (status) {
    HostPortForwardStatus.Stopped -> "Stopped"
    HostPortForwardStatus.Starting -> "Starting"
    is HostPortForwardStatus.Running -> "Running"
    is HostPortForwardStatus.Failed -> "Failed: ${status.message}"
}

internal fun validatePortForwardDraft(
    draft: HostPortForwardDraft,
    existingRules: List<HostPortForwardRule>,
    editingRuleId: String?,
): PortForwardDraftValidation {
    val localPort = draft.localPort.trim().toIntOrNull()
        ?: return PortForwardDraftValidation.Invalid("Local port must be a number")
    val remotePort = draft.remotePort.trim().toIntOrNull()
        ?: return PortForwardDraftValidation.Invalid("Remote port must be a number")
    val rule = runCatching {
        HostPortForwardRule.create(
            name = draft.name,
            localBindAddress = draft.bindAddress,
            localPort = localPort,
            remotePort = remotePort,
        )
    }.getOrElse {
        return PortForwardDraftValidation.Invalid(it.message ?: "Invalid port forward")
    }
    val duplicate = existingRules.any {
        it.id != editingRuleId && it.localBindAddress == rule.localBindAddress && it.localPort == rule.localPort
    }
    if (duplicate) {
        return PortForwardDraftValidation.Invalid("Local port ${rule.localBindAddress.value}:${rule.localPort} is already saved for this host")
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
    var error by remember(host.id) { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ports") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
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
            Text("Remote target is fixed to 127.0.0.1 on the SSH host.", style = MaterialTheme.typography.bodyMedium)
            Button(
                onClick = {
                    draft = HostPortForwardDraft()
                    editingRuleId = null
                    error = null
                },
            ) {
                Text("Add port")
            }
            if (host.portForwards.isEmpty()) {
                Text("No ports")
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
                            is PortForwardDraftValidation.Invalid -> error = validation.message
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
            Text("Local: ${rule.localBindAddress.value}:${rule.localPort}")
            Text("Remote: 127.0.0.1:${rule.remotePort}")
            Text(portForwardStatusLabel(status), style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                if (status is HostPortForwardStatus.Running || status == HostPortForwardStatus.Starting) {
                    TextButton(onClick = onStop) { Text("Stop") }
                } else {
                    TextButton(onClick = onStart) { Text("Start") }
                }
                TextButton(onClick = onEdit) { Text("Edit") }
                TextButton(onClick = onDelete) { Text("Delete") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PortForwardEditor(
    draft: HostPortForwardDraft,
    error: String?,
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
                label = { Text("Name") },
                singleLine = true,
            )
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.localPort,
                onValueChange = { onDraftChange(draft.copy(localPort = it)) },
                label = { Text("Local port") },
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
                        Text(address.label)
                    }
                }
            }
            if (shouldShowLanWarning(draft.bindAddress)) {
                Text(
                    "LAN mode exposes this phone port to devices that can reach it on the local network.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = draft.remotePort,
                onValueChange = { onDraftChange(draft.copy(remotePort = it)) },
                label = { Text("Remote port") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
            )
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                TextButton(onClick = onCancel) { Text("Cancel") }
                Button(onClick = onSave) { Text("Save") }
            }
        }
    }
}

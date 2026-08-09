package com.mrongm.hobgoblin.ui.screens.diagnostics

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.DiagnosticCategory
import com.mrongm.hobgoblin.domain.ssh.DiagnosticStage
import com.mrongm.hobgoblin.domain.ssh.DiagnosticStageResult
import com.mrongm.hobgoblin.domain.ssh.DiagnosticStatus
import com.mrongm.hobgoblin.domain.ssh.DiagnosticsResult
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing

@Composable
internal fun HostDiagnosticsContent(
    state: ResourceState<DiagnosticsResult>,
    onRunDiagnostics: () -> Unit,
    onTrustHostKey: (String) -> Unit,
    onOpenTerminal: (() -> Unit)? = null,
) {
    Button(
        enabled = state !is ResourceState.Loading,
        onClick = onRunDiagnostics,
    ) {
        Text(
            stringResource(
                if (state is ResourceState.Loading) R.string.diagnostics_running else R.string.diagnostics_run,
            ),
        )
    }
    when (state) {
        ResourceState.Idle -> DiagnosticStageList(stages = pendingDiagnosticStages())
        ResourceState.Loading -> DiagnosticStageList(
            stages = pendingDiagnosticStages(running = DiagnosticStage.SSH),
        )
        is ResourceState.Error -> {
            Text(stringResource(R.string.diagnostics_status_failed), color = MaterialTheme.colorScheme.error)
            Text(state.message)
            DiagnosticStageList(stages = pendingDiagnosticStages())
        }

        is ResourceState.Stale -> DiagnosticResultContent(
            result = state.value,
            onTrustHostKey = onTrustHostKey,
            onRunDiagnostics = onRunDiagnostics,
            onOpenTerminal = onOpenTerminal,
        )

        is ResourceState.Loaded -> DiagnosticResultContent(
            result = state.value,
            onTrustHostKey = onTrustHostKey,
            onRunDiagnostics = onRunDiagnostics,
            onOpenTerminal = onOpenTerminal,
        )
    }
}

@Composable
private fun DiagnosticResultContent(
    result: DiagnosticsResult,
    onTrustHostKey: (String) -> Unit,
    onRunDiagnostics: () -> Unit,
    onOpenTerminal: (() -> Unit)?,
) {
    DiagnosticStageList(stages = result.stages)
    if (result.category == DiagnosticCategory.HostKey && result.hostKeyFingerprint != null) {
        Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(HobgoblinSpacing.Md),
                verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
            ) {
                Text(result.message)
                Text(result.hostKeyFingerprint)
                Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    Button(
                        onClick = {
                            onTrustHostKey(result.hostKeyFingerprint)
                            onRunDiagnostics()
                        },
                    ) {
                        Text(stringResource(R.string.diagnostics_trust_host_key))
                    }
                    TextButton(onClick = {}) {
                        Text(stringResource(R.string.common_cancel))
                    }
                }
            }
        }
    }
    if (result.ok && onOpenTerminal != null) {
        Button(onClick = onOpenTerminal) {
            Text(stringResource(R.string.diagnostics_open_terminal))
        }
    }
}

@Composable
private fun DiagnosticStageList(stages: List<DiagnosticStageResult>) {
    val expanded = remember { mutableStateMapOf<DiagnosticStage, Boolean>() }
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
        stages.forEach { stage ->
            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(HobgoblinSpacing.Md),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(stage.stage.labelResource()))
                        Text(stringResource(stage.status.labelResource()))
                    }
                    if (stage.category != null || stage.message.isNotBlank()) {
                        Text(
                            stage.category?.let { stringResource(it.labelResource()) } ?: stage.message,
                            style = MaterialTheme.typography.labelMedium,
                        )
                        if (stage.message.isNotBlank()) Text(stage.message)
                    }
                    if (stage.details.isNotBlank()) {
                        TextButton(onClick = { expanded[stage.stage] = expanded[stage.stage] != true }) {
                            Text(stringResource(R.string.diagnostics_details))
                        }
                        AnimatedVisibility(visible = expanded[stage.stage] == true) {
                            Text(stage.details, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

private fun DiagnosticStage.labelResource(): Int = when (this) {
    DiagnosticStage.SSH -> R.string.diagnostics_stage_ssh
    DiagnosticStage.Shell -> R.string.diagnostics_stage_shell
    DiagnosticStage.Git -> R.string.diagnostics_stage_git
    DiagnosticStage.Path -> R.string.diagnostics_stage_path
    DiagnosticStage.Repo -> R.string.diagnostics_stage_repo
}

private fun DiagnosticStatus.labelResource(): Int = when (this) {
    DiagnosticStatus.Pending -> R.string.diagnostics_status_pending
    DiagnosticStatus.Running -> R.string.diagnostics_status_running
    DiagnosticStatus.Passed -> R.string.diagnostics_status_passed
    DiagnosticStatus.Failed -> R.string.diagnostics_status_failed
    DiagnosticStatus.Skipped -> R.string.diagnostics_status_skipped
}

private fun DiagnosticCategory.labelResource(): Int = when (this) {
    DiagnosticCategory.AuthFailed -> R.string.diagnostics_category_auth_failed
    DiagnosticCategory.HostKey -> R.string.diagnostics_category_host_key
    DiagnosticCategory.Unreachable -> R.string.diagnostics_category_unreachable
    DiagnosticCategory.ShellFailed -> R.string.diagnostics_category_shell_failed
    DiagnosticCategory.GitMissing -> R.string.diagnostics_category_git_missing
    DiagnosticCategory.PathMissing -> R.string.diagnostics_category_path_missing
    DiagnosticCategory.NotARepo -> R.string.diagnostics_category_not_repo
    DiagnosticCategory.Timeout -> R.string.diagnostics_category_timeout
    DiagnosticCategory.Cancelled -> R.string.diagnostics_category_cancelled
    DiagnosticCategory.ConfigChanged -> R.string.diagnostics_category_config_changed
    DiagnosticCategory.Unknown -> R.string.diagnostics_category_unknown
}

internal fun pendingDiagnosticStages(running: DiagnosticStage? = null): List<DiagnosticStageResult> =
    listOf(
        DiagnosticStage.SSH,
        DiagnosticStage.Shell,
    ).map { stage ->
        DiagnosticStageResult(
            stage = stage,
            status = if (stage == running) DiagnosticStatus.Running else DiagnosticStatus.Pending,
        )
    }

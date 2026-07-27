package com.mrongm.hobgoblin.ui.screens.terminals

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.res.stringResource
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.data.ManualItemOrderPolicy
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.ui.components.ManualReorderHandle
import com.mrongm.hobgoblin.ui.components.ManualReorderState
import com.mrongm.hobgoblin.ui.components.manualReorderItem
import com.mrongm.hobgoblin.ui.components.rememberManualReorderState
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.mrongm.hobgoblin.ui.text.resolve

internal fun terminalOverviewTitleText(session: TerminalSessionRecord): LocalizedText = when {
    session.displayName.isNotBlank() -> LocalizedText(R.string.common_value, listOf(session.displayName))
    session.terminalId != null -> LocalizedText(R.string.common_value, listOf("terminal-${session.terminalId}"))
    else -> LocalizedText(R.string.terminals_host_terminal)
}

internal fun terminalOverviewStatusText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    when (session.status) {
        com.mrongm.hobgoblin.terminals.TerminalSessionStatus.Starting -> R.string.terminal_status_starting
        com.mrongm.hobgoblin.terminals.TerminalSessionStatus.Running -> R.string.terminal_status_running
        com.mrongm.hobgoblin.terminals.TerminalSessionStatus.Exited -> R.string.terminal_status_exited
        com.mrongm.hobgoblin.terminals.TerminalSessionStatus.Failed -> R.string.terminal_status_failed
        com.mrongm.hobgoblin.terminals.TerminalSessionStatus.Disconnected -> R.string.terminal_status_disconnected
    },
)

internal fun terminalOverviewCloseConfirmationText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    resourceId = if (session.tmuxIdentity != null) R.string.terminals_close_tmux else R.string.terminals_close_native,
    formatArgs = listOf(terminalOverviewTitleText(session)),
)

internal fun terminalOverviewDeleteConfirmationText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    resourceId = if (session.tmuxIdentity != null) R.string.terminals_delete_tmux else R.string.terminals_delete_native,
    formatArgs = listOf(terminalOverviewTitleText(session)),
)

internal fun terminalOverviewOrderAfterDelete(
    orderedIds: List<String>,
    deletedId: String,
): List<String> = orderedIds.filterNot { it == deletedId }

internal data class TerminalOverviewSource(
    val contextLabel: LocalizedText,
    val locationLabel: LocalizedText,
    val path: String,
)

internal fun terminalOverviewSource(
    session: TerminalSessionRecord,
    hosts: List<SshHostProfile>,
    repositories: List<RemoteRepositoryProfile>,
): TerminalOverviewSource {
    val hostReference = session.hostId.trim().substringBefore("/")
    val host = hosts.firstOrNull { candidate ->
        candidate.id == session.hostId || candidate.subtitle == hostReference
    }
    val repository = session.repositoryId?.let { repositoryId ->
        repositories.firstOrNull { it.id == repositoryId }
    }
    val path = terminalSessionRemotePath(session.remotePath)
    val projectRoot = session.repositoryRemotePath
        ?.let(::terminalSessionRemotePath)
        ?: repository?.remotePath?.let(::terminalSessionRemotePath)
    val projectLabel: Any = when {
        session.repositoryId == null -> LocalizedText(R.string.terminals_host_terminal)
        repository != null -> repository.title
        else -> LocalizedText(R.string.terminals_project_unavailable)
    }
    val locationLabel = when {
        session.repositoryId == null -> LocalizedText(R.string.terminals_host_directory)
        projectRoot == path -> LocalizedText(R.string.terminals_project_root)
        repository?.isGitRepository == true -> LocalizedText(R.string.terminals_branch_directory)
        else -> LocalizedText(R.string.terminals_workspace_directory)
    }
    val hostLabel: Any = host?.title
        ?: hostReference.takeIf { it.isNotBlank() }
        ?: LocalizedText(R.string.terminals_host_unavailable)
    return TerminalOverviewSource(
        contextLabel = LocalizedText(R.string.terminals_context, listOf(hostLabel, projectLabel)),
        locationLabel = locationLabel,
        path = path,
    )
}

@Composable
fun TerminalsScreen(
    sessions: List<TerminalSessionRecord>,
    hosts: List<SshHostProfile>,
    repositories: List<RemoteRepositoryProfile>,
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit,
    onReconnectTerminalSession: (TerminalSessionRecord) -> Unit,
    onCloseTerminalSession: (String) -> Unit,
    onDeleteTerminalSession: (String) -> Unit,
    initialManualOrder: List<String> = emptyList(),
    onSaveManualOrder: (List<String>) -> Unit = {},
) {
    var manualOrder by remember(initialManualOrder) { mutableStateOf(initialManualOrder) }
    var pendingCloseSessionId by remember { mutableStateOf<String?>(null) }
    var pendingDeleteSessionId by remember { mutableStateOf<String?>(null) }
    val defaultOrderedSessions = terminalOverviewOrderedSessions(sessions)
    val orderedSessions = ManualItemOrderPolicy.apply(
        defaultOrderedSessions,
        manualOrder,
        TerminalSessionRecord::id,
    )
    val reorderState = rememberManualReorderState(
        onMove = { draggedId, targetId ->
            manualOrder = ManualItemOrderPolicy.move(
                orderedSessions.map(TerminalSessionRecord::id),
                draggedId,
                targetId,
            )
        },
        onFinished = { onSaveManualOrder(manualOrder) },
    )
    if (orderedSessions.isEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(HobgoblinSpacing.Md),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                stringResource(R.string.terminals_empty_title),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                stringResource(R.string.terminals_empty_description),
                modifier = Modifier.padding(top = HobgoblinSpacing.Sm),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(HobgoblinSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        items(orderedSessions, key = { it.id }) { session ->
            TerminalOverviewRow(
                modifier = Modifier.manualReorderItem(reorderState, session.id),
                session = session,
                source = terminalOverviewSource(session, hosts, repositories),
                reorderState = reorderState,
                onOpen = { onOpenTerminalSession(session) },
                onReconnect = { onReconnectTerminalSession(session) },
                onRequestClose = { pendingCloseSessionId = session.id },
                onRequestDelete = { pendingDeleteSessionId = session.id },
            )
        }
    }

    val pendingCloseSession = orderedSessions.firstOrNull { it.id == pendingCloseSessionId }
    if (pendingCloseSession != null) {
        AlertDialog(
            onDismissRequest = { pendingCloseSessionId = null },
            title = { Text(stringResource(R.string.repository_close_terminal_title)) },
            text = { Text(terminalOverviewCloseConfirmationText(pendingCloseSession).resolve()) },
            confirmButton = {
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = {
                        pendingCloseSessionId = null
                        onCloseTerminalSession(pendingCloseSession.id)
                    },
                ) {
                    Text(stringResource(R.string.terminal_close_terminal))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingCloseSessionId = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }

    val pendingDeleteSession = orderedSessions.firstOrNull { it.id == pendingDeleteSessionId }
    if (pendingDeleteSession != null) {
        AlertDialog(
            onDismissRequest = { pendingDeleteSessionId = null },
            title = { Text(stringResource(R.string.repository_delete_terminal_title)) },
            text = { Text(terminalOverviewDeleteConfirmationText(pendingDeleteSession).resolve()) },
            confirmButton = {
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = {
                        val nextOrder = terminalOverviewOrderAfterDelete(
                            orderedIds = orderedSessions.map(TerminalSessionRecord::id),
                            deletedId = pendingDeleteSession.id,
                        )
                        manualOrder = nextOrder
                        onSaveManualOrder(nextOrder)
                        pendingDeleteSessionId = null
                        onDeleteTerminalSession(pendingDeleteSession.id)
                    },
                ) {
                    Text(stringResource(R.string.terminals_delete_terminal))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteSessionId = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }
}

@Composable
private fun TerminalOverviewRow(
    modifier: Modifier,
    session: TerminalSessionRecord,
    source: TerminalOverviewSource,
    reorderState: ManualReorderState,
    onOpen: () -> Unit,
    onReconnect: () -> Unit,
    onRequestClose: () -> Unit,
    onRequestDelete: () -> Unit,
) {
    val title = terminalOverviewTitleText(session).resolve()
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    title,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    terminalOverviewStatusText(session).resolve(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                ManualReorderHandle(
                    state = reorderState,
                    itemKey = session.id,
                    itemLabel = title,
                )
            }
            Text(
                source.contextLabel.resolve(),
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    LocalizedText(R.string.terminals_location, listOf(source.locationLabel)).resolve(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 1,
                )
                Text(
                    source.path,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TerminalSessionIdentityDetails(session = session)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(
                    enabled = terminalSessionReconnectAvailable(session),
                    onClick = onReconnect,
                ) {
                    Text(stringResource(R.string.terminal_action_reconnect))
                }
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = onRequestClose,
                ) {
                    Text(stringResource(R.string.repository_terminal_close))
                }
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = onRequestDelete,
                ) {
                    Text(stringResource(R.string.common_delete))
                }
                TextButton(onClick = onOpen) {
                    Text(stringResource(R.string.common_open))
                }
            }
        }
    }
}

package com.mrongm.hobgoblin.ui.screens.terminals

import android.text.format.DateUtils
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
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.ui.theme.HobgoblinColors
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
        TerminalSessionStatus.Starting -> R.string.terminal_status_starting
        TerminalSessionStatus.Running -> R.string.terminal_status_running
        TerminalSessionStatus.Exited -> R.string.terminal_status_exited
        TerminalSessionStatus.Failed -> R.string.terminal_status_failed
        TerminalSessionStatus.Disconnected -> R.string.terminal_status_disconnected
    },
)

internal fun terminalOverviewOpenedText(relativeTime: CharSequence): LocalizedText =
    LocalizedText(R.string.terminals_opened_at, listOf(relativeTime))

internal enum class TerminalOverviewTone {
    Neutral,
    Running,
    Alert,
    Exited,
}

internal fun terminalOverviewTone(status: TerminalSessionStatus): TerminalOverviewTone = when (status) {
    TerminalSessionStatus.Starting -> TerminalOverviewTone.Neutral
    TerminalSessionStatus.Running -> TerminalOverviewTone.Running
    TerminalSessionStatus.Disconnected,
    TerminalSessionStatus.Failed,
    -> TerminalOverviewTone.Alert
    TerminalSessionStatus.Exited -> TerminalOverviewTone.Exited
}

internal enum class TerminalOverviewConnectionAction {
    Reconnect,
    Close,
}

internal fun terminalOverviewConnectionAction(
    session: TerminalSessionRecord,
): TerminalOverviewConnectionAction = if (terminalSessionReconnectAvailable(session)) {
    TerminalOverviewConnectionAction.Reconnect
} else {
    TerminalOverviewConnectionAction.Close
}

@Composable
private fun TerminalOverviewStatusBadge(session: TerminalSessionRecord) {
    val (containerColor, contentColor) = when (terminalOverviewTone(session.status)) {
        TerminalOverviewTone.Neutral ->
            MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        TerminalOverviewTone.Running -> HobgoblinColors.Success to Color.White
        TerminalOverviewTone.Alert ->
            MaterialTheme.colorScheme.error to MaterialTheme.colorScheme.onError
        TerminalOverviewTone.Exited -> MaterialTheme.colorScheme.onSurface
            .copy(alpha = 0.18f)
            .compositeOver(MaterialTheme.colorScheme.surface) to MaterialTheme.colorScheme.onSurface
    }

    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            terminalOverviewStatusText(session).resolve(),
            modifier = Modifier.padding(
                horizontal = HobgoblinSpacing.Sm,
                vertical = HobgoblinSpacing.Xs,
            ),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

internal fun terminalOverviewCloseConfirmationText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    resourceId = if (terminalSessionIsTmuxBacked(session)) {
        R.string.terminals_close_tmux
    } else {
        R.string.terminals_close_native
    },
    formatArgs = listOf(terminalOverviewTitleText(session)),
)

internal fun terminalOverviewDeleteConfirmationText(session: TerminalSessionRecord): LocalizedText = LocalizedText(
    resourceId = if (terminalSessionIsTmuxBacked(session)) {
        R.string.terminals_delete_tmux
    } else {
        R.string.terminals_delete_native
    },
    formatArgs = listOf(terminalOverviewTitleText(session)),
)

internal data class TerminalOverviewSource(
    val hostTitle: LocalizedText,
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
    val hostTitle = when {
        host != null -> LocalizedText(R.string.common_value, listOf(host.title))
        hostReference.isNotBlank() -> LocalizedText(R.string.common_value, listOf(hostReference))
        else -> LocalizedText(R.string.terminals_host_unavailable)
    }
    val contextLabel = if (session.repositoryId == null) {
        terminalOverviewTitleText(session)
    } else {
        LocalizedText(
            R.string.terminals_context,
            listOf(terminalOverviewTitleText(session), projectLabel),
        )
    }
    return TerminalOverviewSource(
        hostTitle = hostTitle,
        contextLabel = contextLabel,
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
) {
    var pendingCloseSessionId by remember { mutableStateOf<String?>(null) }
    var pendingDeleteSessionId by remember { mutableStateOf<String?>(null) }
    val orderedSessions = terminalOverviewOrderedSessions(sessions)
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
                modifier = Modifier,
                session = session,
                source = terminalOverviewSource(session, hosts, repositories),
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
    onOpen: () -> Unit,
    onReconnect: () -> Unit,
    onRequestClose: () -> Unit,
    onRequestDelete: () -> Unit,
) {
    val title = source.hostTitle.resolve()
    OutlinedCard(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        colors = CardDefaults.outlinedCardColors(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
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
                TerminalOverviewStatusBadge(session)
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
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                Text(
                    source.path,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    softWrap = true,
                )
            }
            Text(
                terminalOverviewOpenedText(
                    DateUtils.getRelativeTimeSpanString(
                        session.openedAt,
                        System.currentTimeMillis(),
                        DateUtils.MINUTE_IN_MILLIS,
                    ),
                ).resolve(),
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            TerminalSessionIdentityDetails(session = session)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                when (terminalOverviewConnectionAction(session)) {
                    TerminalOverviewConnectionAction.Reconnect -> TextButton(onClick = onReconnect) {
                        Text(stringResource(R.string.terminal_action_reconnect))
                    }
                    TerminalOverviewConnectionAction.Close -> TextButton(
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = MaterialTheme.colorScheme.error,
                        ),
                        onClick = onRequestClose,
                    ) {
                        Text(stringResource(R.string.repository_terminal_close))
                    }
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

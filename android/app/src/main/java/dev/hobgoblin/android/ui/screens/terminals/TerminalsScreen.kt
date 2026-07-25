package dev.hobgoblin.android.ui.screens.terminals

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
import dev.hobgoblin.android.data.ManualItemOrderPolicy
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.ui.components.ManualReorderHandle
import dev.hobgoblin.android.ui.components.ManualReorderState
import dev.hobgoblin.android.ui.components.manualReorderItem
import dev.hobgoblin.android.ui.components.rememberManualReorderState
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

internal fun terminalOverviewTitle(session: TerminalSessionRecord): String =
    session.displayName.ifBlank {
        session.terminalId?.let { "terminal-$it" } ?: "Host terminal"
    }

internal fun terminalOverviewStatus(session: TerminalSessionRecord): String = session.status.name.lowercase()

internal fun terminalOverviewCloseConfirmationText(session: TerminalSessionRecord): String {
    val title = terminalOverviewTitle(session)
    return if (session.tmuxIdentity != null) {
        "This closes the Android connection for $title but keeps it in the terminal list so you can reconnect later. " +
            "The remote tmux session keeps running."
    } else {
        "This stops $title but keeps it in the terminal list so you can reconnect later."
    }
}

internal fun terminalOverviewDeleteConfirmationText(session: TerminalSessionRecord): String {
    val title = terminalOverviewTitle(session)
    val message = "This removes $title from the terminal list and stops its Android connection if active."
    return if (session.tmuxIdentity != null) {
        "$message The remote tmux session keeps running."
    } else message
}

internal fun terminalOverviewOrderAfterDelete(
    orderedIds: List<String>,
    deletedId: String,
): List<String> = orderedIds.filterNot { it == deletedId }

internal data class TerminalOverviewSource(
    val contextLabel: String,
    val locationLabel: String,
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
    val projectLabel = when {
        session.repositoryId == null -> "Host terminal"
        repository != null -> repository.title
        else -> "Project unavailable"
    }
    val locationLabel = when {
        session.repositoryId == null -> "Host directory"
        projectRoot == path -> "Project root"
        repository?.isGitRepository == true -> "Branch directory"
        else -> "Workspace directory"
    }
    return TerminalOverviewSource(
        contextLabel = "${host?.title ?: hostReference.ifBlank { "Host unavailable" }} · $projectLabel",
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
                "No terminals",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Existing Host and Project terminal sessions will appear here.",
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
            title = { Text("Close terminal?") },
            text = { Text(terminalOverviewCloseConfirmationText(pendingCloseSession)) },
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
                    Text("Close terminal")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingCloseSessionId = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    val pendingDeleteSession = orderedSessions.firstOrNull { it.id == pendingDeleteSessionId }
    if (pendingDeleteSession != null) {
        AlertDialog(
            onDismissRequest = { pendingDeleteSessionId = null },
            title = { Text("Delete terminal?") },
            text = { Text(terminalOverviewDeleteConfirmationText(pendingDeleteSession)) },
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
                    Text("Delete terminal")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteSessionId = null }) {
                    Text("Cancel")
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
                    terminalOverviewTitle(session),
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    terminalOverviewStatus(session),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                ManualReorderHandle(
                    state = reorderState,
                    itemKey = session.id,
                    itemLabel = terminalOverviewTitle(session),
                )
            }
            Text(
                source.contextLabel,
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
                    "${source.locationLabel} ·",
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
                    Text("Reconnect")
                }
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = onRequestClose,
                ) {
                    Text("Close")
                }
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = onRequestDelete,
                ) {
                    Text("Delete")
                }
                TextButton(onClick = onOpen) {
                    Text("Open")
                }
            }
        }
    }
}

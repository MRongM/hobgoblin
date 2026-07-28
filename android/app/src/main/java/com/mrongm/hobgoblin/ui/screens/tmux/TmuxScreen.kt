package com.mrongm.hobgoblin.ui.screens.tmux

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.data.ManualItemOrderPolicy
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.HostTmuxPathGroup
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.ui.screens.terminals.terminalOverviewStatusText
import com.mrongm.hobgoblin.ui.theme.HobgoblinColors
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import com.mrongm.hobgoblin.ui.text.resolve
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TmuxScreen(
    hosts: List<SshHostProfile>,
    selectedHost: SshHostProfile?,
    tmuxState: ResourceState<List<HostTmuxPathGroup>>,
    tmuxRefreshing: Boolean,
    onSelectHost: (String) -> Unit,
    onChangeHost: () -> Unit,
    onAddHost: () -> Unit,
    onRefreshTmux: () -> Unit,
    onOpenTmuxSession: (HostDiscoveredTmuxSession) -> Unit,
    retainedTmuxSessions: Map<HostDiscoveredTmuxSession, TerminalSessionRecord>,
    onReconnectTmuxSession: (TerminalSessionRecord) -> Unit,
    onCloseTmuxSession: (String) -> Unit,
    onDeleteTmuxSession: suspend (HostDiscoveredTmuxSession, TerminalSessionRecord, Boolean) -> Unit,
    hostOrder: List<String> = emptyList(),
) {
    if (selectedHost == null) {
        TmuxHostChooser(
            hosts = ManualItemOrderPolicy.apply(hosts, hostOrder, SshHostProfile::id),
            onSelectHost = onSelectHost,
            onAddHost = onAddHost,
        )
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        SelectedTmuxHost(
            host = selectedHost,
            isRefreshing = tmuxRefreshing,
            onRefresh = onRefreshTmux,
            onChangeHost = onChangeHost,
        )
        Box(modifier = Modifier.weight(1f)) {
            HostTmuxCatalog(
                hostTitle = selectedHost.title,
                state = tmuxState,
                isRefreshing = tmuxRefreshing,
                onRefresh = onRefreshTmux,
                onChangeHost = onChangeHost,
                onOpenSession = onOpenTmuxSession,
                retainedSessions = retainedTmuxSessions,
                onReconnectSession = onReconnectTmuxSession,
                onCloseSession = onCloseTmuxSession,
                onDeleteSession = onDeleteTmuxSession,
            )
        }
    }
}

@Composable
private fun TmuxHostChooser(
    hosts: List<SshHostProfile>,
    onSelectHost: (String) -> Unit,
    onAddHost: () -> Unit,
) {
    if (hosts.isEmpty()) {
        FeedbackState(
            title = stringResource(R.string.tmux_no_hosts_title),
            description = stringResource(R.string.tmux_no_hosts_description),
            primaryLabel = stringResource(R.string.navigation_add_host),
            onPrimary = onAddHost,
        )
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(HobgoblinSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        item(key = "chooser-heading") {
            Column(
                modifier = Modifier.padding(bottom = HobgoblinSpacing.Sm),
                verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
            ) {
                Text(
                    stringResource(R.string.tmux_choose_host_title),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    stringResource(R.string.tmux_choose_host_description),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(hosts, key = SshHostProfile::id) { host ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp)
                    .semantics { contentDescription = "${host.title}, ${host.subtitle}" },
                onClick = { onSelectHost(host.id) },
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(HobgoblinSpacing.Md),
                    horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                    ) {
                        Text(
                            host.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            host.subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        stringResource(R.string.tmux_scan_host),
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }
    }
}

@Composable
private fun SelectedTmuxHost(
    host: SshHostProfile,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onChangeHost: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = HobgoblinSpacing.Md, vertical = HobgoblinSpacing.Sm),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(
                start = HobgoblinSpacing.Md,
                top = HobgoblinSpacing.Sm,
                end = HobgoblinSpacing.Sm,
                bottom = HobgoblinSpacing.Sm,
            ),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                ) {
                    Text(
                        stringResource(R.string.tmux_selected_host_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        host.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        host.subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = onChangeHost) {
                    Text(stringResource(R.string.tmux_change_host))
                }
            }
            TextButton(
                modifier = Modifier.align(Alignment.End),
                enabled = !isRefreshing,
                onClick = onRefresh,
            ) {
                Text(stringResource(R.string.common_refresh))
            }
        }
    }
}

private data class HostTmuxActionTarget(
    val discovery: HostDiscoveredTmuxSession,
    val retainedSession: TerminalSessionRecord,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HostTmuxCatalog(
    hostTitle: String,
    state: ResourceState<List<HostTmuxPathGroup>>,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onChangeHost: () -> Unit,
    onOpenSession: (HostDiscoveredTmuxSession) -> Unit,
    retainedSessions: Map<HostDiscoveredTmuxSession, TerminalSessionRecord>,
    onReconnectSession: (TerminalSessionRecord) -> Unit,
    onCloseSession: (String) -> Unit,
    onDeleteSession: suspend (HostDiscoveredTmuxSession, TerminalSessionRecord, Boolean) -> Unit,
) {
    var pendingClose by remember { mutableStateOf<HostTmuxActionTarget?>(null) }
    var pendingDelete by remember { mutableStateOf<HostTmuxActionTarget?>(null) }
    var closeRemoteOnDelete by remember { mutableStateOf(HostTmuxCloseRemoteOnDeleteDefault) }
    var deletePending by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }
    val deleteFailedMessage = stringResource(R.string.host_tmux_delete_failed)
    val scope = rememberCoroutineScope()

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        when (state) {
            ResourceState.Idle,
            ResourceState.Loading,
            -> CenteredMessage(stringResource(R.string.tmux_scanning_host, hostTitle))
            is ResourceState.Error -> TmuxErrorState(
                message = state.message,
                onRetry = onRefresh,
                onChangeHost = onChangeHost,
            )
            is ResourceState.Loaded -> HostTmuxGroups(
                groups = state.value,
                staleReason = null,
                actionError = actionError,
                onRefresh = onRefresh,
                onChangeHost = onChangeHost,
                onOpenSession = onOpenSession,
                retainedSessions = retainedSessions,
                onReconnectSession = onReconnectSession,
                onRequestClose = { discovery, retainedSession ->
                    pendingClose = HostTmuxActionTarget(discovery, retainedSession)
                },
                onRequestDelete = { discovery, retainedSession ->
                    closeRemoteOnDelete = HostTmuxCloseRemoteOnDeleteDefault
                    pendingDelete = HostTmuxActionTarget(discovery, retainedSession)
                },
            )
            is ResourceState.Stale -> HostTmuxGroups(
                groups = state.value,
                staleReason = state.reason,
                actionError = actionError,
                onRefresh = onRefresh,
                onChangeHost = onChangeHost,
                onOpenSession = onOpenSession,
                retainedSessions = retainedSessions,
                onReconnectSession = onReconnectSession,
                onRequestClose = { discovery, retainedSession ->
                    pendingClose = HostTmuxActionTarget(discovery, retainedSession)
                },
                onRequestDelete = { discovery, retainedSession ->
                    closeRemoteOnDelete = HostTmuxCloseRemoteOnDeleteDefault
                    pendingDelete = HostTmuxActionTarget(discovery, retainedSession)
                },
            )
        }
    }

    pendingClose?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingClose = null },
            title = { Text(stringResource(R.string.repository_close_terminal_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.host_tmux_close_description,
                        target.discovery.terminalNumber,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = {
                        pendingClose = null
                        onCloseSession(target.retainedSession.id)
                    },
                ) {
                    Text(stringResource(R.string.repository_terminal_close))
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingClose = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = {
                if (!deletePending) {
                    pendingDelete = null
                    closeRemoteOnDelete = HostTmuxCloseRemoteOnDeleteDefault
                }
            },
            title = { Text(stringResource(R.string.host_tmux_delete_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    actionError?.let { message ->
                        Text(
                            message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Text(
                        stringResource(
                            R.string.host_tmux_delete_local_description,
                            target.discovery.terminalNumber,
                        ),
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !deletePending) {
                                closeRemoteOnDelete = !closeRemoteOnDelete
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = closeRemoteOnDelete,
                            onCheckedChange = { closeRemoteOnDelete = it },
                            enabled = !deletePending,
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs)) {
                            Text(stringResource(R.string.host_tmux_close_remote_on_delete))
                            Text(
                                stringResource(R.string.host_tmux_close_remote_warning),
                                style = MaterialTheme.typography.bodySmall,
                                color = if (closeRemoteOnDelete) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !deletePending,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    onClick = {
                        if (deletePending) return@TextButton
                        deletePending = true
                        actionError = null
                        scope.launch {
                            runCatching {
                                onDeleteSession(
                                    target.discovery,
                                    target.retainedSession,
                                    closeRemoteOnDelete,
                                )
                            }.onSuccess {
                                pendingDelete = null
                                closeRemoteOnDelete = HostTmuxCloseRemoteOnDeleteDefault
                            }.onFailure { error ->
                                actionError = error.message?.takeIf(String::isNotBlank) ?: deleteFailedMessage
                            }
                            deletePending = false
                        }
                    },
                ) {
                    Text(stringResource(R.string.terminals_delete_terminal))
                }
            },
            dismissButton = {
                TextButton(
                    enabled = !deletePending,
                    onClick = {
                        pendingDelete = null
                        closeRemoteOnDelete = HostTmuxCloseRemoteOnDeleteDefault
                    },
                ) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }
}

@Composable
private fun CenteredMessage(message: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(HobgoblinSpacing.Md),
        contentAlignment = Alignment.Center,
    ) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TmuxErrorState(
    message: String,
    onRetry: () -> Unit,
    onChangeHost: () -> Unit,
) {
    FeedbackState(
        title = stringResource(R.string.tmux_scan_failed),
        description = message,
        primaryLabel = stringResource(R.string.common_retry),
        onPrimary = onRetry,
        secondaryLabel = stringResource(R.string.tmux_change_host),
        onSecondary = onChangeHost,
        isError = true,
    )
}

@Composable
private fun FeedbackState(
    title: String,
    description: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
    isError: Boolean = false,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(HobgoblinSpacing.Lg),
        horizontalAlignment = Alignment.Start,
        verticalArrangement = Arrangement.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            Text(
                title,
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                description,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                TextButton(onClick = onPrimary) {
                    Text(primaryLabel)
                }
                if (secondaryLabel != null && onSecondary != null) {
                    TextButton(onClick = onSecondary) {
                        Text(secondaryLabel)
                    }
                }
            }
        }
    }
}

@Composable
private fun CatalogNotice(message: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(HobgoblinSpacing.Sm),
            )
            .padding(HobgoblinSpacing.Sm),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        Text(
            message,
            color = MaterialTheme.colorScheme.onErrorContainer,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun HostTmuxGroups(
    groups: List<HostTmuxPathGroup>,
    staleReason: String?,
    actionError: String?,
    onRefresh: () -> Unit,
    onChangeHost: () -> Unit,
    onOpenSession: (HostDiscoveredTmuxSession) -> Unit,
    retainedSessions: Map<HostDiscoveredTmuxSession, TerminalSessionRecord>,
    onReconnectSession: (TerminalSessionRecord) -> Unit,
    onRequestClose: (HostDiscoveredTmuxSession, TerminalSessionRecord) -> Unit,
    onRequestDelete: (HostDiscoveredTmuxSession, TerminalSessionRecord) -> Unit,
) {
    if (groups.isEmpty() && staleReason == null) {
        FeedbackState(
            title = stringResource(R.string.tmux_empty_title),
            description = stringResource(R.string.tmux_empty_description),
            primaryLabel = stringResource(R.string.common_refresh),
            onPrimary = onRefresh,
            secondaryLabel = stringResource(R.string.tmux_change_host),
            onSecondary = onChangeHost,
        )
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(HobgoblinSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        actionError?.let { message ->
            item(key = "action-error") {
                CatalogNotice(message)
            }
        }
        staleReason?.let { reason ->
            item(key = "stale") {
                CatalogNotice(stringResource(R.string.tmux_stale, reason))
            }
        }
        groups.forEach { group ->
            item(key = "heading:${group.initialPath}") {
                Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs)) {
                    Text(
                        hostTmuxPathTitle(group.initialPath),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        group.initialPath,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(
                items = group.sessions,
                key = { session -> hostTmuxSessionAccessibilityLabel(session) },
            ) { session ->
                val retainedSession = retainedSessions[session]
                HostTmuxSessionCard(
                    session = session,
                    retainedSession = retainedSession,
                    onOpen = { onOpenSession(session) },
                    onReconnect = { retainedSession?.let(onReconnectSession) },
                    onRequestClose = { retainedSession?.let { onRequestClose(session, it) } },
                    onRequestDelete = { retainedSession?.let { onRequestDelete(session, it) } },
                )
            }
        }
    }
}

@Composable
private fun HostTmuxSessionCard(
    session: HostDiscoveredTmuxSession,
    retainedSession: TerminalSessionRecord?,
    onOpen: () -> Unit,
    onReconnect: () -> Unit,
    onRequestClose: () -> Unit,
    onRequestDelete: () -> Unit,
) {
    val serverAccent = when (hostTmuxServerSource(session.server)) {
        HostTmuxServerSource.Default -> HobgoblinColors.MuxCopper
        HostTmuxServerSource.Project -> HobgoblinColors.RelayTeal
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = hostTmuxSessionAccessibilityLabel(session) },
        onClick = onOpen,
    ) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier
                        .width(MuxRailWidth)
                        .height(76.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    repeat(2) {
                        Box(
                            modifier = Modifier
                                .width(2.dp)
                                .height(76.dp)
                                .background(serverAccent, RoundedCornerShape(1.dp)),
                        )
                    }
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stringResource(R.string.host_tmux_terminal_label, session.terminalNumber),
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.titleMedium,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                if (session.attachedClients == 0) {
                                    stringResource(R.string.host_tmux_idle)
                                } else {
                                    stringResource(R.string.host_tmux_attached_clients, session.attachedClients)
                                },
                                style = MaterialTheme.typography.labelMedium,
                                color = if (session.attachedClients == 0) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.primary
                                },
                            )
                            retainedSession?.let {
                                Text(
                                    terminalOverviewStatusText(retainedSession).resolve(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    Text(
                        when (val server = session.server) {
                            TmuxServerTarget.Default -> stringResource(R.string.host_tmux_default_server)
                            is TmuxServerTarget.Named -> stringResource(
                                R.string.host_tmux_project_server,
                                hostTmuxProtocolNameSuffix(server.serverName),
                            )
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(
                            R.string.host_tmux_session_name,
                            hostTmuxProtocolNameSuffix(session.identity.sessionName),
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                hostTmuxSessionActions(retainedSession).forEach { action ->
                    when (action) {
                        HostTmuxSessionAction.Reconnect -> TextButton(
                            modifier = HostTmuxActionButtonModifier,
                            contentPadding = HostTmuxActionButtonPadding,
                            onClick = onReconnect,
                        ) {
                            Text(stringResource(R.string.terminal_action_reconnect))
                        }
                        HostTmuxSessionAction.Close -> TextButton(
                            modifier = HostTmuxActionButtonModifier,
                            contentPadding = HostTmuxActionButtonPadding,
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = MaterialTheme.colorScheme.error,
                            ),
                            onClick = onRequestClose,
                        ) {
                            Text(stringResource(R.string.repository_terminal_close))
                        }
                        HostTmuxSessionAction.Delete -> TextButton(
                            modifier = HostTmuxActionButtonModifier,
                            contentPadding = HostTmuxActionButtonPadding,
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = MaterialTheme.colorScheme.error,
                            ),
                            onClick = onRequestDelete,
                        ) {
                            Text(stringResource(R.string.common_delete))
                        }
                        HostTmuxSessionAction.Open -> TextButton(
                            modifier = HostTmuxActionButtonModifier,
                            contentPadding = HostTmuxActionButtonPadding,
                            onClick = onOpen,
                        ) {
                            Text(stringResource(R.string.common_open))
                        }
                    }
                }
            }
        }
    }
}

private val MuxRailWidth = 6.dp
private val HostTmuxActionButtonModifier = Modifier.heightIn(min = 48.dp)
private val HostTmuxActionButtonPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)

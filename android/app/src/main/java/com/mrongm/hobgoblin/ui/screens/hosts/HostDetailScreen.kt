package com.mrongm.hobgoblin.ui.screens.hosts

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.navigation.HostDetailTab
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.HostTmuxPathGroup
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.ui.screens.terminals.terminalOverviewStatusText
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import com.mrongm.hobgoblin.ui.text.resolve
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HostDetailScreen(
    host: SshHostProfile,
    selectedTab: HostDetailTab,
    tmuxState: ResourceState<List<HostTmuxPathGroup>>,
    tmuxRefreshing: Boolean,
    onSelectTab: (HostDetailTab) -> Unit,
    onBack: () -> Unit,
    onRefreshTmux: () -> Unit,
    onOpenTmuxSession: (HostDiscoveredTmuxSession) -> Unit,
    retainedTmuxSessions: Map<HostDiscoveredTmuxSession, TerminalSessionRecord>,
    onReconnectTmuxSession: (TerminalSessionRecord) -> Unit,
    onCloseTmuxSession: (String) -> Unit,
    onDeleteTmuxSession: suspend (HostDiscoveredTmuxSession, TerminalSessionRecord, Boolean) -> Unit,
    projectsContent: @Composable () -> Unit,
) {
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(host.title) },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
                    }
                },
                actions = {
                    if (selectedTab == HostDetailTab.Tmux) {
                        TextButton(onClick = onRefreshTmux) {
                            Text(stringResource(R.string.common_refresh))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding),
        ) {
            PrimaryTabRow(selectedTabIndex = selectedTab.ordinal) {
                Tab(
                    selected = selectedTab == HostDetailTab.Projects,
                    onClick = { onSelectTab(HostDetailTab.Projects) },
                    text = { Text(stringResource(R.string.host_detail_projects)) },
                )
                Tab(
                    selected = selectedTab == HostDetailTab.Tmux,
                    onClick = { onSelectTab(HostDetailTab.Tmux) },
                    text = { Text(stringResource(R.string.host_detail_tmux)) },
                )
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                when (selectedTab) {
                    HostDetailTab.Projects -> projectsContent()
                    HostDetailTab.Tmux -> HostTmuxCatalog(
                        state = tmuxState,
                        isRefreshing = tmuxRefreshing,
                        onRefresh = onRefreshTmux,
                        onOpenSession = onOpenTmuxSession,
                        retainedSessions = retainedTmuxSessions,
                        onReconnectSession = onReconnectTmuxSession,
                        onCloseSession = onCloseTmuxSession,
                        onDeleteSession = onDeleteTmuxSession,
                    )
                }
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
    state: ResourceState<List<HostTmuxPathGroup>>,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
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
            -> CenteredMessage(stringResource(R.string.host_tmux_loading))
            is ResourceState.Error -> ErrorMessage(state.message)
            is ResourceState.Loaded -> HostTmuxGroups(
                groups = state.value,
                staleReason = null,
                actionError = actionError,
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
private fun ErrorMessage(message: String) {
    Column(
        modifier = Modifier.padding(HobgoblinSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        Text(
            stringResource(R.string.common_error),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.titleMedium,
        )
        Text(message)
    }
}

@Composable
private fun HostTmuxGroups(
    groups: List<HostTmuxPathGroup>,
    staleReason: String?,
    actionError: String?,
    onOpenSession: (HostDiscoveredTmuxSession) -> Unit,
    retainedSessions: Map<HostDiscoveredTmuxSession, TerminalSessionRecord>,
    onReconnectSession: (TerminalSessionRecord) -> Unit,
    onRequestClose: (HostDiscoveredTmuxSession, TerminalSessionRecord) -> Unit,
    onRequestDelete: (HostDiscoveredTmuxSession, TerminalSessionRecord) -> Unit,
) {
    if (groups.isEmpty() && staleReason == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(HobgoblinSpacing.Md),
            contentAlignment = Alignment.Center,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                Text(
                    stringResource(R.string.host_tmux_empty_title),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    stringResource(R.string.host_tmux_empty_description),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(HobgoblinSpacing.Md),
        verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
    ) {
        actionError?.let { message ->
            item(key = "action-error") {
                Text(
                    message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        staleReason?.let { reason ->
            item(key = "stale") {
                Text(
                    stringResource(R.string.host_tmux_stale, reason),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
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
        HostTmuxServerSource.Default -> MaterialTheme.colorScheme.tertiary
        HostTmuxServerSource.Project -> MaterialTheme.colorScheme.primary
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
                Box(
                    modifier = Modifier
                        .width(4.dp)
                        .height(72.dp)
                        .background(serverAccent, RoundedCornerShape(2.dp)),
                )
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
                            contentPadding = HostTmuxActionButtonPadding,
                            onClick = onReconnect,
                        ) {
                            Text(stringResource(R.string.terminal_action_reconnect))
                        }
                        HostTmuxSessionAction.Close -> TextButton(
                            contentPadding = HostTmuxActionButtonPadding,
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = MaterialTheme.colorScheme.error,
                            ),
                            onClick = onRequestClose,
                        ) {
                            Text(stringResource(R.string.repository_terminal_close))
                        }
                        HostTmuxSessionAction.Delete -> TextButton(
                            contentPadding = HostTmuxActionButtonPadding,
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = MaterialTheme.colorScheme.error,
                            ),
                            onClick = onRequestDelete,
                        ) {
                            Text(stringResource(R.string.common_delete))
                        }
                        HostTmuxSessionAction.Open -> TextButton(
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

private val HostTmuxActionButtonPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)

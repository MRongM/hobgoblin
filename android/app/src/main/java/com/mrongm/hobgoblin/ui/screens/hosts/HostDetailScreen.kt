package com.mrongm.hobgoblin.ui.screens.hosts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing

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
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HostTmuxCatalog(
    state: ResourceState<List<HostTmuxPathGroup>>,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onOpenSession: (HostDiscoveredTmuxSession) -> Unit,
) {
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
                onOpenSession = onOpenSession,
            )
            is ResourceState.Stale -> HostTmuxGroups(
                groups = state.value,
                staleReason = state.reason,
                onOpenSession = onOpenSession,
            )
        }
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
    onOpenSession: (HostDiscoveredTmuxSession) -> Unit,
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
                HostTmuxSessionCard(session = session, onClick = { onOpenSession(session) })
            }
        }
    }
}

@Composable
private fun HostTmuxSessionCard(
    session: HostDiscoveredTmuxSession,
    onClick: () -> Unit,
) {
    val serverAccent = when (hostTmuxServerSource(session.server)) {
        HostTmuxServerSource.Default -> MaterialTheme.colorScheme.tertiary
        HostTmuxServerSource.Project -> MaterialTheme.colorScheme.primary
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = hostTmuxSessionAccessibilityLabel(session) },
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
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
    }
}

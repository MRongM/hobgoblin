package com.mrongm.hobgoblin.ui.screens.workspaces

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemoteConfiguredWorkspaceSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemotePathAvailability
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceTmuxGroup
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceTmuxLocation
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceTmuxTerminal
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing

internal fun initialRepositoriesExpanded(): Boolean = false

internal fun toggledExpandedBranch(current: String?, selected: String): String? =
    selected.takeUnless { selected == current }

internal fun branchWorkspaceTerminalCount(branch: RemoteBranchWorkspaceSnapshot): Int =
    branch.terminalGroups.sumOf { group -> group.terminals.size }

internal fun branchWorkspaceNeedsAttention(branch: RemoteBranchWorkspaceSnapshot): Boolean =
    branch.operation != null ||
        branch.rootAvailability == RemotePathAvailability.Unavailable ||
        branch.members.any { member ->
            member.availability == RemotePathAvailability.Unavailable || member.progress != "complete"
        }

internal fun terminalAccessibilityLabel(
    branch: RemoteBranchWorkspaceSnapshot,
    location: RemoteWorkspaceTmuxLocation,
    terminal: RemoteWorkspaceTmuxTerminal,
    rootLabel: String,
): String {
    val locationLabel = when (location) {
        RemoteWorkspaceTmuxLocation.Root -> rootLabel
        is RemoteWorkspaceTmuxLocation.Repository -> location.repositoryName
    }
    return "${branch.branch}, $locationLabel, terminal-${terminal.terminalNumber}, ${terminal.workingDirectory}"
}

@Composable
fun WorkspaceCatalogScreen(
    workspaceState: ResourceState<RemoteConfiguredWorkspaceSnapshot>,
    initialExpandedBranchWorkspaceId: String?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenTerminal: (RemoteWorkspaceTmuxTerminal, String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(HobgoblinSpacing.Md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text("‹ ${stringResource(R.string.common_back)}") }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onRefresh) { Text("↻ ${stringResource(R.string.common_refresh)}") }
        }
        PullToRefreshBox(
            isRefreshing = workspaceState is ResourceState.Loading,
            onRefresh = onRefresh,
            modifier = Modifier.weight(1f),
        ) {
            when (workspaceState) {
                ResourceState.Idle,
                ResourceState.Loading,
                -> Text(stringResource(R.string.workspace_loading))
                is ResourceState.Error -> Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    Text(
                        stringResource(R.string.common_error),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(workspaceState.message)
                }
                is ResourceState.Loaded -> WorkspaceContent(
                    workspace = workspaceState.value,
                    staleReason = null,
                    initialExpandedBranchWorkspaceId = initialExpandedBranchWorkspaceId,
                    onOpenTerminal = onOpenTerminal,
                )
                is ResourceState.Stale -> WorkspaceContent(
                    workspace = workspaceState.value,
                    staleReason = workspaceState.reason,
                    initialExpandedBranchWorkspaceId = initialExpandedBranchWorkspaceId,
                    onOpenTerminal = onOpenTerminal,
                )
            }
        }
    }
}

@Composable
private fun WorkspaceContent(
    workspace: RemoteConfiguredWorkspaceSnapshot,
    staleReason: String?,
    initialExpandedBranchWorkspaceId: String?,
    onOpenTerminal: (RemoteWorkspaceTmuxTerminal, String) -> Unit,
) {
    var repositoriesExpanded by remember(workspace.rootPath) { mutableStateOf(initialRepositoriesExpanded()) }
    var expandedBranchId by remember(workspace.rootPath, initialExpandedBranchWorkspaceId) {
        mutableStateOf(initialExpandedBranchWorkspaceId)
    }
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            workspace.rootPath.substringAfterLast('/').ifBlank { "/" },
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Text(
            workspace.rootPath,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        staleReason?.let { reason ->
            Spacer(Modifier.height(HobgoblinSpacing.Sm))
            StatusText(stringResource(R.string.workspace_stale, reason))
        }
        workspace.branchWorkspaceError?.let { error ->
            Spacer(Modifier.height(HobgoblinSpacing.Sm))
            StatusText(stringResource(R.string.workspace_branch_error, error))
        }
        workspace.tmuxDiscoveryError?.let { error ->
            Spacer(Modifier.height(HobgoblinSpacing.Sm))
            StatusText(stringResource(R.string.workspace_tmux_error, error))
        }
        Spacer(Modifier.height(HobgoblinSpacing.Md))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { repositoriesExpanded = !repositoriesExpanded }
                .padding(vertical = HobgoblinSpacing.Sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.workspace_repositories),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text("${workspace.repositories.size} ${if (repositoriesExpanded) "⌃" else "⌄"}")
        }
        AnimatedVisibility(visible = repositoriesExpanded) {
            Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                workspace.repositories.forEach { repository ->
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text(repository.name, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                        if (repository.availability == RemotePathAvailability.Unavailable) {
                            Text(
                                stringResource(R.string.workspace_unavailable),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                    Text(
                        repository.path,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(HobgoblinSpacing.Md))
        Text(
            stringResource(R.string.workspace_branch_workspaces),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(HobgoblinSpacing.Sm))
        if (workspace.branchWorkspaces.isEmpty()) {
            Text(stringResource(R.string.workspace_no_branch_workspaces))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                items(workspace.branchWorkspaces, key = { branch -> branch.id }) { branch ->
                    BranchWorkspaceItem(
                        branch = branch,
                        expanded = expandedBranchId == branch.id,
                        onToggle = {
                            expandedBranchId = toggledExpandedBranch(expandedBranchId, branch.id)
                        },
                        onOpenTerminal = { terminal -> onOpenTerminal(terminal, branch.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun BranchWorkspaceItem(
    branch: RemoteBranchWorkspaceSnapshot,
    expanded: Boolean,
    onToggle: () -> Unit,
    onOpenTerminal: (RemoteWorkspaceTmuxTerminal) -> Unit,
) {
    val count = branchWorkspaceTerminalCount(branch)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(HobgoblinSpacing.Md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(branch.branch, fontWeight = FontWeight.SemiBold)
                    if (branchWorkspaceNeedsAttention(branch)) {
                        Text(
                            stringResource(R.string.workspace_attention),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
                Text(terminalCountLabel(count))
            }
            AnimatedVisibility(visible = expanded) {
                Column(modifier = Modifier.padding(start = HobgoblinSpacing.Md, end = HobgoblinSpacing.Md)) {
                    if (count == 0) {
                        Text(
                            stringResource(R.string.workspace_no_tmux_terminals),
                            modifier = Modifier.padding(bottom = HobgoblinSpacing.Md),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    branch.terminalGroups.forEach { group ->
                        TerminalGroup(branch, group, onOpenTerminal)
                    }
                }
            }
        }
    }
}

@Composable
private fun TerminalGroup(
    branch: RemoteBranchWorkspaceSnapshot,
    group: RemoteWorkspaceTmuxGroup,
    onOpenTerminal: (RemoteWorkspaceTmuxTerminal) -> Unit,
) {
    val rootLabel = stringResource(R.string.workspace_root)
    val location = when (val value = group.location) {
        RemoteWorkspaceTmuxLocation.Root -> rootLabel
        is RemoteWorkspaceTmuxLocation.Repository -> value.repositoryName
    }
    val unavailable = when (val value = group.location) {
        RemoteWorkspaceTmuxLocation.Root -> branch.rootAvailability == RemotePathAvailability.Unavailable
        is RemoteWorkspaceTmuxLocation.Repository -> branch.members
            .firstOrNull { member -> member.repositoryName == value.repositoryName }
            ?.availability == RemotePathAvailability.Unavailable
    }
    Row(modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .height((56 + group.terminals.size * 64).dp)
                .background(MaterialTheme.colorScheme.outlineVariant),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = HobgoblinSpacing.Md, bottom = HobgoblinSpacing.Sm),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            Text(location, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            if (unavailable) {
                Text(
                    stringResource(R.string.workspace_unavailable),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            group.terminals.forEach { terminal ->
                val description = terminalAccessibilityLabel(branch, group.location, terminal, rootLabel)
                val openDescription = stringResource(
                    R.string.workspace_open_terminal,
                    "terminal-${terminal.terminalNumber}",
                    branch.branch,
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "$openDescription. $description" }
                        .clickable { onOpenTerminal(terminal) }
                        .padding(vertical = HobgoblinSpacing.Sm),
                ) {
                    Text("terminal-${terminal.terminalNumber}", color = MaterialTheme.colorScheme.primary)
                    Text(
                        terminal.workingDirectory,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun terminalCountLabel(count: Int): String = when (count) {
    0 -> stringResource(R.string.terminal_count_zero)
    1 -> stringResource(R.string.terminal_count_one)
    else -> stringResource(R.string.terminal_count_many, count)
}

@Composable
private fun StatusText(message: String) {
    Text(
        message,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
    )
}

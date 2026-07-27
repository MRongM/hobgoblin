package dev.hobgoblin.android.ui.screens.projects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import dev.hobgoblin.android.R
import dev.hobgoblin.android.data.ManualItemOrderPolicy
import dev.hobgoblin.android.domain.ResourceState
import dev.hobgoblin.android.domain.ssh.RemoteProjectKind
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.ui.components.ManualReorderHandle
import dev.hobgoblin.android.ui.components.ManualReorderState
import dev.hobgoblin.android.ui.components.manualReorderItem
import dev.hobgoblin.android.ui.components.rememberManualReorderState
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing

@Composable
fun ProjectsScreen(
    repositoriesState: ResourceState<List<RemoteRepositoryProfile>>,
    hosts: List<SshHostProfile>,
    onOpenProject: (String) -> Unit,
    onOpenProjectTerminals: (String, String) -> Unit,
    onDeleteProject: (String) -> Unit,
    hostFilterId: String? = null,
    onClearHostFilter: () -> Unit = {},
    initialManualOrder: List<String> = emptyList(),
    onSaveManualOrder: (List<String>) -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(HobgoblinSpacing.Md),
    ) {
        when (repositoriesState) {
            ResourceState.Idle,
            ResourceState.Loading,
            -> LoadingProjects()

            is ResourceState.Error -> ErrorProjects(message = repositoriesState.message)
            is ResourceState.Stale -> ProjectList(
                repositories = repositoriesState.value,
                hosts = hosts,
                onOpenProject = onOpenProject,
                onOpenProjectTerminals = onOpenProjectTerminals,
                onDeleteProject = onDeleteProject,
                hostFilterId = hostFilterId,
                onClearHostFilter = onClearHostFilter,
                initialManualOrder = initialManualOrder,
                onSaveManualOrder = onSaveManualOrder,
            )
            is ResourceState.Loaded -> ProjectList(
                repositories = repositoriesState.value,
                hosts = hosts,
                onOpenProject = onOpenProject,
                onOpenProjectTerminals = onOpenProjectTerminals,
                onDeleteProject = onDeleteProject,
                hostFilterId = hostFilterId,
                onClearHostFilter = onClearHostFilter,
                initialManualOrder = initialManualOrder,
                onSaveManualOrder = onSaveManualOrder,
            )
        }
    }
}

internal data class ProjectTerminalTarget(
    val repositoryId: String,
    val terminalWorkspacePath: String,
)

internal fun projectTerminalTarget(repository: RemoteRepositoryProfile): ProjectTerminalTarget =
    ProjectTerminalTarget(
        repositoryId = repository.id,
        terminalWorkspacePath = repository.remotePath,
    )

internal fun projectActionLabelResources(): List<Int> =
    listOf(R.string.common_open, R.string.common_terminals, R.string.common_delete)

internal fun emptyProjectsDescriptionResource(): Int = R.string.projects_empty_description

internal fun projectsForHost(
    repositories: List<RemoteRepositoryProfile>,
    hostId: String?,
): List<RemoteRepositoryProfile> = if (hostId == null) {
    repositories
} else {
    repositories.filter { it.hostProfileId == hostId }
}

internal fun filteredProjectsDescriptionResource(): Int = R.string.projects_filtered_empty_description

internal fun projectReorderAvailable(hostFilterId: String?): Boolean = hostFilterId == null

internal fun projectKindLabelResource(project: RemoteRepositoryProfile): Int = when (project.kind) {
    RemoteProjectKind.GitRepository -> R.string.projects_git_repository
    RemoteProjectKind.PlainWorkspace -> R.string.projects_plain_workspace
}

@Composable
private fun ProjectList(
    repositories: List<RemoteRepositoryProfile>,
    hosts: List<SshHostProfile>,
    onOpenProject: (String) -> Unit,
    onOpenProjectTerminals: (String, String) -> Unit,
    onDeleteProject: (String) -> Unit,
    hostFilterId: String?,
    onClearHostFilter: () -> Unit,
    initialManualOrder: List<String>,
    onSaveManualOrder: (List<String>) -> Unit,
) {
    var deleteTarget by remember { mutableStateOf<RemoteRepositoryProfile?>(null) }
    var manualOrder by remember(initialManualOrder) { mutableStateOf(initialManualOrder) }
    val hostById = remember(hosts) { hosts.associateBy { it.id } }
    val filteredHostTitle = hostFilterId
        ?.let(hostById::get)
        ?.title
        ?: stringResource(R.string.projects_selected_host)
    val allOrderedRepositories = ManualItemOrderPolicy.apply(repositories, manualOrder, RemoteRepositoryProfile::id)
    val orderedRepositories = projectsForHost(allOrderedRepositories, hostFilterId)
    val reorderState = rememberManualReorderState(
        onMove = { draggedId, targetId ->
            manualOrder = ManualItemOrderPolicy.move(
                allOrderedRepositories.map(RemoteRepositoryProfile::id),
                draggedId,
                targetId,
            )
        },
        onFinished = { onSaveManualOrder(manualOrder) },
    )

    if (orderedRepositories.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                if (hostFilterId == null) {
                    stringResource(R.string.projects_empty_title)
                } else {
                    stringResource(R.string.projects_empty_on_host, filteredHostTitle)
                },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(HobgoblinSpacing.Sm))
            Text(
                if (hostFilterId == null) {
                    stringResource(emptyProjectsDescriptionResource())
                } else {
                    stringResource(filteredProjectsDescriptionResource(), filteredHostTitle)
                },
            )
            if (hostFilterId != null) {
                Spacer(Modifier.height(HobgoblinSpacing.Sm))
                TextButton(onClick = onClearHostFilter) {
                    Text(stringResource(R.string.projects_show_all))
                }
            }
            Spacer(Modifier.height(HobgoblinSpacing.Lg))
        }
        return
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (hostFilterId == null) {
                stringResource(R.string.projects_saved_heading)
            } else {
                stringResource(R.string.projects_on_host, filteredHostTitle)
            },
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleMedium,
        )
        if (hostFilterId != null) {
            TextButton(onClick = onClearHostFilter) {
                Text(stringResource(R.string.projects_show_all_short))
            }
        }
    }
    Spacer(Modifier.height(HobgoblinSpacing.Md))
    LazyColumn(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
        items(orderedRepositories, key = { it.id }) { repository ->
            val reorderAvailable = projectReorderAvailable(hostFilterId)
            ProjectRow(
                modifier = if (reorderAvailable) {
                    Modifier.manualReorderItem(reorderState, repository.id)
                } else {
                    Modifier
                },
                repository = repository,
                reorderState = reorderState.takeIf { reorderAvailable },
                host = hostById[repository.hostProfileId],
                onOpenProject = { onOpenProject(repository.id) },
                onOpenProjectTerminals = {
                    val target = projectTerminalTarget(repository)
                    onOpenProjectTerminals(target.repositoryId, target.terminalWorkspacePath)
                },
                onDeleteProject = { deleteTarget = repository },
            )
        }
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text(stringResource(R.string.projects_delete_title)) },
            text = { Text(stringResource(R.string.projects_delete_description, target.title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDeleteProject(target.id)
                        deleteTarget = null
                    },
                ) {
                    Text(stringResource(R.string.common_delete))
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }
}

@Composable
private fun LoadingProjects() {
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
        Text(stringResource(R.string.common_loading), style = MaterialTheme.typography.labelMedium)
        Text(stringResource(R.string.projects_loading_description))
    }
}

@Composable
private fun ErrorProjects(message: String) {
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md)) {
        Text(
            stringResource(R.string.common_error),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.labelMedium,
        )
        Text(message)
    }
}

@Composable
private fun ProjectRow(
    modifier: Modifier,
    repository: RemoteRepositoryProfile,
    reorderState: ManualReorderState?,
    host: SshHostProfile?,
    onOpenProject: () -> Unit,
    onOpenProjectTerminals: () -> Unit,
    onDeleteProject: () -> Unit,
) {
    val rootAddress = remember(host?.host) {
        host?.let { "root@${it.host}:${it.port}" }
    }
    val actionLabels = listOf(
        stringResource(R.string.common_open),
        stringResource(R.string.common_terminals),
        stringResource(R.string.common_delete),
    )

    Card(
        modifier = modifier.fillMaxWidth(),
        onClick = onOpenProject,
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
                    "${repository.title}: ${repository.remotePath}",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                )
                reorderState?.let { state ->
                    ManualReorderHandle(
                        state = state,
                        itemKey = repository.id,
                        itemLabel = repository.title,
                    )
                }
            }
            Text(
                stringResource(projectKindLabelResource(repository)),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            rootAddress?.let { address ->
                Text(address, style = MaterialTheme.typography.labelMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                TextButton(onClick = onOpenProject) {
                    Text(actionLabels[0])
                }
                TextButton(onClick = onOpenProjectTerminals) {
                    Text(actionLabels[1])
                }
                TextButton(onClick = onDeleteProject) {
                    Text(actionLabels[2])
                }
            }
        }
    }
}

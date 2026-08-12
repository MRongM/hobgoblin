package com.mrongm.hobgoblin.ui.screens.projects

import android.text.format.DateUtils
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.data.ManualItemOrderPolicy
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.ui.components.ManualReorderHandle
import com.mrongm.hobgoblin.ui.components.ManualReorderState
import com.mrongm.hobgoblin.ui.components.manualReorderItem
import com.mrongm.hobgoblin.ui.components.rememberManualReorderState
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.mrongm.hobgoblin.ui.text.resolve

@Composable
fun ProjectsScreen(
    repositoriesState: ResourceState<List<RemoteRepositoryProfile>>,
    hosts: List<SshHostProfile>,
    onOpenProject: (String) -> Unit,
    onOpenProjectTerminals: (String, String) -> Unit,
    onDeleteProject: (String) -> Unit,
    hostFilterId: String? = null,
    onClearHostFilter: (() -> Unit)? = null,
    terminalCountByProjectId: Map<String, Int> = emptyMap(),
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
                terminalCountByProjectId = terminalCountByProjectId,
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
                terminalCountByProjectId = terminalCountByProjectId,
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

internal fun projectDisplayOrder(
    repositories: List<RemoteRepositoryProfile>,
    savedIds: List<String>,
): List<RemoteRepositoryProfile> {
    val currentIds = repositories.mapTo(mutableSetOf(), RemoteRepositoryProfile::id)
    val hasEffectiveManualOrder = savedIds.any(currentIds::contains)
    return if (hasEffectiveManualOrder) {
        ManualItemOrderPolicy.apply(repositories, savedIds, RemoteRepositoryProfile::id)
    } else {
        repositories.sortedByDescending { it.createdAt ?: Long.MIN_VALUE }
    }
}

internal fun projectKindLabelResource(project: RemoteRepositoryProfile): Int = when (project.kind) {
    RemoteProjectKind.GitRepository -> R.string.projects_git_repository
    RemoteProjectKind.PlainWorkspace -> R.string.projects_plain_workspace
}

internal fun projectHostTitle(
    repository: RemoteRepositoryProfile,
    host: SshHostProfile?,
): String = host?.title ?: repository.hostProfileId

internal fun projectSecondaryTitle(repository: RemoteRepositoryProfile): String? =
    repository.alias?.trim()?.takeIf(String::isNotEmpty)

internal fun projectCreatedText(relativeTime: CharSequence?): LocalizedText =
    if (relativeTime == null) {
        LocalizedText(R.string.projects_created_unknown)
    } else {
        LocalizedText(R.string.projects_created_at, listOf(relativeTime))
    }

@Composable
private fun ProjectList(
    repositories: List<RemoteRepositoryProfile>,
    hosts: List<SshHostProfile>,
    onOpenProject: (String) -> Unit,
    onOpenProjectTerminals: (String, String) -> Unit,
    onDeleteProject: (String) -> Unit,
    hostFilterId: String?,
    onClearHostFilter: (() -> Unit)?,
    terminalCountByProjectId: Map<String, Int>,
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
    val allOrderedRepositories = projectDisplayOrder(repositories, manualOrder)
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
            if (hostFilterId != null && onClearHostFilter != null) {
                Spacer(Modifier.height(HobgoblinSpacing.Sm))
                TextButton(onClick = onClearHostFilter) {
                    Text(stringResource(R.string.projects_show_all))
                }
            }
            Spacer(Modifier.height(HobgoblinSpacing.Lg))
        }
        return
    }

    if (hostFilterId != null) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.projects_on_host, filteredHostTitle),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
            )
            if (onClearHostFilter != null) {
                TextButton(onClick = onClearHostFilter) {
                    Text(stringResource(R.string.projects_show_all_short))
                }
            }
        }
        Spacer(Modifier.height(HobgoblinSpacing.Md))
    }
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
                terminalCount = terminalCountByProjectId[repository.id] ?: 0,
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
    terminalCount: Int,
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
                    projectHostTitle(repository, host),
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    pluralStringResource(R.plurals.projects_terminal_count, terminalCount, terminalCount),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                reorderState?.let { state ->
                    ManualReorderHandle(
                        state = state,
                        itemKey = repository.id,
                        itemLabel = repository.title,
                    )
                }
            }
            projectSecondaryTitle(repository)?.let { secondaryTitle ->
                Text(
                    secondaryTitle,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                repository.remotePath,
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                softWrap = true,
            )
            Text(
                stringResource(projectKindLabelResource(repository)),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val relativeTime = repository.createdAt?.let { createdAt ->
                DateUtils.getRelativeTimeSpanString(
                    createdAt,
                    System.currentTimeMillis(),
                    DateUtils.MINUTE_IN_MILLIS,
                )
            }
            Text(
                projectCreatedText(relativeTime).resolve(),
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
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

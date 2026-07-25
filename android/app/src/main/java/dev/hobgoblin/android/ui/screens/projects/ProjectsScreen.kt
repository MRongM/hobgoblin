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
import androidx.compose.ui.text.font.FontWeight
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
                initialManualOrder = initialManualOrder,
                onSaveManualOrder = onSaveManualOrder,
            )
            is ResourceState.Loaded -> ProjectList(
                repositories = repositoriesState.value,
                hosts = hosts,
                onOpenProject = onOpenProject,
                onOpenProjectTerminals = onOpenProjectTerminals,
                onDeleteProject = onDeleteProject,
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

internal fun projectActionLabels(): List<String> = listOf("Open", "Terminals", "Delete")

internal fun emptyProjectsDescription(): String =
    "Add a remote Git repository or Plain workspace to open its terminal."

internal fun projectKindLabel(project: RemoteRepositoryProfile): String = when (project.kind) {
    RemoteProjectKind.GitRepository -> "Git repository"
    RemoteProjectKind.PlainWorkspace -> "Plain workspace"
}

@Composable
private fun ProjectList(
    repositories: List<RemoteRepositoryProfile>,
    hosts: List<SshHostProfile>,
    onOpenProject: (String) -> Unit,
    onOpenProjectTerminals: (String, String) -> Unit,
    onDeleteProject: (String) -> Unit,
    initialManualOrder: List<String>,
    onSaveManualOrder: (List<String>) -> Unit,
) {
    var deleteTarget by remember { mutableStateOf<RemoteRepositoryProfile?>(null) }
    var manualOrder by remember(initialManualOrder) { mutableStateOf(initialManualOrder) }
    val hostById = remember(hosts) { hosts.associateBy { it.id } }
    val orderedRepositories = ManualItemOrderPolicy.apply(repositories, manualOrder, RemoteRepositoryProfile::id)
    val reorderState = rememberManualReorderState(
        onMove = { draggedId, targetId ->
            manualOrder = ManualItemOrderPolicy.move(
                orderedRepositories.map(RemoteRepositoryProfile::id),
                draggedId,
                targetId,
            )
        },
        onFinished = { onSaveManualOrder(manualOrder) },
    )

    if (repositories.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("No projects", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(HobgoblinSpacing.Sm))
            Text(emptyProjectsDescription())
            Spacer(Modifier.height(HobgoblinSpacing.Lg))
        }
        return
    }

    Text("Saved projects", style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(HobgoblinSpacing.Md))
    LazyColumn(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
        items(orderedRepositories, key = { it.id }) { repository ->
            ProjectRow(
                modifier = Modifier.manualReorderItem(reorderState, repository.id),
                repository = repository,
                reorderState = reorderState,
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
            title = { Text("Delete project record?") },
            text = { Text("This removes ${target.title} from Hobgoblin Android. It does not delete anything on the SSH server.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDeleteProject(target.id)
                        deleteTarget = null
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun LoadingProjects() {
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
        Text("loading", style = MaterialTheme.typography.labelMedium)
        Text("Loading saved projects.")
    }
}

@Composable
private fun ErrorProjects(message: String) {
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md)) {
        Text("error", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
        Text(message)
    }
}

@Composable
private fun ProjectRow(
    modifier: Modifier,
    repository: RemoteRepositoryProfile,
    reorderState: ManualReorderState,
    host: SshHostProfile?,
    onOpenProject: () -> Unit,
    onOpenProjectTerminals: () -> Unit,
    onDeleteProject: () -> Unit,
) {
    val rootAddress = remember(host?.host) {
        host?.let { "root@${it.host}:${it.port}" }
    }
    val actionLabels = projectActionLabels()

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
                ManualReorderHandle(
                    state = reorderState,
                    itemKey = repository.id,
                    itemLabel = repository.title,
                )
            }
            Text(
                projectKindLabel(repository),
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

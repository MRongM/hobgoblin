package dev.hobgoblin.android.ui.screens.repositories

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextOverflow
import dev.hobgoblin.android.domain.ResourceState
import dev.hobgoblin.android.data.ManualItemOrderPolicy
import dev.hobgoblin.android.domain.ssh.RemoteDirectoryEntry
import dev.hobgoblin.android.domain.ssh.RemoteProjectInspection
import dev.hobgoblin.android.domain.ssh.RemoteProjectKind
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryBranch
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile
import dev.hobgoblin.android.domain.ssh.RemoteRepositorySnapshot
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryWorktree
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.ssh.evaluateWorktreeRemoval
import dev.hobgoblin.android.ssh.worktreeRemovalConfirmationText
import dev.hobgoblin.android.ssh.WorktreeCreationSource
import dev.hobgoblin.android.terminals.TerminalDisconnectedReason
import dev.hobgoblin.android.terminals.TerminalLaunchMode
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TerminalSessionStatus
import dev.hobgoblin.android.terminals.TmuxSessionProtocol
import dev.hobgoblin.android.termux.ExternalTermuxLaunchResult
import dev.hobgoblin.android.ui.screens.terminals.TerminalSessionIdentityDetails
import dev.hobgoblin.android.ui.screens.terminals.terminalSessionRemotePath
import dev.hobgoblin.android.ui.screens.terminals.terminalSessionDisplayName
import dev.hobgoblin.android.ui.screens.terminals.terminalWorkspaceSessionCountsByPath
import dev.hobgoblin.android.ui.screens.terminals.terminalWorkspaceCreatedSessions
import dev.hobgoblin.android.ui.screens.terminals.terminalWorkspaceOrderedSessions
import dev.hobgoblin.android.ui.components.ManualReorderHandle
import dev.hobgoblin.android.ui.components.ManualReorderState
import dev.hobgoblin.android.ui.components.manualReorderItem
import dev.hobgoblin.android.ui.components.rememberManualReorderState
import dev.hobgoblin.android.ui.theme.HobgoblinSpacing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.absoluteValue
import kotlin.math.roundToInt

internal enum class RepositoryWorkspaceTab(val label: String) {
    Worktrees("Worktrees"),
    Commits("Commits"),
    Terminal("Terminals"),
}

internal enum class RepositoryTerminalMode(val label: String) {
    RemoteSsh("Remote SSH"),
    ExternalTermux("External Termux"),
}

internal enum class ExternalTermuxStatus(val label: String) {
    Ready("ready"),
    CommandCopied("command copied"),
    OpenedInTermux("opened in Termux"),
    TermuxNotInstalled("Termux not installed"),
    CommandApiUnavailable("Termux command API unavailable"),
    Failed("failed"),
}

private const val CompactWorkspaceTabLimit = 4

internal fun repositoryTerminalModes(): List<RepositoryTerminalMode> =
    RepositoryTerminalMode.entries.toList()

internal fun externalTermuxTargetLabel(host: SshHostProfile): String =
    "${host.user}@${host.host}:${host.port}"

internal fun externalTermuxStatusLabel(status: ExternalTermuxStatus): String =
    status.label

internal fun externalTermuxStatusAfterLaunch(result: ExternalTermuxLaunchResult): ExternalTermuxStatus =
    when (result) {
        ExternalTermuxLaunchResult.Launched -> ExternalTermuxStatus.OpenedInTermux
        is ExternalTermuxLaunchResult.CopiedFallback -> ExternalTermuxStatus.CommandApiUnavailable
        is ExternalTermuxLaunchResult.Unavailable -> ExternalTermuxStatus.TermuxNotInstalled
        is ExternalTermuxLaunchResult.Failed -> ExternalTermuxStatus.Failed
    }

internal fun externalTermuxActionError(result: ExternalTermuxLaunchResult): String? =
    if (result is ExternalTermuxLaunchResult.Failed) result.message else null

internal fun authenticatedHosts(hosts: List<SshHostProfile>): List<SshHostProfile> =
    hosts.filter { it.identityRefId != null }

internal fun defaultAuthenticatedHost(hosts: List<SshHostProfile>): SshHostProfile? =
    authenticatedHosts(hosts).firstOrNull()

internal fun canSaveRepository(host: SshHostProfile?, remotePath: String): Boolean =
    host?.identityRefId != null && remotePath.trim().startsWith("/")

internal fun directoryBrowserRootPath(remotePath: String): String =
    remotePath.trim().takeIf { it.startsWith("/") } ?: "/"

internal fun directoryBrowserParentPath(path: String): String? {
    val normalized = directoryBrowserRootPath(path)
    if (normalized == "/") return null
    val trimmed = normalized.trimEnd('/')
    val parent = trimmed.substringBeforeLast("/", missingDelimiterValue = "")
    return parent.ifBlank { "/" }
}

internal fun shouldLoadDirectoryPage(state: ResourceState<List<RemoteDirectoryEntry>>?): Boolean = when (state) {
    null,
    ResourceState.Idle,
    is ResourceState.Error,
    -> true
    ResourceState.Loading,
    is ResourceState.Loaded,
    is ResourceState.Stale,
    -> false
}

internal fun repositoryWorkspaceTabs(repository: RemoteRepositoryProfile): List<RepositoryWorkspaceTab> =
    if (repository.isGitRepository) {
        listOf(
            RepositoryWorkspaceTab.Worktrees,
            RepositoryWorkspaceTab.Terminal,
        )
    } else {
        listOf(RepositoryWorkspaceTab.Terminal)
    }

internal fun initialRepositoryWorkspaceTab(
    repository: RemoteRepositoryProfile,
    initialTerminalWorkspacePath: String?,
): RepositoryWorkspaceTab = if (initialTerminalWorkspacePath != null || !repository.isGitRepository) {
    RepositoryWorkspaceTab.Terminal
} else {
    RepositoryWorkspaceTab.Worktrees
}

internal fun shouldLoadRepositorySnapshot(repository: RemoteRepositoryProfile): Boolean =
    repository.isGitRepository

data class RepositoryTmuxScope(
    val projectRoot: String,
    val allowedInitialPaths: List<String>,
)

internal fun repositoryTmuxScope(
    repository: RemoteRepositoryProfile,
    snapshotState: ResourceState<RemoteRepositorySnapshot>,
): RepositoryTmuxScope? {
    val configuredRoot = TmuxSessionProtocol.normalizePath(repository.remotePath) ?: return null
    if (!repository.isGitRepository) {
        return RepositoryTmuxScope(projectRoot = configuredRoot, allowedInitialPaths = listOf(configuredRoot))
    }
    val worktrees = when (snapshotState) {
        is ResourceState.Loaded -> snapshotState.value.worktrees
        is ResourceState.Stale -> snapshotState.value.worktrees
        ResourceState.Idle,
        ResourceState.Loading,
        is ResourceState.Error,
        -> return null
    }
    val projectRoot = worktrees
        .firstOrNull { it.isPrimary && !it.isMissing && !it.isBare }
        ?.path
        ?.let(TmuxSessionProtocol::normalizePath)
        ?: configuredRoot
    val allowedInitialPaths = buildList {
        add(projectRoot)
        add(configuredRoot)
        worktrees.asSequence()
            .filterNot { it.isMissing }
            .mapNotNull { TmuxSessionProtocol.normalizePath(it.path) }
            .forEach(::add)
    }.distinct()
    return RepositoryTmuxScope(projectRoot = projectRoot, allowedInitialPaths = allowedInitialPaths)
}

internal fun repositoryTmuxDiscoveryPaths(
    repository: RemoteRepositoryProfile,
    snapshotState: ResourceState<RemoteRepositorySnapshot>,
): List<String>? = repositoryTmuxScope(repository, snapshotState)?.allowedInitialPaths

internal fun tmuxScanButtonLabel(isScanning: Boolean): String =
    if (isScanning) "Scanning..." else "Scan tmux"

internal fun tmuxScanResultMessage(foundCount: Int, sshUser: String): String =
    if (foundCount == 0) {
        "No tmux sessions found for SSH user $sshUser. " +
            "Use the same SSH user that created the tmux session."
    } else {
        "Found $foundCount tmux ${if (foundCount == 1) "session" else "sessions"} for SSH user $sshUser."
    }

internal fun canScanTmux(isScanning: Boolean, discoveryPaths: List<String>?): Boolean =
    !isScanning && !discoveryPaths.isNullOrEmpty()

internal fun repositoryWorkspaceTabsUseScrollableStrip(tabs: List<RepositoryWorkspaceTab>): Boolean =
    tabs.size > CompactWorkspaceTabLimit

internal fun repositoryWorkspaceTabIndex(
    tabs: List<RepositoryWorkspaceTab>,
    selectedTab: RepositoryWorkspaceTab,
    fallback: RepositoryWorkspaceTab = RepositoryWorkspaceTab.Worktrees,
): Int {
    val selectedIndex = tabs.indexOf(selectedTab)
    if (selectedIndex >= 0) return selectedIndex
    return tabs.indexOf(fallback).coerceAtLeast(0)
}

internal fun repositoryTerminalPath(repository: RemoteRepositoryProfile): String = repository.remotePath

internal fun worktreeTerminalPath(worktree: RemoteRepositoryWorktree): String = worktree.path

internal fun suggestedWorktreePath(repositoryPath: String, branch: String): String {
    val parent = repositoryPath.trimEnd('/').substringBeforeLast("/", missingDelimiterValue = "")
    val repoName = repositoryPath.trimEnd('/').substringAfterLast("/")
    val safeBranch = branch.trim()
        .replace(Regex("[^A-Za-z0-9._-]+"), "-")
        .trim('-')
        .ifBlank { "worktree" }
    val base = if (parent.isBlank()) "/" else parent
    return "$base/$repoName-$safeBranch"
}

internal fun canCreateWorktree(branch: String, worktreePath: String): Boolean =
    branch.isNotBlank() && worktreePath.trim().startsWith("/")

internal data class WorktreeBranchCandidate(
    val ref: String,
    val kindLabel: String,
)

internal fun worktreeBranchCandidates(
    localBranches: List<RemoteRepositoryBranch>,
    remoteBranches: List<String>,
): List<WorktreeBranchCandidate> =
    localBranches.map { WorktreeBranchCandidate(ref = it.name, kindLabel = "local") } +
        remoteBranches.distinct().map { WorktreeBranchCandidate(ref = it, kindLabel = "remote") }

internal fun worktreePathBranchName(
    selectedRef: String,
    remoteBranchNames: Set<String>,
): String = if (selectedRef in remoteBranchNames) {
    selectedRef.substringAfter('/').ifBlank { selectedRef }
} else {
    selectedRef
}

internal fun worktreeCreationSource(
    selectedRef: String,
    localBranchNames: Set<String>,
    remoteBranchNames: Set<String>,
): WorktreeCreationSource {
    val normalizedRef = selectedRef.trim()
    if (normalizedRef !in remoteBranchNames) return WorktreeCreationSource.ExistingLocal(normalizedRef)
    val localBranch = worktreePathBranchName(normalizedRef, remoteBranchNames)
    return if (localBranch in localBranchNames) {
        WorktreeCreationSource.ExistingLocal(localBranch)
    } else {
        WorktreeCreationSource.TrackRemote(remoteRef = normalizedRef, localBranch = localBranch)
    }
}

internal fun repositoriesAfterLocalDelete(
    repositories: List<RemoteRepositoryProfile>,
    repositoryId: String,
): List<RemoteRepositoryProfile> = repositories.filterNot { it.id == repositoryId }

internal fun createProjectFromInspection(
    host: SshHostProfile,
    alias: String,
    inspection: RemoteProjectInspection,
): RemoteRepositoryProfile = RemoteRepositoryProfile.create(
    hostProfileId = host.id,
    alias = alias,
    remotePath = inspection.resolvedPath,
    kind = inspection.kind,
)

internal fun repositorySnapshotStateAfterRefreshFailure(
    previous: ResourceState<RemoteRepositorySnapshot>,
    message: String,
    cause: Throwable? = null,
): ResourceState<RemoteRepositorySnapshot> = when (previous) {
    is ResourceState.Loaded -> ResourceState.Stale(previous.value, previous.loadedAtMillis, message)
    is ResourceState.Stale -> ResourceState.Stale(previous.value, previous.loadedAtMillis, message)
    else -> ResourceState.Error(message, cause)
}

internal fun worktreeBadges(worktree: RemoteRepositoryWorktree): List<String> =
    buildList {
        if (worktree.isPrimary) add("primary")
        if (worktree.isLinked) add("linked")
        if (worktree.isLocked) add("locked")
        if (worktree.isMissing) add("missing")
        if (worktree.isDirty) add("dirty ${worktree.changeCount}")
        if (worktree.isBare) add("bare")
    }

internal fun terminalWorkspaceSessions(
    hostId: String,
    sessions: List<TerminalSessionRecord>,
    remotePath: String,
): List<TerminalSessionRecord> =
    terminalWorkspaceOrderedSessions(sessions = sessions, hostId = hostId, remotePath = remotePath)

internal fun terminalWorkspaceSessions(
    hostIds: Set<String>,
    sessions: List<TerminalSessionRecord>,
    remotePath: String,
): List<TerminalSessionRecord> =
    terminalWorkspaceOrderedSessions(sessions = sessions, hostIds = hostIds, remotePath = remotePath)

internal fun terminalWorkspaceOptionLabel(path: String): String =
    path.trim()
        .trimEnd('/')
        .substringAfterLast('/', missingDelimiterValue = path)
        .ifBlank { path }

internal fun terminalWorkspaceCountLabel(count: Int): String =
    if (count == 1) "1 terminal" else "$count terminals"

internal fun terminalSessionDefaultLabel(index: Int): String = terminalSessionDisplayName(index)

internal fun terminalSessionDefaultLabel(session: TerminalSessionRecord, index: Int): String =
    session.displayName.ifBlank { terminalSessionDisplayName(index) }

internal fun terminalSessionStatusLabel(session: TerminalSessionRecord): String {
    val base = when (session.status) {
        TerminalSessionStatus.Starting -> "starting"
        TerminalSessionStatus.Running -> "running"
        TerminalSessionStatus.Exited -> "exited"
        TerminalSessionStatus.Failed -> "failed"
        TerminalSessionStatus.Disconnected -> "disconnected"
    }
    if (session.status == TerminalSessionStatus.Running && session.foregroundServiceOwned) {
        return "$base - foreground"
    }
    val reason = session.disconnectedReason ?: return base
    return when (session.status) {
        TerminalSessionStatus.Exited,
        TerminalSessionStatus.Failed,
        TerminalSessionStatus.Disconnected,
        -> "$base - ${terminalDisconnectedReasonLabel(reason)}"
        TerminalSessionStatus.Starting,
        TerminalSessionStatus.Running,
        -> base
    }
}

private fun terminalDisconnectedReasonLabel(reason: TerminalDisconnectedReason): String =
    when (reason) {
        TerminalDisconnectedReason.UserClosed -> "user closed"
        TerminalDisconnectedReason.RemoteExited -> "remote exited"
        TerminalDisconnectedReason.SshDisconnected -> "ssh disconnected"
        TerminalDisconnectedReason.AndroidServiceStopped -> "android service stopped"
        TerminalDisconnectedReason.TerminalWriteTimeout -> "terminal write timeout"
        TerminalDisconnectedReason.TerminalFailure -> "terminal failure"
    }

internal fun terminalSessionActivityText(session: TerminalSessionRecord): String =
    DateUtils.getRelativeTimeSpanString(
        session.lastActivityAt ?: session.openedAt,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
    ).let { "last activated $it" }

internal fun requiresTerminalDeleteConfirmation(session: TerminalSessionRecord): Boolean =
    session.status == TerminalSessionStatus.Starting || session.status == TerminalSessionStatus.Running

internal fun terminalDeleteConfirmationText(label: String, session: TerminalSessionRecord): String =
    if (requiresTerminalDeleteConfirmation(session)) {
        "$label at ${session.remotePath} is still active. This will stop the terminal process and remove the terminal record."
    } else {
        "$label at ${session.remotePath} will be removed from the terminal list."
    }

internal data class RepositoryTerminalCreationAction(
    val label: String,
    val launchMode: TerminalLaunchMode,
    val primary: Boolean,
)

internal fun repositoryTerminalCreationActions(): List<RepositoryTerminalCreationAction> = listOf(
    RepositoryTerminalCreationAction(
        label = "New terminal",
        launchMode = TerminalLaunchMode.Native,
        primary = true,
    ),
    RepositoryTerminalCreationAction(
        label = "New terminal with tmux",
        launchMode = TerminalLaunchMode.TmuxIfAvailable,
        primary = false,
    ),
)

internal fun canCloseTerminalTmuxSession(session: TerminalSessionRecord): Boolean =
    session.tmuxIdentity != null

internal fun terminalTmuxCloseWarning(): String =
    "Also close the tmux session. This ends its running processes and disconnects other clients."

private data class TerminalDeleteTarget(
    val session: TerminalSessionRecord,
    val label: String,
)

private data class TerminalWorkspaceOption(
    val path: String,
    val label: String,
)

private fun repositoryTerminalWorkspaceOptions(
    repository: RemoteRepositoryProfile,
    snapshotState: ResourceState<RemoteRepositorySnapshot>,
): List<TerminalWorkspaceOption> {
    val root = TerminalWorkspaceOption(
        path = repositoryTerminalPath(repository),
        label = repository.title.ifBlank { "Repository root" },
    )
    val worktrees = when (snapshotState) {
        is ResourceState.Loaded -> snapshotState.value.worktrees
        is ResourceState.Stale -> snapshotState.value.worktrees
        else -> emptyList()
    }
    return buildList {
        add(root)
        worktrees.forEach { worktree ->
            val path = worktreeTerminalPath(worktree)
            if (path != root.path) {
                add(TerminalWorkspaceOption(path = path, label = terminalWorkspaceOptionLabel(path)))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepositorySetupScreen(
    hosts: List<SshHostProfile>,
    repositories: List<RemoteRepositoryProfile>,
    onBack: () -> Unit,
    onSaveRepository: (RemoteRepositoryProfile) -> Unit,
    onOpenRepository: (String) -> Unit,
    onDeleteRepository: (String) -> Unit,
    onBrowseDirectories: (SshHostProfile, String) -> List<RemoteDirectoryEntry> = { _, _ -> emptyList() },
    onInspectProject: (SshHostProfile, String) -> RemoteProjectInspection = { _, path ->
        RemoteProjectInspection(path, path, RemoteProjectKind.GitRepository, null, null)
    },
) {
    val authenticated = authenticatedHosts(hosts)
    var selectedHostId by remember(authenticated) { mutableStateOf(defaultAuthenticatedHost(authenticated)?.id) }
    var menuExpanded by remember { mutableStateOf(false) }
    var alias by remember { mutableStateOf("") }
    var remotePath by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var deleteTarget by remember { mutableStateOf<RemoteRepositoryProfile?>(null) }
    var directoryBrowserPath by remember { mutableStateOf<String?>(null) }
    var directoryEntriesState: ResourceState<List<RemoteDirectoryEntry>> by remember { mutableStateOf(ResourceState.Idle) }
    var saving by remember { mutableStateOf(false) }
    val selectedHost = authenticated.firstOrNull { it.id == selectedHostId }
    val scope = rememberCoroutineScope()

    fun clearDirectoryBrowser() {
        directoryBrowserPath = null
        directoryEntriesState = ResourceState.Idle
    }

    fun loadDirectoryPage(path: String) {
        val host = selectedHost ?: return
        val normalizedPath = directoryBrowserRootPath(path)
        val requestHostId = host.id
        directoryBrowserPath = normalizedPath
        directoryEntriesState = ResourceState.Loading
        error = null
        scope.launch {
            val nextState = runCatching {
                withContext(Dispatchers.IO) { onBrowseDirectories(host, normalizedPath) }
            }.fold(
                onSuccess = { ResourceState.Loaded(it) },
                onFailure = { ResourceState.Error(it.message ?: "Remote directory browse failed", it) },
            )
            if (selectedHostId != requestHostId || directoryBrowserPath != normalizedPath) return@launch
            directoryEntriesState = nextState
        }
    }

    fun openDirectoryPage(path: String) {
        val normalizedPath = directoryBrowserRootPath(path)
        if (directoryBrowserPath == normalizedPath && !shouldLoadDirectoryPage(directoryEntriesState)) {
            return
        }
        loadDirectoryPage(normalizedPath)
    }

    fun browseDirectories() {
        openDirectoryPage(remotePath)
    }

    fun openParentDirectory() {
        directoryBrowserPath?.let(::directoryBrowserParentPath)?.let(::openDirectoryPage)
    }

    fun validateAndSaveRepository() {
        val host = selectedHost ?: return
        saving = true
        error = null
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val inspection = onInspectProject(host, remotePath)
                    createProjectFromInspection(host, alias, inspection)
                }
            }.onSuccess {
                onSaveRepository(it)
                alias = ""
                remotePath = ""
                clearDirectoryBrowser()
                error = null
            }.onFailure {
                error = it.message ?: "Project validation failed"
            }
            saving = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add project") },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
            if (authenticated.isEmpty()) {
                Text("Initialize SSH access on a server before adding projects.")
                return@Column
            }

            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(HobgoblinSpacing.Md),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                ) {
                    Text("Project source", style = MaterialTheme.typography.titleMedium)
                    Box {
                        OutlinedButton(onClick = { menuExpanded = true }) {
                            Text(selectedHost?.title ?: "Select server")
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            authenticated.forEach { host ->
                                DropdownMenuItem(
                                    text = { Text(host.title) },
                                    onClick = {
                                        selectedHostId = host.id
                                        menuExpanded = false
                                        clearDirectoryBrowser()
                                    },
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = alias,
                        onValueChange = { alias = it },
                        label = { Text("Alias") },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = remotePath,
                        onValueChange = {
                            remotePath = it
                            clearDirectoryBrowser()
                        },
                        label = { Text("Remote path") },
                        singleLine = true,
                        isError = error != null,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                        OutlinedButton(
                            enabled = selectedHost != null,
                            onClick = { browseDirectories() },
                        ) {
                            Text("Browse")
                        }
                    }
                    directoryBrowserPath?.let { currentPath ->
                        DirectoryPagePicker(
                            currentPath = currentPath,
                            state = directoryEntriesState,
                            onOpenParent = ::openParentDirectory,
                            onOpenDirectory = ::openDirectoryPage,
                            onSelect = { selectedPath -> remotePath = selectedPath },
                        )
                    }
                    Button(
                        enabled = canSaveRepository(selectedHost, remotePath) && !saving,
                        onClick = { validateAndSaveRepository() },
                    ) {
                        Text(if (saving) "Validating..." else "Save project")
                    }
                    if (error != null) Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
                }
            }

            Text("Saved projects", style = MaterialTheme.typography.titleMedium)
            if (repositories.isEmpty()) {
                Text("No saved projects.")
            } else {
                repositories.forEach { repository ->
                    RepositoryRow(
                        repository = repository,
                        onOpenRepository = onOpenRepository,
                        onDeleteRepository = { deleteTarget = repository },
                    )
                }
            }
        }
    }

    deleteTarget?.let { target ->
        DeleteRepositoryDialog(
            repository = target,
            onConfirm = {
                onDeleteRepository(target.id)
                deleteTarget = null
            },
            onDismiss = { deleteTarget = null },
        )
    }
}

@Composable
private fun DirectoryPagePicker(
    currentPath: String,
    state: ResourceState<List<RemoteDirectoryEntry>>,
    onOpenParent: () -> Unit,
    onOpenDirectory: (String) -> Unit,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs)) {
        Text("Remote directories", style = MaterialTheme.typography.titleSmall)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(currentPath, style = MaterialTheme.typography.bodyMedium)
            }
            TextButton(
                enabled = directoryBrowserParentPath(currentPath) != null,
                onClick = onOpenParent,
            ) {
                Text("Up")
            }
            TextButton(onClick = { onSelect(currentPath) }) {
                Text("Select")
            }
        }
        when (state) {
            ResourceState.Idle -> Text("Not loaded.", style = MaterialTheme.typography.bodySmall)
            ResourceState.Loading -> Text("Loading directories.", style = MaterialTheme.typography.bodySmall)
            is ResourceState.Error -> Text(
                state.message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
            is ResourceState.Loaded -> DirectoryPageEntries(
                entries = state.value,
                onOpenDirectory = onOpenDirectory,
                onSelect = onSelect,
            )
            is ResourceState.Stale -> DirectoryPageEntries(
                entries = state.value,
                onOpenDirectory = onOpenDirectory,
                onSelect = onSelect,
            )
        }
    }
}

@Composable
private fun DirectoryPageEntries(
    entries: List<RemoteDirectoryEntry>,
    onOpenDirectory: (String) -> Unit,
    onSelect: (String) -> Unit,
) {
    if (entries.isEmpty()) {
        Text("No child directories.", style = MaterialTheme.typography.bodySmall)
        return
    }
    val listState = rememberLazyListState()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 260.dp),
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxWidth()
                .padding(end = 8.dp),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        ) {
            items(entries, key = { it.path }) { entry ->
                DirectoryPageEntryRow(
                    entry = entry,
                    onOpenDirectory = onOpenDirectory,
                    onSelect = onSelect,
                )
            }
        }
        DirectoryPageScrollbar(
            listState = listState,
            totalItems = entries.size,
            modifier = Modifier.align(Alignment.CenterEnd),
        )
    }
}

@Composable
private fun DirectoryPageEntryRow(
    entry: RemoteDirectoryEntry,
    onOpenDirectory: (String) -> Unit,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(entry.name, style = MaterialTheme.typography.bodyMedium)
            Text(entry.path, style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = { onOpenDirectory(entry.path) }) {
            Text("Open")
        }
        TextButton(onClick = { onSelect(entry.path) }) {
            Text("Select")
        }
    }
}

@Composable
private fun DirectoryPageScrollbar(
    listState: LazyListState,
    totalItems: Int,
    modifier: Modifier = Modifier,
) {
    val visibleItems = listState.layoutInfo.visibleItemsInfo.size
    if (totalItems <= 0 || visibleItems <= 0 || totalItems <= visibleItems) return

    val availableItems = (totalItems - visibleItems).coerceAtLeast(1)
    val scrollProgress = (listState.firstVisibleItemIndex.toFloat() / availableItems).coerceIn(0f, 1f)
    val thumbFraction = (visibleItems.toFloat() / totalItems).coerceIn(0.15f, 0.9f)
    val movableFraction = 1f - thumbFraction
    val topWeight = scrollProgress * movableFraction
    val bottomWeight = (movableFraction - topWeight).coerceAtLeast(0f)

    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(4.dp)
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
    ) {
        if (topWeight > 0f) Box(Modifier.weight(topWeight))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(thumbFraction)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)),
        )
        if (bottomWeight > 0f) Box(Modifier.weight(bottomWeight))
    }
}

@Composable
private fun RepositoryRow(
    repository: RemoteRepositoryProfile,
    onOpenRepository: (String) -> Unit,
    onDeleteRepository: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text(repository.title, style = MaterialTheme.typography.bodyMedium)
                Text(repository.remotePath, style = MaterialTheme.typography.bodySmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs)) {
                TextButton(onClick = { onOpenRepository(repository.id) }) {
                    Text("Open")
                }
                TextButton(onClick = onDeleteRepository) {
                    Text("Delete")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepositoryWorkspaceScreen(
    host: SshHostProfile,
    repository: RemoteRepositoryProfile,
    onBack: () -> Unit,
    onLoadSnapshot: () -> RemoteRepositorySnapshot,
    initialTerminalWorkspacePath: String? = null,
    terminalSessions: List<TerminalSessionRecord> = emptyList(),
    onProjectRootResolved: (String) -> Unit = {},
    onDiscoverTmuxTerminals: (RepositoryTmuxScope) -> Int = { 0 },
    onCreateTerminalAtPath: (String, String, TerminalLaunchMode) -> TerminalSessionRecord = { _, _, _ ->
        throw UnsupportedOperationException("Terminal sessions are not available")
    },
    onOpenExternalTermuxAtPath: (RemoteTarget) -> ExternalTermuxLaunchResult = {
        ExternalTermuxLaunchResult.Unavailable(copiedCommand = false)
    },
    onCopyExternalTermuxCommandAtPath: (RemoteTarget) -> Boolean = { false },
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit = {},
    onDeleteTerminalSession: (String, Boolean) -> Unit = { _, _ -> },
    onDeleteRepository: () -> Unit,
    onCreateWorktree: (WorktreeCreationSource, String) -> Unit = { _, _ -> },
    onRemoveWorktree: (RemoteRepositoryWorktree) -> Unit = {},
    initialWorktreeOrder: List<String> = emptyList(),
    onSaveWorktreeOrder: (List<String>) -> Unit = {},
) {
    var selectedTab by remember(repository.id) {
        mutableStateOf(initialRepositoryWorkspaceTab(repository, initialTerminalWorkspacePath))
    }
    var selectedTerminalWorkspacePath by remember(repository.id) {
        mutableStateOf(initialTerminalWorkspacePath ?: repositoryTerminalPath(repository))
    }
    var snapshotState: ResourceState<RemoteRepositorySnapshot> by remember(repository.id) {
        mutableStateOf(ResourceState.Idle)
    }
    var confirmDelete by remember(repository.id) { mutableStateOf(false) }
    var removeTarget by remember(repository.id) { mutableStateOf<RemoteRepositoryWorktree?>(null) }
    var terminalDeleteTarget by remember(repository.id) { mutableStateOf<TerminalDeleteTarget?>(null) }
    var closeTmuxSessionOnDelete by remember(repository.id) { mutableStateOf(false) }
    var terminalDeletePending by remember(repository.id) { mutableStateOf(false) }
    var tmuxDiscoveryPending by remember(repository.id) { mutableStateOf(false) }
    var actionError by remember(repository.id) { mutableStateOf<String?>(null) }
    var actionMessage by remember(repository.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val workspaceTabs = remember(repository.id, repository.remotePath, repository.kind) {
        repositoryWorkspaceTabs(repository)
    }
    val terminalWorkspaceOptions = remember(repository, snapshotState) {
        repositoryTerminalWorkspaceOptions(repository = repository, snapshotState = snapshotState)
    }
    val tmuxScope = remember(repository, snapshotState) {
        repositoryTmuxScope(repository = repository, snapshotState = snapshotState)
    }

    fun refreshSnapshot() {
        if (!shouldLoadRepositorySnapshot(repository)) return
        val previous = snapshotState
        snapshotState = ResourceState.Loading
        scope.launch {
            snapshotState = runCatching {
                withContext(Dispatchers.IO) { onLoadSnapshot() }
            }.fold(
                onSuccess = { snapshot ->
                    val loaded = ResourceState.Loaded(snapshot)
                    repositoryTmuxScope(repository, loaded)
                        ?.projectRoot
                        ?.takeIf { it != TmuxSessionProtocol.normalizePath(repository.remotePath) }
                        ?.let(onProjectRootResolved)
                    loaded
                },
                onFailure = {
                    repositorySnapshotStateAfterRefreshFailure(
                        previous = previous,
                        message = it.message ?: "Repository snapshot failed",
                        cause = it,
                    )
                },
            )
        }
    }

    fun createWorktree(source: WorktreeCreationSource, worktreePath: String) {
        actionError = null
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { onCreateWorktree(source, worktreePath) }
            }.onSuccess {
                refreshSnapshot()
            }.onFailure {
                actionError = it.message ?: "Remote worktree create failed"
            }
        }
    }

    fun removeWorktree(worktree: RemoteRepositoryWorktree) {
        actionError = null
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { onRemoveWorktree(worktree) }
            }.onSuccess {
                removeTarget = null
                refreshSnapshot()
            }.onFailure {
                actionError = it.message ?: "Remote worktree remove failed"
            }
        }
    }

    fun selectTerminalWorkspace(path: String) {
        selectedTerminalWorkspacePath = path
        selectedTab = RepositoryWorkspaceTab.Terminal
    }

    fun createTerminal(path: String, launchMode: TerminalLaunchMode) {
        actionError = null
        scope.launch {
            runCatching {
                val projectRoot = tmuxScope?.projectRoot
                    ?: requireNotNull(TmuxSessionProtocol.normalizePath(repository.remotePath)) {
                        "Terminal project root is invalid"
                    }
                withContext(Dispatchers.IO) { onCreateTerminalAtPath(path, projectRoot, launchMode) }
            }.onSuccess { session ->
                onOpenTerminalSession(session)
            }.onFailure {
                actionError = it.message ?: "Terminal create failed"
            }
        }
    }

    fun openExternalTermux(path: String, onResult: (ExternalTermuxLaunchResult) -> Unit) {
        actionError = null
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    onOpenExternalTermuxAtPath(RemoteTarget.fromHostProfile(host, path))
                }
            }.onSuccess { result ->
                actionError = externalTermuxActionError(result)
                onResult(result)
            }.onFailure {
                actionError = it.message ?: "External Termux launch failed"
                onResult(
                    ExternalTermuxLaunchResult.Failed(
                        copiedCommand = false,
                        openedTermux = false,
                        message = it.message ?: "External Termux launch failed",
                    ),
                )
            }
        }
    }

    fun copyExternalTermuxCommand(path: String, onCopied: (Boolean) -> Unit) {
        actionError = null
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    onCopyExternalTermuxCommandAtPath(RemoteTarget.fromHostProfile(host, path))
                }
            }.onSuccess { copied ->
                onCopied(copied)
                if (!copied) actionError = "External Termux command copy failed"
            }.onFailure {
                actionError = it.message ?: "External Termux command copy failed"
                onCopied(false)
            }
        }
    }

    fun deleteTerminalSession(session: TerminalSessionRecord) {
        if (terminalDeletePending) return
        actionError = null
        terminalDeletePending = true
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    onDeleteTerminalSession(session.id, closeTmuxSessionOnDelete)
                }
            }.onSuccess {
                terminalDeleteTarget = null
                closeTmuxSessionOnDelete = false
            }.onFailure {
                actionError = it.message ?: "Terminal delete failed"
            }
            terminalDeletePending = false
        }
    }

    fun requestDeleteTerminalSession(session: TerminalSessionRecord, label: String) {
        closeTmuxSessionOnDelete = false
        terminalDeleteTarget = TerminalDeleteTarget(session = session, label = label)
    }

    fun dismissTerminalDelete() {
        if (terminalDeletePending) return
        terminalDeleteTarget = null
        closeTmuxSessionOnDelete = false
    }

    suspend fun discoverTmuxTerminals(discoveryScope: RepositoryTmuxScope) {
        if (tmuxDiscoveryPending) return
        actionError = null
        actionMessage = null
        tmuxDiscoveryPending = true
        try {
            runCatching {
                withContext(Dispatchers.IO) { onDiscoverTmuxTerminals(discoveryScope) }
            }.onSuccess { foundCount ->
                actionMessage = tmuxScanResultMessage(foundCount = foundCount, sshUser = host.user)
            }.onFailure {
                actionError = it.message ?: "Tmux terminal discovery failed"
            }
        } finally {
            tmuxDiscoveryPending = false
        }
    }

    LaunchedEffect(repository.id) {
        if (shouldLoadRepositorySnapshot(repository)) refreshSnapshot()
    }

    LaunchedEffect(repository.id, initialTerminalWorkspacePath) {
        initialTerminalWorkspacePath?.let { selectTerminalWorkspace(it) }
    }

    LaunchedEffect(repository.id, selectedTab, tmuxScope) {
        if (selectedTab != RepositoryWorkspaceTab.Terminal || tmuxScope == null) {
            return@LaunchedEffect
        }
        discoverTmuxTerminals(tmuxScope)
    }

    BackHandler { onBack() }

    val density = LocalDensity.current
    val backSwipeDistancePx = with(density) { 72.dp.toPx() }
    val backSwipeEdgePx = with(density) { 28.dp.toPx() }

    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(onBack) {
                var draggedDistance = 0f
                var tracking = false
                var shouldHandle = true
                detectHorizontalDragGestures(
                    onHorizontalDrag = { change, amount ->
                        if (!shouldHandle) return@detectHorizontalDragGestures
                        if (!tracking) {
                            if (change.position.x <= backSwipeEdgePx) {
                                tracking = true
                            } else {
                                return@detectHorizontalDragGestures
                            }
                        }
                        draggedDistance += amount
                        if (draggedDistance.absoluteValue >= backSwipeDistancePx) {
                            onBack()
                            shouldHandle = false
                        }
                    },
                    onDragEnd = {
                        draggedDistance = 0f
                        tracking = false
                        shouldHandle = true
                    },
                    onDragCancel = {
                        draggedDistance = 0f
                        tracking = false
                        shouldHandle = true
                    },
                )
            },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = host.subtitle,
                        style = MaterialTheme.typography.titleSmall,
                    )
                },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text("Back")
                    }
                },
                actions = {
                    if (shouldLoadRepositorySnapshot(repository)) {
                        TextButton(onClick = { refreshSnapshot() }) {
                            Text("Refresh")
                        }
                    }
                    TextButton(onClick = { confirmDelete = true }) {
                        Text("Delete")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(
                    start = HobgoblinSpacing.Md,
                    top = HobgoblinSpacing.Xs,
                    end = HobgoblinSpacing.Md,
                    bottom = HobgoblinSpacing.Md,
                ),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Md),
        ) {
                actionError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                actionMessage?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                }
            RepositoryWorkspaceTabStrip(
                tabs = workspaceTabs,
                selectedTab = selectedTab,
                onSelectTab = { selectedTab = it },
                onSelectPreviousTab = {
                    if (workspaceTabs.isNotEmpty()) {
                        val currentIndex = repositoryWorkspaceTabIndex(workspaceTabs, selectedTab)
                        val previousIndex = if (currentIndex <= 0) workspaceTabs.lastIndex else currentIndex - 1
                        selectedTab = workspaceTabs[previousIndex]
                    }
                },
                onSelectNextTab = {
                    if (workspaceTabs.isNotEmpty()) {
                        val currentIndex = repositoryWorkspaceTabIndex(workspaceTabs, selectedTab)
                        val nextIndex = if (currentIndex >= workspaceTabs.lastIndex) 0 else currentIndex + 1
                        selectedTab = workspaceTabs[nextIndex]
                    }
                },
            )
            when (selectedTab) {
                RepositoryWorkspaceTab.Worktrees -> RepositoryWorktreesPanel(
                    repository = repository,
                    snapshotState = snapshotState,
                    onRefresh = { refreshSnapshot() },
                    onSelectTerminalWorkspace = ::selectTerminalWorkspace,
                    onCreateWorktree = ::createWorktree,
                    onRemoveWorktree = { removeTarget = it },
                    initialManualOrder = initialWorktreeOrder,
                    onSaveManualOrder = onSaveWorktreeOrder,
                )
                RepositoryWorkspaceTab.Commits -> Unit
                RepositoryWorkspaceTab.Terminal -> RepositoryTerminalPanel(
                    host = host,
                    hostProfileId = host.id,
                    targetHostId = RemoteTarget.fromHostProfile(host, selectedTerminalWorkspacePath).id,
                    path = selectedTerminalWorkspacePath,
                    workspaceOptions = terminalWorkspaceOptions,
                    sessions = terminalSessions,
                    tmuxScanPending = tmuxDiscoveryPending,
                    tmuxScanEnabled = canScanTmux(tmuxDiscoveryPending, tmuxScope?.allowedInitialPaths),
                    onScanTmux = {
                        tmuxScope?.let { discoveryScope ->
                            scope.launch { discoverTmuxTerminals(discoveryScope) }
                        }
                    },
                    onSelectWorkspace = ::selectTerminalWorkspace,
                    onCreateTerminalAtPath = ::createTerminal,
                    onOpenExternalTermuxAtPath = ::openExternalTermux,
                    onCopyExternalTermuxCommandAtPath = ::copyExternalTermuxCommand,
                    onOpenTerminalSession = onOpenTerminalSession,
                    onDeleteTerminalSession = ::requestDeleteTerminalSession,
                )
            }
        }
    }

    if (confirmDelete) {
        DeleteRepositoryDialog(
            repository = repository,
            onConfirm = {
                onDeleteRepository()
                confirmDelete = false
            },
            onDismiss = { confirmDelete = false },
        )
    }

    removeTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { removeTarget = null },
            title = { Text("Remove remote worktree?") },
            text = { Text(worktreeRemovalConfirmationText(target)) },
            confirmButton = {
                TextButton(onClick = { removeWorktree(target) }) {
                    Text("Remove")
                }
            },
            dismissButton = {
                TextButton(onClick = { removeTarget = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    terminalDeleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = ::dismissTerminalDelete,
            title = { Text("Delete terminal?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    Text(terminalDeleteConfirmationText(target.label, target.session))
                    if (canCloseTerminalTmuxSession(target.session)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !terminalDeletePending) {
                                    closeTmuxSessionOnDelete = !closeTmuxSessionOnDelete
                                },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(
                                checked = closeTmuxSessionOnDelete,
                                onCheckedChange = { closeTmuxSessionOnDelete = it },
                                enabled = !terminalDeletePending,
                            )
                            Text(terminalTmuxCloseWarning(), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { deleteTerminalSession(target.session) },
                    enabled = !terminalDeletePending,
                ) {
                    Text(if (requiresTerminalDeleteConfirmation(target.session)) "Stop and delete" else "Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = ::dismissTerminalDelete, enabled = !terminalDeletePending) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun RepositoryWorkspaceTabStrip(
    tabs: List<RepositoryWorkspaceTab>,
    selectedTab: RepositoryWorkspaceTab,
    onSelectTab: (RepositoryWorkspaceTab) -> Unit,
    onSelectPreviousTab: () -> Unit,
    onSelectNextTab: () -> Unit,
) {
    if (tabs.isEmpty()) return
    val canCycle = tabs.size > 1
    val density = LocalDensity.current
    val tabSwipeDistancePx = with(density) { 72.dp.toPx() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(tabs, canCycle, onSelectNextTab, onSelectPreviousTab) {
                if (!canCycle) return@pointerInput
                var draggedDistance = 0f
                detectHorizontalDragGestures(
                    onHorizontalDrag = { _, amount ->
                        draggedDistance += amount
                        when {
                            draggedDistance >= tabSwipeDistancePx -> {
                                onSelectPreviousTab()
                                draggedDistance = 0f
                            }
                            draggedDistance <= -tabSwipeDistancePx -> {
                                onSelectNextTab()
                                draggedDistance = 0f
                            }
                        }
                    },
                    onDragEnd = { draggedDistance = 0f },
                    onDragCancel = { draggedDistance = 0f },
                )
            },
        horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (repositoryWorkspaceTabsUseScrollableStrip(tabs)) {
            PrimaryScrollableTabRow(
                modifier = Modifier.weight(1f),
                selectedTabIndex = repositoryWorkspaceTabIndex(tabs, selectedTab),
                edgePadding = HobgoblinSpacing.Xs,
            ) {
                tabs.forEach { tab ->
                    Tab(
                        selected = tab == selectedTab,
                        onClick = { onSelectTab(tab) },
                        text = { Text(tab.label) },
                    )
                }
            }
        } else {
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
            ) {
                tabs.forEach { tab ->
                    TextButton(onClick = { onSelectTab(tab) }) {
                        Text(tab.label)
                    }
                }
            }
        }
    }
}

@Composable
private fun DeleteRepositoryDialog(
    repository: RemoteRepositoryProfile,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete project record?") },
        text = {
            Text("This removes ${repository.title} from Hobgoblin Android. It does not delete anything on the SSH server.")
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("Delete")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

@Composable
private fun RepositoryWorktreesPanel(
    repository: RemoteRepositoryProfile,
    snapshotState: ResourceState<RemoteRepositorySnapshot>,
    onRefresh: () -> Unit,
    onSelectTerminalWorkspace: (String) -> Unit,
    onCreateWorktree: (WorktreeCreationSource, String) -> Unit,
    onRemoveWorktree: (RemoteRepositoryWorktree) -> Unit,
    initialManualOrder: List<String>,
    onSaveManualOrder: (List<String>) -> Unit,
) {
    var branch by remember(repository.id) { mutableStateOf("") }
    var branchMenuExpanded by remember(repository.id) { mutableStateOf(false) }
    var worktreePath by remember(repository.id) { mutableStateOf("") }
    var manualOrder by remember(repository.id, initialManualOrder) { mutableStateOf(initialManualOrder) }

    fun updateBranch(value: String, pathBranchName: String = value) {
        branch = value
        worktreePath = suggestedWorktreePath(repository.remotePath, pathBranchName)
    }

    val branches = when (snapshotState) {
        is ResourceState.Loaded -> snapshotState.value.branches
        is ResourceState.Stale -> snapshotState.value.branches
        else -> emptyList()
    }
    val defaultBranch = branches.firstOrNull { it.isDefault } ?: branches.firstOrNull()

    LaunchedEffect(repository.id, defaultBranch?.name, snapshotState) {
        if (branch.isBlank() && defaultBranch != null) {
            updateBranch(defaultBranch.name)
        }
    }

    SnapshotContent(snapshotState = snapshotState, onRefresh = onRefresh) { snapshot ->
        val localBranchNames = snapshot.branches.map(RemoteRepositoryBranch::name).toSet()
        val remoteBranchNames = snapshot.remoteBranches.toSet()
        val branchCandidates = worktreeBranchCandidates(snapshot.branches, snapshot.remoteBranches)
        val orderedWorktrees = ManualItemOrderPolicy.apply(
            snapshot.worktrees,
            manualOrder,
            RemoteRepositoryWorktree::path,
        )
        val reorderState = rememberManualReorderState(
            onMove = { draggedPath, targetPath ->
                manualOrder = ManualItemOrderPolicy.move(
                    orderedWorktrees.map(RemoteRepositoryWorktree::path),
                    draggedPath,
                    targetPath,
                )
            },
            onFinished = { onSaveManualOrder(manualOrder) },
        )
        Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(HobgoblinSpacing.Md),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                ) {
                    Text("Create worktree", style = MaterialTheme.typography.titleMedium)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            modifier = Modifier.weight(1f),
                            value = branch,
                            onValueChange = { updateBranch(it) },
                            label = { Text("Base branch") },
                            singleLine = true,
                        )
                        if (branchCandidates.isNotEmpty()) {
                            TextButton(onClick = { branchMenuExpanded = true }) {
                                Text("Select branch")
                            }
                            DropdownMenu(
                                expanded = branchMenuExpanded,
                                onDismissRequest = { branchMenuExpanded = false },
                            ) {
                                branchCandidates.forEach { candidate ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(candidate.ref)
                                                Text(
                                                    candidate.kindLabel,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        },
                                        onClick = {
                                            updateBranch(
                                                value = candidate.ref,
                                                pathBranchName = worktreePathBranchName(candidate.ref, remoteBranchNames),
                                            )
                                            branchMenuExpanded = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                    OutlinedTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = worktreePath,
                        onValueChange = { worktreePath = it },
                        label = { Text("Worktree path") },
                        singleLine = true,
                    )
                    Button(
                        enabled = canCreateWorktree(branch, worktreePath),
                        onClick = {
                            onCreateWorktree(
                                worktreeCreationSource(branch, localBranchNames, remoteBranchNames),
                                worktreePath,
                            )
                        },
                    ) {
                        Text("Create worktree")
                    }
                }
            }
            if (orderedWorktrees.isEmpty()) {
                Text("No worktrees found.")
            } else {
                orderedWorktrees.forEach { worktree ->
                    WorktreeRow(
                        modifier = Modifier.manualReorderItem(reorderState, worktree.path),
                        worktree = worktree,
                        reorderState = reorderState,
                        onSelectTerminalWorkspace = onSelectTerminalWorkspace,
                        onRemoveWorktree = onRemoveWorktree,
                    )
                }
            }
        }
    }
}

@Composable
private fun WorktreeRow(
    modifier: Modifier,
    worktree: RemoteRepositoryWorktree,
    reorderState: ManualReorderState,
    onSelectTerminalWorkspace: (String) -> Unit,
    onRemoveWorktree: (RemoteRepositoryWorktree) -> Unit,
) {
    val removalSafety = evaluateWorktreeRemoval(worktree)
    val worktreeTitle = worktree.path
        .trim()
        .trimEnd('/')
        .substringAfterLast('/', missingDelimiterValue = worktree.path)
        .ifBlank { worktree.path }
    val workspaceSummary = run {
        val badges = worktreeBadges(worktree).joinToString(" ")
        buildString {
            append(worktree.branch ?: "detached")
            if (badges.isNotBlank()) {
                append(" · ")
                append(badges)
            }
        }
    }
    val actionButtonPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp)

    Card(modifier.fillMaxWidth()) {
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
                    worktreeTitle,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis,
                )
                ManualReorderHandle(
                    state = reorderState,
                    itemKey = worktree.path,
                    itemLabel = worktreeTitle,
                )
            }
            if (workspaceSummary.isNotBlank()) {
                Text(
                    workspaceSummary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Clip,
                )
            }
            Text(
                worktree.path,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip,
            )
            if (!removalSafety.allowed) {
                Text(
                    removalSafety.reason.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = { onSelectTerminalWorkspace(worktreeTerminalPath(worktree)) },
                    contentPadding = actionButtonPadding,
                ) {
                    Text("Terminals", style = MaterialTheme.typography.labelMedium)
                }
                if (removalSafety.allowed) {
                    TextButton(
                        onClick = { onRemoveWorktree(worktree) },
                        contentPadding = actionButtonPadding,
                    ) {
                        Text("Remove", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun RepositoryTerminalPanel(
    host: SshHostProfile,
    hostProfileId: String,
    targetHostId: String,
    path: String,
    workspaceOptions: List<TerminalWorkspaceOption>,
    sessions: List<TerminalSessionRecord>,
    tmuxScanPending: Boolean,
    tmuxScanEnabled: Boolean,
    onScanTmux: () -> Unit,
    onSelectWorkspace: (String) -> Unit,
    onCreateTerminalAtPath: (String, TerminalLaunchMode) -> Unit,
    onOpenExternalTermuxAtPath: (String, (ExternalTermuxLaunchResult) -> Unit) -> Unit,
    onCopyExternalTermuxCommandAtPath: (String, (Boolean) -> Unit) -> Unit,
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit,
    onDeleteTerminalSession: (TerminalSessionRecord, String) -> Unit,
) {
    val selectedPath = terminalSessionRemotePath(path)
    val terminalHostIds = remember(hostProfileId, targetHostId) { setOf(hostProfileId, targetHostId) }
    val workspaceSessionCounts = terminalWorkspaceSessionCountsByPath(
        sessions = sessions,
        hostIds = terminalHostIds,
    )
    val workspaceSessions = terminalWorkspaceSessions(
        hostIds = terminalHostIds,
        sessions = sessions,
        remotePath = selectedPath,
    )
    val stableOrderedSessions = terminalWorkspaceCreatedSessions(sessions, terminalHostIds, path)
    val openedOrderLabels = stableOrderedSessions
        .mapIndexed { index, session -> session.id to terminalSessionDefaultLabel(session, index) }
        .toMap()
    val activeWorktreeCount = workspaceSessions.size
    var workspaceMenuExpanded by remember(path, workspaceOptions) { mutableStateOf(false) }
    var selectedMode by remember(path) { mutableStateOf(RepositoryTerminalMode.RemoteSsh) }
    var externalTermuxStatus by remember(path) { mutableStateOf(ExternalTermuxStatus.Ready) }
    val selectedWorkspaceOption = workspaceOptions.firstOrNull { terminalSessionRemotePath(it.path) == selectedPath }
        ?: TerminalWorkspaceOption(path = selectedPath, label = terminalWorkspaceOptionLabel(selectedPath))
    Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
        RepositoryTerminalModeSelector(
            selectedMode = selectedMode,
            onSelectMode = {
                selectedMode = it
                externalTermuxStatus = ExternalTermuxStatus.Ready
            },
        )
        when (selectedMode) {
            RepositoryTerminalMode.RemoteSsh -> RemoteSshTerminalPanelContent(
                selectedWorkspaceOption = selectedWorkspaceOption,
                workspaceOptions = workspaceOptions,
                workspaceSessionCounts = workspaceSessionCounts,
                workspaceSessions = workspaceSessions,
                openedOrderLabels = openedOrderLabels,
                activeWorktreeCount = activeWorktreeCount,
                tmuxScanPending = tmuxScanPending,
                tmuxScanEnabled = tmuxScanEnabled,
                onScanTmux = onScanTmux,
                workspaceMenuExpanded = workspaceMenuExpanded,
                onWorkspaceMenuExpandedChange = { workspaceMenuExpanded = it },
                onSelectWorkspace = onSelectWorkspace,
                onCreateTerminalAtPath = onCreateTerminalAtPath,
                onOpenTerminalSession = onOpenTerminalSession,
                onDeleteTerminalSession = onDeleteTerminalSession,
            )
            RepositoryTerminalMode.ExternalTermux -> ExternalTermuxPanel(
                host = host,
                path = path,
                status = externalTermuxStatus,
                onOpenExternalTermuxAtPath = onOpenExternalTermuxAtPath,
                onCopyExternalTermuxCommandAtPath = onCopyExternalTermuxCommandAtPath,
                onStatusChange = { externalTermuxStatus = it },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RepositoryTerminalModeSelector(
    selectedMode: RepositoryTerminalMode,
    onSelectMode: (RepositoryTerminalMode) -> Unit,
) {
    val modes = repositoryTerminalModes()
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        modes.forEachIndexed { index, mode ->
            SegmentedButton(
                selected = selectedMode == mode,
                onClick = { onSelectMode(mode) },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = modes.size),
            ) {
                Text(mode.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun ExternalTermuxPanel(
    host: SshHostProfile,
    path: String,
    status: ExternalTermuxStatus,
    onOpenExternalTermuxAtPath: (String, (ExternalTermuxLaunchResult) -> Unit) -> Unit,
    onCopyExternalTermuxCommandAtPath: (String, (Boolean) -> Unit) -> Unit,
    onStatusChange: (ExternalTermuxStatus) -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                ) {
                    Text(externalTermuxTargetLabel(host), style = MaterialTheme.typography.titleMedium)
                    Text(
                        path,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    externalTermuxStatusLabel(status),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onCopyExternalTermuxCommandAtPath(path) { copied ->
                            onStatusChange(
                                if (copied) ExternalTermuxStatus.CommandCopied else ExternalTermuxStatus.Failed,
                            )
                        }
                    },
                ) {
                    Text("Copy command", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onOpenExternalTermuxAtPath(path) { result ->
                            onStatusChange(externalTermuxStatusAfterLaunch(result))
                        }
                    },
                ) {
                    Text("Open in Termux", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun RemoteSshTerminalPanelContent(
    selectedWorkspaceOption: TerminalWorkspaceOption,
    workspaceOptions: List<TerminalWorkspaceOption>,
    workspaceSessionCounts: List<Pair<String, Int>>,
    workspaceSessions: List<TerminalSessionRecord>,
    openedOrderLabels: Map<String, String>,
    activeWorktreeCount: Int,
    tmuxScanPending: Boolean,
    tmuxScanEnabled: Boolean,
    onScanTmux: () -> Unit,
    workspaceMenuExpanded: Boolean,
    onWorkspaceMenuExpandedChange: (Boolean) -> Unit,
    onSelectWorkspace: (String) -> Unit,
    onCreateTerminalAtPath: (String, TerminalLaunchMode) -> Unit,
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit,
    onDeleteTerminalSession: (TerminalSessionRecord, String) -> Unit,
) {
    val creationActions = repositoryTerminalCreationActions()
    val nativeCreationAction = creationActions.first { it.primary }
    val tmuxCreationAction = creationActions.first { !it.primary }
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(HobgoblinSpacing.Md),
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                ) {
                    Text(selectedWorkspaceOption.label, style = MaterialTheme.typography.titleMedium)
                    Text(
                        selectedWorkspaceOption.path,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    terminalWorkspaceCountLabel(activeWorktreeCount),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = { onWorkspaceMenuExpandedChange(true) },
                ) {
                    Text(
                        "Switch workspace",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Button(
                    onClick = {
                        onCreateTerminalAtPath(selectedWorkspaceOption.path, nativeCreationAction.launchMode)
                    },
                ) {
                    Text(nativeCreationAction.label, maxLines = 1)
                }
            }
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    onCreateTerminalAtPath(selectedWorkspaceOption.path, tmuxCreationAction.launchMode)
                },
            ) {
                Text(tmuxCreationAction.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = onScanTmux,
                enabled = tmuxScanEnabled,
            ) {
                Text(
                    tmuxScanButtonLabel(tmuxScanPending),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            DropdownMenu(
                expanded = workspaceMenuExpanded,
                onDismissRequest = { onWorkspaceMenuExpandedChange(false) },
            ) {
                workspaceOptions.forEach { option ->
                    val optionPath = terminalSessionRemotePath(option.path)
                    val count = workspaceSessionCounts.find { it.first == optionPath }?.second ?: 0
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text(option.label)
                                Text(
                                    "${option.path} · ${terminalWorkspaceCountLabel(count)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        },
                        onClick = {
                            onWorkspaceMenuExpandedChange(false)
                            onSelectWorkspace(option.path)
                        },
                    )
                }
            }
        }
    }
    if (workspaceSessions.isEmpty()) {
        Text("No terminals for this worktree.")
    } else {
        Column(
            verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
        ) {
            workspaceSessions.forEach { session ->
                val label = openedOrderLabels[session.id] ?: terminalSessionDefaultLabel(0)
                SwipeDeleteTerminalSessionRow(
                    onDelete = { onDeleteTerminalSession(session, label) },
                ) {
                    TerminalSessionRow(
                        session = session,
                        label = label,
                        onOpenTerminalSession = onOpenTerminalSession,
                        onDeleteTerminalSession = onDeleteTerminalSession,
                    )
                }
            }
        }
    }
}

@Composable
private fun SwipeDeleteTerminalSessionRow(
    onDelete: () -> Unit,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val revealDistancePx = with(density) { 88.dp.toPx() }
    val confirmDistancePx = with(density) { 48.dp.toPx() }
    val offsetX = remember {
        Animatable(0f)
    }
    val scope = rememberCoroutineScope()

    Box(Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(MaterialTheme.colorScheme.errorContainer)
                .padding(HobgoblinSpacing.Md),
            contentAlignment = Alignment.CenterEnd,
        ) {
            TextButton(onClick = onDelete) {
                Text("Delete")
            }
        }
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .pointerInput(revealDistancePx) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { _, amount ->
                            val next = (offsetX.value + amount).coerceIn(-revealDistancePx, 0f)
                            scope.launch {
                                offsetX.snapTo(next)
                            }
                        },
                        onDragEnd = {
                            scope.launch {
                                val shouldDelete = offsetX.value <= -confirmDistancePx
                                offsetX.animateTo(0f)
                                if (shouldDelete) onDelete()
                            }
                        },
                        onDragCancel = {
                            scope.launch {
                                offsetX.animateTo(0f)
                            }
                        },
                    )
                },
        ) {
            content()
        }
    }
}

@Composable
private fun TerminalSessionRow(
    session: TerminalSessionRecord,
    label: String,
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit,
    onDeleteTerminalSession: (TerminalSessionRecord, String) -> Unit,
) {
    Card(
        Modifier
            .fillMaxWidth()
            .clickable { onOpenTerminalSession(session) },
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
                    label,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    terminalSessionStatusLabel(session),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                terminalSessionActivityText(session),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TerminalSessionIdentityDetails(session = session)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = { onOpenTerminalSession(session) }) {
                    Text("Open")
                }
                TextButton(onClick = { onDeleteTerminalSession(session, label) }) {
                    Text("Delete")
                }
            }
        }
    }
}

@Composable
private fun SnapshotContent(
    snapshotState: ResourceState<RemoteRepositorySnapshot>,
    onRefresh: () -> Unit,
    content: @Composable (RemoteRepositorySnapshot) -> Unit,
) {
    when (snapshotState) {
        ResourceState.Idle,
        ResourceState.Loading,
        -> Text("Loading repository data.")

        is ResourceState.Error -> Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(HobgoblinSpacing.Md),
                verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
            ) {
                Text("failed", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                Text(snapshotState.message)
                Button(onClick = onRefresh) {
                    Text("Retry")
                }
            }
        }

        is ResourceState.Stale -> {
            Text("stale - ${snapshotState.reason}", color = MaterialTheme.colorScheme.error)
            content(snapshotState.value)
        }
        is ResourceState.Loaded -> content(snapshotState.value)
    }
}

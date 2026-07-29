package com.mrongm.hobgoblin.ui.screens.repositories

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
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextOverflow
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.data.ManualItemOrderPolicy
import com.mrongm.hobgoblin.domain.ssh.RemoteDirectoryEntry
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectInspection
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryBranch
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositorySnapshot
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.ssh.evaluateWorktreeRemoval
import com.mrongm.hobgoblin.ssh.evaluateMergeDestination
import com.mrongm.hobgoblin.ssh.evaluateMergeOutSource
import com.mrongm.hobgoblin.ssh.mergeOutDestinationWorktrees
import com.mrongm.hobgoblin.ssh.WorktreeRemovalBlockReason
import com.mrongm.hobgoblin.ssh.WorktreeCreationSource
import com.mrongm.hobgoblin.terminals.TerminalDisconnectedReason
import com.mrongm.hobgoblin.terminals.TerminalLaunchMode
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol
import com.mrongm.hobgoblin.termux.ExternalTermuxLaunchResult
import com.mrongm.hobgoblin.ui.screens.terminals.TerminalSessionIdentityDetails
import com.mrongm.hobgoblin.ui.screens.terminals.terminalSessionRemotePath
import com.mrongm.hobgoblin.ui.screens.terminals.terminalSessionDisplayName
import com.mrongm.hobgoblin.ui.screens.terminals.terminalSessionReconnectAvailable
import com.mrongm.hobgoblin.ui.screens.terminals.terminalWorkspaceSessionCountsByPath
import com.mrongm.hobgoblin.ui.screens.terminals.terminalWorkspaceCreatedSessions
import com.mrongm.hobgoblin.ui.screens.terminals.terminalWorkspaceOrderedSessions
import com.mrongm.hobgoblin.ui.components.ManualReorderHandle
import com.mrongm.hobgoblin.ui.components.ManualReorderState
import com.mrongm.hobgoblin.ui.components.manualReorderItem
import com.mrongm.hobgoblin.ui.components.rememberManualReorderState
import com.mrongm.hobgoblin.ui.theme.HobgoblinSpacing
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.mrongm.hobgoblin.ui.text.resolve
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.absoluteValue
import kotlin.math.roundToInt

internal enum class RepositoryWorkspaceTab {
    Worktrees,
    Commits,
    Terminal,
}

internal enum class RepositoryTerminalMode {
    RemoteSsh,
    ExternalTermux,
}

internal enum class ExternalTermuxStatus {
    Ready,
    CommandCopied,
    OpenedInTermux,
    TermuxNotInstalled,
    CommandApiUnavailable,
    Failed,
}

private const val CompactWorkspaceTabLimit = 4

internal fun repositoryTerminalModes(): List<RepositoryTerminalMode> =
    RepositoryTerminalMode.entries.toList()

internal fun repositoryWorkspaceTabText(tab: RepositoryWorkspaceTab): LocalizedText =
    when (tab) {
        RepositoryWorkspaceTab.Worktrees -> LocalizedText(R.string.repository_tab_worktrees)
        RepositoryWorkspaceTab.Commits -> LocalizedText(R.string.repository_tab_commits)
        RepositoryWorkspaceTab.Terminal -> LocalizedText(R.string.common_terminals)
    }

internal fun repositoryTerminalModeText(mode: RepositoryTerminalMode): LocalizedText =
    when (mode) {
        RepositoryTerminalMode.RemoteSsh -> LocalizedText(R.string.repository_terminal_mode_remote_ssh)
        RepositoryTerminalMode.ExternalTermux -> LocalizedText(R.string.repository_terminal_mode_external_termux)
    }

internal fun externalTermuxTargetLabel(host: SshHostProfile): String =
    "${host.user}@${host.host}:${host.port}"

internal fun externalTermuxStatusText(status: ExternalTermuxStatus): LocalizedText =
    when (status) {
        ExternalTermuxStatus.Ready -> LocalizedText(R.string.repository_termux_ready)
        ExternalTermuxStatus.CommandCopied -> LocalizedText(R.string.repository_termux_command_copied)
        ExternalTermuxStatus.OpenedInTermux -> LocalizedText(R.string.repository_termux_opened)
        ExternalTermuxStatus.TermuxNotInstalled -> LocalizedText(R.string.repository_termux_not_installed)
        ExternalTermuxStatus.CommandApiUnavailable -> LocalizedText(R.string.repository_termux_api_unavailable)
        ExternalTermuxStatus.Failed -> LocalizedText(R.string.repository_termux_failed)
    }

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

internal fun initialRepositoryHost(
    authenticated: List<SshHostProfile>,
    initialHostId: String?,
): SshHostProfile? = authenticated.firstOrNull { it.id == initialHostId }
    ?: defaultAuthenticatedHost(authenticated)

internal fun initialRepositoryPath(initialRemotePath: String?): String =
    initialRemotePath?.trim().orEmpty()

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

internal fun tmuxScanButtonText(isScanning: Boolean): LocalizedText =
    LocalizedText(if (isScanning) R.string.repository_tmux_scanning else R.string.repository_tmux_scan)

internal fun tmuxScanResultText(foundCount: Int, sshUser: String): LocalizedText =
    when (foundCount) {
        0 -> LocalizedText(R.string.repository_tmux_none, listOf(sshUser))
        1 -> LocalizedText(R.string.repository_tmux_found_one, listOf(sshUser))
        else -> LocalizedText(R.string.repository_tmux_found_many, listOf(foundCount, sshUser))
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
    val kindLabel: LocalizedText,
)

internal fun worktreeBranchCandidates(
    localBranches: List<RemoteRepositoryBranch>,
    remoteBranches: List<String>,
): List<WorktreeBranchCandidate> =
    localBranches.map {
        WorktreeBranchCandidate(ref = it.name, kindLabel = LocalizedText(R.string.repository_branch_local))
    } + remoteBranches.distinct().map {
        WorktreeBranchCandidate(ref = it, kindLabel = LocalizedText(R.string.repository_branch_remote))
    }

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

internal fun worktreeBadges(worktree: RemoteRepositoryWorktree): List<LocalizedText> =
    buildList {
        if (worktree.isPrimary) add(LocalizedText(R.string.repository_badge_primary))
        if (worktree.isLinked) add(LocalizedText(R.string.repository_badge_linked))
        if (worktree.isLocked) add(LocalizedText(R.string.repository_badge_locked))
        if (worktree.isMissing) add(LocalizedText(R.string.repository_badge_missing))
        if (worktree.isDirty) add(LocalizedText(R.string.repository_badge_dirty, listOf(worktree.changeCount)))
        if (worktree.isBare) add(LocalizedText(R.string.repository_badge_bare))
    }

internal fun worktreeRemovalBlockedText(reason: WorktreeRemovalBlockReason?): LocalizedText? = when (reason) {
    WorktreeRemovalBlockReason.Primary -> LocalizedText(R.string.repository_worktree_primary_blocked)
    WorktreeRemovalBlockReason.Dirty -> LocalizedText(R.string.repository_worktree_dirty_blocked)
    WorktreeRemovalBlockReason.Locked -> LocalizedText(R.string.repository_worktree_locked_blocked)
    WorktreeRemovalBlockReason.Missing -> LocalizedText(R.string.repository_worktree_missing_blocked)
    WorktreeRemovalBlockReason.IdentityChanged -> LocalizedText(R.string.repository_worktree_identity_changed)
    null -> null
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

internal fun terminalWorkspaceCountText(count: Int): LocalizedText =
    when (count) {
        0 -> LocalizedText(R.string.terminal_count_zero)
        1 -> LocalizedText(R.string.terminal_count_one)
        else -> LocalizedText(R.string.terminal_count_many, listOf(count))
    }

internal fun terminalSessionDefaultLabel(index: Int): String = terminalSessionDisplayName(index)

internal fun terminalSessionDefaultLabel(session: TerminalSessionRecord, index: Int): String =
    session.displayName.ifBlank { terminalSessionDisplayName(index) }

internal fun terminalSessionStatusText(session: TerminalSessionRecord): LocalizedText {
    val base = LocalizedText(when (session.status) {
        TerminalSessionStatus.Starting -> R.string.terminal_status_starting
        TerminalSessionStatus.Running -> R.string.terminal_status_running
        TerminalSessionStatus.Exited -> R.string.terminal_status_exited
        TerminalSessionStatus.Failed -> R.string.terminal_status_failed
        TerminalSessionStatus.Disconnected -> R.string.terminal_status_disconnected
    })
    if (session.status == TerminalSessionStatus.Running && session.foregroundServiceOwned) {
        return LocalizedText(R.string.terminal_status_foreground, listOf(base))
    }
    val reason = session.disconnectedReason ?: return base
    return when (session.status) {
        TerminalSessionStatus.Exited,
        TerminalSessionStatus.Failed,
        TerminalSessionStatus.Disconnected,
        -> LocalizedText(R.string.terminal_status_with_detail, listOf(base, terminalDisconnectedReasonText(reason)))
        TerminalSessionStatus.Starting,
        TerminalSessionStatus.Running,
        -> base
    }
}

private fun terminalDisconnectedReasonText(reason: TerminalDisconnectedReason): LocalizedText =
    when (reason) {
        TerminalDisconnectedReason.UserClosed -> LocalizedText(R.string.terminal_reason_user_closed)
        TerminalDisconnectedReason.RemoteExited -> LocalizedText(R.string.terminal_reason_remote_exited)
        TerminalDisconnectedReason.SshDisconnected -> LocalizedText(R.string.terminal_reason_ssh_disconnected)
        TerminalDisconnectedReason.AndroidServiceStopped -> LocalizedText(R.string.terminal_reason_android_service_stopped)
        TerminalDisconnectedReason.TerminalWriteTimeout -> LocalizedText(R.string.terminal_reason_write_timeout)
        TerminalDisconnectedReason.TerminalFailure -> LocalizedText(R.string.terminal_reason_failure)
    }

internal fun terminalSessionActivityText(session: TerminalSessionRecord): LocalizedText =
    LocalizedText(R.string.repository_terminal_last_activated, listOf(DateUtils.getRelativeTimeSpanString(
        session.lastActivityAt ?: session.openedAt,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
    )))

internal fun requiresTerminalDeleteConfirmation(session: TerminalSessionRecord): Boolean =
    session.status == TerminalSessionStatus.Starting || session.status == TerminalSessionStatus.Running

internal fun terminalDeleteConfirmationText(label: String, session: TerminalSessionRecord): LocalizedText =
    LocalizedText(
        resourceId = if (requiresTerminalDeleteConfirmation(session)) {
            R.string.repository_terminal_delete_active
        } else {
            R.string.repository_terminal_delete_inactive
        },
        formatArgs = listOf(label, session.remotePath),
    )

internal fun repositoryTerminalCloseConfirmationText(
    label: String,
    session: TerminalSessionRecord,
): LocalizedText = LocalizedText(
    resourceId = if (session.tmuxIdentity != null) {
        R.string.repository_terminal_close_tmux
    } else {
        R.string.repository_terminal_close_native
    },
    formatArgs = listOf(label, session.remotePath),
)

internal data class RepositoryTerminalCreationAction(
    val label: LocalizedText,
    val launchMode: TerminalLaunchMode,
    val primary: Boolean,
)

internal fun repositoryTerminalCreationActions(): List<RepositoryTerminalCreationAction> = listOf(
    RepositoryTerminalCreationAction(
        label = LocalizedText(R.string.repository_new_terminal),
        launchMode = TerminalLaunchMode.Native,
        primary = true,
    ),
    RepositoryTerminalCreationAction(
        label = LocalizedText(R.string.repository_new_tmux_terminal),
        launchMode = TerminalLaunchMode.TmuxIfAvailable,
        primary = false,
    ),
)

internal fun canCloseTerminalTmuxSession(session: TerminalSessionRecord): Boolean =
    session.tmuxIdentity != null

internal fun terminalTmuxCloseWarningText(): LocalizedText =
    LocalizedText(R.string.repository_tmux_close_warning)

private data class TerminalActionTarget(
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
    repositoryRootLabel: String,
): List<TerminalWorkspaceOption> {
    val root = TerminalWorkspaceOption(
        path = repositoryTerminalPath(repository),
        label = repository.title.ifBlank { repositoryRootLabel },
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
    initialHostId: String? = null,
    initialRemotePath: String? = null,
    onBack: () -> Unit,
    onSaveRepository: (RemoteRepositoryProfile) -> Unit,
    onOpenRepository: (String) -> Unit,
    onDeleteRepository: (String) -> Unit,
    onBrowseDirectories: (SshHostProfile, String) -> List<RemoteDirectoryEntry> = { _, _ -> emptyList() },
    onInspectProject: (SshHostProfile, String) -> RemoteProjectInspection = { _, path ->
        RemoteProjectInspection(path, path, RemoteProjectKind.GitRepository, null, null)
    },
) {
    val directoryBrowseFailed = stringResource(R.string.repository_directory_browse_failed)
    val validationFailed = stringResource(R.string.repository_validation_failed)
    val authenticated = authenticatedHosts(hosts)
    var selectedHostId by remember(authenticated, initialHostId) {
        mutableStateOf(initialRepositoryHost(authenticated, initialHostId)?.id)
    }
    var menuExpanded by remember { mutableStateOf(false) }
    var alias by remember { mutableStateOf("") }
    var remotePath by remember(initialRemotePath) { mutableStateOf(initialRepositoryPath(initialRemotePath)) }
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
                onFailure = {
                    ResourceState.Error(it.message ?: directoryBrowseFailed, it)
                },
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
                error = it.message ?: validationFailed
            }
            saving = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.repository_add_project)) },
                navigationIcon = {
                    TextButton(onClick = onBack) {
                        Text(stringResource(R.string.common_back))
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
                Text(stringResource(R.string.repository_initialize_ssh_first))
                return@Column
            }

            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(HobgoblinSpacing.Md),
                    verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
                ) {
                    Text(stringResource(R.string.repository_project_source), style = MaterialTheme.typography.titleMedium)
                    Box {
                        OutlinedButton(onClick = { menuExpanded = true }) {
                            Text(selectedHost?.title ?: stringResource(R.string.repository_select_server))
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
                        label = { Text(stringResource(R.string.repository_alias)) },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = remotePath,
                        onValueChange = {
                            remotePath = it
                            clearDirectoryBrowser()
                        },
                        label = { Text(stringResource(R.string.repository_remote_path)) },
                        singleLine = true,
                        isError = error != null,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                        OutlinedButton(
                            enabled = selectedHost != null,
                            onClick = { browseDirectories() },
                        ) {
                            Text(stringResource(R.string.repository_browse))
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
                        Text(
                            stringResource(
                                if (saving) R.string.repository_validating else R.string.repository_save_project,
                            ),
                        )
                    }
                    if (error != null) Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
                }
            }

            Text(stringResource(R.string.repository_saved_projects), style = MaterialTheme.typography.titleMedium)
            if (repositories.isEmpty()) {
                Text(stringResource(R.string.repository_no_saved_projects))
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
        Text(stringResource(R.string.repository_remote_directories), style = MaterialTheme.typography.titleSmall)
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
                Text(stringResource(R.string.repository_up))
            }
            TextButton(onClick = { onSelect(currentPath) }) {
                Text(stringResource(R.string.common_select))
            }
        }
        when (state) {
            ResourceState.Idle -> Text(stringResource(R.string.repository_not_loaded), style = MaterialTheme.typography.bodySmall)
            ResourceState.Loading -> Text(
                stringResource(R.string.repository_loading_directories),
                style = MaterialTheme.typography.bodySmall,
            )
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
        Text(stringResource(R.string.repository_no_child_directories), style = MaterialTheme.typography.bodySmall)
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
            Text(stringResource(R.string.common_open))
        }
        TextButton(onClick = { onSelect(entry.path) }) {
            Text(stringResource(R.string.common_select))
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
                    Text(stringResource(R.string.common_open))
                }
                TextButton(onClick = onDeleteRepository) {
                    Text(stringResource(R.string.common_delete))
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
        throw UnsupportedOperationException()
    },
    onOpenExternalTermuxAtPath: (RemoteTarget) -> ExternalTermuxLaunchResult = {
        ExternalTermuxLaunchResult.Unavailable(copiedCommand = false)
    },
    onCopyExternalTermuxCommandAtPath: (RemoteTarget) -> Boolean = { false },
    onOpenTerminalSession: (TerminalSessionRecord) -> Unit = {},
    onReconnectTerminalSession: (TerminalSessionRecord) -> Unit = {},
    onCloseTerminalSession: (String) -> Unit = {},
    onDeleteTerminalSession: (String, Boolean) -> Unit = { _, _ -> },
    onDeleteRepository: () -> Unit,
    onCreateWorktree: (WorktreeCreationSource, String) -> Unit = { _, _ -> },
    onRemoveWorktree: (RemoteRepositoryWorktree) -> Unit = {},
    onMergeInto: (RemoteRepositoryWorktree, String) -> Unit = { _, _ -> },
    onMergeOut: (RemoteRepositoryWorktree, RemoteRepositoryWorktree) -> Unit = { _, _ -> },
    initialWorktreeOrder: List<String> = emptyList(),
    onSaveWorktreeOrder: (List<String>) -> Unit = {},
) {
    val resources = LocalResources.current
    val repositoryRootLabel = stringResource(R.string.repository_root)
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
    var mergeRequest by remember(repository.id) { mutableStateOf<WorktreeMergeRequest?>(null) }
    var mergePending by remember(repository.id) { mutableStateOf(false) }
    var mergeError by remember(repository.id) { mutableStateOf<String?>(null) }
    var terminalCloseTarget by remember(repository.id) { mutableStateOf<TerminalActionTarget?>(null) }
    var terminalDeleteTarget by remember(repository.id) { mutableStateOf<TerminalActionTarget?>(null) }
    var terminalClosePending by remember(repository.id) { mutableStateOf(false) }
    var closeTmuxSessionOnDelete by remember(repository.id) { mutableStateOf(false) }
    var terminalDeletePending by remember(repository.id) { mutableStateOf(false) }
    var tmuxDiscoveryPending by remember(repository.id) { mutableStateOf(false) }
    var actionError by remember(repository.id) { mutableStateOf<String?>(null) }
    var actionMessage by remember(repository.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val workspaceTabs = remember(repository.id, repository.remotePath, repository.kind) {
        repositoryWorkspaceTabs(repository)
    }
    val terminalWorkspaceOptions = remember(repository, snapshotState, repositoryRootLabel) {
        repositoryTerminalWorkspaceOptions(
            repository = repository,
            snapshotState = snapshotState,
            repositoryRootLabel = repositoryRootLabel,
        )
    }
    val tmuxScope = remember(repository, snapshotState) {
        repositoryTmuxScope(repository = repository, snapshotState = snapshotState)
    }

    fun loadedSnapshotState(snapshot: RemoteRepositorySnapshot): ResourceState.Loaded<RemoteRepositorySnapshot> {
        val loaded = ResourceState.Loaded(snapshot)
        repositoryTmuxScope(repository, loaded)
            ?.projectRoot
            ?.takeIf { it != TmuxSessionProtocol.normalizePath(repository.remotePath) }
            ?.let(onProjectRootResolved)
        return loaded
    }

    fun refreshSnapshot() {
        if (!shouldLoadRepositorySnapshot(repository)) return
        val previous = snapshotState
        snapshotState = ResourceState.Loading
        scope.launch {
            snapshotState = runCatching {
                withContext(Dispatchers.IO) { onLoadSnapshot() }
            }.fold(
                onSuccess = ::loadedSnapshotState,
                onFailure = {
                    repositorySnapshotStateAfterRefreshFailure(
                        previous = previous,
                        message = it.message ?: resources.getString(R.string.repository_snapshot_failed),
                        cause = it,
                    )
                },
            )
        }
    }

    suspend fun refreshMergeSnapshotAfterFailure(
        request: WorktreeMergeRequest,
        mergeFailureMessage: String,
    ) {
        val previous = snapshotState
        runCatching {
            withContext(Dispatchers.IO) { onLoadSnapshot() }
        }.fold(
            onSuccess = { snapshot ->
                snapshotState = loadedSnapshotState(snapshot)
                mergeRequest = reprojectWorktreeMergeRequest(request, snapshot)
                if (mergeRequest == null) {
                    actionError = mergeFailureMessage
                }
            },
            onFailure = {
                snapshotState = repositorySnapshotStateAfterRefreshFailure(
                    previous = previous,
                    message = it.message ?: resources.getString(R.string.repository_snapshot_failed),
                    cause = it,
                )
            },
        )
    }

    fun createWorktree(source: WorktreeCreationSource, worktreePath: String) {
        actionError = null
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { onCreateWorktree(source, worktreePath) }
            }.onSuccess {
                refreshSnapshot()
            }.onFailure {
                actionError = it.message ?: resources.getString(R.string.repository_worktree_create_failed)
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
                actionError = it.message ?: resources.getString(R.string.repository_worktree_remove_failed)
            }
        }
    }

    fun runWorktreeMerge(request: WorktreeMergeRequest, operation: () -> Unit) {
        if (mergePending) return
        actionError = null
        mergeError = null
        mergePending = true
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) { operation() }
            }
            result.onSuccess {
                mergeRequest = null
                refreshSnapshot()
            }.onFailure { failure ->
                val message = worktreeMergeFailureText(failure)?.let(resources::resolve)
                    ?: failure.message
                    ?: resources.getString(R.string.repository_worktree_merge_failed)
                mergeError = message
                refreshMergeSnapshotAfterFailure(request, message)
            }
            mergePending = false
        }
    }

    fun mergeIntoWorktree(destination: RemoteRepositoryWorktree, sourceBranch: String) {
        runWorktreeMerge(WorktreeMergeRequest.MergeInto(destination)) {
            onMergeInto(destination, sourceBranch)
        }
    }

    fun mergeOutOfWorktree(
        source: RemoteRepositoryWorktree,
        destination: RemoteRepositoryWorktree,
    ) {
        runWorktreeMerge(WorktreeMergeRequest.MergeOut(source)) {
            onMergeOut(source, destination)
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
                        resources.getString(R.string.repository_terminal_root_invalid)
                    }
                withContext(Dispatchers.IO) { onCreateTerminalAtPath(path, projectRoot, launchMode) }
            }.onSuccess { session ->
                onOpenTerminalSession(session)
            }.onFailure {
                actionError = it.message ?: resources.getString(R.string.repository_terminal_create_failed)
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
                val fallbackMessage = resources.getString(R.string.repository_termux_launch_failed)
                actionError = it.message ?: fallbackMessage
                onResult(
                    ExternalTermuxLaunchResult.Failed(
                        copiedCommand = false,
                        openedTermux = false,
                        message = it.message ?: fallbackMessage,
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
                if (!copied) actionError = resources.getString(R.string.repository_termux_copy_failed)
            }.onFailure {
                actionError = it.message ?: resources.getString(R.string.repository_termux_copy_failed)
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
                actionError = it.message ?: resources.getString(R.string.repository_terminal_delete_failed)
            }
            terminalDeletePending = false
        }
    }

    fun closeTerminalSession(session: TerminalSessionRecord) {
        if (terminalClosePending) return
        actionError = null
        terminalClosePending = true
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { onCloseTerminalSession(session.id) }
            }.onSuccess {
                terminalCloseTarget = null
            }.onFailure {
                actionError = it.message ?: resources.getString(R.string.repository_terminal_close_failed)
            }
            terminalClosePending = false
        }
    }

    fun requestCloseTerminalSession(session: TerminalSessionRecord, label: String) {
        terminalCloseTarget = TerminalActionTarget(session = session, label = label)
    }

    fun dismissTerminalClose() {
        if (terminalClosePending) return
        terminalCloseTarget = null
    }

    fun requestDeleteTerminalSession(session: TerminalSessionRecord, label: String) {
        closeTmuxSessionOnDelete = false
        terminalDeleteTarget = TerminalActionTarget(session = session, label = label)
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
                actionMessage = resources.resolve(tmuxScanResultText(foundCount = foundCount, sshUser = host.user))
            }.onFailure {
                actionError = it.message ?: resources.getString(R.string.repository_tmux_discovery_failed)
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
                        Text(stringResource(R.string.common_back))
                    }
                },
                actions = {
                    if (shouldLoadRepositorySnapshot(repository)) {
                        TextButton(onClick = { refreshSnapshot() }) {
                            Text(stringResource(R.string.common_refresh))
                        }
                    }
                    TextButton(onClick = { confirmDelete = true }) {
                        Text(stringResource(R.string.common_delete))
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
                    onRequestMergeInto = {
                        mergeError = null
                        mergeRequest = WorktreeMergeRequest.MergeInto(it)
                    },
                    onRequestMergeOut = {
                        mergeError = null
                        mergeRequest = WorktreeMergeRequest.MergeOut(it)
                    },
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
                    onReconnectTerminalSession = onReconnectTerminalSession,
                    onCloseTerminalSession = ::requestCloseTerminalSession,
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
            title = { Text(stringResource(R.string.repository_remove_worktree_title)) },
            text = {
                Text(stringResource(R.string.repository_remove_worktree_description, target.path))
            },
            confirmButton = {
                TextButton(onClick = { removeWorktree(target) }) {
                    Text(stringResource(R.string.common_remove))
                }
            },
            dismissButton = {
                TextButton(onClick = { removeTarget = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }

    val mergeSnapshot = when (val state = snapshotState) {
        is ResourceState.Loaded -> state.value
        is ResourceState.Stale -> state.value
        else -> null
    }
    mergeRequest?.let { request ->
        mergeSnapshot?.let { snapshot ->
            WorktreeMergeDialog(
                request = request,
                snapshot = snapshot,
                pending = mergePending,
                error = mergeError,
                onMergeInto = ::mergeIntoWorktree,
                onMergeOut = ::mergeOutOfWorktree,
                onDismiss = {
                    if (!mergePending) {
                        mergeRequest = null
                        mergeError = null
                    }
                },
            )
        }
    }

    terminalCloseTarget?.let { target ->
        AlertDialog(
            onDismissRequest = ::dismissTerminalClose,
            title = { Text(stringResource(R.string.repository_close_terminal_title)) },
            text = { Text(repositoryTerminalCloseConfirmationText(target.label, target.session).resolve()) },
            confirmButton = {
                TextButton(
                    onClick = { closeTerminalSession(target.session) },
                    enabled = !terminalClosePending,
                ) {
                    Text(stringResource(R.string.repository_close_terminal))
                }
            },
            dismissButton = {
                TextButton(onClick = ::dismissTerminalClose, enabled = !terminalClosePending) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
        )
    }

    terminalDeleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = ::dismissTerminalDelete,
            title = { Text(stringResource(R.string.repository_delete_terminal_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm)) {
                    Text(terminalDeleteConfirmationText(target.label, target.session).resolve())
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
                            Text(terminalTmuxCloseWarningText().resolve(), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { deleteTerminalSession(target.session) },
                    enabled = !terminalDeletePending,
                ) {
                    Text(
                        stringResource(
                            if (requiresTerminalDeleteConfirmation(target.session)) {
                                R.string.repository_stop_and_delete
                            } else {
                                R.string.common_delete
                            },
                        ),
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = ::dismissTerminalDelete, enabled = !terminalDeletePending) {
                    Text(stringResource(R.string.common_cancel))
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
                        text = { Text(repositoryWorkspaceTabText(tab).resolve()) },
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
                        Text(repositoryWorkspaceTabText(tab).resolve())
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
        title = { Text(stringResource(R.string.repository_delete_project_title)) },
        text = {
            Text(stringResource(R.string.repository_delete_project_description, repository.title))
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.common_delete))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.common_cancel))
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
    onRequestMergeInto: (RemoteRepositoryWorktree) -> Unit,
    onRequestMergeOut: (RemoteRepositoryWorktree) -> Unit,
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
                    Text(stringResource(R.string.repository_create_worktree), style = MaterialTheme.typography.titleMedium)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            modifier = Modifier.weight(1f),
                            value = branch,
                            onValueChange = { updateBranch(it) },
                            label = { Text(stringResource(R.string.repository_base_branch)) },
                            singleLine = true,
                        )
                        if (branchCandidates.isNotEmpty()) {
                            TextButton(onClick = { branchMenuExpanded = true }) {
                                Text(stringResource(R.string.repository_select_branch))
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
                                                    candidate.kindLabel.resolve(),
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
                        label = { Text(stringResource(R.string.repository_worktree_path)) },
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
                        Text(stringResource(R.string.repository_create_worktree))
                    }
                }
            }
            if (orderedWorktrees.isEmpty()) {
                Text(stringResource(R.string.repository_no_worktrees))
            } else {
                orderedWorktrees.forEach { worktree ->
                    WorktreeRow(
                        modifier = Modifier.manualReorderItem(reorderState, worktree.path),
                        repositoryPath = repository.remotePath,
                        worktree = worktree,
                        reorderState = reorderState,
                        canMergeInto = evaluateMergeDestination(worktree).allowed,
                        canMergeOut = evaluateMergeOutSource(worktree).allowed &&
                            mergeOutDestinationWorktrees(snapshot, worktree).isNotEmpty(),
                        onSelectTerminalWorkspace = onSelectTerminalWorkspace,
                        onRemoveWorktree = onRemoveWorktree,
                        onRequestMergeInto = onRequestMergeInto,
                        onRequestMergeOut = onRequestMergeOut,
                    )
                }
            }
        }
    }
}

@Composable
private fun WorktreeRow(
    modifier: Modifier,
    repositoryPath: String,
    worktree: RemoteRepositoryWorktree,
    reorderState: ManualReorderState,
    canMergeInto: Boolean,
    canMergeOut: Boolean,
    onSelectTerminalWorkspace: (String) -> Unit,
    onRemoveWorktree: (RemoteRepositoryWorktree) -> Unit,
    onRequestMergeInto: (RemoteRepositoryWorktree) -> Unit,
    onRequestMergeOut: (RemoteRepositoryWorktree) -> Unit,
) {
    val removalSafety = evaluateWorktreeRemoval(repositoryPath, worktree)
    var actionMenuExpanded by remember(worktree.path) { mutableStateOf(false) }
    val worktreeTitle = worktree.path
        .trim()
        .trimEnd('/')
        .substringAfterLast('/', missingDelimiterValue = worktree.path)
        .ifBlank { worktree.path }
    val badgeTexts = mutableListOf<String>()
    for (badge in worktreeBadges(worktree)) {
        badgeTexts += badge.resolve()
    }
    val workspaceSummary = run {
        val badges = badgeTexts.joinToString(" ")
        buildString {
            append(worktree.branch ?: stringResource(R.string.repository_detached))
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
                    worktreeRemovalBlockedText(removalSafety.blockReason)?.resolve().orEmpty(),
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
                    Text(stringResource(R.string.common_terminals), style = MaterialTheme.typography.labelMedium)
                }
                if (canMergeInto || canMergeOut || removalSafety.allowed) {
                    Box {
                        TextButton(
                            onClick = { actionMenuExpanded = true },
                            contentPadding = actionButtonPadding,
                        ) {
                            Text(stringResource(R.string.repository_worktree_actions), style = MaterialTheme.typography.labelMedium)
                        }
                        DropdownMenu(
                            expanded = actionMenuExpanded,
                            onDismissRequest = { actionMenuExpanded = false },
                        ) {
                            if (canMergeInto) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.repository_worktree_merge_in)) },
                                    onClick = {
                                        actionMenuExpanded = false
                                        onRequestMergeInto(worktree)
                                    },
                                )
                            }
                            if (canMergeOut) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.repository_worktree_merge_out)) },
                                    onClick = {
                                        actionMenuExpanded = false
                                        onRequestMergeOut(worktree)
                                    },
                                )
                            }
                            if (removalSafety.allowed) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.common_remove)) },
                                    onClick = {
                                        actionMenuExpanded = false
                                        onRemoveWorktree(worktree)
                                    },
                                )
                            }
                        }
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
    onReconnectTerminalSession: (TerminalSessionRecord) -> Unit,
    onCloseTerminalSession: (TerminalSessionRecord, String) -> Unit,
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
                onReconnectTerminalSession = onReconnectTerminalSession,
                onCloseTerminalSession = onCloseTerminalSession,
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
                Text(repositoryTerminalModeText(mode).resolve(), maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                    externalTermuxStatusText(status).resolve(),
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
                    Text(stringResource(R.string.repository_copy_command), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onOpenExternalTermuxAtPath(path) { result ->
                            onStatusChange(externalTermuxStatusAfterLaunch(result))
                        }
                    },
                ) {
                    Text(stringResource(R.string.repository_open_in_termux), maxLines = 1, overflow = TextOverflow.Ellipsis)
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
    onReconnectTerminalSession: (TerminalSessionRecord) -> Unit,
    onCloseTerminalSession: (TerminalSessionRecord, String) -> Unit,
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
                    terminalWorkspaceCountText(activeWorktreeCount).resolve(),
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
                        stringResource(R.string.repository_switch_workspace),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Button(
                    onClick = {
                        onCreateTerminalAtPath(selectedWorkspaceOption.path, nativeCreationAction.launchMode)
                    },
                ) {
                    Text(nativeCreationAction.label.resolve(), maxLines = 1)
                }
            }
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    onCreateTerminalAtPath(selectedWorkspaceOption.path, tmuxCreationAction.launchMode)
                },
            ) {
                Text(tmuxCreationAction.label.resolve(), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = onScanTmux,
                enabled = tmuxScanEnabled,
            ) {
                Text(
                    tmuxScanButtonText(tmuxScanPending).resolve(),
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
                                    stringResource(
                                        R.string.repository_workspace_with_count,
                                        option.path,
                                        terminalWorkspaceCountText(count).resolve(),
                                    ),
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
        Text(stringResource(R.string.repository_no_terminals_for_worktree))
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
                        onReconnectTerminalSession = onReconnectTerminalSession,
                        onCloseTerminalSession = onCloseTerminalSession,
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
                Text(stringResource(R.string.common_delete))
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
    onReconnectTerminalSession: (TerminalSessionRecord) -> Unit,
    onCloseTerminalSession: (TerminalSessionRecord, String) -> Unit,
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
                    terminalSessionStatusText(session).resolve(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                terminalSessionActivityText(session).resolve(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TerminalSessionIdentityDetails(session = session)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    enabled = terminalSessionReconnectAvailable(session),
                    onClick = { onReconnectTerminalSession(session) },
                ) {
                    Text(stringResource(R.string.repository_terminal_reconnect))
                }
                TextButton(onClick = { onCloseTerminalSession(session, label) }) {
                    Text(stringResource(R.string.repository_terminal_close))
                }
                TextButton(onClick = { onOpenTerminalSession(session) }) {
                    Text(stringResource(R.string.common_open))
                }
                TextButton(onClick = { onDeleteTerminalSession(session, label) }) {
                    Text(stringResource(R.string.common_delete))
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
        -> Text(stringResource(R.string.repository_loading_data))

        is ResourceState.Error -> Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(HobgoblinSpacing.Md),
                verticalArrangement = Arrangement.spacedBy(HobgoblinSpacing.Sm),
            ) {
                Text(
                    stringResource(R.string.terminal_status_failed),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelMedium,
                )
                Text(snapshotState.message)
                Button(onClick = onRefresh) {
                    Text(stringResource(R.string.common_retry))
                }
            }
        }

        is ResourceState.Stale -> {
            Text(
                stringResource(R.string.repository_stale, snapshotState.reason),
                color = MaterialTheme.colorScheme.error,
            )
            content(snapshotState.value)
        }
        is ResourceState.Loaded -> content(snapshotState.value)
    }
}

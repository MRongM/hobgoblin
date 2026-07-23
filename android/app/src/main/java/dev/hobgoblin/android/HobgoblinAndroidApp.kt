package dev.hobgoblin.android

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import dev.hobgoblin.android.data.HostProfileStore
import dev.hobgoblin.android.data.RemoteRepositoryStore
import dev.hobgoblin.android.data.TerminalSettingsStore
import dev.hobgoblin.android.data.ssh.SecureIdentityStore
import dev.hobgoblin.android.domain.ResourceState
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.domain.ssh.withDiagnosticResult
import dev.hobgoblin.android.navigation.AppRoute
import dev.hobgoblin.android.navigation.terminalReturnRoute
import dev.hobgoblin.android.ssh.HostPortForwardManager
import dev.hobgoblin.android.ssh.HostPortForwardStatus
import dev.hobgoblin.android.ssh.RemoteBranchService
import dev.hobgoblin.android.ssh.RemoteRepositoryGitService
import dev.hobgoblin.android.ssh.RemoteWorktreeService
import dev.hobgoblin.android.ssh.SshDiagnosticsService
import dev.hobgoblin.android.ssh.SshInitializationService
import dev.hobgoblin.android.navigation.AppRoute.Companion.terminal
import dev.hobgoblin.android.terminals.TerminalForegroundBridge
import dev.hobgoblin.android.terminals.DiscoveredTmuxSession
import dev.hobgoblin.android.terminals.RemoteTmuxCloseResult
import dev.hobgoblin.android.terminals.RemoteTmuxDiscoveryResult
import dev.hobgoblin.android.terminals.RemoteTmuxSessionService
import dev.hobgoblin.android.terminals.TerminalNavigationRequest
import dev.hobgoblin.android.terminals.TerminalSessionManager
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TmuxTerminalRecoveryCandidate
import dev.hobgoblin.android.termux.ExternalTermuxLauncher
import dev.hobgoblin.android.termux.externalTermuxLaunchRequest
import dev.hobgoblin.android.ui.screens.addhost.AddHostScreen
import dev.hobgoblin.android.ui.screens.diagnostics.DiagnosticsScreen
import dev.hobgoblin.android.ui.navigation.MainTab
import dev.hobgoblin.android.ui.navigation.MainTabShell
import dev.hobgoblin.android.ui.screens.hosts.HostsScreen
import dev.hobgoblin.android.ui.screens.hosts.hostTemporaryTerminalRoute
import dev.hobgoblin.android.ui.screens.hosts.isHostTemporaryTerminal
import dev.hobgoblin.android.ui.screens.portforwards.HostPortsScreen
import dev.hobgoblin.android.ui.screens.projects.ProjectsScreen
import dev.hobgoblin.android.ui.screens.settings.SettingsScreen
import dev.hobgoblin.android.ui.screens.repositories.RepositorySetupScreen
import dev.hobgoblin.android.ui.screens.repositories.RepositoryWorkspaceScreen
import dev.hobgoblin.android.ui.screens.terminals.TerminalBackClosesSessionHint
import dev.hobgoblin.android.ui.screens.terminals.TerminalBackKeepsSessionHint
import dev.hobgoblin.android.ui.screens.terminals.TerminalScreen
import dev.hobgoblin.android.ui.screens.terminals.TerminalsScreen
import dev.hobgoblin.android.ui.screens.terminals.terminalTargetLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal fun tmuxRecoveryCandidates(
    host: SshHostProfile,
    repository: RemoteRepositoryProfile,
    discoveries: List<DiscoveredTmuxSession>,
): List<TmuxTerminalRecoveryCandidate> = discoveries.map { discovery ->
    val remotePath = discovery.identity.initialPath
    TmuxTerminalRecoveryCandidate(
        target = RemoteTarget.fromHostProfile(host, remotePath),
        repositoryId = repository.id,
        repositoryRemotePath = repository.remotePath,
        targetLabel = terminalTargetLabel(repository.title, remotePath),
        discovery = discovery,
    )
}

@Composable
fun HobgoblinAndroidApp(
    hostProfileStore: HostProfileStore,
    remoteRepositoryStore: RemoteRepositoryStore,
    secureIdentityStore: SecureIdentityStore,
    diagnosticsService: SshDiagnosticsService,
    remoteRepositoryGitService: RemoteRepositoryGitService,
    remoteBranchService: RemoteBranchService,
    remoteWorktreeService: RemoteWorktreeService,
    initializationService: SshInitializationService,
    terminalSettingsStore: TerminalSettingsStore,
    terminalSessionManager: TerminalSessionManager,
    remoteTmuxSessionService: RemoteTmuxSessionService,
    terminalForegroundBridge: TerminalForegroundBridge,
    externalTermuxLauncher: ExternalTermuxLauncher,
    hostPortForwardManager: HostPortForwardManager,
    terminalNavigationRequest: TerminalNavigationRequest? = null,
) {
    val initialRepositories = remember {
        remoteRepositoryStore.loadRepositories()
    }

    var route: AppRoute by remember(initialRepositories) {
        mutableStateOf(if (initialRepositories.isNotEmpty()) AppRoute.Projects else AppRoute.Hosts)
    }

    LaunchedEffect(terminalNavigationRequest?.sequence) {
        val request = terminalNavigationRequest ?: return@LaunchedEffect
        val record = terminalSessionManager.session(request.sessionId) ?: return@LaunchedEffect
        route = terminal(record)
    }
    var hostsState: ResourceState<List<SshHostProfile>> by remember {
        mutableStateOf(ResourceState.Loaded(hostProfileStore.loadHosts()))
    }
    var repositoriesState: ResourceState<List<RemoteRepositoryProfile>> by remember {
        mutableStateOf(ResourceState.Loaded(initialRepositories))
    }
    var terminalSessions: List<TerminalSessionRecord> by remember {
        mutableStateOf(terminalSessionManager.sessions())
    }
    var terminalFitToScreen by remember {
        mutableStateOf(terminalSettingsStore.loadTerminalFitToScreen())
    }
    var portForwardStatuses: Map<String, HostPortForwardStatus> by remember {
        mutableStateOf(hostPortForwardManager.statuses())
    }
    val scope = rememberCoroutineScope()

    DisposableEffect(terminalSessionManager) {
        val observer = terminalSessionManager.observeSessions { sessions ->
            scope.launch {
                terminalSessions = sessions
            }
        }
        onDispose {
            observer.close()
        }
    }

    DisposableEffect(hostPortForwardManager) {
        val observer = hostPortForwardManager.observeStatuses { statuses ->
            scope.launch {
                portForwardStatuses = statuses
            }
        }
        onDispose {
            observer.close()
        }
    }

    fun reloadHosts() {
        hostsState = ResourceState.Loaded(hostProfileStore.loadHosts())
    }

    fun reloadRepositories() {
        repositoriesState = ResourceState.Loaded(remoteRepositoryStore.loadRepositories())
    }

    fun currentHosts(): List<SshHostProfile> = when (val state = hostsState) {
        is ResourceState.Loaded -> state.value
        is ResourceState.Stale -> state.value
        else -> hostProfileStore.loadHosts()
    }

    fun currentRepositories(): List<RemoteRepositoryProfile> = when (val state = repositoriesState) {
        is ResourceState.Loaded -> state.value
        is ResourceState.Stale -> state.value
        else -> remoteRepositoryStore.loadRepositories()
    }

    fun stopRepositoryRuntimeResources(repositoryId: String) {
        terminalSessionManager.removeRepositorySessions(repositoryId)
        terminalForegroundBridge.sync()
    }

    fun resolveHostForTerminalRoute(routeHostId: String): SshHostProfile? {
        val normalizedRouteHostId = routeHostId.trim().ifBlank { return null }
        val direct = currentHosts().firstOrNull { it.id == normalizedRouteHostId }
        if (direct != null) return direct

        val targetHostId = normalizedRouteHostId.substringBefore("/")
        return currentHosts().firstOrNull { "${it.user}@${it.host}:${it.port}" == targetHostId }
    }

    fun deleteRepositoryRecord(repositoryId: String) {
        stopRepositoryRuntimeResources(repositoryId)
        remoteRepositoryStore.deleteRepository(repositoryId)
        reloadRepositories()
    }

    fun selectMainTab(tab: MainTab) {
        route = when (tab) {
            MainTab.Hosts -> AppRoute.Hosts
            MainTab.Projects -> AppRoute.Projects
            MainTab.Terminals -> AppRoute.Terminals
        }
    }

    fun mainTabForRoute(currentRoute: AppRoute): MainTab? = when (currentRoute) {
        AppRoute.Hosts -> MainTab.Hosts
        AppRoute.Projects -> MainTab.Projects
        AppRoute.Terminals -> MainTab.Terminals
        else -> null
    }

    fun openHostTemporaryTerminal(hostId: String) {
        if (currentHosts().none { it.id == hostId }) return
        route = hostTemporaryTerminalRoute(hostId)
    }

    fun closeHostTemporaryTerminal(sessionId: String?) {
        sessionId?.let { terminalSessionManager.removeSession(it) }
        terminalForegroundBridge.sync()
    }

    when (val currentRoute = route) {
        AppRoute.Hosts,
        AppRoute.Projects,
        AppRoute.Terminals,
        -> {
            val selectedTab = mainTabForRoute(currentRoute) ?: MainTab.Hosts
            MainTabShell(
                selectedTab = selectedTab,
                onSelectTab = ::selectMainTab,
                onOpenSettings = { route = AppRoute.Settings },
                onAddHost = { route = AppRoute.AddHost },
                onAddProject = { route = AppRoute.AddRepository },
                repositoriesState = repositoriesState,
                hostsContent = {
                    HostsScreen(
                        hostsState = hostsState,
                        onEditHost = { hostId -> route = AppRoute.EditHost(hostId) },
                        onDeleteHost = { hostId ->
                            currentRepositories()
                                .filter { it.hostProfileId == hostId }
                                .forEach { stopRepositoryRuntimeResources(it.id) }
                            hostPortForwardManager.stopForHost(hostId)
                            hostProfileStore.deleteHost(hostId)
                            remoteRepositoryStore.deleteByHostId(hostId)
                            reloadHosts()
                            reloadRepositories()
                        },
                        onOpenDiagnostics = { hostId -> route = AppRoute.Diagnostics(hostId) },
                        onOpenTerminal = ::openHostTemporaryTerminal,
                        onOpenPorts = { hostId -> route = AppRoute.HostPorts(hostId) },
                    )
                },
                projectsContent = {
                    ProjectsScreen(
                        repositoriesState = repositoriesState,
                        hosts = currentHosts(),
                        onOpenProject = { repositoryId -> route = AppRoute.Repository(repositoryId) },
                        onOpenProjectTerminals = { repositoryId, terminalWorkspacePath ->
                            route = AppRoute.Repository(
                                repositoryId = repositoryId,
                                terminalWorkspacePath = terminalWorkspacePath,
                            )
                        },
                        onDeleteProject = { repositoryId ->
                            deleteRepositoryRecord(repositoryId)
                        },
                    )
                },
                terminalsContent = {
                    TerminalsScreen(
                        sessions = terminalSessions,
                        onOpenTerminalSession = { session ->
                            val current = terminalSessionManager.session(session.id)
                            if (current != null) {
                                terminalSessionManager.touchSession(current.id)
                                route = AppRoute.terminal(current, returnToTerminals = true)
                            }
                        },
                    )
                },
            )
        }

        AppRoute.AddHost -> AddHostScreen(
            initialHost = null,
            onBack = { route = AppRoute.Hosts },
            onImportPrivateKey = { displayName, bytes -> secureIdentityStore.importPrivateKey(displayName, bytes) },
            onCheckSshInitialization = { input -> initializationService.check(input) },
            onTrustHostKey = { input, fingerprint -> initializationService.trustHostKey(input, fingerprint) },
            onInitializeSshAccess = { input, password ->
                val result = initializationService.initialize(input, password)
                result.profile
            },
            onRunDiagnostics = { input ->
                diagnosticsService.runDiagnostics(RemoteTarget.fromHostProfile(input))
            },
            onSaveHost = { input ->
                hostProfileStore.saveHost(input)
                reloadHosts()
                route = AppRoute.Hosts
            },
        )

        is AppRoute.EditHost -> {
            val host = currentHosts().firstOrNull { it.id == currentRoute.hostId }
            if (host == null) {
                route = AppRoute.Hosts
            } else {
                AddHostScreen(
                    initialHost = host,
                    onBack = { route = AppRoute.Hosts },
                    onImportPrivateKey = { displayName, bytes -> secureIdentityStore.importPrivateKey(displayName, bytes) },
                    onCheckSshInitialization = { input -> initializationService.check(input) },
                    onTrustHostKey = { input, fingerprint -> initializationService.trustHostKey(input, fingerprint) },
                    onInitializeSshAccess = { input, password ->
                        val result = initializationService.initialize(input, password)
                        result.profile
                    },
                    onRunDiagnostics = { input ->
                        diagnosticsService.runDiagnostics(RemoteTarget.fromHostProfile(input))
                    },
                    onSaveHost = { input ->
                        hostProfileStore.saveHost(input)
                        reloadHosts()
                        route = AppRoute.Hosts
                    },
                )
            }
        }

        is AppRoute.HostPorts -> {
            val host = currentHosts().firstOrNull { it.id == currentRoute.hostId }
            if (host == null) {
                route = AppRoute.Hosts
            } else {
                HostPortsScreen(
                    host = host,
                    statuses = portForwardStatuses,
                    onBack = { route = AppRoute.Hosts },
                    onSaveHost = { updated ->
                        hostProfileStore.saveHost(updated)
                        reloadHosts()
                    },
                    onStart = { rule ->
                        scope.launch {
                            withContext(Dispatchers.IO) {
                                hostPortForwardManager.start(host, rule)
                            }
                        }
                    },
                    onStop = { rule ->
                        hostPortForwardManager.stop(rule.id)
                    },
                )
            }
        }

        is AppRoute.Diagnostics -> {
            val host = currentHosts().firstOrNull { it.id == currentRoute.hostId }
            if (host == null) {
                route = AppRoute.Hosts
            } else {
                fun routeHost(): SshHostProfile =
                    currentHosts().firstOrNull { it.id == currentRoute.hostId } ?: host

                DiagnosticsScreen(
                    host = host,
                    onBack = { route = AppRoute.Hosts },
                    onOpenTerminal = { route = AppRoute.Terminal(currentRoute.hostId) },
                    onRunDiagnostics = {
                        val currentHost = routeHost()
                        val result = diagnosticsService.runDiagnostics(RemoteTarget.fromHostProfile(currentHost))
                        hostProfileStore.saveHost(currentHost.withDiagnosticResult(result))
                        reloadHosts()
                        result
                    },
                    onTrustHostKey = { fingerprint ->
                        initializationService.trustHostKey(routeHost(), fingerprint)
                    },
                )
            }
        }

        AppRoute.AddRepository -> RepositorySetupScreen(
            hosts = currentHosts(),
            repositories = currentRepositories(),
            onBack = { route = AppRoute.Projects },
            onSaveRepository = { repository ->
                remoteRepositoryStore.saveRepository(repository)
                reloadRepositories()
            },
            onDeleteRepository = { repositoryId ->
                deleteRepositoryRecord(repositoryId)
            },
            onOpenRepository = { repositoryId -> route = AppRoute.Repository(repositoryId) },
            onBrowseDirectories = { host, remotePath ->
                remoteRepositoryGitService.browseDirectories(RemoteTarget.fromHostProfile(host, remotePath))
            },
            onInspectProject = { host, remotePath ->
                remoteRepositoryGitService.inspectProject(RemoteTarget.fromHostProfile(host, remotePath))
            },
        )

        is AppRoute.Repository -> {
            val repository = currentRepositories().firstOrNull { it.id == currentRoute.repositoryId }
            val host = repository?.let { repo -> currentHosts().firstOrNull { it.id == repo.hostProfileId } }
            if (repository == null || host == null) {
                route = AppRoute.Projects
            } else {
                RepositoryWorkspaceScreen(
                    host = host,
                    repository = repository,
                    onBack = { route = AppRoute.Projects },
                    onLoadSnapshot = {
                        remoteRepositoryGitService.loadSnapshot(
                            RemoteTarget.fromHostProfile(host, repository.remotePath),
                        )
                    },
                    initialTerminalWorkspacePath = currentRoute.terminalWorkspacePath,
                    terminalSessions = terminalSessions,
                    onDiscoverTmuxTerminals = { allowedPaths ->
                        when (
                            val result = remoteTmuxSessionService.discoverAssociatedSessions(
                                target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                                projectRoot = repository.remotePath,
                                allowedInitialPaths = allowedPaths.toSet(),
                            )
                        ) {
                            is RemoteTmuxDiscoveryResult.Found -> {
                                terminalSessionManager.recoverTmuxSessions(
                                    tmuxRecoveryCandidates(
                                        host = host,
                                        repository = repository,
                                        discoveries = result.sessions,
                                    ),
                                )
                            }
                            is RemoteTmuxDiscoveryResult.Failed -> error(result.message)
                        }
                    },
                    onCreateTerminalAtPath = { remotePath, launchMode ->
                        val session = terminalSessionManager.createNew(
                            target = RemoteTarget.fromHostProfile(host, remotePath),
                            repositoryId = repository.id,
                            repositoryRemotePath = repository.remotePath,
                            targetLabel = terminalTargetLabel(repository.title, remotePath),
                            launchMode = launchMode,
                        )
                        terminalForegroundBridge.sync()
                        session
                    },
                    onOpenExternalTermuxAtPath = { target ->
                        val request = externalTermuxLaunchRequest(target) { identityId ->
                            secureIdentityStore.loadProtectedBytesById(identityId)
                        }
                        try {
                            externalTermuxLauncher.openInTermux(request)
                        } finally {
                            request.privateKeyBytes?.fill(0)
                        }
                    },
                    onCopyExternalTermuxCommandAtPath = { target ->
                        externalTermuxLauncher.copyCommand(target)
                    },
                    onOpenTerminalSession = { session ->
                        terminalSessionManager.touchSession(session.id)
                        val target = RemoteTarget.fromHostProfile(host, session.remotePath)
                        route = AppRoute.Terminal(
                            hostId = target.id,
                            remotePath = session.remotePath,
                            repositoryId = repository.id,
                            terminalSessionId = session.id,
                        )
                    },
                    onDeleteTerminalSession = { sessionId, closeTmuxSession ->
                        val session = terminalSessionManager.session(sessionId)
                        if (closeTmuxSession) {
                            val identity = requireNotNull(session?.tmuxIdentity) {
                                "This terminal has no current Hobgoblin tmux identity."
                            }
                            when (
                                val result = remoteTmuxSessionService.closeAssociatedSession(
                                    target = RemoteTarget.fromHostProfile(host, session.remotePath),
                                    identity = identity,
                                )
                            ) {
                                RemoteTmuxCloseResult.Closed,
                                RemoteTmuxCloseResult.Missing,
                                -> Unit
                                is RemoteTmuxCloseResult.Failed -> error(result.message)
                            }
                        }
                        terminalSessionManager.removeSession(sessionId)
                        terminalForegroundBridge.sync()
                    },
                    onDeleteRepository = {
                        deleteRepositoryRecord(repository.id)
                        route = AppRoute.Projects
                    },
                    onCreateBranch = { baseBranch, newBranch ->
                        remoteBranchService.createAndCheckoutBranch(
                            target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                            baseBranch = baseBranch,
                            newBranch = newBranch,
                        )
                    },
                    onCheckoutBranch = { branch ->
                        remoteBranchService.checkoutBranch(
                            target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                            branch = branch.name,
                        )
                    },
                    onDeleteBranch = { branch ->
                        remoteBranchService.deleteBranch(
                            target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                            branch = branch.name,
                        )
                    },
                    onCreateWorktree = { branch, worktreePath ->
                        remoteWorktreeService.createWorktree(
                            target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                            branch = branch,
                            worktreePath = worktreePath,
                        )
                    },
                    onRemoveWorktree = { worktree ->
                        remoteWorktreeService.removeWorktree(
                            target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                            worktree = worktree,
                        )
                        terminalSessionManager.removeWorkspaceSessions(repository.id, worktree.path)
                        terminalForegroundBridge.sync()
                    },
                )
            }
        }

        is AppRoute.Terminal -> {
            val host = resolveHostForTerminalRoute(currentRoute.hostId)
            if (host == null) {
                route = AppRoute.Hosts
            } else {
                val repository = currentRoute.repositoryId?.let { repositoryId ->
                    currentRepositories().firstOrNull { it.id == repositoryId }
                }
                TerminalScreen(
                    host = host,
                    remotePath = currentRoute.remotePath,
                    repositoryId = currentRoute.repositoryId,
                    repositoryRemotePath = repository?.remotePath,
                    targetLabel = terminalTargetLabel(repository?.title ?: host.title, currentRoute.remotePath),
                    terminalSessionId = currentRoute.terminalSessionId,
                    fitToScreen = terminalFitToScreen,
                    onFitToScreenChange = { fitToScreen ->
                        terminalFitToScreen = fitToScreen
                        terminalSettingsStore.setTerminalFitToScreen(fitToScreen)
                    },
                    onSwitchGlobalTerminal = { session ->
                        terminalSessionManager.touchSession(session.id)
                        route = AppRoute.terminal(
                            session,
                            returnToTerminals = currentRoute.returnToTerminals,
                        )
                    },
                    backHint = if (isHostTemporaryTerminal(currentRoute.remotePath, currentRoute.repositoryId)) {
                        TerminalBackClosesSessionHint
                    } else {
                        TerminalBackKeepsSessionHint
                    },
                    terminalSessionManager = terminalSessionManager,
                    terminalForegroundBridge = terminalForegroundBridge,
                    onBack = { activeSessionId ->
                        val temporary = isHostTemporaryTerminal(currentRoute.remotePath, currentRoute.repositoryId)
                        if (temporary) {
                            closeHostTemporaryTerminal(activeSessionId ?: currentRoute.terminalSessionId)
                        }
                        route = terminalReturnRoute(
                            route = currentRoute,
                            resolvedHostId = host.id,
                            temporary = temporary,
                        )
                    },
                )
            }
        }

        AppRoute.Settings -> SettingsScreen(
            initialKeepAliveIntervalSeconds = terminalSettingsStore.loadKeepAliveIntervalSeconds(),
            initialHeartbeatFailureThreshold = terminalSettingsStore.loadHeartbeatFailureThreshold(),
            onBack = { route = AppRoute.Hosts },
            onSave = { keepAliveIntervalSeconds, heartbeatFailureThreshold ->
                terminalSettingsStore.setKeepAliveIntervalSeconds(keepAliveIntervalSeconds)
                terminalSettingsStore.setHeartbeatFailureThreshold(heartbeatFailureThreshold)
                route = AppRoute.Hosts
            },
        )
    }
}

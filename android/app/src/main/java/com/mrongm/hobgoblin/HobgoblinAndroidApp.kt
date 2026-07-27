package com.mrongm.hobgoblin

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.mrongm.hobgoblin.data.HostProfileStore
import com.mrongm.hobgoblin.data.ManualItemOrderScope
import com.mrongm.hobgoblin.data.ManualItemOrderStore
import com.mrongm.hobgoblin.data.RemoteRepositoryStore
import com.mrongm.hobgoblin.data.TerminalSettingsStore
import com.mrongm.hobgoblin.data.TerminalAppearance
import com.mrongm.hobgoblin.data.ssh.SecureIdentityStore
import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.navigation.AppRoute
import com.mrongm.hobgoblin.navigation.initialMainRoute
import com.mrongm.hobgoblin.navigation.terminalBackgroundRoute
import com.mrongm.hobgoblin.navigation.terminalReturnRoute
import com.mrongm.hobgoblin.ssh.HostPortForwardManager
import com.mrongm.hobgoblin.ssh.HostPortForwardStatus
import com.mrongm.hobgoblin.ssh.RemoteRepositoryGitService
import com.mrongm.hobgoblin.ssh.RemoteWorktreeService
import com.mrongm.hobgoblin.ssh.SshDiagnosticsService
import com.mrongm.hobgoblin.ssh.SshInitializationService
import com.mrongm.hobgoblin.navigation.AppRoute.Companion.terminal
import com.mrongm.hobgoblin.terminals.TerminalForegroundBridge
import com.mrongm.hobgoblin.terminals.DiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.RemoteTmuxCloseResult
import com.mrongm.hobgoblin.terminals.RemoteTmuxDiscoveryResult
import com.mrongm.hobgoblin.terminals.RemoteTmuxSessionService
import com.mrongm.hobgoblin.terminals.TerminalNavigationRequest
import com.mrongm.hobgoblin.terminals.TerminalSessionManager
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TmuxTerminalRecoveryCandidate
import com.mrongm.hobgoblin.termux.ExternalTermuxLauncher
import com.mrongm.hobgoblin.termux.externalTermuxLaunchRequest
import com.mrongm.hobgoblin.ui.screens.addhost.AddHostScreen
import com.mrongm.hobgoblin.ui.navigation.MainTab
import com.mrongm.hobgoblin.ui.navigation.MainTabShell
import com.mrongm.hobgoblin.ui.screens.hosts.HostsScreen
import com.mrongm.hobgoblin.ui.screens.hosts.hostTemporaryTerminalRoute
import com.mrongm.hobgoblin.ui.screens.hosts.isHostTemporaryTerminal
import com.mrongm.hobgoblin.ui.screens.portforwards.HostPortsScreen
import com.mrongm.hobgoblin.ui.screens.projects.ProjectsScreen
import com.mrongm.hobgoblin.ui.screens.settings.SettingsScreen
import com.mrongm.hobgoblin.ui.screens.repositories.RepositorySetupScreen
import com.mrongm.hobgoblin.ui.screens.repositories.RepositoryWorkspaceScreen
import com.mrongm.hobgoblin.ui.screens.terminals.TerminalScreen
import com.mrongm.hobgoblin.ui.screens.terminals.TerminalsScreen
import com.mrongm.hobgoblin.ui.screens.terminals.terminalSessionReconnectAvailable
import com.mrongm.hobgoblin.ui.screens.terminals.terminalTargetLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal fun tmuxRecoveryCandidates(
    host: SshHostProfile,
    repository: RemoteRepositoryProfile,
    discoveries: List<DiscoveredTmuxSession>,
    projectRoot: String = repository.remotePath,
): List<TmuxTerminalRecoveryCandidate> = discoveries.map { discovery ->
    val remotePath = discovery.identity.initialPath
    TmuxTerminalRecoveryCandidate(
        target = RemoteTarget.fromHostProfile(host, remotePath),
        repositoryId = repository.id,
        repositoryRemotePath = projectRoot,
        targetLabel = terminalTargetLabel(repository.title, remotePath),
        discovery = discovery,
    )
}

@Composable
fun HobgoblinAndroidApp(
    hostProfileStore: HostProfileStore,
    manualItemOrderStore: ManualItemOrderStore,
    remoteRepositoryStore: RemoteRepositoryStore,
    secureIdentityStore: SecureIdentityStore,
    diagnosticsService: SshDiagnosticsService,
    remoteRepositoryGitService: RemoteRepositoryGitService,
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
    val missingTmuxIdentity = stringResource(R.string.terminal_tmux_identity_missing)
    val missingTmuxProjectRoot = stringResource(R.string.terminal_tmux_project_root_missing)
    val initialRepositories = remember {
        remoteRepositoryStore.loadRepositories()
    }

    var route: AppRoute by remember {
        mutableStateOf(initialMainRoute())
    }
    var projectHostFilterId: String? by remember { mutableStateOf(null) }

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
    var terminalAppearance: TerminalAppearance by remember {
        mutableStateOf(terminalSettingsStore.loadTerminalAppearance())
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
        if (tab == MainTab.Projects) {
            projectHostFilterId = null
        }
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

    fun reconnectRetainedTerminal(session: TerminalSessionRecord) {
        val current = terminalSessionManager.session(session.id) ?: return
        if (!terminalSessionReconnectAvailable(current)) return
        val host = resolveHostForTerminalRoute(current.hostId) ?: return
        scope.launch {
            withContext(Dispatchers.IO) {
                val retained = terminalSessionManager.session(current.id) ?: return@withContext
                terminalSessionManager.reconnect(
                    sessionId = retained.id,
                    target = RemoteTarget.fromHostProfile(host, retained.remotePath),
                    repositoryId = retained.repositoryId,
                    repositoryRemotePath = retained.repositoryRemotePath,
                    targetLabel = retained.targetLabel,
                )
            }
            terminalForegroundBridge.sync()
        }
    }

    fun closeRetainedTerminal(sessionId: String) {
        terminalSessionManager.close(sessionId)
        terminalForegroundBridge.sync()
    }

    fun deleteRetainedTerminal(sessionId: String) {
        terminalSessionManager.removeSession(sessionId)
        terminalForegroundBridge.sync()
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
                        onOpenProjects = { hostId ->
                            projectHostFilterId = hostId
                            route = AppRoute.Projects
                        },
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
                        onOpenTerminal = ::openHostTemporaryTerminal,
                        onOpenPorts = { hostId -> route = AppRoute.HostPorts(hostId) },
                        initialManualOrder = manualItemOrderStore.load(ManualItemOrderScope.Hosts),
                        onSaveManualOrder = { ids ->
                            manualItemOrderStore.save(ManualItemOrderScope.Hosts, ids)
                        },
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
                        hostFilterId = projectHostFilterId,
                        onClearHostFilter = { projectHostFilterId = null },
                        initialManualOrder = manualItemOrderStore.load(ManualItemOrderScope.Projects),
                        onSaveManualOrder = { ids ->
                            manualItemOrderStore.save(ManualItemOrderScope.Projects, ids)
                        },
                    )
                },
                terminalsContent = {
                    TerminalsScreen(
                        sessions = terminalSessions,
                        hosts = currentHosts(),
                        repositories = currentRepositories(),
                        onOpenTerminalSession = { session ->
                            val current = terminalSessionManager.session(session.id)
                            if (current != null) {
                                terminalSessionManager.touchSession(current.id)
                                route = AppRoute.terminal(current, returnToTerminals = true)
                            }
                        },
                        onReconnectTerminalSession = ::reconnectRetainedTerminal,
                        onCloseTerminalSession = ::closeRetainedTerminal,
                        onDeleteTerminalSession = ::deleteRetainedTerminal,
                        initialManualOrder = manualItemOrderStore.load(ManualItemOrderScope.Terminals),
                        onSaveManualOrder = { ids ->
                            manualItemOrderStore.save(ManualItemOrderScope.Terminals, ids)
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
            onTrustHostKey = { input, fingerprint ->
                initializationService.trustHostKey(input, fingerprint)
            },
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
                    onTrustHostKey = { input, fingerprint ->
                        initializationService.trustHostKey(input, fingerprint)
                    },
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
                    onProjectRootResolved = { projectRoot ->
                        remoteRepositoryStore.saveRepository(repository.copy(remotePath = projectRoot))
                        reloadRepositories()
                    },
                    onDiscoverTmuxTerminals = { tmuxScope ->
                        when (
                            val result = remoteTmuxSessionService.discoverAssociatedSessions(
                                target = RemoteTarget.fromHostProfile(host, tmuxScope.projectRoot),
                                projectRoot = tmuxScope.projectRoot,
                                allowedInitialPaths = tmuxScope.allowedInitialPaths.toSet(),
                            )
                        ) {
                            is RemoteTmuxDiscoveryResult.Found -> {
                                terminalSessionManager.recoverTmuxSessions(
                                    tmuxRecoveryCandidates(
                                        host = host,
                                        repository = repository,
                                        discoveries = result.sessions,
                                        projectRoot = tmuxScope.projectRoot,
                                    ),
                                )
                                result.sessions.size
                            }
                            is RemoteTmuxDiscoveryResult.Failed -> error(result.message)
                        }
                    },
                    onCreateTerminalAtPath = { remotePath, projectRoot, launchMode ->
                        val session = terminalSessionManager.createNew(
                            target = RemoteTarget.fromHostProfile(host, remotePath),
                            repositoryId = repository.id,
                            repositoryRemotePath = projectRoot,
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
                    onReconnectTerminalSession = ::reconnectRetainedTerminal,
                    onCloseTerminalSession = ::closeRetainedTerminal,
                    onDeleteTerminalSession = { sessionId, closeTmuxSession ->
                        val session = terminalSessionManager.session(sessionId)
                        if (closeTmuxSession) {
                            val identity = requireNotNull(session?.tmuxIdentity) {
                                missingTmuxIdentity
                            }
                            when (
                                val result = remoteTmuxSessionService.closeAssociatedSession(
                                    target = RemoteTarget.fromHostProfile(host, session.remotePath),
                                    identity = identity,
                                    projectRoot = requireNotNull(session.repositoryRemotePath) {
                                        missingTmuxProjectRoot
                                    },
                                )
                            ) {
                                RemoteTmuxCloseResult.Closed,
                                RemoteTmuxCloseResult.Missing,
                                -> Unit
                                is RemoteTmuxCloseResult.Failed -> error(result.message)
                            }
                        }
                        deleteRetainedTerminal(sessionId)
                    },
                    onDeleteRepository = {
                        deleteRepositoryRecord(repository.id)
                        route = AppRoute.Projects
                    },
                    onCreateWorktree = { source, worktreePath ->
                        remoteWorktreeService.createWorktree(
                            target = RemoteTarget.fromHostProfile(host, repository.remotePath),
                            source = source,
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
                    initialWorktreeOrder = manualItemOrderStore.load(
                        ManualItemOrderScope.Worktrees(repository.id),
                    ),
                    onSaveWorktreeOrder = { ids ->
                        manualItemOrderStore.save(ManualItemOrderScope.Worktrees(repository.id), ids)
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
                val retainedProjectRoot = currentRoute.terminalSessionId
                    ?.let(terminalSessionManager::session)
                    ?.repositoryRemotePath
                TerminalScreen(
                    host = host,
                    remotePath = currentRoute.remotePath,
                    repositoryId = currentRoute.repositoryId,
                    repositoryRemotePath = retainedProjectRoot ?: repository?.remotePath,
                    targetLabel = terminalTargetLabel(repository?.title ?: host.title, currentRoute.remotePath),
                    terminalSessionId = currentRoute.terminalSessionId,
                    fitToScreen = terminalFitToScreen,
                    onFitToScreenChange = { fitToScreen ->
                        terminalFitToScreen = fitToScreen
                        terminalSettingsStore.setTerminalFitToScreen(fitToScreen)
                    },
                    appearance = terminalAppearance,
                    onAppearanceChange = { appearance ->
                        terminalAppearance = appearance
                        terminalSettingsStore.setTerminalAppearance(appearance)
                    },
                    onSwitchGlobalTerminal = { session ->
                        terminalSessionManager.touchSession(session.id)
                        route = AppRoute.terminal(
                            session,
                            returnToTerminals = currentRoute.returnToTerminals,
                        )
                    },
                    terminalSessionManager = terminalSessionManager,
                    terminalForegroundBridge = terminalForegroundBridge,
                    onBackground = {
                        terminalForegroundBridge.sync()
                        route = terminalBackgroundRoute()
                    },
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

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
import com.mrongm.hobgoblin.navigation.HostDetailReturn
import com.mrongm.hobgoblin.navigation.TmuxReturn
import com.mrongm.hobgoblin.navigation.initialMainRoute
import com.mrongm.hobgoblin.navigation.projectSetupReturnRoute
import com.mrongm.hobgoblin.navigation.terminalBackgroundRoute
import com.mrongm.hobgoblin.navigation.terminalNotificationRoute
import com.mrongm.hobgoblin.navigation.terminalReturnRoute
import com.mrongm.hobgoblin.ssh.HostPortForwardManager
import com.mrongm.hobgoblin.ssh.HostPortForwardStatus
import com.mrongm.hobgoblin.ssh.RemoteRepositoryGitService
import com.mrongm.hobgoblin.ssh.RemoteWorktreeService
import com.mrongm.hobgoblin.ssh.SshDiagnosticsService
import com.mrongm.hobgoblin.ssh.SshInitializationService
import com.mrongm.hobgoblin.terminals.TerminalForegroundBridge
import com.mrongm.hobgoblin.terminals.DiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.HostTmuxPathGroup
import com.mrongm.hobgoblin.terminals.HostTmuxRecoveryCandidate
import com.mrongm.hobgoblin.terminals.RemoteTmuxCloseResult
import com.mrongm.hobgoblin.terminals.RemoteTmuxDiscoveryResult
import com.mrongm.hobgoblin.terminals.RemoteHostTmuxDiscoveryResult
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
import com.mrongm.hobgoblin.ui.navigation.projectCountsByHostId
import com.mrongm.hobgoblin.ui.navigation.terminalCountsByProjectId
import com.mrongm.hobgoblin.ui.screens.hosts.HostsScreen
import com.mrongm.hobgoblin.ui.screens.hosts.HostDetailScreen
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
import com.mrongm.hobgoblin.ui.screens.tmux.TmuxScreen
import com.mrongm.hobgoblin.ui.screens.tmux.selectTmuxHost
import com.mrongm.hobgoblin.ui.screens.tmux.tmuxNeedsScan
import com.mrongm.hobgoblin.ui.screens.tmux.tmuxRoute
import com.mrongm.hobgoblin.ui.screens.tmux.tmuxScanOwnsRefreshIndicator
import com.mrongm.hobgoblin.ui.screens.tmux.tmuxStateForHost
import com.mrongm.hobgoblin.ui.theme.AndroidApplicationTheme
import com.mrongm.hobgoblin.ui.text.currentAndroidApplicationLanguageSetting
import com.mrongm.hobgoblin.ui.text.setAndroidApplicationLanguagePreference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
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

internal fun hostTmuxRecoveryCandidate(
    host: SshHostProfile,
    discovery: HostDiscoveredTmuxSession,
): HostTmuxRecoveryCandidate {
    val remotePath = discovery.initialPath
    return HostTmuxRecoveryCandidate(
        target = RemoteTarget.fromHostProfile(host, remotePath),
        targetLabel = terminalTargetLabel(host.title, remotePath),
        discovery = discovery,
    )
}

internal fun requireHostTmuxRemoteCloseSuccess(result: RemoteTmuxCloseResult) {
    when (result) {
        RemoteTmuxCloseResult.Closed,
        RemoteTmuxCloseResult.Missing,
        -> Unit
        is RemoteTmuxCloseResult.Failed -> error(result.message)
    }
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
    applicationTheme: AndroidApplicationTheme,
    onApplicationThemeChange: (AndroidApplicationTheme) -> Unit,
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
    LaunchedEffect(terminalNavigationRequest?.sequence) {
        val request = terminalNavigationRequest ?: return@LaunchedEffect
        val record = terminalSessionManager.session(request.sessionId) ?: return@LaunchedEffect
        route = terminalNotificationRoute(record)
    }
    var hostsState: ResourceState<List<SshHostProfile>> by remember {
        mutableStateOf(ResourceState.Loaded(hostProfileStore.loadHosts()))
    }
    var repositoriesState: ResourceState<List<RemoteRepositoryProfile>> by remember {
        mutableStateOf(ResourceState.Loaded(initialRepositories))
    }
    var hostTmuxState: ResourceState<List<HostTmuxPathGroup>> by remember {
        mutableStateOf(ResourceState.Idle)
    }
    var hostTmuxStateHostId: String? by remember { mutableStateOf(null) }
    var hostTmuxRefreshNonce by remember { mutableStateOf(0) }
    var hostTmuxRefreshInFlight by remember { mutableStateOf(false) }
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

    fun <T> failedRefresh(previous: ResourceState<T>, message: String): ResourceState<T> = when (previous) {
        is ResourceState.Loaded -> ResourceState.Stale(previous.value, previous.loadedAtMillis, message)
        is ResourceState.Stale -> previous.copy(reason = message)
        else -> ResourceState.Error(message)
    }

    LaunchedEffect(route, hostTmuxRefreshNonce) {
        val activeTmuxRoute = route as? AppRoute.Tmux ?: return@LaunchedEffect
        if (!tmuxNeedsScan(activeTmuxRoute)) return@LaunchedEffect
        val requestedHostId = requireNotNull(activeTmuxRoute.selectedHostId)
        val host = currentHosts().firstOrNull { it.id == requestedHostId }
        if (host == null) {
            hostTmuxState = ResourceState.Idle
            hostTmuxStateHostId = null
            route = tmuxRoute()
            return@LaunchedEffect
        }
        val previous = tmuxStateForHost(
            selectedHostId = requestedHostId,
            stateHostId = hostTmuxStateHostId,
            state = hostTmuxState,
        )
        hostTmuxStateHostId = host.id
        if (previous !is ResourceState.Loaded && previous !is ResourceState.Stale) {
            hostTmuxState = ResourceState.Loading
        }
        hostTmuxRefreshInFlight = true
        try {
            val result = withContext(Dispatchers.IO) {
                remoteTmuxSessionService.discoverHostSessions(RemoteTarget.fromHostProfile(host))
            }
            val nextState = when (result) {
                is RemoteHostTmuxDiscoveryResult.Loaded ->
                    ResourceState.Loaded(HostTmuxPathGroup.from(result.sessions))
                is RemoteHostTmuxDiscoveryResult.Failed -> failedRefresh(previous, result.message)
            }
            if ((route as? AppRoute.Tmux)?.selectedHostId == requestedHostId) {
                hostTmuxState = nextState
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if ((route as? AppRoute.Tmux)?.selectedHostId == requestedHostId) {
                hostTmuxState = failedRefresh(previous, error.message ?: "tmux scan failed.")
            }
        } finally {
            if (tmuxScanOwnsRefreshIndicator(route, requestedHostId)) {
                hostTmuxRefreshInFlight = false
            }
        }
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
            MainTab.Tmux -> AppRoute.Tmux()
            MainTab.Terminals -> AppRoute.Terminals
        }
    }

    fun mainTabForRoute(currentRoute: AppRoute): MainTab? = when (currentRoute) {
        AppRoute.Hosts -> MainTab.Hosts
        AppRoute.Projects -> MainTab.Projects
        is AppRoute.Tmux -> MainTab.Tmux
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

    fun openHostTmuxSession(
        host: SshHostProfile,
        discovery: HostDiscoveredTmuxSession,
    ) {
        val tmuxReturn = TmuxReturn(host.id)
        scope.launch {
            val record = withContext(Dispatchers.IO) {
                val candidate = hostTmuxRecoveryCandidate(host, discovery)
                val recovered = terminalSessionManager.recoverOrGetHostTmuxSession(candidate) ?: return@withContext null
                if (terminalSessionReconnectAvailable(recovered)) {
                    terminalSessionManager.reconnect(
                        sessionId = recovered.id,
                        target = candidate.target,
                        repositoryId = null,
                        repositoryRemotePath = null,
                        targetLabel = candidate.targetLabel,
                    ) ?: recovered
                } else {
                    recovered
                }
            } ?: return@launch
            terminalForegroundBridge.sync()
            route = AppRoute.terminal(record, tmuxReturn = tmuxReturn)
        }
    }

    when (val currentRoute = route) {
        AppRoute.Hosts,
        AppRoute.Projects,
        AppRoute.Terminals,
        is AppRoute.Tmux,
        -> {
            val selectedTab = mainTabForRoute(currentRoute) ?: MainTab.Hosts
            val tmuxVisit = currentRoute as? AppRoute.Tmux ?: tmuxRoute()
            val selectedTmuxHost = tmuxVisit.selectedHostId?.let { selectedHostId ->
                currentHosts().firstOrNull { host -> host.id == selectedHostId }
            }
            val visibleTmuxState = tmuxStateForHost(
                selectedHostId = tmuxVisit.selectedHostId,
                stateHostId = hostTmuxStateHostId,
                state = hostTmuxState,
            )
            val discoveredTmuxSessions = when (visibleTmuxState) {
                is ResourceState.Loaded -> visibleTmuxState.value.flatMap(HostTmuxPathGroup::sessions)
                is ResourceState.Stale -> visibleTmuxState.value.flatMap(HostTmuxPathGroup::sessions)
                ResourceState.Idle,
                ResourceState.Loading,
                is ResourceState.Error,
                -> emptyList()
            }
            val retainedSessionIds = terminalSessions.mapTo(mutableSetOf(), TerminalSessionRecord::id)
            val retainedTmuxSessions = selectedTmuxHost?.let { host ->
                discoveredTmuxSessions.mapNotNull { discovery ->
                    terminalSessionManager
                        .retainedHostTmuxSession(hostTmuxRecoveryCandidate(host, discovery))
                        ?.takeIf { retained -> retained.id in retainedSessionIds }
                        ?.let { retained -> discovery to retained }
                }.toMap()
            } ?: emptyMap()
            val projectCountByHostId = projectCountsByHostId(currentRepositories())
            val terminalCountByProjectId = terminalCountsByProjectId(terminalSessions)
            MainTabShell(
                selectedTab = selectedTab,
                onSelectTab = ::selectMainTab,
                onOpenSettings = { route = AppRoute.Settings },
                onAddHost = { route = AppRoute.AddHost },
                onAddProject = { route = AppRoute.AddRepository() },
                repositoriesState = repositoriesState,
                hostsContent = {
                    HostsScreen(
                        hostsState = hostsState,
                        onOpenHostDetail = { hostId -> route = AppRoute.HostDetail(hostId) },
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
                        projectCountByHostId = projectCountByHostId,
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
                        terminalCountByProjectId = terminalCountByProjectId,
                        initialManualOrder = manualItemOrderStore.load(ManualItemOrderScope.Projects),
                        onSaveManualOrder = { ids ->
                            manualItemOrderStore.save(ManualItemOrderScope.Projects, ids)
                        },
                    )
                },
                tmuxContent = {
                    TmuxScreen(
                        hosts = currentHosts(),
                        selectedHost = selectedTmuxHost,
                        repositories = currentRepositories(),
                        tmuxState = visibleTmuxState,
                        tmuxRefreshing = hostTmuxRefreshInFlight,
                        onSelectHost = { hostId ->
                            hostTmuxState = ResourceState.Idle
                            hostTmuxStateHostId = null
                            route = selectTmuxHost(hostId)
                        },
                        onChangeHost = {
                            hostTmuxState = ResourceState.Idle
                            hostTmuxStateHostId = null
                            route = tmuxRoute()
                        },
                        onAddHost = { route = AppRoute.AddHost },
                        onRefreshTmux = { hostTmuxRefreshNonce += 1 },
                        onImportDirectory = { initialPath ->
                            val hostId = requireNotNull(tmuxVisit.selectedHostId)
                            route = AppRoute.AddRepository(
                                initialHostId = hostId,
                                initialRemotePath = initialPath,
                                tmuxReturn = TmuxReturn(hostId),
                            )
                        },
                        onOpenTmuxSession = { discovery ->
                            selectedTmuxHost?.let { host -> openHostTmuxSession(host, discovery) }
                        },
                        retainedTmuxSessions = retainedTmuxSessions,
                        onReconnectTmuxSession = ::reconnectRetainedTerminal,
                        onCloseTmuxSession = ::closeRetainedTerminal,
                        onDeleteTmuxSession = { discovery, session, closeRemote ->
                            val host = requireNotNull(selectedTmuxHost) {
                                "The selected tmux host is no longer available."
                            }
                            val candidate = hostTmuxRecoveryCandidate(host, discovery)
                            val retained = terminalSessionManager.retainedHostTmuxSession(candidate)
                            require(retained?.id == session.id) {
                                "The retained tmux terminal is no longer available."
                            }
                            if (closeRemote) {
                                requireHostTmuxRemoteCloseSuccess(
                                    withContext(Dispatchers.IO) {
                                        remoteTmuxSessionService.closeHostSession(
                                            target = candidate.target,
                                            discovery = discovery,
                                        )
                                    },
                                )
                            }
                            deleteRetainedTerminal(session.id)
                            hostTmuxRefreshNonce += 1
                        },
                        hostOrder = manualItemOrderStore.load(ManualItemOrderScope.Hosts),
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
                    onExportPrivateKey = { identityId, output ->
                        secureIdentityStore.exportPrivateKey(identityId, output)
                    },
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

        is AppRoute.AddRepository -> RepositorySetupScreen(
            hosts = currentHosts(),
            repositories = currentRepositories(),
            initialHostId = currentRoute.initialHostId,
            initialRemotePath = currentRoute.initialRemotePath,
            onBack = { route = projectSetupReturnRoute(currentRoute) },
            onSaveRepository = { repository ->
                remoteRepositoryStore.saveRepository(repository)
                reloadRepositories()
                if (currentRoute.tmuxReturn != null) {
                    route = projectSetupReturnRoute(currentRoute)
                }
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
                route = currentRoute.hostDetailReturn?.let { parent ->
                    AppRoute.HostDetail(parent.hostId)
                } ?: AppRoute.Projects
            } else {
                RepositoryWorkspaceScreen(
                    host = host,
                    repository = repository,
                    onBack = {
                        route = currentRoute.hostDetailReturn?.let { parent ->
                            AppRoute.HostDetail(parent.hostId)
                        } ?: AppRoute.Projects
                    },
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
                            hostDetailReturn = currentRoute.hostDetailReturn,
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
                        route = currentRoute.hostDetailReturn?.let { parent ->
                            AppRoute.HostDetail(parent.hostId)
                        } ?: AppRoute.Projects
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
                val retainedTargetLabel = currentRoute.terminalSessionId
                    ?.let(terminalSessionManager::session)
                    ?.targetLabel
                TerminalScreen(
                    host = host,
                    remotePath = currentRoute.remotePath,
                    repositoryId = currentRoute.repositoryId,
                    repositoryRemotePath = retainedProjectRoot ?: repository?.remotePath,
                    targetLabel = retainedTargetLabel
                        ?: terminalTargetLabel(repository?.title ?: host.title, currentRoute.remotePath),
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
                            hostDetailReturn = currentRoute.hostDetailReturn,
                            tmuxReturn = currentRoute.tmuxReturn,
                        )
                    },
                    terminalSessionManager = terminalSessionManager,
                    terminalForegroundBridge = terminalForegroundBridge,
                    onBackground = {
                        terminalForegroundBridge.sync()
                        route = terminalBackgroundRoute()
                    },
                    onBack = { activeSessionId ->
                        val temporary = isHostTemporaryTerminal(
                            remotePath = currentRoute.remotePath,
                            repositoryId = currentRoute.repositoryId,
                            returnsToHostDetail = currentRoute.hostDetailReturn != null || currentRoute.tmuxReturn != null,
                        )
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

        is AppRoute.HostDetail -> {
            val host = currentHosts().firstOrNull { it.id == currentRoute.hostId }
            if (host == null) {
                route = AppRoute.Hosts
            } else {
                val parent = HostDetailReturn(host.id)
                HostDetailScreen(
                    host = host,
                    onBack = { route = AppRoute.Hosts },
                    projectsContent = {
                        ProjectsScreen(
                            repositoriesState = repositoriesState,
                            hosts = currentHosts(),
                            onOpenProject = { repositoryId ->
                                route = AppRoute.Repository(
                                    repositoryId = repositoryId,
                                    hostDetailReturn = parent,
                                )
                            },
                            onOpenProjectTerminals = { repositoryId, terminalWorkspacePath ->
                                route = AppRoute.Repository(
                                    repositoryId = repositoryId,
                                    terminalWorkspacePath = terminalWorkspacePath,
                                    hostDetailReturn = parent,
                                )
                            },
                            onDeleteProject = ::deleteRepositoryRecord,
                            hostFilterId = host.id,
                            onClearHostFilter = null,
                            initialManualOrder = manualItemOrderStore.load(ManualItemOrderScope.Projects),
                            onSaveManualOrder = { ids ->
                                manualItemOrderStore.save(ManualItemOrderScope.Projects, ids)
                            },
                        )
                    },
                )
            }
        }

        AppRoute.Settings -> SettingsScreen(
            initialKeepAliveIntervalSeconds = terminalSettingsStore.loadKeepAliveIntervalSeconds(),
            initialHeartbeatFailureThreshold = terminalSettingsStore.loadHeartbeatFailureThreshold(),
            initialApplicationLanguage = currentAndroidApplicationLanguageSetting(),
            initialApplicationTheme = applicationTheme,
            onBack = { route = AppRoute.Hosts },
            onSave = {
                    keepAliveIntervalSeconds,
                    heartbeatFailureThreshold,
                    applicationLanguage,
                    updatedApplicationTheme,
                ->
                terminalSettingsStore.setKeepAliveIntervalSeconds(keepAliveIntervalSeconds)
                terminalSettingsStore.setHeartbeatFailureThreshold(heartbeatFailureThreshold)
                onApplicationThemeChange(updatedApplicationTheme)
                route = AppRoute.Hosts
                setAndroidApplicationLanguagePreference(applicationLanguage)
            },
        )
    }
}

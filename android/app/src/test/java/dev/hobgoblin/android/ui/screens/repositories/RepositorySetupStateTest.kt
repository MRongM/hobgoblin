package dev.hobgoblin.android.ui.screens.repositories

import dev.hobgoblin.android.tmuxRecoveryCandidates
import dev.hobgoblin.android.domain.ResourceState
import dev.hobgoblin.android.domain.ssh.RemoteDirectoryEntry
import dev.hobgoblin.android.domain.ssh.RemoteProjectInspection
import dev.hobgoblin.android.domain.ssh.RemoteProjectKind
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryBranch
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile
import dev.hobgoblin.android.domain.ssh.RemoteRepositorySnapshot
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryWorktree
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.terminals.TerminalDisconnectedReason
import dev.hobgoblin.android.terminals.TerminalLaunchMode
import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TerminalSessionStatus
import dev.hobgoblin.android.terminals.DiscoveredTmuxSession
import dev.hobgoblin.android.terminals.TmuxSessionDescriptor
import dev.hobgoblin.android.terminals.TmuxSessionIdentity
import dev.hobgoblin.android.terminals.TmuxSessionProtocol
import dev.hobgoblin.android.termux.ExternalTermuxLaunchResult
import dev.hobgoblin.android.ui.screens.placeholders.localTerminalPlaceholderText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RepositorySetupStateTest {
    @Test
    fun `only hosts with identities are selectable as authenticated servers`() {
        val unauthenticated = host(id = "host-1", identityRefId = null)
        val authenticated = host(id = "host-2", identityRefId = "identity-1")

        assertEquals(listOf(authenticated), authenticatedHosts(listOf(unauthenticated, authenticated)))
        assertEquals(authenticated, defaultAuthenticatedHost(listOf(unauthenticated, authenticated)))
    }

    @Test
    fun `remote project paths must be absolute before saving or opening`() {
        assertFalse(canSaveRepository(host(id = "host-1", identityRefId = "identity-1"), "srv/app"))
        assertTrue(canSaveRepository(host(id = "host-1", identityRefId = "identity-1"), "/srv/app"))
    }

    @Test
    fun `directory browser starts from typed absolute path or root`() {
        assertEquals("/srv/app", directoryBrowserRootPath(" /srv/app "))
        assertEquals("/", directoryBrowserRootPath(""))
        assertEquals("/", directoryBrowserRootPath("srv/app"))
    }

    @Test
    fun `directory browser resolves parent path for hierarchical navigation`() {
        assertNull(directoryBrowserParentPath("/"))
        assertEquals("/", directoryBrowserParentPath("/srv"))
        assertEquals("/srv", directoryBrowserParentPath("/srv/app"))
        assertEquals("/srv", directoryBrowserParentPath("/srv/app/"))
    }

    @Test
    fun `directory browser loads only the current page when no usable listing exists`() {
        val entry = RemoteDirectoryEntry(name = "app", path = "/srv/app", isDirectory = true)

        assertTrue(shouldLoadDirectoryPage(null))
        assertTrue(shouldLoadDirectoryPage(ResourceState.Idle))
        assertTrue(shouldLoadDirectoryPage(ResourceState.Error("failed")))
        assertFalse(shouldLoadDirectoryPage(ResourceState.Loading))
        assertFalse(shouldLoadDirectoryPage(ResourceState.Loaded(listOf(entry))))
        assertFalse(
            shouldLoadDirectoryPage(ResourceState.Stale(value = listOf(entry), loadedAtMillis = 1L, reason = "offline")),
        )
    }

    @Test
    fun `workspace terminal uses repository remote path`() {
        val repository = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "App",
            remotePath = "/srv/app",
        )

        assertEquals(
            listOf(
                RepositoryWorkspaceTab.Branches,
                RepositoryWorkspaceTab.Worktrees,
                RepositoryWorkspaceTab.Terminal,
            ),
            repositoryWorkspaceTabs(repository),
        )
        assertEquals("/srv/app", repositoryTerminalPath(repository))
    }

    @Test
    fun `plain workspace exposes only its root terminal capability`() {
        val workspace = repository(
            id = "project-1",
            remotePath = "/srv/scripts",
            kind = RemoteProjectKind.PlainWorkspace,
        )

        assertEquals(listOf(RepositoryWorkspaceTab.Terminal), repositoryWorkspaceTabs(workspace))
        assertEquals(
            RepositoryWorkspaceTab.Terminal,
            initialRepositoryWorkspaceTab(workspace, initialTerminalWorkspacePath = null),
        )
        assertFalse(shouldLoadRepositorySnapshot(workspace))
    }

    @Test
    fun `git project keeps git tabs and snapshot capability`() {
        val repository = repository(id = "repo-1", remotePath = "/srv/app")

        assertEquals(RepositoryWorkspaceTab.Branches, initialRepositoryWorkspaceTab(repository, null))
        assertTrue(shouldLoadRepositorySnapshot(repository))
    }

    @Test
    fun `plain workspace tmux discovery uses its root without a git snapshot`() {
        val workspace = repository(
            id = "project-1",
            remotePath = "/srv//scripts/./",
            kind = RemoteProjectKind.PlainWorkspace,
        )

        assertEquals(
            listOf("/srv/scripts"),
            repositoryTmuxDiscoveryPaths(workspace, ResourceState.Idle),
        )
    }

    @Test
    fun `git tmux discovery waits for a usable repository snapshot`() {
        val repository = repository(id = "repo-1", remotePath = "/srv/app")

        assertNull(repositoryTmuxDiscoveryPaths(repository, ResourceState.Idle))
        assertNull(repositoryTmuxDiscoveryPaths(repository, ResourceState.Loading))
        assertNull(repositoryTmuxDiscoveryPaths(repository, ResourceState.Error("git failed")))
    }

    @Test
    fun `git tmux discovery includes normalized root and non missing worktrees`() {
        val repository = repository(id = "repo-1", remotePath = "/srv/app/")
        val usableSnapshot = snapshot().copy(
            worktrees = listOf(
                worktree(path = "/srv/app"),
                worktree(path = "/srv//app-feature/./"),
                worktree(path = "/srv/app-missing", isMissing = true),
            ),
        )
        val expected = listOf("/srv/app", "/srv/app-feature")

        assertEquals(
            expected,
            repositoryTmuxDiscoveryPaths(repository, ResourceState.Loaded(usableSnapshot)),
        )
        assertEquals(
            expected,
            repositoryTmuxDiscoveryPaths(
                repository,
                ResourceState.Stale(usableSnapshot, loadedAtMillis = 1L, reason = "offline"),
            ),
        )
    }

    @Test
    fun `tmux scan action exposes stable ready and pending labels`() {
        assertEquals("Scan tmux", tmuxScanButtonLabel(isScanning = false))
        assertEquals("Scanning...", tmuxScanButtonLabel(isScanning = true))
    }

    @Test
    fun `tmux scan action requires paths and rejects reentry`() {
        assertFalse(canScanTmux(isScanning = false, discoveryPaths = null))
        assertFalse(canScanTmux(isScanning = false, discoveryPaths = emptyList()))
        assertTrue(canScanTmux(isScanning = false, discoveryPaths = listOf("/srv/app")))
        assertFalse(canScanTmux(isScanning = true, discoveryPaths = listOf("/srv/app")))
    }

    @Test
    fun `validated discoveries map to path scoped recovery candidates`() {
        val host = host(id = "host-1", identityRefId = "identity-1")
        val repository = repository(id = "repo-1", remotePath = "/srv/app")
        val identity = requireNotNull(
            TmuxSessionProtocol.identity(
                TmuxSessionDescriptor(
                    projectRoot = repository.remotePath,
                    workingDirectory = "/srv/app-feature",
                    terminalNumber = 3,
                ),
            ),
        )

        val candidates = tmuxRecoveryCandidates(
            host = host,
            repository = repository,
            discoveries = listOf(DiscoveredTmuxSession(identity, terminalNumber = 3)),
        )

        assertEquals(1, candidates.size)
        assertEquals("root@example.com:22/srv/app-feature", candidates.single().target.id)
        assertEquals("repo-1", candidates.single().repositoryId)
        assertEquals("/srv/app", candidates.single().repositoryRemotePath)
        assertEquals("/srv/app - /srv/app-feature", candidates.single().targetLabel)
        assertEquals(identity, candidates.single().discovery.identity)
    }

    @Test
    fun `workspace detail tabs exclude commits`() {
        val repository = repository(id = "repo-1", remotePath = "/srv/app")

        assertFalse(repositoryWorkspaceTabs(repository).contains(RepositoryWorkspaceTab.Commits))
    }

    @Test
    fun `workspace detail tabs use a scrollable strip when tab count is dense`() {
        val tabs = repositoryWorkspaceTabs(repository(id = "repo-1", remotePath = "/srv/app"))

        assertFalse(repositoryWorkspaceTabsUseScrollableStrip(tabs))
        assertEquals(0, repositoryWorkspaceTabIndex(tabs, RepositoryWorkspaceTab.Branches))
        assertEquals(
            0,
            repositoryWorkspaceTabIndex(
                tabs = listOf(RepositoryWorkspaceTab.Branches),
                selectedTab = RepositoryWorkspaceTab.Commits,
                fallback = RepositoryWorkspaceTab.Branches,
            ),
        )
    }

    @Test
    fun `local terminal placeholder makes v1 scope explicit`() {
        assertEquals(
            "Android-local terminal and local Git are deferred from v1; use SSH terminals for emergency work.",
            localTerminalPlaceholderText(),
        )
    }

    @Test
    fun `worktree terminal uses selected worktree path`() {
        val worktree = RemoteRepositoryWorktree(
            path = "/srv/app-feature",
            branch = "feature/android",
            isPrimary = false,
            isLinked = true,
            isBare = false,
            isLocked = false,
            isMissing = false,
            isDirty = false,
            changeCount = 0,
        )

        assertEquals("/srv/app-feature", worktreeTerminalPath(worktree))
    }

    @Test
    fun `terminal workspace sessions are filtered by host and path`() {
        val appTerminal = terminalSession(
            id = "terminal-1",
            hostId = "host-1",
            remotePath = "/srv/app",
            openedAt = 100,
        )
        val otherPath = terminalSession(
            id = "terminal-2",
            hostId = "host-1",
            remotePath = "/srv/other",
            openedAt = 200,
        )
        val otherHost = terminalSession(
            id = "terminal-3",
            hostId = "host-2",
            remotePath = "/srv/app",
            openedAt = 300,
        )

        assertEquals(
            listOf(appTerminal),
            terminalWorkspaceSessions(
                sessions = listOf(otherPath, appTerminal, otherHost),
                hostId = "host-1",
                remotePath = "/srv/app",
            ),
        )
    }

    @Test
    fun `terminal workspace sessions order active sessions before inactive by activity`() {
        val olderRunning = terminalSession(
            id = "terminal-1",
            status = TerminalSessionStatus.Running,
            openedAt = 100,
            lastActivityAt = 150,
        )
        val exited = terminalSession(
            id = "terminal-2",
            status = TerminalSessionStatus.Exited,
            openedAt = 200,
            lastActivityAt = 300,
            disconnectedReason = TerminalDisconnectedReason.RemoteExited,
        )
        val newerRunning = terminalSession(
            id = "terminal-3",
            status = TerminalSessionStatus.Running,
            openedAt = 250,
            lastActivityAt = 400,
        )

        assertEquals(
            listOf(newerRunning, olderRunning, exited),
            terminalWorkspaceSessions(
                sessions = listOf(exited, olderRunning, newerRunning),
                hostId = "host-1",
                remotePath = "/srv/app",
            ),
        )
    }

    @Test
    fun `terminal workspace labels are stable and lowercase`() {
        assertEquals("terminal-1", terminalSessionDefaultLabel(index = 0))
        assertEquals("terminal-2", terminalSessionDefaultLabel(index = 1))
        assertEquals("starting", terminalSessionStatusLabel(terminalSession(status = TerminalSessionStatus.Starting)))
        assertEquals("running", terminalSessionStatusLabel(terminalSession(status = TerminalSessionStatus.Running)))
        assertEquals("exited", terminalSessionStatusLabel(terminalSession(status = TerminalSessionStatus.Exited)))
        assertEquals("failed", terminalSessionStatusLabel(terminalSession(status = TerminalSessionStatus.Failed)))
        assertEquals(
            "disconnected",
            terminalSessionStatusLabel(terminalSession(status = TerminalSessionStatus.Disconnected)),
        )
    }

    @Test
    fun `terminal workspace count label handles singular and plural`() {
        assertEquals("0 terminals", terminalWorkspaceCountLabel(0))
        assertEquals("1 terminal", terminalWorkspaceCountLabel(1))
        assertEquals("2 terminals", terminalWorkspaceCountLabel(2))
    }

    @Test
    fun `terminal workspace status exposes foreground ownership`() {
        assertEquals(
            "running - foreground",
            terminalSessionStatusLabel(
                terminalSession(
                    status = TerminalSessionStatus.Running,
                    foregroundServiceOwned = true,
                ),
            ),
        )
    }

    @Test
    fun `terminal modes expose remote ssh and external termux`() {
        assertEquals(
            listOf("Remote SSH", "External Termux"),
            repositoryTerminalModes().map { it.label },
        )
    }

    @Test
    fun `external termux target label uses ssh authority`() {
        assertEquals(
            "root@example.com:2222",
            externalTermuxTargetLabel(host(id = "host-1", identityRefId = "identity-1").copy(port = 2222)),
        )
    }

    @Test
    fun `external termux launch results map to stable status labels`() {
        assertEquals("ready", externalTermuxStatusLabel(ExternalTermuxStatus.Ready))
        assertEquals("command copied", externalTermuxStatusLabel(ExternalTermuxStatus.CommandCopied))
        assertEquals(
            "opened in Termux",
            externalTermuxStatusLabel(
                externalTermuxStatusAfterLaunch(ExternalTermuxLaunchResult.Launched),
            ),
        )
        assertEquals(
            "Termux not installed",
            externalTermuxStatusLabel(
                externalTermuxStatusAfterLaunch(ExternalTermuxLaunchResult.Unavailable(copiedCommand = true)),
            ),
        )
        assertEquals(
            "Termux command API unavailable",
            externalTermuxStatusLabel(
                externalTermuxStatusAfterLaunch(ExternalTermuxLaunchResult.CopiedFallback(openedTermux = true)),
            ),
        )
        assertEquals(
            "failed",
            externalTermuxStatusLabel(
                externalTermuxStatusAfterLaunch(
                    ExternalTermuxLaunchResult.Failed(
                        copiedCommand = false,
                        openedTermux = false,
                        message = "Termux command API unavailable",
                    ),
                ),
            ),
        )
        assertEquals(
            "Termux RUN_COMMAND permission and allow-external-apps are required to pass the private key.",
            externalTermuxActionError(
                ExternalTermuxLaunchResult.Failed(
                    copiedCommand = false,
                    openedTermux = false,
                    message = "Termux RUN_COMMAND permission and allow-external-apps are required to pass the private key.",
                ),
            ),
        )
        assertEquals(null, externalTermuxActionError(ExternalTermuxLaunchResult.Launched))
    }

    @Test
    fun `terminal workspace status includes inactive reason labels`() {
        assertEquals(
            "disconnected - android service stopped",
            terminalSessionStatusLabel(
                terminalSession(
                    status = TerminalSessionStatus.Disconnected,
                    disconnectedReason = TerminalDisconnectedReason.AndroidServiceStopped,
                ),
            ),
        )
        assertEquals(
            "exited - remote exited",
            terminalSessionStatusLabel(
                terminalSession(
                    status = TerminalSessionStatus.Exited,
                    disconnectedReason = TerminalDisconnectedReason.RemoteExited,
                ),
            ),
        )
        assertEquals(
            "failed - terminal failure",
            terminalSessionStatusLabel(
                terminalSession(
                    status = TerminalSessionStatus.Failed,
                    disconnectedReason = TerminalDisconnectedReason.TerminalFailure,
                ),
            ),
        )
    }

    @Test
    fun `running terminal delete requires confirmation`() {
        assertTrue(requiresTerminalDeleteConfirmation(terminalSession(status = TerminalSessionStatus.Starting)))
        assertTrue(requiresTerminalDeleteConfirmation(terminalSession(status = TerminalSessionStatus.Running)))
    }

    @Test
    fun `repository terminal creation offers explicit native and tmux actions`() {
        assertEquals(
            listOf(
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
            ),
            repositoryTerminalCreationActions(),
        )
    }

    @Test
    fun `only a retained current tmux identity offers exact session close`() {
        val plain = terminalSession()
        val tmux = terminalSession(
            terminalId = 1,
            repositoryRemotePath = "/srv/app",
            tmuxIdentity = TmuxSessionIdentity(
                sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
                initialPath = "/srv/app",
            ),
        )

        assertFalse(canCloseTerminalTmuxSession(plain))
        assertTrue(canCloseTerminalTmuxSession(tmux))
        assertTrue(terminalTmuxCloseWarning().contains("running processes"))
        assertTrue(terminalTmuxCloseWarning().contains("other clients"))
        assertFalse(terminalTmuxCloseWarning().contains(tmux.tmuxIdentity!!.sessionName))
    }

    @Test
    fun `inactive terminal delete does not require running process confirmation`() {
        assertFalse(requiresTerminalDeleteConfirmation(terminalSession(status = TerminalSessionStatus.Exited)))
        assertFalse(requiresTerminalDeleteConfirmation(terminalSession(status = TerminalSessionStatus.Failed)))
        assertFalse(requiresTerminalDeleteConfirmation(terminalSession(status = TerminalSessionStatus.Disconnected)))
    }

    @Test
    fun `terminal delete confirmation text names terminal and worktree path`() {
        val text = terminalDeleteConfirmationText("Terminal 2", terminalSession(remotePath = "/srv/app-feature"))

        assertTrue(text.contains("Terminal 2"))
        assertTrue(text.contains("/srv/app-feature"))
        assertTrue(text.contains("stop"))
        assertTrue(text.contains("remove"))
    }

    @Test
    fun `worktree path suggestion uses repository parent and sanitized branch name`() {
        assertEquals(
            "/srv/app-feature-android",
            suggestedWorktreePath(repositoryPath = "/srv/app", branch = "feature/android"),
        )
    }

    @Test
    fun `worktree create requires branch and absolute path`() {
        assertFalse(canCreateWorktree(branch = "", worktreePath = "/srv/app-feature"))
        assertFalse(canCreateWorktree(branch = "feature/android", worktreePath = "srv/app-feature"))
        assertTrue(canCreateWorktree(branch = "feature/android", worktreePath = "/srv/app-feature"))
    }

    @Test
    fun `new branch name is recommended from base branch and avoids conflicts`() {
        assertEquals(
            "main-new",
            suggestedBranchName(baseBranch = "main", existingBranchNames = emptySet()),
        )
        assertEquals(
            "feature/android-new-2",
            suggestedBranchName(
                baseBranch = "feature/android",
                existingBranchNames = setOf("feature/android-new"),
            ),
        )
    }

    @Test
    fun `branch create requires base branch and unique editable new branch`() {
        val existing = setOf("main", "main-new")

        assertFalse(canCreateBranch(baseBranch = "", newBranch = "main-new-2", existingBranchNames = existing))
        assertFalse(canCreateBranch(baseBranch = "main", newBranch = "", existingBranchNames = existing))
        assertFalse(canCreateBranch(baseBranch = "main", newBranch = "main-new", existingBranchNames = existing))
        assertTrue(canCreateBranch(baseBranch = "main", newBranch = "main-new-2", existingBranchNames = existing))
    }

    @Test
    fun `branch delete safety blocks current default and worktree branches`() {
        assertEquals("Current branch cannot be deleted.", branchDeleteBlockedReason(branch(isCurrent = true)))
        assertEquals("Default branch cannot be deleted.", branchDeleteBlockedReason(branch(isDefault = true)))
        assertEquals(
            "Branch with a worktree cannot be deleted.",
            branchDeleteBlockedReason(branch(worktreePath = "/srv/app-feature")),
        )
        assertNull(branchDeleteBlockedReason(branch()))
        assertFalse(canDeleteBranch(branch(isCurrent = true)))
        assertTrue(canDeleteBranch(branch()))
    }

    @Test
    fun `branch delete confirmation names remote branch`() {
        val text = branchDeleteConfirmationText(branch(name = "feature/android"))

        assertTrue(text.contains("feature/android"))
        assertTrue(text.contains("remote branch"))
        assertTrue(text.contains("not delete worktrees"))
    }

    @Test
    fun `branch checkout is available only for non current branches`() {
        assertFalse(canCheckoutBranch(branch(isCurrent = true)))
        assertTrue(canCheckoutBranch(branch(isCurrent = false)))
    }

    @Test
    fun `branch checkout confirmation names target branch`() {
        val text = branchCheckoutConfirmationText(branch(name = "feature/android"))

        assertTrue(text.contains("feature/android"))
        assertTrue(text.contains("remote branch"))
        assertTrue(text.contains("working tree"))
    }

    @Test
    fun `local project delete removes only the selected saved project record`() {
        val app = repository(id = "repo-1", remotePath = "/srv/app")
        val api = repository(id = "repo-2", remotePath = "/srv/api")

        assertEquals(listOf(api), repositoriesAfterLocalDelete(listOf(app, api), "repo-1"))
        assertEquals(listOf(app, api), repositoriesAfterLocalDelete(listOf(app, api), "missing"))
    }

    @Test
    fun `validated git project uses inspected top level before local save`() {
        val host = host(id = "host-1", identityRefId = "identity-1")
        val inspection = RemoteProjectInspection(
            requestedPath = "/srv/app/subdir",
            resolvedPath = "/srv/app",
            kind = RemoteProjectKind.GitRepository,
            currentRef = "feature/android",
            defaultBranch = "main",
        )

        val repository = createProjectFromInspection(host, "App", inspection)

        assertEquals("host-1", repository.hostProfileId)
        assertEquals("App", repository.alias)
        assertEquals("/srv/app", repository.remotePath)
        assertEquals(RemoteProjectKind.GitRepository, repository.kind)
    }

    @Test
    fun `validated plain workspace keeps its resolved directory before local save`() {
        val host = host(id = "host-1", identityRefId = "identity-1")
        val inspection = RemoteProjectInspection(
            requestedPath = "/srv/scripts",
            resolvedPath = "/srv/scripts",
            kind = RemoteProjectKind.PlainWorkspace,
            currentRef = null,
            defaultBranch = null,
        )

        val workspace = createProjectFromInspection(host, "Scripts", inspection)

        assertEquals("/srv/scripts", workspace.remotePath)
        assertEquals(RemoteProjectKind.PlainWorkspace, workspace.kind)
    }

    @Test
    fun `refresh failure keeps last loaded snapshot as stale`() {
        val snapshot = snapshot()
        val state = repositorySnapshotStateAfterRefreshFailure(
            previous = ResourceState.Loaded(snapshot, loadedAtMillis = 100),
            message = "git failed",
        )

        require(state is ResourceState.Stale)
        assertEquals(snapshot, state.value)
        assertEquals(100, state.loadedAtMillis)
        assertEquals("git failed", state.reason)
    }

    @Test
    fun `refresh failure without previous snapshot becomes error`() {
        val state = repositorySnapshotStateAfterRefreshFailure(
            previous = ResourceState.Idle,
            message = "git failed",
        )

        require(state is ResourceState.Error)
        assertEquals("git failed", state.message)
    }

    @Test
    fun `worktree badges include linked locked missing dirty and bare states`() {
        val worktree = RemoteRepositoryWorktree(
            path = "/srv/app-linked",
            branch = "feature/android",
            isPrimary = false,
            isLinked = true,
            isBare = true,
            isLocked = true,
            isMissing = true,
            isDirty = true,
            changeCount = 3,
        )

        assertEquals(
            listOf("linked", "locked", "missing", "dirty 3", "bare"),
            worktreeBadges(worktree),
        )
    }

    private fun host(id: String, identityRefId: String?): SshHostProfile =
        SshHostProfile.create(
            alias = "Dev",
            host = "example.com",
            user = "root",
            identityRefId = identityRefId,
        ).copy(id = id)

    private fun repository(
        id: String,
        remotePath: String,
        kind: RemoteProjectKind = RemoteProjectKind.GitRepository,
    ): RemoteRepositoryProfile =
        RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = null,
            remotePath = remotePath,
            kind = kind,
        ).copy(id = id)

    private fun terminalSession(
        id: String = "terminal-1",
        hostId: String = "host-1",
        repositoryId: String = "repo-1",
        remotePath: String = "/srv/app",
        status: TerminalSessionStatus = TerminalSessionStatus.Running,
        openedAt: Long = 100,
        lastActivityAt: Long? = openedAt,
        foregroundServiceOwned: Boolean = false,
        disconnectedReason: TerminalDisconnectedReason? = null,
        terminalId: Int? = null,
        repositoryRemotePath: String? = null,
        tmuxIdentity: TmuxSessionIdentity? = null,
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = id,
        hostId = hostId,
        repositoryId = repositoryId,
        remotePath = remotePath,
        targetLabel = "App - $remotePath",
        terminalId = terminalId,
        repositoryRemotePath = repositoryRemotePath,
        tmuxIdentity = tmuxIdentity,
        status = status,
        openedAt = openedAt,
        lastActivityAt = lastActivityAt,
        foregroundServiceOwned = foregroundServiceOwned,
        disconnectedReason = disconnectedReason,
    )

    private fun branch(
        name: String = "feature/android",
        isCurrent: Boolean = false,
        isDefault: Boolean = false,
        worktreePath: String? = null,
    ): RemoteRepositoryBranch = RemoteRepositoryBranch(
        name = name,
        isCurrent = isCurrent,
        isDefault = isDefault,
        worktreePath = worktreePath,
    )

    private fun snapshot(): RemoteRepositorySnapshot = RemoteRepositorySnapshot(
        currentRef = "main",
        defaultBranch = "main",
        statusLines = emptyList(),
        statusChangeCount = 0,
        branches = emptyList(),
        commits = emptyList(),
        worktrees = emptyList(),
    )

    private fun worktree(
        path: String,
        isMissing: Boolean = false,
    ): RemoteRepositoryWorktree = RemoteRepositoryWorktree(
        path = path,
        branch = "feature/android",
        isPrimary = false,
        isLinked = true,
        isBare = false,
        isLocked = false,
        isMissing = isMissing,
        isDirty = false,
        changeCount = 0,
    )
}

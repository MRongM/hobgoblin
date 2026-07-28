package com.mrongm.hobgoblin.ui.screens.tmux

import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.hostTmuxRecoveryCandidate
import com.mrongm.hobgoblin.requireHostTmuxRemoteCloseSuccess
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.RemoteTmuxCloseResult
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.terminals.TmuxSessionIdentity
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TmuxCatalogPresentationTest {
    @Test
    fun `tmux group title uses basename while root remains readable`() {
        assertEquals("hobgoblin", hostTmuxPathTitle("/srv/projects/hobgoblin"))
        assertEquals("/", hostTmuxPathTitle("/"))
    }

    @Test
    fun `tmux session presentation distinguishes exact server and retains full accessibility identity`() {
        val namedServer = "hobgoblin-project-v1-222222222222222222222222"
        val named = session(TmuxServerTarget.Named(namedServer), attachedClients = 2)
        val legacy = session(TmuxServerTarget.Default, attachedClients = 0)

        assertEquals(HostTmuxServerSource.Project, hostTmuxServerSource(named.server))
        assertEquals(HostTmuxServerSource.Default, hostTmuxServerSource(legacy.server))
        assertEquals("…22222222", hostTmuxProtocolNameSuffix(namedServer))
        assertEquals("…11111111", hostTmuxProtocolNameSuffix(named.identity.sessionName))
        assertTrue(hostTmuxSessionAccessibilityLabel(named).contains(namedServer))
        assertTrue(hostTmuxSessionAccessibilityLabel(named).contains(named.identity.sessionName))
        assertTrue(hostTmuxSessionAccessibilityLabel(named).contains("2"))
    }

    @Test
    fun `host tmux discovery maps to an exact path scoped recovery candidate`() {
        val host = SshHostProfile.create(
            alias = "Dev",
            host = "example.com",
            user = "root",
            identityRefId = "identity-1",
        ).copy(id = "host-1")
        val discovery = session(
            server = TmuxServerTarget.Named("hobgoblin-project-v1-222222222222222222222222"),
            attachedClients = 0,
        )

        val candidate = hostTmuxRecoveryCandidate(host, discovery)

        assertEquals("root@example.com:22/srv/projects/hobgoblin", candidate.target.id)
        assertEquals("Dev - /srv/projects/hobgoblin", candidate.targetLabel)
        assertEquals(discovery, candidate.discovery)
    }

    @Test
    fun `tmux catalog exposes only lifecycle actions that apply to the retained state`() {
        assertEquals(
            listOf(HostTmuxSessionAction.Open),
            hostTmuxSessionActions(null),
        )
        assertEquals(
            listOf(
                HostTmuxSessionAction.Close,
                HostTmuxSessionAction.Delete,
                HostTmuxSessionAction.Open,
            ),
            hostTmuxSessionActions(record(TerminalSessionStatus.Running)),
        )
        assertEquals(
            listOf(
                HostTmuxSessionAction.Reconnect,
                HostTmuxSessionAction.Delete,
                HostTmuxSessionAction.Open,
            ),
            hostTmuxSessionActions(record(TerminalSessionStatus.Disconnected)),
        )
    }

    @Test
    fun `tmux delete defaults to local retention semantics and exposes an explicit remote option`() {
        assertFalse(HostTmuxCloseRemoteOnDeleteDefault)

        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/tmux/TmuxScreen.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("TmuxScreen.kt not found")

        assertTrue(source.contains("onReconnectTmuxSession"))
        assertTrue(source.contains("onCloseTmuxSession"))
        assertTrue(source.contains("onDeleteTmuxSession"))
        assertTrue(source.contains("Checkbox("))
        assertTrue(source.contains("HostTmuxCloseRemoteOnDeleteDefault"))
        assertTrue(source.contains("R.string.host_tmux_close_remote_on_delete"))
        assertTrue(source.contains("R.string.host_tmux_close_remote_warning"))
        assertTrue(source.contains("terminalOverviewStatusText(retainedSession).resolve()"))
    }

    @Test
    fun `host tmux remote deletion is completed before the retained record is removed`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("HobgoblinAndroidApp.kt not found")

        assertTrue(source.contains("remoteTmuxSessionService.closeHostSession("))
        assertTrue(source.contains("onDeleteTmuxSession = { discovery, session, closeRemote ->"))
        assertTrue(source.contains("deleteRetainedTerminal(session.id)"))
        assertTrue(source.contains("hostTmuxRefreshNonce += 1"))
    }

    @Test
    fun `remote close failure blocks local tmux record deletion`() {
        requireHostTmuxRemoteCloseSuccess(RemoteTmuxCloseResult.Closed)
        requireHostTmuxRemoteCloseSuccess(RemoteTmuxCloseResult.Missing)

        val failure = runCatching {
            requireHostTmuxRemoteCloseSuccess(RemoteTmuxCloseResult.Failed("permission denied"))
        }.exceptionOrNull()

        assertEquals("permission denied", failure?.message)
    }

    private fun session(
        server: TmuxServerTarget,
        attachedClients: Int,
    ): HostDiscoveredTmuxSession = HostDiscoveredTmuxSession(
        server = server,
        identity = TmuxSessionIdentity(
            sessionName = "hobgoblin-v1-111111111111111111111111",
            initialPath = "/srv/projects/hobgoblin",
        ),
        terminalNumber = 1,
        attachedClients = attachedClients,
    )

    private fun record(status: TerminalSessionStatus): TerminalSessionRecord = TerminalSessionRecord(
        id = "session-1",
        hostId = "root@example.com:22/srv/projects/hobgoblin",
        repositoryId = null,
        remotePath = "/srv/projects/hobgoblin",
        targetLabel = "Dev - /srv/projects/hobgoblin",
        displayName = "terminal-1",
        terminalId = 1,
        tmuxIdentity = TmuxSessionIdentity(
            sessionName = "hobgoblin-v1-111111111111111111111111",
            initialPath = "/srv/projects/hobgoblin",
        ),
        tmuxServerTarget = TmuxServerTarget.Default,
        status = status,
        openedAt = 1L,
    )
}

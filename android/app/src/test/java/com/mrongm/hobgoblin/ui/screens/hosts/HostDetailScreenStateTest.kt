package com.mrongm.hobgoblin.ui.screens.hosts

import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.hostTmuxRecoveryCandidate
import com.mrongm.hobgoblin.navigation.AppRoute
import com.mrongm.hobgoblin.navigation.HostDetailTab
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.terminals.TmuxSessionIdentity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostDetailScreenStateTest {
    @Test
    fun `host card opens host detail on projects and only tmux tab requests a scan`() {
        val projects = hostDetailRoute("host-1")
        val tmux = AppRoute.HostDetail("host-1", HostDetailTab.Tmux)

        assertEquals(AppRoute.HostDetail("host-1", HostDetailTab.Projects), projects)
        assertFalse(hostDetailNeedsTmuxScan(projects))
        assertTrue(hostDetailNeedsTmuxScan(tmux))
    }

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
}

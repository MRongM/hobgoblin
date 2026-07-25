package dev.hobgoblin.android.navigation

import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TerminalSessionStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class AppRouteTest {
    @Test
    fun `ordinary launch starts on hosts`() {
        assertEquals(AppRoute.Hosts, initialMainRoute())
    }

    @Test
    fun `terminal route carries session identity from record`() {
        val record = TerminalSessionRecord(
            id = "session-1",
            hostId = "host-1",
            repositoryId = "repo-1",
            remotePath = "/srv/app",
            targetLabel = "App - /srv/app",
            status = TerminalSessionStatus.Running,
            openedAt = 100,
        )

        val route = AppRoute.terminal(record)

        assertEquals("host-1", route.hostId)
        assertEquals("/srv/app", route.remotePath)
        assertEquals("repo-1", route.repositoryId)
        assertEquals("session-1", route.terminalSessionId)
        assertEquals(false, route.returnToTerminals)
    }

    @Test
    fun `terminal route can return to the terminals tab`() {
        val record = TerminalSessionRecord(
            id = "session-1",
            hostId = "host-1",
            repositoryId = null,
            remotePath = "/",
            targetLabel = "Example host - /",
            status = TerminalSessionStatus.Running,
            openedAt = 100,
        )

        val route = AppRoute.terminal(record, returnToTerminals = true)

        assertEquals(true, route.returnToTerminals)
    }

    @Test
    fun `terminal opened from overview returns to terminals regardless of source`() {
        val temporary = AppRoute.Terminal(
            hostId = "host-1",
            returnToTerminals = true,
        )
        val project = AppRoute.Terminal(
            hostId = "host-1",
            remotePath = "/srv/app",
            repositoryId = "repo-1",
            returnToTerminals = true,
        )

        assertEquals(AppRoute.Terminals, terminalReturnRoute(temporary, resolvedHostId = "host-1", temporary = true))
        assertEquals(AppRoute.Terminals, terminalReturnRoute(project, resolvedHostId = "host-1", temporary = false))
    }

    @Test
    fun `terminal keeps existing return destinations outside overview`() {
        val temporary = AppRoute.Terminal(hostId = "host-1")
        val project = AppRoute.Terminal(
            hostId = "host-1",
            remotePath = "/srv/app-feature",
            repositoryId = "repo-1",
        )
        val hostTerminal = AppRoute.Terminal(hostId = "host-1", remotePath = "/srv")

        assertEquals(AppRoute.Hosts, terminalReturnRoute(temporary, resolvedHostId = "host-1", temporary = true))
        assertEquals(
            AppRoute.Repository("repo-1", terminalWorkspacePath = "/srv/app-feature"),
            terminalReturnRoute(project, resolvedHostId = "host-1", temporary = false),
        )
        assertEquals(
            AppRoute.EditHost("host-1"),
            terminalReturnRoute(hostTerminal, resolvedHostId = "host-1", temporary = false),
        )
    }

    @Test
    fun `host ports route carries host identity`() {
        val route = AppRoute.HostPorts("host-1")

        assertEquals("host-1", route.hostId)
    }
}

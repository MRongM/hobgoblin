package dev.hobgoblin.android.ui.screens.terminals

import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TerminalSessionStatus
import dev.hobgoblin.android.terminals.TmuxSessionIdentity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TerminalsScreenStateTest {
    @Test
    fun `terminal overview title prefers the retained display name`() {
        assertEquals("release shell", terminalOverviewTitle(record(displayName = "release shell", terminalId = 3)))
    }

    @Test
    fun `terminal overview title falls back to the terminal number`() {
        assertEquals("terminal-3", terminalOverviewTitle(record(displayName = "", terminalId = 3)))
    }

    @Test
    fun `host temporary terminal title has a stable fallback`() {
        assertEquals("Host terminal", terminalOverviewTitle(record(displayName = "", terminalId = null)))
    }

    @Test
    fun `terminal overview context uses the retained target label`() {
        assertEquals(
            "Example - /srv/example",
            terminalOverviewContext(record(targetLabel = "Example - /srv/example")),
        )
    }

    @Test
    fun `terminal overview status stays compact`() {
        assertEquals(
            "disconnected",
            terminalOverviewStatus(record(status = TerminalSessionStatus.Disconnected)),
        )
    }

    @Test
    fun `terminal overview identity summary shows native kind and short Android session id`() {
        assertEquals(
            "native · session 12345678",
            terminalSessionIdentitySummary(record(id = "12345678-90ab-cdef")),
        )
        assertEquals(
            "native · session short",
            terminalSessionIdentitySummary(record(id = "short")),
        )
    }

    @Test
    fun `terminal overview identity summary classifies retained tmux identity`() {
        assertEquals(
            "tmux · session abcdef12",
            terminalSessionIdentitySummary(
                record(id = "abcdef12-3456", tmuxIdentity = tmuxIdentity()),
            ),
        )
    }

    @Test
    fun `terminal overview exposes full tmux session name only for tmux records`() {
        val identity = tmuxIdentity()

        assertEquals(identity.sessionName, terminalSessionTmuxSessionName(record(tmuxIdentity = identity)))
        assertNull(terminalSessionTmuxSessionName(record()))
    }

    private fun record(
        id: String = "session-1",
        displayName: String = "",
        terminalId: Int? = 1,
        targetLabel: String = "Example - /srv/example",
        status: TerminalSessionStatus = TerminalSessionStatus.Running,
        tmuxIdentity: TmuxSessionIdentity? = null,
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = id,
        hostId = "host-1",
        repositoryId = terminalId?.let { "repo-1" },
        remotePath = if (terminalId == null) "/" else "/srv/example",
        targetLabel = targetLabel,
        displayName = displayName,
        terminalId = terminalId,
        repositoryRemotePath = terminalId?.let { "/srv/example" },
        tmuxIdentity = tmuxIdentity,
        status = status,
        openedAt = 100L,
    )

    private fun tmuxIdentity(): TmuxSessionIdentity = TmuxSessionIdentity(
        sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
        initialPath = "/srv/example",
    )
}

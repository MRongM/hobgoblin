package dev.hobgoblin.android.ui.screens.terminals

import dev.hobgoblin.android.terminals.TerminalSessionRecord
import dev.hobgoblin.android.terminals.TerminalSessionStatus
import org.junit.Assert.assertEquals
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

    private fun record(
        displayName: String = "",
        terminalId: Int? = 1,
        targetLabel: String = "Example - /srv/example",
        status: TerminalSessionStatus = TerminalSessionStatus.Running,
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = "session-1",
        hostId = "host-1",
        repositoryId = terminalId?.let { "repo-1" },
        remotePath = if (terminalId == null) "/" else "/srv/example",
        targetLabel = targetLabel,
        displayName = displayName,
        terminalId = terminalId,
        repositoryRemotePath = terminalId?.let { "/srv/example" },
        status = status,
        openedAt = 100L,
    )
}

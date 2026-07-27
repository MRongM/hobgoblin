package dev.hobgoblin.android.terminals

import dev.hobgoblin.android.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalNotificationFactoryTest {
    @Test
    fun `one running terminal notification uses singular count and target label`() {
        val content = TerminalNotificationFactory.contentFor(
            listOf(record(id = "terminal-1", label = "App - /srv/app", lastActivityAt = 200L)),
        )

        assertEquals(TerminalNotificationText(R.string.notification_terminals_running_one), content.title)
        assertEquals(TerminalNotificationText(R.string.common_value, listOf("App - /srv/app")), content.text)
        assertEquals("terminal-1", content.terminalSessionId)
    }

    @Test
    fun `multiple running terminals notification uses plural count`() {
        val content = TerminalNotificationFactory.contentFor(
            listOf(
                record(id = "terminal-1", label = "App - /srv/app", lastActivityAt = 200L),
                record(id = "terminal-2", label = "Api - /srv/api", lastActivityAt = 300L),
            ),
        )

        assertEquals(
            TerminalNotificationText(R.string.notification_terminals_running_many, listOf(2)),
            content.title,
        )
    }

    @Test
    fun `notification routes to first opened terminal`() {
        val content = TerminalNotificationFactory.contentFor(
            listOf(
                record(id = "terminal-1", label = "App - /srv/app", lastActivityAt = 500L),
                record(id = "terminal-2", label = "Api - /srv/api", lastActivityAt = 900L),
            ),
        )

        assertEquals(TerminalNotificationText(R.string.common_value, listOf("App - /srv/app")), content.text)
        assertEquals("terminal-1", content.terminalSessionId)
    }

    @Test
    fun `notification falls back to first opened running terminal`() {
        val content = TerminalNotificationFactory.contentFor(
            listOf(
                record(id = "terminal-1", label = "App - /srv/app", openedAt = 500L, lastActivityAt = null),
                record(id = "terminal-2", label = "Api - /srv/api", openedAt = 900L, lastActivityAt = null),
            ),
        )

        assertEquals(TerminalNotificationText(R.string.common_value, listOf("App - /srv/app")), content.text)
        assertEquals("terminal-1", content.terminalSessionId)
    }

    private fun record(
        id: String,
        label: String,
        openedAt: Long = 100L,
        lastActivityAt: Long?,
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = id,
        hostId = "host-1",
        repositoryId = "repo-1",
        remotePath = "/srv/app",
        targetLabel = label,
        status = TerminalSessionStatus.Running,
        openedAt = openedAt,
        lastActivityAt = lastActivityAt,
    )
}

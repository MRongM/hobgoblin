package com.mrongm.hobgoblin.ui.screens.terminals

import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxSessionIdentity
import com.mrongm.hobgoblin.ui.text.LocalizedText
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalsScreenStateTest {
    @Test
    fun `terminal overview title prefers the retained display name`() {
        assertEquals(
            LocalizedText(R.string.common_value, listOf("release shell")),
            terminalOverviewTitleText(record(displayName = "release shell", terminalId = 3)),
        )
    }

    @Test
    fun `terminal overview title falls back to the terminal number`() {
        assertEquals(
            LocalizedText(R.string.common_value, listOf("terminal-3")),
            terminalOverviewTitleText(record(displayName = "", terminalId = 3)),
        )
    }

    @Test
    fun `host temporary terminal title has a stable fallback`() {
        assertEquals(
            LocalizedText(R.string.terminals_host_terminal),
            terminalOverviewTitleText(record(displayName = "", terminalId = null)),
        )
    }

    @Test
    fun `terminal overview status stays compact`() {
        assertEquals(
            LocalizedText(R.string.terminal_status_disconnected),
            terminalOverviewStatusText(record(status = TerminalSessionStatus.Disconnected)),
        )
    }

    @Test
    fun `project terminal source resolves host project and branch directory`() {
        val source = terminalOverviewSource(
            session = record(
                hostId = "developer@example.com:2222/srv/example-feature",
                remotePath = "/srv/example-feature",
                repositoryRemotePath = "/srv/example",
            ),
            hosts = listOf(host()),
            repositories = listOf(repository()),
        )

        assertEquals(
            LocalizedText(R.string.terminals_context, listOf("Build host", "Example")),
            source.contextLabel,
        )
        assertEquals(LocalizedText(R.string.terminals_branch_directory), source.locationLabel)
        assertEquals("/srv/example-feature", source.path)
    }

    @Test
    fun `project terminal source identifies the project root`() {
        val source = terminalOverviewSource(
            session = record(remotePath = "/srv/example/", repositoryRemotePath = "/srv/example"),
            hosts = listOf(host()),
            repositories = listOf(repository()),
        )

        assertEquals(
            LocalizedText(R.string.terminals_context, listOf("Build host", "Example")),
            source.contextLabel,
        )
        assertEquals(LocalizedText(R.string.terminals_project_root), source.locationLabel)
        assertEquals("/srv/example", source.path)
    }

    @Test
    fun `temporary terminal source identifies its host directory`() {
        val source = terminalOverviewSource(
            session = record(
                terminalId = null,
                hostId = "developer@example.com:2222/var/log",
                remotePath = "/var/log",
            ),
            hosts = listOf(host()),
            repositories = listOf(repository()),
        )

        assertEquals(
            LocalizedText(
                R.string.terminals_context,
                listOf("Build host", LocalizedText(R.string.terminals_host_terminal)),
            ),
            source.contextLabel,
        )
        assertEquals(LocalizedText(R.string.terminals_host_directory), source.locationLabel)
        assertEquals("/var/log", source.path)
    }

    @Test
    fun `terminal overview identity summary shows native kind and short Android session id`() {
        assertEquals(
            LocalizedText(
                R.string.terminal_session_identity,
                listOf(LocalizedText(R.string.terminal_kind_native), "12345678"),
            ),
            terminalSessionIdentityText(record(id = "12345678-90ab-cdef")),
        )
        assertEquals(
            LocalizedText(
                R.string.terminal_session_identity,
                listOf(LocalizedText(R.string.terminal_kind_native), "short"),
            ),
            terminalSessionIdentityText(record(id = "short")),
        )
    }

    @Test
    fun `terminal overview identity summary classifies retained tmux identity`() {
        assertEquals(
            LocalizedText(
                R.string.terminal_session_identity,
                listOf(LocalizedText(R.string.terminal_kind_tmux), "abcdef12"),
            ),
            terminalSessionIdentityText(
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

    @Test
    fun `native terminal close confirmation explains stop and retention`() {
        val text = terminalOverviewCloseConfirmationText(record(displayName = "release shell"))

        assertEquals(R.string.terminals_close_native, text.resourceId)
        assertEquals(listOf(LocalizedText(R.string.common_value, listOf("release shell"))), text.formatArgs)
    }

    @Test
    fun `tmux terminal close confirmation keeps the remote tmux session`() {
        val text = terminalOverviewCloseConfirmationText(record(tmuxIdentity = tmuxIdentity()))

        assertEquals(R.string.terminals_close_tmux, text.resourceId)
    }

    @Test
    fun `terminal delete confirmation explains removal and tmux retention`() {
        val nativeText = terminalOverviewDeleteConfirmationText(record(displayName = "release shell"))
        val tmuxText = terminalOverviewDeleteConfirmationText(record(tmuxIdentity = tmuxIdentity()))

        assertEquals(R.string.terminals_delete_native, nativeText.resourceId)
        assertEquals(R.string.terminals_delete_tmux, tmuxText.resourceId)
    }

    @Test
    fun `deleting a terminal removes only its id from manual order`() {
        assertEquals(
            listOf("session-1", "session-3"),
            terminalOverviewOrderAfterDelete(
                orderedIds = listOf("session-1", "session-2", "session-3"),
                deletedId = "session-2",
            ),
        )
    }

    @Test
    fun `terminal overview exposes distinct confirmed close and delete actions`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/TerminalsScreen.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("TerminalsScreen.kt not found")

        assertTrue(source.contains("onReconnectTerminalSession"))
        assertTrue(source.contains("R.string.terminal_action_reconnect"))
        assertTrue(source.contains("enabled = terminalSessionReconnectAvailable(session)"))
        assertTrue(source.contains("onCloseTerminalSession"))
        assertTrue(source.contains("onDeleteTerminalSession"))
        assertTrue(source.contains("R.string.repository_terminal_close"))
        assertTrue(source.contains("R.string.common_delete"))
        assertTrue(source.contains("R.string.repository_delete_terminal_title"))
        assertTrue(source.contains("AlertDialog("))
    }

    @Test
    fun `terminal overview maps close and delete to distinct manager operations`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("HobgoblinAndroidApp.kt not found")

        assertTrue(source.contains("fun closeRetainedTerminal(sessionId: String)"))
        assertTrue(source.contains("terminalSessionManager.close(sessionId)"))
        assertTrue(source.contains("fun deleteRetainedTerminal(sessionId: String)"))
        assertTrue(source.contains("terminalSessionManager.removeSession(sessionId)"))
        assertTrue(source.contains("onCloseTerminalSession = ::closeRetainedTerminal"))
        assertTrue(source.contains("onDeleteTerminalSession = ::deleteRetainedTerminal"))
    }

    @Test
    fun `terminal items share one app level reconnect operation`() {
        val source = listOf(
            File("src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
        ).firstOrNull(File::isFile)?.readText() ?: error("HobgoblinAndroidApp.kt not found")

        assertTrue(source.contains("fun reconnectRetainedTerminal(session: TerminalSessionRecord)"))
        assertTrue(source.contains("val current = terminalSessionManager.session(session.id) ?: return"))
        assertTrue(source.contains("terminalSessionManager.reconnect("))
        assertEquals(2, source.split("onReconnectTerminalSession = ::reconnectRetainedTerminal").size - 1)
    }

    private fun record(
        id: String = "session-1",
        hostId: String = "host-1",
        displayName: String = "",
        terminalId: Int? = 1,
        remotePath: String = if (terminalId == null) "/" else "/srv/example",
        repositoryRemotePath: String? = terminalId?.let { "/srv/example" },
        status: TerminalSessionStatus = TerminalSessionStatus.Running,
        tmuxIdentity: TmuxSessionIdentity? = null,
    ): TerminalSessionRecord = TerminalSessionRecord(
        id = id,
        hostId = hostId,
        repositoryId = terminalId?.let { "repo-1" },
        remotePath = remotePath,
        targetLabel = "Example - $remotePath",
        displayName = displayName,
        terminalId = terminalId,
        repositoryRemotePath = repositoryRemotePath,
        tmuxIdentity = tmuxIdentity,
        status = status,
        openedAt = 100L,
    )

    private fun host(): SshHostProfile = SshHostProfile(
        id = "host-1",
        alias = "Build host",
        host = "example.com",
        user = "developer",
        port = 2222,
    )

    private fun repository(): RemoteRepositoryProfile = RemoteRepositoryProfile(
        id = "repo-1",
        hostProfileId = "host-1",
        alias = "Example",
        remotePath = "/srv/example",
    )

    private fun tmuxIdentity(): TmuxSessionIdentity = TmuxSessionIdentity(
        sessionName = "hobgoblin-v1-aebf050981ac829e36100020",
        initialPath = "/srv/example",
    )
}

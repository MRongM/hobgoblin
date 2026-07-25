package dev.hobgoblin.android.ui.screens.terminals

import dev.hobgoblin.android.domain.ssh.RemoteRepositoryProfile
import dev.hobgoblin.android.domain.ssh.SshHostProfile
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
    fun `terminal overview status stays compact`() {
        assertEquals(
            "disconnected",
            terminalOverviewStatus(record(status = TerminalSessionStatus.Disconnected)),
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

        assertEquals("Build host · Example", source.contextLabel)
        assertEquals("Branch directory", source.locationLabel)
        assertEquals("/srv/example-feature", source.path)
    }

    @Test
    fun `project terminal source identifies the project root`() {
        val source = terminalOverviewSource(
            session = record(remotePath = "/srv/example/", repositoryRemotePath = "/srv/example"),
            hosts = listOf(host()),
            repositories = listOf(repository()),
        )

        assertEquals("Build host · Example", source.contextLabel)
        assertEquals("Project root", source.locationLabel)
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

        assertEquals("Build host · Host terminal", source.contextLabel)
        assertEquals("Host directory", source.locationLabel)
        assertEquals("/var/log", source.path)
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

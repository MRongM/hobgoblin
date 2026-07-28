package com.mrongm.hobgoblin.ui.navigation

import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MainTabCountsTest {
    @Test
    fun `projects are counted by host`() {
        val repositories = listOf(
            repository(id = "repo-1", hostId = "host-1"),
            repository(id = "repo-2", hostId = "host-1"),
            repository(id = "repo-3", hostId = "host-2"),
        )

        assertEquals(
            mapOf("host-1" to 2, "host-2" to 1),
            projectCountsByHostId(repositories),
        )
    }

    @Test
    fun `only project-associated terminals are counted by project`() {
        val sessions = listOf(
            terminal(id = "session-1", repositoryId = "repo-1"),
            terminal(id = "session-2", repositoryId = "repo-1"),
            terminal(id = "session-3", repositoryId = "repo-2"),
            terminal(id = "temporary", repositoryId = null),
        )

        assertEquals(
            mapOf("repo-1" to 2, "repo-2" to 1),
            terminalCountsByProjectId(sessions),
        )
    }

    @Test
    fun `app derives and passes both main list count maps`() {
        val source = appSource()

        assertTrue(source.contains("projectCountsByHostId(currentRepositories())"))
        assertTrue(source.contains("terminalCountsByProjectId(terminalSessions)"))
        assertTrue(source.contains("projectCountByHostId = projectCountByHostId"))
        assertTrue(source.contains("terminalCountByProjectId = terminalCountByProjectId"))
    }

    private fun repository(id: String, hostId: String): RemoteRepositoryProfile =
        RemoteRepositoryProfile(
            id = id,
            hostProfileId = hostId,
            alias = id,
            remotePath = "/srv/$id",
        )

    private fun terminal(id: String, repositoryId: String?): TerminalSessionRecord =
        TerminalSessionRecord(
            id = id,
            hostId = "host-1",
            repositoryId = repositoryId,
            remotePath = "/srv/example",
            targetLabel = "Example",
            status = TerminalSessionStatus.Running,
            openedAt = 100L,
        )

    private fun appSource(): String = listOf(
        File("src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
        File("app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
        File("android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt"),
    ).firstOrNull(File::isFile)?.readText() ?: error("HobgoblinAndroidApp.kt not found")
}

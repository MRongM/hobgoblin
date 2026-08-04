package com.mrongm.hobgoblin.ui.screens.projects

import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.ui.text.LocalizedText
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectsScreenStateTest {
    @Test
    fun `empty projects copy describes workspace and terminal only`() {
        assertEquals(R.string.projects_empty_description, emptyProjectsDescriptionResource())
    }

    @Test
    fun `project item actions match hosts-style bottom action order`() {
        assertEquals(
            listOf(R.string.common_open, R.string.common_terminals, R.string.common_delete),
            projectActionLabelResources(),
        )
    }

    @Test
    fun `project terminal target uses repository id and root path`() {
        val repository = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "App",
            remotePath = "/srv/app",
        ).copy(id = "repo-1")

        val target = projectTerminalTarget(repository)

        assertEquals("repo-1", target.repositoryId)
        assertEquals("/srv/app", target.terminalWorkspacePath)
    }

    @Test
    fun `project kind labels distinguish git repositories and plain workspaces`() {
        val git = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "App",
            remotePath = "/srv/app",
        )
        val plain = RemoteRepositoryProfile.create(
            hostProfileId = "host-1",
            alias = "Scripts",
            remotePath = "/srv/scripts",
            kind = RemoteProjectKind.PlainWorkspace,
        )

        assertEquals(R.string.projects_git_repository, projectKindLabelResource(git))
        assertEquals(R.string.projects_plain_workspace, projectKindLabelResource(plain))
    }

    @Test
    fun `host filter keeps only projects assigned to the selected host`() {
        val hostOne = project(id = "repo-1", hostId = "host-1")
        val hostTwo = project(id = "repo-2", hostId = "host-2")

        assertEquals(
            listOf("repo-1"),
            projectsForHost(listOf(hostOne, hostTwo), hostId = "host-1").map { it.id },
        )
        assertEquals(listOf(hostOne, hostTwo), projectsForHost(listOf(hostOne, hostTwo), hostId = null))
        assertTrue(projectsForHost(listOf(hostOne, hostTwo), hostId = "missing").isEmpty())
    }

    @Test
    fun `filtered empty copy names the selected host`() {
        assertEquals(R.string.projects_filtered_empty_description, filteredProjectsDescriptionResource())
    }

    @Test
    fun `filtered projects cannot reorder hidden global items`() {
        assertTrue(projectReorderAvailable(hostFilterId = null))
        assertEquals(false, projectReorderAvailable(hostFilterId = "host-1"))
    }

    @Test
    fun `only local projects enter local reorder inputs`() {
        val projects = listOf(project(id = "repo-1", hostId = "host-1"))

        assertEquals(listOf("repo-1"), localProjectReorderIds(projects))
    }

    @Test
    fun `default project display order puts newest project first`() {
        val oldest = project(id = "oldest", hostId = "host-1", createdAt = 1_000L)
        val newest = project(id = "newest", hostId = "host-1", createdAt = 3_000L)
        val middle = project(id = "middle", hostId = "host-1", createdAt = 2_000L)

        val ordered = projectDisplayOrder(listOf(oldest, newest, middle), savedIds = emptyList())

        assertEquals(listOf("newest", "middle", "oldest"), ordered.map { it.id })
    }

    @Test
    fun `default project display order keeps unknown legacy projects last and stable`() {
        val legacyA = project(id = "legacy-a", hostId = "host-1")
        val known = project(id = "known", hostId = "host-1", createdAt = 1_000L)
        val legacyB = project(id = "legacy-b", hostId = "host-1")

        val ordered = projectDisplayOrder(listOf(legacyA, known, legacyB), savedIds = emptyList())

        assertEquals(listOf("known", "legacy-a", "legacy-b"), ordered.map { it.id })
    }

    @Test
    fun `stale saved project ids fall back to newest first default`() {
        val older = project(id = "older", hostId = "host-1", createdAt = 1_000L)
        val newer = project(id = "newer", hostId = "host-1", createdAt = 2_000L)

        val ordered = projectDisplayOrder(listOf(older, newer), savedIds = listOf("deleted"))

        assertEquals(listOf("newer", "older"), ordered.map { it.id })
    }

    @Test
    fun `saved project order wins and appends unseen projects`() {
        val oldest = project(id = "oldest", hostId = "host-1", createdAt = 1_000L)
        val middle = project(id = "middle", hostId = "host-1", createdAt = 2_000L)
        val newest = project(id = "newest", hostId = "host-1", createdAt = 3_000L)

        val ordered = projectDisplayOrder(
            repositories = listOf(oldest, middle, newest),
            savedIds = listOf("middle", "oldest"),
        )

        assertEquals(listOf("middle", "oldest", "newest"), ordered.map { it.id })
    }

    @Test
    fun `host filter preserves global project display order`() {
        val hostOneOlder = project(id = "host-1-older", hostId = "host-1", createdAt = 1_000L)
        val hostTwoNewest = project(id = "host-2-newest", hostId = "host-2", createdAt = 3_000L)
        val hostOneNewer = project(id = "host-1-newer", hostId = "host-1", createdAt = 2_000L)

        val ordered = projectDisplayOrder(
            listOf(hostOneOlder, hostTwoNewest, hostOneNewer),
            savedIds = emptyList(),
        )

        assertEquals(
            listOf("host-1-newer", "host-1-older"),
            projectsForHost(ordered, hostId = "host-1").map { it.id },
        )
    }

    @Test
    fun `unfiltered project list omits saved heading but filtered scope remains visible`() {
        val source = projectsScreenSource()

        assertFalse(source.contains("R.string.projects_saved_heading"))
        assertTrue(source.contains("R.string.projects_on_host"))
        assertTrue(source.contains("R.string.projects_show_all_short"))
    }

    @Test
    fun `project cards show localized terminal counts including zero`() {
        val source = projectsScreenSource()

        assertTrue(source.contains("terminalCountByProjectId: Map<String, Int> = emptyMap()"))
        assertTrue(source.contains("terminalCount = terminalCountByProjectId[repository.id] ?: 0"))
        assertTrue(source.contains("R.plurals.projects_terminal_count"))
    }

    @Test
    fun `project card title prefers saved host and falls back to host id`() {
        val project = project(id = "repo-1", hostId = "host-1")

        assertEquals("Build host", projectHostTitle(project, host()))
        assertEquals("host-1", projectHostTitle(project, host = null))
    }

    @Test
    fun `project secondary title keeps only a non-blank alias`() {
        assertEquals(
            "Application",
            projectSecondaryTitle(
                RemoteRepositoryProfile(
                    id = "repo-1",
                    hostProfileId = "host-1",
                    alias = "Application",
                    remotePath = "/srv/application",
                ),
            ),
        )
        assertNull(
            projectSecondaryTitle(
                RemoteRepositoryProfile(
                    id = "repo-2",
                    hostProfileId = "host-1",
                    alias = " ",
                    remotePath = "/srv/scripts",
                ),
            ),
        )
    }

    @Test
    fun `project created text distinguishes known and legacy times`() {
        assertEquals(
            LocalizedText(R.string.projects_created_at, listOf("5 minutes ago")),
            projectCreatedText("5 minutes ago"),
        )
        assertEquals(
            LocalizedText(R.string.projects_created_unknown),
            projectCreatedText(relativeTime = null),
        )
    }

    @Test
    fun `project cards show localized relative created time from stored timestamp`() {
        val source = projectsScreenSource()

        assertTrue(source.contains("DateUtils.getRelativeTimeSpanString"))
        assertTrue(source.contains("repository.createdAt?.let"))
        assertTrue(source.contains("DateUtils.MINUTE_IN_MILLIS"))
        assertTrue(source.contains("projectCreatedText(relativeTime).resolve()"))
    }

    @Test
    fun `project card highlights the full root directory`() {
        val source = projectsScreenSource()
        val pathText = source
            .substringAfter("Text(\n                repository.remotePath,")
            .substringBefore("\n            )")

        assertTrue(source.contains("projectHostTitle(repository, host)"))
        assertTrue(source.contains("projectSecondaryTitle(repository)?.let"))
        assertTrue(pathText.contains("color = MaterialTheme.colorScheme.primary"))
        assertTrue(pathText.contains("fontFamily = FontFamily.Monospace"))
        assertTrue(pathText.contains("fontWeight = FontWeight.SemiBold"))
        assertTrue(pathText.contains("softWrap = true"))
        assertFalse(pathText.contains("maxLines = 1"))
        assertFalse(pathText.contains("TextOverflow.Ellipsis"))
    }

    private fun project(
        id: String,
        hostId: String,
        createdAt: Long? = null,
    ): RemoteRepositoryProfile = RemoteRepositoryProfile(
        id = id,
        hostProfileId = hostId,
        alias = id,
        remotePath = "/srv/$id",
        createdAt = createdAt,
    )

    private fun host(): SshHostProfile = SshHostProfile(
        id = "host-1",
        alias = "Build host",
        host = "example.com",
        user = "developer",
        port = 22,
    )

    private fun projectsScreenSource(): String = listOf(
        File("src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt"),
        File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt"),
        File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/projects/ProjectsScreen.kt"),
    ).firstOrNull(File::isFile)?.readText() ?: error("ProjectsScreen.kt not found")
}

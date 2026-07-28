package com.mrongm.hobgoblin.ui.screens.projects

import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.workspace.RemoteConfiguredWorkspaceSnapshot
import org.junit.Assert.assertEquals
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
    fun `remote workspace catalog is visible only for a selected host`() {
        assertEquals(false, workspaceCatalogVisible(hostFilterId = null))
        assertTrue(workspaceCatalogVisible(hostFilterId = "host-1"))
    }

    @Test
    fun `workspace order remains remote owned and never enters local reorder inputs`() {
        val workspaces = listOf(
            RemoteConfiguredWorkspaceSnapshot("/srv/b", emptyList(), emptyList()),
            RemoteConfiguredWorkspaceSnapshot("/srv/a", emptyList(), emptyList()),
        )
        val projects = listOf(project(id = "repo-1", hostId = "host-1"))

        assertEquals(listOf("/srv/b", "/srv/a"), orderedWorkspaceRoots(workspaces))
        assertEquals(listOf("repo-1"), localProjectReorderIds(projects))
    }

    @Test
    fun `non empty workspace section prevents a full page filtered empty state`() {
        assertEquals(false, filteredPageIsEmpty(localProjects = 0, remoteWorkspaces = 1))
        assertTrue(filteredPageIsEmpty(localProjects = 0, remoteWorkspaces = 0))
    }

    private fun project(id: String, hostId: String): RemoteRepositoryProfile =
        RemoteRepositoryProfile.create(
            hostProfileId = hostId,
            alias = id,
            remotePath = "/srv/$id",
        ).copy(id = id)
}

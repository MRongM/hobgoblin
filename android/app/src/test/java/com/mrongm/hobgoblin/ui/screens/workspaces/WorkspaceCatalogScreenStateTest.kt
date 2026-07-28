package com.mrongm.hobgoblin.ui.screens.workspaces

import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceMemberSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceOperation
import com.mrongm.hobgoblin.domain.workspace.RemoteBranchWorkspaceSnapshot
import com.mrongm.hobgoblin.domain.workspace.RemotePathAvailability
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceTmuxGroup
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceTmuxLocation
import com.mrongm.hobgoblin.domain.workspace.RemoteWorkspaceTmuxTerminal
import com.mrongm.hobgoblin.terminals.TmuxSessionDescriptor
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkspaceCatalogScreenStateTest {
    @Test
    fun `repositories start collapsed and branch expansion keeps only one item`() {
        assertFalse(initialRepositoriesExpanded())
        assertEquals("auth", toggledExpandedBranch(current = null, selected = "auth"))
        assertEquals("search", toggledExpandedBranch(current = "auth", selected = "search"))
        assertEquals(null, toggledExpandedBranch(current = "search", selected = "search"))
    }

    @Test
    fun `terminal count and attention include unavailable paths and persisted operation`() {
        val branch = branchWorkspace(operation = RemoteBranchWorkspaceOperation.Repair)

        assertEquals(2, branchWorkspaceTerminalCount(branch))
        assertTrue(branchWorkspaceNeedsAttention(branch))
        assertTrue(branchWorkspaceNeedsAttention(branchWorkspace(rootAvailability = RemotePathAvailability.Unavailable)))
        assertFalse(branchWorkspaceNeedsAttention(branchWorkspace()))
    }

    @Test
    fun `terminal accessibility label includes branch location slot and exact path`() {
        val branch = branchWorkspace()
        val terminal = branch.terminalGroups[1].terminals.single()

        assertEquals(
            "feature/auth, api, terminal-2, /srv/product/hobgoblin-feature-auth/api",
            terminalAccessibilityLabel(
                branch = branch,
                location = RemoteWorkspaceTmuxLocation.Repository("api"),
                terminal = terminal,
                rootLabel = "Workspace root",
            ),
        )
    }

    private fun branchWorkspace(
        operation: RemoteBranchWorkspaceOperation? = null,
        rootAvailability: RemotePathAvailability = RemotePathAvailability.Available,
    ): RemoteBranchWorkspaceSnapshot {
        val rootPath = "/srv/product/hobgoblin-feature-auth"
        val rootTerminal = terminal("/srv/product", rootPath, 1)
        val memberTerminal = terminal("/srv/product/api", "$rootPath/api", 2)
        return RemoteBranchWorkspaceSnapshot(
            id = "auth",
            branch = "feature/auth",
            path = rootPath,
            operation = operation,
            rootAvailability = rootAvailability,
            members = listOf(
                RemoteBranchWorkspaceMemberSnapshot(
                    repositoryName = "api",
                    repositoryRootPath = "/srv/product/api",
                    worktreePath = "$rootPath/api",
                    progress = "complete",
                    availability = RemotePathAvailability.Available,
                ),
            ),
            terminalGroups = listOf(
                RemoteWorkspaceTmuxGroup(RemoteWorkspaceTmuxLocation.Root, listOf(rootTerminal)),
                RemoteWorkspaceTmuxGroup(RemoteWorkspaceTmuxLocation.Repository("api"), listOf(memberTerminal)),
            ),
        )
    }

    private fun terminal(projectRoot: String, path: String, number: Int): RemoteWorkspaceTmuxTerminal =
        RemoteWorkspaceTmuxTerminal(
            projectRoot = projectRoot,
            workingDirectory = path,
            terminalNumber = number,
            identity = requireNotNull(
                TmuxSessionProtocol.identity(TmuxSessionDescriptor(projectRoot, path, number)),
            ),
        )
}

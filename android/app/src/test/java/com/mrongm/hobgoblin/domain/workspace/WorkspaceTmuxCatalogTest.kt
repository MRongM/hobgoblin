package com.mrongm.hobgoblin.domain.workspace

import com.mrongm.hobgoblin.terminals.DiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.ScopedDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.TmuxDiscoveryScope
import com.mrongm.hobgoblin.terminals.TmuxSessionDescriptor
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkspaceTmuxCatalogTest {
    @Test
    fun `discovery scopes include workspace root configured repositories and retained members`() {
        val scopes = workspaceTmuxDiscoveryScopes(workspace())

        assertEquals(
            listOf(
                TmuxDiscoveryScope(Root, setOf(AuthPath, SearchPath)),
                TmuxDiscoveryScope("$Root/api", setOf("$AuthPath/api")),
                TmuxDiscoveryScope("$Root/web", setOf("$AuthPath/web")),
                TmuxDiscoveryScope("$Root/tools", setOf("$SearchPath/tools")),
            ),
            scopes,
        )
    }

    @Test
    fun `discoveries group by branch root and manifest member order while retaining empty groups`() {
        val workspace = workspace()
        val discoveries = listOf(
            discovery(Root, AuthPath, 2),
            discovery("$Root/api", "$AuthPath/api", 1),
            discovery("$Root/tools", "$SearchPath/tools", 3),
        )

        val projected = projectWorkspaceTmuxSessions(workspace, discoveries)
        val auth = projected.branchWorkspaces[0]
        val search = projected.branchWorkspaces[1]

        assertEquals(
            listOf(
                RemoteWorkspaceTmuxLocation.Root,
                RemoteWorkspaceTmuxLocation.Repository("api"),
                RemoteWorkspaceTmuxLocation.Repository("web"),
            ),
            auth.terminalGroups.map { it.location },
        )
        assertEquals(listOf(1, 1, 0), auth.terminalGroups.map { it.terminals.size })
        assertEquals(AuthPath, auth.terminalGroups[0].terminals.single().workingDirectory)
        assertEquals(RemotePathAvailability.Unavailable, auth.members[1].availability)
        assertEquals(listOf(0, 1), search.terminalGroups.map { it.terminals.size })
        assertEquals(3, search.terminalGroups[1].terminals.single().terminalNumber)
    }

    private fun workspace(): RemoteConfiguredWorkspaceSnapshot = RemoteConfiguredWorkspaceSnapshot(
        rootPath = Root,
        repositories = listOf(
            RemoteWorkspaceRepositorySnapshot("api", "$Root/api", RemotePathAvailability.Available),
            RemoteWorkspaceRepositorySnapshot("web", "$Root/web", RemotePathAvailability.Available),
        ),
        branchWorkspaces = listOf(
            RemoteBranchWorkspaceSnapshot(
                id = "auth",
                branch = "feature/auth",
                path = AuthPath,
                operation = null,
                rootAvailability = RemotePathAvailability.Available,
                members = listOf(
                    member("api", AuthPath, RemotePathAvailability.Available),
                    member("web", AuthPath, RemotePathAvailability.Unavailable),
                ),
            ),
            RemoteBranchWorkspaceSnapshot(
                id = "search",
                branch = "feature/search",
                path = SearchPath,
                operation = RemoteBranchWorkspaceOperation.Repair,
                rootAvailability = RemotePathAvailability.Unavailable,
                members = listOf(member("tools", SearchPath, RemotePathAvailability.Unavailable)),
            ),
        ),
    )

    private fun member(
        name: String,
        branchPath: String,
        availability: RemotePathAvailability,
    ): RemoteBranchWorkspaceMemberSnapshot = RemoteBranchWorkspaceMemberSnapshot(
        repositoryName = name,
        repositoryRootPath = "$Root/$name",
        worktreePath = "$branchPath/$name",
        progress = "complete",
        availability = availability,
    )

    private fun discovery(projectRoot: String, path: String, terminalNumber: Int): ScopedDiscoveredTmuxSession {
        val identity = requireNotNull(
            TmuxSessionProtocol.identity(TmuxSessionDescriptor(projectRoot, path, terminalNumber)),
        )
        return ScopedDiscoveredTmuxSession(
            projectRoot = projectRoot,
            discovery = DiscoveredTmuxSession(identity, terminalNumber),
        )
    }

    private companion object {
        const val Root = "/srv/product"
        const val AuthPath = "/srv/product/hobgoblin-feature-auth"
        const val SearchPath = "/srv/product/hobgoblin-feature-search"
    }
}

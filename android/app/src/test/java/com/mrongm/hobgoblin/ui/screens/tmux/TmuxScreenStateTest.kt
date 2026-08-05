package com.mrongm.hobgoblin.ui.screens.tmux

import com.mrongm.hobgoblin.domain.ResourceState
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectPathResolution
import com.mrongm.hobgoblin.navigation.AppRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TmuxScreenStateTest {
    @Test
    fun `tmux catalog snapshot keeps groups and project path identities coherent`() {
        val resolution = RemoteProjectPathResolution(
            requestedPath = "/srv/app-feature",
            kind = RemoteProjectKind.GitRepository,
            projectPath = "/srv/app",
            worktreePath = "/srv/app-feature",
        )

        val snapshot = HostTmuxCatalogSnapshot(
            groups = emptyList(),
            projectPathResolutions = mapOf(resolution.requestedPath to resolution),
        )

        assertTrue(snapshot.groups.isEmpty())
        assertEquals(resolution, snapshot.projectPathResolutions.getValue("/srv/app-feature"))
    }

    @Test
    fun `entering tmux always starts with an explicit host choice`() {
        assertEquals(AppRoute.Tmux(selectedHostId = null), tmuxRoute())
        assertEquals(AppRoute.Tmux(selectedHostId = null), tmuxRoute())
        assertFalse(tmuxNeedsScan(tmuxRoute()))
    }

    @Test
    fun `selecting a host normalizes its id and enables scanning`() {
        val selected = selectTmuxHost(" host-1 ")

        assertEquals(AppRoute.Tmux(selectedHostId = "host-1"), selected)
        assertTrue(tmuxNeedsScan(selected))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `blank host id cannot start a tmux scan`() {
        selectTmuxHost("   ")
    }

    @Test
    fun `only the selected host can project a tmux snapshot`() {
        val loaded = ResourceState.Loaded(listOf("session-1"), loadedAtMillis = 100L)

        assertEquals(
            loaded,
            tmuxStateForHost(
                selectedHostId = "host-1",
                stateHostId = "host-1",
                state = loaded,
            ),
        )
        assertEquals(
            ResourceState.Idle,
            tmuxStateForHost(
                selectedHostId = "host-2",
                stateHostId = "host-1",
                state = loaded,
            ),
        )
        assertEquals(
            ResourceState.Idle,
            tmuxStateForHost(
                selectedHostId = null,
                stateHostId = "host-1",
                state = loaded,
            ),
        )
    }

    @Test
    fun `an old scan cannot clear the new hosts refresh indicator`() {
        assertFalse(
            tmuxScanOwnsRefreshIndicator(
                currentRoute = AppRoute.Tmux(selectedHostId = "host-2"),
                scanHostId = "host-1",
            ),
        )
        assertTrue(
            tmuxScanOwnsRefreshIndicator(
                currentRoute = AppRoute.Tmux(selectedHostId = "host-1"),
                scanHostId = "host-1",
            ),
        )
        assertTrue(
            tmuxScanOwnsRefreshIndicator(
                currentRoute = AppRoute.Terminals,
                scanHostId = "host-1",
            ),
        )
    }
}

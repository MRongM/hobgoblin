package com.mrongm.hobgoblin.ui.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MainTabBarTest {
    @Test
    fun `shouldSwitchMainTab ignores reselecting the active tab`() {
        assertFalse(shouldSwitchMainTab(MainTab.Hosts, MainTab.Hosts))
        assertFalse(shouldSwitchMainTab(MainTab.Projects, MainTab.Projects))
        assertFalse(shouldSwitchMainTab(MainTab.Tmux, MainTab.Tmux))
        assertFalse(shouldSwitchMainTab(MainTab.Terminals, MainTab.Terminals))
    }

    @Test
    fun `main tabs expose hosts tmux terminals and projects in navigation order`() {
        assertEquals(
            listOf(MainTab.Hosts, MainTab.Tmux, MainTab.Terminals, MainTab.Projects),
            MainTab.entries,
        )
    }

    @Test
    fun `shouldSwitchMainTab allows switching between all tabs`() {
        assertTrue(shouldSwitchMainTab(MainTab.Hosts, MainTab.Projects))
        assertTrue(shouldSwitchMainTab(MainTab.Projects, MainTab.Hosts))
        assertTrue(shouldSwitchMainTab(MainTab.Projects, MainTab.Tmux))
        assertTrue(shouldSwitchMainTab(MainTab.Tmux, MainTab.Terminals))
    }

    @Test
    fun `main tabs use semantic icons`() {
        assertEquals(MainTabIconKind.Host, mainTabIconKind(MainTab.Hosts))
        assertEquals(MainTabIconKind.Folder, mainTabIconKind(MainTab.Projects))
        assertEquals(MainTabIconKind.Multiplexer, mainTabIconKind(MainTab.Tmux))
        assertEquals(MainTabIconKind.Terminal, mainTabIconKind(MainTab.Terminals))
    }

    @Test
    fun `main tab swipes follow navigation order without wrapping`() {
        assertEquals(MainTab.Tmux, mainTabAfterSwipe(MainTab.Hosts, MainTabSwipeDirection.Next))
        assertEquals(MainTab.Terminals, mainTabAfterSwipe(MainTab.Tmux, MainTabSwipeDirection.Next))
        assertEquals(MainTab.Projects, mainTabAfterSwipe(MainTab.Terminals, MainTabSwipeDirection.Next))
        assertNull(mainTabAfterSwipe(MainTab.Projects, MainTabSwipeDirection.Next))

        assertEquals(MainTab.Terminals, mainTabAfterSwipe(MainTab.Projects, MainTabSwipeDirection.Previous))
        assertEquals(MainTab.Tmux, mainTabAfterSwipe(MainTab.Terminals, MainTabSwipeDirection.Previous))
        assertEquals(MainTab.Hosts, mainTabAfterSwipe(MainTab.Tmux, MainTabSwipeDirection.Previous))
        assertNull(mainTabAfterSwipe(MainTab.Hosts, MainTabSwipeDirection.Previous))
    }
}

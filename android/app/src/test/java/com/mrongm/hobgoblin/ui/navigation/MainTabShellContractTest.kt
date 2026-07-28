package com.mrongm.hobgoblin.ui.navigation

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainTabShellContractTest {
    @Test
    fun `main shell mounts tmux between projects and terminals`() {
        val source = source("ui/navigation/MainTabShell.kt")
        val panes = source.substringAfter(") { padding ->")

        assertTrue(source.contains("tmuxContent: @Composable () -> Unit"))
        assertTrue(panes.indexOf("MainTab.Projects") < panes.indexOf("MainTab.Tmux"))
        assertTrue(panes.indexOf("MainTab.Tmux") < panes.indexOf("MainTab.Terminals"))
        assertTrue(source.contains("content = tmuxContent"))
    }

    @Test
    fun `app owns selected host scanning outside host detail`() {
        val source = source("HobgoblinAndroidApp.kt")

        assertTrue(source.contains("tmuxNeedsScan("))
        assertTrue(source.contains("tmuxStateForHost("))
        assertTrue(source.contains("TmuxScreen("))
        assertTrue(source.contains("tmuxReturn = TmuxReturn(host.id)"))
        assertFalse(source.contains("hostDetailNeedsTmuxScan"))
        assertFalse(source.contains("HostDetailTab"))
    }

    private fun source(relativePath: String): String = listOf(
        File("src/main/java/com/mrongm/hobgoblin/$relativePath"),
        File("app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
        File("android/app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
    ).firstOrNull(File::isFile)?.readText() ?: error("$relativePath not found")
}

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

    @Test
    fun `settings remains the rightmost top bar action`() {
        val source = source("ui/navigation/MainTabShell.kt")
        val actions = source
            .substringAfter("actions = {")
            .substringBefore("bottomBar = {")

        assertTrue(
            actions.indexOf("R.string.navigation_add_host") <
                actions.indexOf("R.string.navigation_settings"),
        )
        assertTrue(
            actions.indexOf("R.string.navigation_add_project") <
                actions.indexOf("R.string.navigation_settings"),
        )
    }

    @Test
    fun `main top app bar uses an explicit compact height`() {
        val source = source("ui/navigation/MainTabShell.kt")

        assertTrue(source.contains("private val MainTopAppBarHeight = 48.dp"))
        assertTrue(source.contains("expandedHeight = MainTopAppBarHeight"))
    }

    private fun source(relativePath: String): String = listOf(
        File("src/main/java/com/mrongm/hobgoblin/$relativePath"),
        File("app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
        File("android/app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
    ).firstOrNull(File::isFile)?.readText() ?: error("$relativePath not found")
}

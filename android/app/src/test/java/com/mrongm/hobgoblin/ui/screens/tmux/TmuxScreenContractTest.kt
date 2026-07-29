package com.mrongm.hobgoblin.ui.screens.tmux

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TmuxScreenContractTest {
    @Test
    fun `tmux is a select first main screen with an inline host switcher`() {
        val source = source("ui/screens/tmux/TmuxScreen.kt")

        assertTrue(source.contains("fun TmuxScreen("))
        assertTrue(source.contains("onSelectHost"))
        assertTrue(source.contains("onAddHost"))
        assertFalse(source.contains("R.string.tmux_choose_host_title"))
        assertFalse(source.contains("R.string.tmux_choose_host_description"))
        assertTrue(source.contains("R.string.tmux_change_host"))
        assertTrue(source.contains("DropdownMenu("))
        assertTrue(source.contains("DropdownMenuItem("))
        assertTrue(source.contains("enabled = host.id != selectedHost.id"))
        assertTrue(source.contains("onSelectHost(host.id)"))
        assertFalse(source.contains("onChangeHost"))
        assertTrue(source.contains("R.string.common_retry"))
        assertTrue(source.contains("PullToRefreshBox("))
    }

    @Test
    fun `tmux directory heading exposes an explicit project import action`() {
        val source = source("ui/screens/tmux/TmuxScreen.kt")

        assertTrue(source.contains("onImportDirectory"))
        assertTrue(source.contains("hostTmuxPathIsImported"))
        assertTrue(source.contains("R.string.tmux_import_project"))
        assertTrue(source.contains("R.string.tmux_project_imported"))
    }

    @Test
    fun `tmux directory import reuses project setup with its return context`() {
        val source = source("HobgoblinAndroidApp.kt")

        assertTrue(source.contains("initialHostId = hostId"))
        assertTrue(source.contains("initialRemotePath = initialPath"))
        assertTrue(source.contains("tmuxReturn = TmuxReturn(hostId)"))
        assertTrue(source.contains("projectSetupReturnRoute(currentRoute)"))
        assertTrue(source.contains("initialHostId = currentRoute.initialHostId"))
        assertTrue(source.contains("initialRemotePath = currentRoute.initialRemotePath"))
    }

    @Test
    fun `tmux technical identity uses monospace and a purposeful mux rail`() {
        val source = source("ui/screens/tmux/TmuxScreen.kt")

        assertTrue(source.contains("FontFamily.Monospace"))
        assertTrue(source.contains("MuxRailWidth"))
        assertTrue(source.contains("HobgoblinColors.MuxCopper"))
        assertTrue(source.contains("HobgoblinColors.RelayTeal"))
    }

    @Test
    fun `host detail is a single project surface without nested tmux tabs`() {
        val source = source("ui/screens/hosts/HostDetailScreen.kt")

        assertTrue(source.contains("fun HostDetailScreen("))
        assertTrue(source.contains("projectsContent"))
        assertFalse(source.contains("PrimaryTabRow"))
        assertFalse(source.contains("HostTmuxCatalog"))
        assertFalse(source.contains("onRefreshTmux"))
    }

    private fun source(relativePath: String): String = listOf(
        File("src/main/java/com/mrongm/hobgoblin/$relativePath"),
        File("app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
        File("android/app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
    ).firstOrNull(File::isFile)?.readText() ?: error("$relativePath not found")
}

package com.mrongm.hobgoblin.ui.components

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManualReorderScreenContractTest {
    @Test
    fun `manually ordered Android item rows expose the shared reorder handle`() {
        val root = File("src/main/java/com/mrongm/hobgoblin/ui/screens")
        val sources = listOf(
            root.resolve("hosts/HostsScreen.kt"),
            root.resolve("projects/ProjectsScreen.kt"),
            root.resolve("repositories/RepositorySetupScreen.kt"),
        )

        sources.forEach { source ->
            assertTrue("${source.name} must use ManualReorderHandle", source.readText().contains("ManualReorderHandle("))
        }

        assertFalse(
            root.resolve("terminals/TerminalsScreen.kt").readText().contains("ManualReorderHandle("),
        )
    }
}

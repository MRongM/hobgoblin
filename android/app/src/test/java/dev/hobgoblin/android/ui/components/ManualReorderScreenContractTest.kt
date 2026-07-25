package dev.hobgoblin.android.ui.components

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class ManualReorderScreenContractTest {
    @Test
    fun `all requested Android item rows expose the shared reorder handle`() {
        val root = File("src/main/java/dev/hobgoblin/android/ui/screens")
        val sources = listOf(
            root.resolve("hosts/HostsScreen.kt"),
            root.resolve("projects/ProjectsScreen.kt"),
            root.resolve("terminals/TerminalsScreen.kt"),
            root.resolve("repositories/RepositorySetupScreen.kt"),
        )

        sources.forEach { source ->
            assertTrue("${source.name} must use ManualReorderHandle", source.readText().contains("ManualReorderHandle("))
        }
    }
}

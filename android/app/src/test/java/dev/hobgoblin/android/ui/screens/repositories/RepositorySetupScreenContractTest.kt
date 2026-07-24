package dev.hobgoblin.android.ui.screens.repositories

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class RepositorySetupScreenContractTest {
    @Test
    fun `project terminal rows render shared terminal identity details`() {
        val source = repositorySetupScreenSource()

        assertTrue(source.contains("TerminalSessionIdentityDetails(session = session)"))
    }

    @Test
    fun `remote ssh terminal panel exposes guarded tmux scan action`() {
        val source = repositorySetupScreenSource()

        assertTrue(source.contains("onClick = onScanTmux"))
        assertTrue(source.contains("enabled = tmuxScanEnabled"))
        assertTrue(source.contains("tmuxScanButtonLabel(tmuxScanPending)"))
    }

    private fun repositorySetupScreenSource(): String {
        val candidates = listOf(
            File("src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt"),
            File("app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt"),
            File("android/app/src/main/java/dev/hobgoblin/android/ui/screens/repositories/RepositorySetupScreen.kt"),
        )
        return candidates.firstOrNull { it.isFile }?.readText()
            ?: error("RepositorySetupScreen.kt not found from ${File(".").absolutePath}")
    }
}

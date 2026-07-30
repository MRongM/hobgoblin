package com.mrongm.hobgoblin.ui.screens.repositories

import java.io.File
import org.junit.Assert.assertFalse
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
        assertTrue(source.contains("tmuxScanButtonText(tmuxScanPending).resolve()"))
    }

    @Test
    fun `repository workspace no longer composes the branches panel`() {
        val source = repositorySetupScreenSource()

        assertFalse(source.contains("RepositoryBranchesPanel("))
    }

    @Test
    fun `worktree actions expose both merge directions through the merge dialog`() {
        val source = repositorySetupScreenSource()
        val dialog = androidSource(
            "com/mrongm/hobgoblin/ui/screens/repositories/WorktreeMergeDialog.kt",
        )

        assertTrue(source.contains("WorktreeMergeDialog("))
        assertTrue(source.contains("onMergeInto ="))
        assertTrue(source.contains("onMergeOut ="))
        assertTrue(source.contains("onRequestMergeInto"))
        assertTrue(source.contains("onRequestMergeOut"))
        assertTrue(source.contains("canMergeInto = evaluateMergeDestination(worktree).allowed,"))
        assertTrue(source.contains("var mergeError"))
        assertTrue(source.contains("error = mergeError"))
        assertTrue(source.contains("reprojectWorktreeMergeRequest("))
        assertTrue(dialog.contains("error: String?"))
    }

    @Test
    fun `application wires both worktree merge directions to the ssh service`() {
        val activity = androidSource("com/mrongm/hobgoblin/MainActivity.kt")
        val application = androidSource("com/mrongm/hobgoblin/HobgoblinAndroidApp.kt")

        assertTrue(activity.contains("RemoteWorktreeMergeService("))
        assertTrue(activity.contains("remoteWorktreeMergeService = remoteWorktreeMergeService"))
        assertTrue(application.contains("remoteWorktreeMergeService: RemoteWorktreeMergeService"))
        assertTrue(application.contains("remoteWorktreeMergeService.mergeInto("))
        assertTrue(application.contains("remoteWorktreeMergeService.mergeOut("))
    }

    private fun repositorySetupScreenSource(): String {
        val candidates = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/repositories/RepositorySetupScreen.kt"),
        )
        return candidates.firstOrNull { it.isFile }?.readText()
            ?: error("RepositorySetupScreen.kt not found from ${File(".").absolutePath}")
    }

    private fun androidSource(relativePath: String): String {
        val candidates = listOf(
            File("src/main/java", relativePath),
            File("app/src/main/java", relativePath),
            File("android/app/src/main/java", relativePath),
        )
        return candidates.firstOrNull { it.isFile }?.readText()
            ?: error("$relativePath not found from ${File(".").absolutePath}")
    }
}

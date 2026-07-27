package com.mrongm.hobgoblin.ui.screens.addhost

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class AddHostConnectionTestContractTest {
    @Test
    fun `newly initialized identities expose an inline connection test`() {
        val source = sourceFile(
            "src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
        )

        assertTrue(source.contains("onRunDiagnostics: (SshHostProfile) -> DiagnosticsResult"))
        assertTrue(source.contains("initializedIdentityRefId != null"))
        assertTrue(source.contains("R.string.host_test_connection"))
        assertTrue(source.contains("lastDiagnosticStatus"))
    }

    @Test
    fun `app wiring reuses host diagnostics for the draft profile`() {
        val source = sourceFile(
            "src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
            "app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
            "android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
        )

        assertTrue(
            source.contains("diagnosticsService.runDiagnostics(RemoteTarget.fromHostProfile(input))"),
        )
    }

    @Test
    fun `saved host diagnostics are rendered inside edit host`() {
        val source = sourceFile(
            "src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
        )

        assertTrue(source.contains("shouldShowSavedHostDiagnostics(initialHost)"))
        assertTrue(source.contains("HostDiagnosticsContent("))
    }

    private fun sourceFile(vararg paths: String): String {
        val source = paths.map(::File).firstOrNull { it.isFile }
            ?: error("Source file not found from ${File(".").absolutePath}: ${paths.joinToString()}")
        return source.readText()
    }
}

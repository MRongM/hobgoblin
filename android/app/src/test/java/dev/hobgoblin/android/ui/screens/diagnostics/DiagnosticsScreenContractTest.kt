package dev.hobgoblin.android.ui.screens.diagnostics

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Test

class DiagnosticsScreenContractTest {
    @Test
    fun `diagnostics screen never exposes password based SSH initialization`() {
        val source = diagnosticsScreenSource()

        listOf(
            "Temporary password",
            "onCheckSshInitialization",
            "onInitializeSshAccess",
            "SshInitializationCard",
        ).forEach { forbidden ->
            assertFalse(
                "DiagnosticsScreen must not expose $forbidden",
                source.contains(forbidden),
            )
        }
    }

    private fun diagnosticsScreenSource(): String {
        val candidates = listOf(
            File("src/main/java/dev/hobgoblin/android/ui/screens/diagnostics/DiagnosticsScreen.kt"),
            File("app/src/main/java/dev/hobgoblin/android/ui/screens/diagnostics/DiagnosticsScreen.kt"),
            File("android/app/src/main/java/dev/hobgoblin/android/ui/screens/diagnostics/DiagnosticsScreen.kt"),
        )
        val source = candidates.firstOrNull { it.isFile }
            ?: error("DiagnosticsScreen.kt not found from ${File(".").absolutePath}")
        return source.readText()
    }
}

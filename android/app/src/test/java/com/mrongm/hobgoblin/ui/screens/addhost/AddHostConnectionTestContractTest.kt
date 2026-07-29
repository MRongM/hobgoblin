package com.mrongm.hobgoblin.ui.screens.addhost

import java.io.File
import org.junit.Assert.assertFalse
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

    @Test
    fun `edit host exports private keys through a confirmed document flow`() {
        val screenSource = sourceFile(
            "src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
        )
        val appSource = sourceFile(
            "src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
            "app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
            "android/app/src/main/java/com/mrongm/hobgoblin/HobgoblinAndroidApp.kt",
        )
        val addHostWiring = appSource
            .substringAfter("AppRoute.AddHost ->")
            .substringBefore("is AppRoute.EditHost")
        val editHostWiring = appSource
            .substringAfter("is AppRoute.EditHost")
            .substringBefore("is AppRoute.HostPorts")

        assertTrue(screenSource.contains("onExportPrivateKey: ((String, OutputStream) -> Unit)? = null"))
        assertTrue(screenSource.contains("ActivityResultContracts.CreateDocument(\"application/octet-stream\")"))
        assertTrue(screenSource.contains("R.string.host_export_private_key_confirmation_title"))
        assertTrue(screenSource.contains("canExportPrivateKey("))
        assertFalse(addHostWiring.contains("onExportPrivateKey ="))
        assertTrue(editHostWiring.contains("onExportPrivateKey ="))
        assertTrue(editHostWiring.contains("secureIdentityStore.exportPrivateKey(identityId, output)"))
    }

    @Test
    fun `private key import and export actions share one equal-width row`() {
        val source = sourceFile(
            "src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
            "android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/addhost/AddHostScreen.kt",
        )

        assertTrue(source.contains("private fun PrivateKeyActions("))
        val actions = source
            .substringAfter("private fun PrivateKeyActions(")
            .substringBefore("private fun SshInitializationSection(")
        assertTrue(actions.contains("Row("))
        assertTrue(actions.contains("R.string.host_import_private_key"))
        assertTrue(actions.contains("R.string.host_export_private_key"))
        assertTrue(Regex("Modifier\\.weight\\(1f\\)").findAll(actions).count() == 2)
    }

    private fun sourceFile(vararg paths: String): String {
        val source = paths.map(::File).firstOrNull { it.isFile }
            ?: error("Source file not found from ${File(".").absolutePath}: ${paths.joinToString()}")
        return source.readText()
    }
}

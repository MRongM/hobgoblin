package com.mrongm.hobgoblin.ui.screens.settings

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsPrivacyPolicyContractTest {
    @Test
    fun `settings exposes the canonical privacy policy through the platform URI handler`() {
        val source = settingsSource()

        assertTrue(source.contains("LocalUriHandler.current"))
        assertTrue(source.contains("uriHandler.openUri(PrivacyPolicy.url)"))
        assertTrue(source.contains("R.string.settings_privacy_policy"))
    }

    private fun settingsSource(): String {
        val candidates = listOf(
            File("src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt"),
            File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/settings/SettingsScreen.kt"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("SettingsScreen.kt not found from ${File(".").absolutePath}")
    }
}

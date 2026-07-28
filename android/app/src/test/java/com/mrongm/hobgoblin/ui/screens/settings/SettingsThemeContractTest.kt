package com.mrongm.hobgoblin.ui.screens.settings

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsThemeContractTest {
    @Test
    fun `settings stages all Web color themes and Android appearance modes`() {
        val source = settingsSource()

        assertTrue(source.contains("initialApplicationTheme: AndroidApplicationTheme"))
        assertTrue(source.contains("selectedAppearance"))
        assertTrue(source.contains("selectedColorTheme"))
        assertTrue(source.contains("AndroidAppearancePreference.entries.forEach"))
        assertTrue(source.contains("AndroidColorTheme.entries.forEach"))
        assertTrue(source.contains("R.string.settings_theme"))
        assertTrue(source.contains("R.string.settings_appearance"))
        assertTrue(source.windowed("ExposedDropdownMenuBox(".length).count { it == "ExposedDropdownMenuBox(" } >= 3)
    }

    @Test
    fun `theme changes participate in the existing explicit save flow`() {
        val source = settingsSource()

        assertTrue(source.contains("selectedAppearance != initialApplicationTheme.appearance"))
        assertTrue(source.contains("selectedColorTheme != initialApplicationTheme.colorTheme"))
        assertTrue(source.contains("AndroidApplicationTheme("))
        assertTrue(source.contains("appearance = selectedAppearance"))
        assertTrue(source.contains("colorTheme = selectedColorTheme"))
        assertTrue(source.contains("onSave("))
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

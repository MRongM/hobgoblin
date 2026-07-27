package dev.hobgoblin.android.ui.screens.terminals

import dev.hobgoblin.android.R
import dev.hobgoblin.android.data.TerminalAppearance
import dev.hobgoblin.android.ui.text.LocalizedText
import dev.hobgoblin.android.data.terminalAppearance
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TerminalAppearanceTest {
    @Test
    fun `persisted appearance parses known values and falls back to dark`() {
        assertEquals(TerminalAppearance.Light, terminalAppearance("light"))
        assertEquals(TerminalAppearance.Dark, terminalAppearance("dark"))
        assertEquals(TerminalAppearance.Dark, terminalAppearance(null))
        assertEquals(TerminalAppearance.Dark, terminalAppearance("unknown"))
    }

    @Test
    fun `appearance toggle names the destination and alternates`() {
        assertEquals(LocalizedText(R.string.terminal_appearance_light), terminalAppearanceToggleText(TerminalAppearance.Dark))
        assertEquals(LocalizedText(R.string.terminal_appearance_dark), terminalAppearanceToggleText(TerminalAppearance.Light))
        assertEquals(TerminalAppearance.Light, nextTerminalAppearance(TerminalAppearance.Dark))
        assertEquals(TerminalAppearance.Dark, nextTerminalAppearance(TerminalAppearance.Light))
    }

    @Test
    fun `dark terminal palette uses the cold graphite design tokens`() {
        val palette = terminalPalette(TerminalAppearance.Dark)

        assertEquals(0xFF0A0E12.toInt(), palette.backgroundArgb)
        assertEquals(0xFFE7EDF3.toInt(), palette.foregroundArgb)
        assertEquals(0xFF121820.toInt(), palette.surfaceArgb)
        assertEquals(0xFF293544.toInt(), palette.dividerArgb)
        assertEquals(0xFF65B9FF.toInt(), palette.actionArgb)
        assertEquals(16, palette.ansiArgb.size)
    }

    @Test
    fun `light terminal palette uses readable ink on mist canvas`() {
        val palette = terminalPalette(TerminalAppearance.Light)

        assertEquals(0xFFF3F6F8.toInt(), palette.backgroundArgb)
        assertEquals(0xFF17212B.toInt(), palette.foregroundArgb)
        assertEquals(0xFFE7EDF2.toInt(), palette.surfaceArgb)
        assertEquals(0xFFC4CFD8.toInt(), palette.dividerArgb)
        assertEquals(0xFF246EA8.toInt(), palette.actionArgb)
        assertEquals(16, palette.ansiArgb.size)
    }

    @Test
    fun `terminal view applies appearance to termux indexed and special colors`() {
        val source = sourceFile("ui/screens/terminals/HobgoblinTerminalView.kt")

        assertTrue(source.contains("fun setTerminalAppearance("))
        assertTrue(source.contains("TextStyle.COLOR_INDEX_FOREGROUND"))
        assertTrue(source.contains("TextStyle.COLOR_INDEX_BACKGROUND"))
        assertTrue(source.contains("TextStyle.COLOR_INDEX_CURSOR"))
    }

    @Test
    fun `terminal settings store persists appearance independently from app theme`() {
        val source = sourceFile("data/TerminalSettingsStore.kt")

        assertTrue(source.contains("fun loadTerminalAppearance()"))
        assertTrue(source.contains("fun setTerminalAppearance("))
        assertTrue(source.contains("terminal_appearance"))
    }

    private fun sourceFile(relativePath: String): String {
        val candidates = listOf(
            File("src/main/java/dev/hobgoblin/android/$relativePath"),
            File("app/src/main/java/dev/hobgoblin/android/$relativePath"),
            File("android/app/src/main/java/dev/hobgoblin/android/$relativePath"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Source not found: $relativePath")
    }
}

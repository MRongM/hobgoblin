package com.mrongm.hobgoblin.ui.screens.terminals

import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.data.TerminalAppearance
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.mrongm.hobgoblin.data.terminalAppearance
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
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
        assertEquals(0xFF223044.toInt(), palette.inputBackgroundArgb)
        assertEquals(0xFFF7FAFC.toInt(), palette.inputForegroundArgb)
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
        assertEquals(0xFFFFFFFF.toInt(), palette.inputBackgroundArgb)
        assertEquals(0xFF111820.toInt(), palette.inputForegroundArgb)
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

    @Test
    fun `command input colors preserve readable text and a distinct boundary`() {
        TerminalAppearance.entries.forEach { appearance ->
            val palette = terminalPalette(appearance)

            assertTrue(contrastRatio(palette.inputForegroundArgb, palette.inputBackgroundArgb) >= 7.0)
            assertTrue(contrastRatio(palette.actionArgb, palette.surfaceArgb) >= 3.0)
        }
    }

    @Test
    fun `command input renders the dedicated high contrast palette`() {
        val source = sourceFile("ui/screens/terminals/TerminalScreen.kt")

        assertTrue(source.contains("Color(palette.inputForegroundArgb)"))
        assertTrue(source.contains(".background(Color(palette.inputBackgroundArgb), TerminalCommandInputShape)"))
        assertTrue(source.contains(".border(2.dp, Color(palette.actionArgb), TerminalCommandInputShape)"))
    }

    private fun contrastRatio(firstArgb: Int, secondArgb: Int): Double {
        val first = relativeLuminance(firstArgb)
        val second = relativeLuminance(secondArgb)
        return (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }

    private fun relativeLuminance(argb: Int): Double {
        fun linear(component: Int): Double {
            val normalized = component / 255.0
            return if (normalized <= 0.04045) {
                normalized / 12.92
            } else {
                ((normalized + 0.055) / 1.055).pow(2.4)
            }
        }

        val red = linear(argb ushr 16 and 0xFF)
        val green = linear(argb ushr 8 and 0xFF)
        val blue = linear(argb and 0xFF)
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    }

    private fun sourceFile(relativePath: String): String {
        val candidates = listOf(
            File("src/main/java/com/mrongm/hobgoblin/$relativePath"),
            File("app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
            File("android/app/src/main/java/com/mrongm/hobgoblin/$relativePath"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Source not found: $relativePath")
    }
}

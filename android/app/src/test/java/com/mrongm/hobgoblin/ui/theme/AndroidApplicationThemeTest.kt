package com.mrongm.hobgoblin.ui.theme

import androidx.compose.ui.graphics.Color
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AndroidApplicationThemeTest {
    @Test
    fun `theme identifiers stay compatible with Web and persisted settings`() {
        assertEquals(
            listOf("system", "light", "dark"),
            AndroidAppearancePreference.entries.map(AndroidAppearancePreference::storedValue),
        )
        assertEquals(
            listOf(
                "macos",
                "mono",
                "github",
                "claude",
                "cursor",
                "airbnb",
                "bmw",
                "signal",
                "forge",
                "catppuccin",
                "solarized",
                "tokyo-night",
            ),
            AndroidColorTheme.entries.map(AndroidColorTheme::storedValue),
        )
    }

    @Test
    fun `missing or unknown persisted values use Web-compatible defaults`() {
        assertEquals(AndroidAppearancePreference.System, androidAppearancePreference(null))
        assertEquals(AndroidAppearancePreference.System, androidAppearancePreference("unknown"))
        assertEquals(AndroidColorTheme.Macos, androidColorTheme(null))
        assertEquals(AndroidColorTheme.Macos, androidColorTheme("unknown"))
        assertEquals(AndroidApplicationTheme(), AndroidApplicationTheme())
    }

    @Test
    fun `appearance preference resolves system light and forced modes`() {
        assertEquals(false, resolveDarkTheme(AndroidAppearancePreference.System, systemDarkTheme = false))
        assertEquals(true, resolveDarkTheme(AndroidAppearancePreference.System, systemDarkTheme = true))
        assertEquals(false, resolveDarkTheme(AndroidAppearancePreference.Light, systemDarkTheme = true))
        assertEquals(true, resolveDarkTheme(AndroidAppearancePreference.Dark, systemDarkTheme = false))
    }

    @Test
    fun `every Web preset exposes complete light and dark Compose schemes`() {
        AndroidColorTheme.entries.forEach { colorTheme ->
            listOf(false, true).forEach { darkTheme ->
                val scheme = androidColorScheme(colorTheme, darkTheme)

                assertNotEquals(Color.Unspecified, scheme.background)
                assertNotEquals(Color.Unspecified, scheme.surface)
                assertNotEquals(Color.Unspecified, scheme.primary)
                assertNotEquals(Color.Unspecified, scheme.onSurface)
                assertNotEquals(Color.Unspecified, scheme.error)
            }
        }
    }

    @Test
    fun `representative Compose colors match Web semantic tokens`() {
        assertPalette(
            colorTheme = AndroidColorTheme.Macos,
            darkTheme = false,
            canvas = 0xFFFFFFFF,
            accent = 0xFF0066CC,
            text = 0xFF1D1D1F,
        )
        assertPalette(
            colorTheme = AndroidColorTheme.Github,
            darkTheme = true,
            canvas = 0xFF0D1117,
            accent = 0xFF3FB950,
            text = 0xFFE6EDF3,
        )
        assertPalette(
            colorTheme = AndroidColorTheme.Claude,
            darkTheme = false,
            canvas = 0xFFFAF9F5,
            accent = 0xFFCC785C,
            text = 0xFF141413,
        )
        assertPalette(
            colorTheme = AndroidColorTheme.Catppuccin,
            darkTheme = true,
            canvas = 0xFF1E1E2E,
            accent = 0xFFCBA6F7,
            text = 0xFFCDD6F4,
        )
        assertPalette(
            colorTheme = AndroidColorTheme.Solarized,
            darkTheme = true,
            canvas = 0xFF002B36,
            accent = 0xFF268BD2,
            text = 0xFFAAB6B6,
        )
        assertPalette(
            colorTheme = AndroidColorTheme.TokyoNight,
            darkTheme = false,
            canvas = 0xFFE6E7ED,
            accent = 0xFF2959AA,
            text = 0xFF343B58,
        )
    }

    @Test
    fun `every Compose preset keeps its identity colors aligned with Web CSS`() {
        AndroidColorTheme.entries.forEach { colorTheme ->
            listOf(false, true).forEach { darkTheme ->
                val mode = if (darkTheme) "dark" else "light"
                val css = webThemeCss(colorTheme)
                val block = selectorBlock(css, colorTheme.storedValue, mode)
                val scheme = androidColorScheme(colorTheme, darkTheme)

                assertEquals(webColor(block, "goblin-surface-canvas"), scheme.background)
                assertEquals(webColor(block, "goblin-accent"), scheme.primary)
                assertEquals(webColor(block, "goblin-text-primary"), scheme.onBackground)
            }
        }
    }

    private fun assertPalette(
        colorTheme: AndroidColorTheme,
        darkTheme: Boolean,
        canvas: Long,
        accent: Long,
        text: Long,
    ) {
        val scheme = androidColorScheme(colorTheme, darkTheme)

        assertEquals(Color(canvas), scheme.background)
        assertEquals(Color(accent), scheme.primary)
        assertEquals(Color(text), scheme.onBackground)
    }

    private fun webThemeCss(colorTheme: AndroidColorTheme): String {
        val relativePath = "src/web/theme/themes/${colorTheme.storedValue}.css"
        val candidates = listOf(File("."), File(".."), File("../.."), File("../../.."))
            .map { root -> File(root, relativePath) }
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Web theme CSS not found: $relativePath")
    }

    private fun selectorBlock(css: String, colorTheme: String, mode: String): String {
        val selector = "html[data-color-theme='$colorTheme'][data-theme='$mode']"
        val selectorIndex = css.indexOf(selector)
        require(selectorIndex >= 0) { "Missing selector $selector" }
        val blockStart = css.indexOf('{', selectorIndex)
        val blockEnd = css.indexOf("\n}", blockStart)
        require(blockStart >= 0 && blockEnd > blockStart) { "Incomplete selector $selector" }
        return css.substring(blockStart + 1, blockEnd)
    }

    private fun webColor(block: String, token: String): Color {
        val match = Regex("--$token:\\s*(#[0-9a-fA-F]{6});").find(block)
            ?: error("Missing hex token --$token")
        return Color(match.groupValues[1].removePrefix("#").toLong(16) or 0xFF000000)
    }
}

package com.mrongm.hobgoblin.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

enum class AndroidAppearancePreference(val storedValue: String) {
    System("system"),
    Light("light"),
    Dark("dark"),
}

enum class AndroidColorTheme(val storedValue: String) {
    Macos("macos"),
    Mono("mono"),
    Github("github"),
    Claude("claude"),
    Cursor("cursor"),
    Airbnb("airbnb"),
    Bmw("bmw"),
    Signal("signal"),
    Forge("forge"),
    Catppuccin("catppuccin"),
    Solarized("solarized"),
    TokyoNight("tokyo-night"),
}

data class AndroidApplicationTheme(
    val appearance: AndroidAppearancePreference = AndroidAppearancePreference.System,
    val colorTheme: AndroidColorTheme = AndroidColorTheme.Macos,
)

fun androidAppearancePreference(storedValue: String?): AndroidAppearancePreference =
    AndroidAppearancePreference.entries.firstOrNull { it.storedValue == storedValue }
        ?: AndroidAppearancePreference.System

fun androidColorTheme(storedValue: String?): AndroidColorTheme =
    AndroidColorTheme.entries.firstOrNull { it.storedValue == storedValue }
        ?: AndroidColorTheme.Macos

fun resolveDarkTheme(
    appearance: AndroidAppearancePreference,
    systemDarkTheme: Boolean,
): Boolean = when (appearance) {
    AndroidAppearancePreference.System -> systemDarkTheme
    AndroidAppearancePreference.Light -> false
    AndroidAppearancePreference.Dark -> true
}

fun androidColorScheme(colorTheme: AndroidColorTheme, darkTheme: Boolean): ColorScheme =
    androidThemePalette(colorTheme, darkTheme).toColorScheme(darkTheme)

private data class AndroidThemePalette(
    val canvas: Color,
    val surface: Color,
    val surfaceVariant: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val outline: Color,
    val accent: Color,
    val onAccent: Color,
    val danger: Color,
    val onDanger: Color,
)

private fun AndroidThemePalette.toColorScheme(darkTheme: Boolean): ColorScheme {
    return lightColorScheme(
        primary = accent,
        onPrimary = onAccent,
        primaryContainer = surfaceVariant,
        onPrimaryContainer = textPrimary,
        inversePrimary = accent,
        secondary = accent,
        onSecondary = onAccent,
        secondaryContainer = surfaceVariant,
        onSecondaryContainer = textPrimary,
        tertiary = accent,
        onTertiary = onAccent,
        tertiaryContainer = surfaceVariant,
        onTertiaryContainer = textPrimary,
        background = canvas,
        onBackground = textPrimary,
        surface = surface,
        onSurface = textPrimary,
        surfaceVariant = surfaceVariant,
        onSurfaceVariant = textSecondary,
        surfaceTint = accent,
        inverseSurface = textPrimary,
        inverseOnSurface = canvas,
        error = danger,
        onError = onDanger,
        errorContainer = surfaceVariant,
        onErrorContainer = danger,
        outline = outline,
        outlineVariant = outline,
        scrim = Color.Black,
        surfaceBright = if (darkTheme) surfaceVariant else surface,
        surfaceDim = if (darkTheme) canvas else surfaceVariant,
        surfaceContainer = surfaceVariant,
        surfaceContainerHigh = surfaceVariant,
        surfaceContainerHighest = surfaceVariant,
        surfaceContainerLow = surface,
        surfaceContainerLowest = canvas,
        primaryFixed = accent,
        primaryFixedDim = accent,
        onPrimaryFixed = onAccent,
        onPrimaryFixedVariant = onAccent,
        secondaryFixed = accent,
        secondaryFixedDim = accent,
        onSecondaryFixed = onAccent,
        onSecondaryFixedVariant = onAccent,
        tertiaryFixed = accent,
        tertiaryFixedDim = accent,
        onTertiaryFixed = onAccent,
        onTertiaryFixedVariant = onAccent,
    )
}

private fun androidThemePalette(colorTheme: AndroidColorTheme, darkTheme: Boolean): AndroidThemePalette =
    when (colorTheme) {
        AndroidColorTheme.Macos -> if (darkTheme) {
            palette(
                canvas = 0xFF000000,
                surface = 0xFF272729,
                surfaceVariant = 0xFF252527,
                textPrimary = 0xFFFFFFFF,
                textSecondary = 0xFFCCCCCC,
                outline = 0x42FFFFFF,
                accent = 0xFF2997FF,
                onAccent = 0xFF001A33,
                danger = 0xFFFF453A,
                onDanger = 0xFF260605,
            )
        } else {
            palette(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFAFAFC, 0xFF1D1D1F, 0xFF7A7A7A, 0xFFD2D2D7, 0xFF0066CC, 0xFFFFFFFF, 0xFFD70015, 0xFFFFFFFF)
        }
        AndroidColorTheme.Mono -> if (darkTheme) {
            palette(0xFF09090B, 0xFF18181B, 0xFF27272A, 0xFFFAFAFA, 0xFFA1A1AA, 0x29FFFFFF, 0xFFFAFAFA, 0xFF18181B, 0xFFF87171, 0xFF450A0A)
        } else {
            palette(0xFFFFFFFF, 0xFFFFFFFF, 0xFFF4F4F5, 0xFF09090B, 0xFF71717A, 0xFFD4D4D8, 0xFF18181B, 0xFFFAFAFA, 0xFFEF4444, 0xFFFEF2F2)
        }
        AndroidColorTheme.Github -> if (darkTheme) {
            palette(0xFF0D1117, 0xFF161B22, 0xFF21262D, 0xFFE6EDF3, 0xFF8B949E, 0xFF484F58, 0xFF3FB950, 0xFFFFFFFF, 0xFFF85149, 0xFFFFFFFF)
        } else {
            palette(0xFFFFFFFF, 0xFFFFFFFF, 0xFFF6F8FA, 0xFF1F2328, 0xFF59636E, 0xFFAFB8C1, 0xFF1A7F37, 0xFFFFFFFF, 0xFFCF222E, 0xFFFFFFFF)
        }
        AndroidColorTheme.Claude -> if (darkTheme) {
            palette(0xFF181715, 0xFF252320, 0xFF252320, 0xFFFAF9F5, 0xFFA09D96, 0x47E6DFD8, 0xFFCC785C, 0xFF1F120D, 0xFFFF7B72, 0xFF2A0707)
        } else {
            palette(0xFFFAF9F5, 0xFFFFFFFF, 0xFFEFE9DE, 0xFF141413, 0xFF6C6A64, 0xFFD4CABD, 0xFFCC785C, 0xFFFFFFFF, 0xFFC64545, 0xFFFFFFFF)
        }
        AndroidColorTheme.Cursor -> if (darkTheme) {
            palette(0xFF181818, 0xFF242424, 0xFF242424, 0xFFEDEDED, 0xFF949494, 0xFF505050, 0xFFEDEDED, 0xFF181818, 0xFFE05A5A, 0xFF250808)
        } else {
            palette(0xFFF7F7F5, 0xFFFFFFFF, 0xFFF1F1EF, 0xFF1B1B1B, 0xFF73736F, 0xFFBDBDB8, 0xFF1B1B1B, 0xFFFFFFFF, 0xFFC73B3B, 0xFFFFFFFF)
        }
        AndroidColorTheme.Airbnb -> if (darkTheme) {
            palette(0xFF111111, 0xFF2A2A2A, 0xFF2A2A2A, 0xFFFFFFFF, 0xFFC1C1C1, 0x4DFFFFFF, 0xFFFF385C, 0xFFFFFFFF, 0xFFFF7A5F, 0xFF2A0703)
        } else {
            palette(0xFFFFFFFF, 0xFFFFFFFF, 0xFFF2F2F2, 0xFF222222, 0xFF6A6A6A, 0xFFC1C1C1, 0xFFFF385C, 0xFFFFFFFF, 0xFFC13515, 0xFFFFFFFF)
        }
        AndroidColorTheme.Bmw -> if (darkTheme) {
            palette(0xFF000000, 0xFF1A1A1A, 0xFF1A1A1A, 0xFFFFFFFF, 0xFFBBBBBB, 0xFF5A5A5A, 0xFF1C69D4, 0xFFFFFFFF, 0xFFE22718, 0xFFFFFFFF)
        } else {
            palette(0xFFF5F5F5, 0xFFFFFFFF, 0xFFE6E6E6, 0xFF0D0D0D, 0xFF5A5A5A, 0xFF7E7E7E, 0xFF1C69D4, 0xFFFFFFFF, 0xFFE22718, 0xFFFFFFFF)
        }
        AndroidColorTheme.Signal -> if (darkTheme) {
            palette(0xFF0F1B1A, 0xFF1D2F2C, 0xFF1D2F2C, 0xFFECFFFB, 0xFF9DBAB4, 0x47D3EEE9, 0xFF22B8A8, 0xFF031B18, 0xFFFF6F7D, 0xFF2A050A)
        } else {
            palette(0xFFF8FBFB, 0xFFFFFFFF, 0xFFE4F0ED, 0xFF10201F, 0xFF476461, 0xFF8DB9B1, 0xFF009B8F, 0xFFFFFFFF, 0xFFC33A4A, 0xFFFFFFFF)
        }
        AndroidColorTheme.Forge -> if (darkTheme) {
            palette(0xFF18110D, 0xFF2B2019, 0xFF2B2019, 0xFFFFF3E0, 0xFFBDA58B, 0x47EAD7BD, 0xFFD66A28, 0xFF230C03, 0xFFFF7668, 0xFF2B0704)
        } else {
            palette(0xFFF6F3EC, 0xFFFFFDF8, 0xFFE4D9C7, 0xFF201B16, 0xFF5F5242, 0xFFA9906C, 0xFFB6531C, 0xFFFFF8F0, 0xFFB73C2F, 0xFFFFFFFF)
        }
        AndroidColorTheme.Catppuccin -> if (darkTheme) {
            palette(0xFF1E1E2E, 0xFF313244, 0xFF313244, 0xFFCDD6F4, 0xFFA6ADC8, 0xFF585B70, 0xFFCBA6F7, 0xFF11111B, 0xFFF38BA8, 0xFF11111B)
        } else {
            palette(0xFFEFF1F5, 0xFFFFFFFF, 0xFFE6E9EF, 0xFF4C4F69, 0xFF5C5F77, 0xFF9CA0B0, 0xFF8839EF, 0xFFFFFFFF, 0xFFD20F39, 0xFFFFFFFF)
        }
        AndroidColorTheme.Solarized -> if (darkTheme) {
            palette(0xFF002B36, 0xFF0B414D, 0xFF073642, 0xFFAAB6B6, 0xFF93A1A1, 0xFF4B6971, 0xFF268BD2, 0xFF002B36, 0xFFDC322F, 0xFF002B36)
        } else {
            palette(0xFFFDF6E3, 0xFFFFFDF5, 0xFFEEE8D5, 0xFF475B62, 0xFF566C73, 0xFFC7BEA8, 0xFF268BD2, 0xFFFFFFFF, 0xFFC62D2A, 0xFFFFFFFF)
        }
        AndroidColorTheme.TokyoNight -> if (darkTheme) {
            palette(0xFF1A1B26, 0xFF2D324A, 0xFF24283B, 0xFFC0CAF5, 0xFF9AA5CE, 0xFF565F89, 0xFF7AA2F7, 0xFF1A1B26, 0xFFF7768E, 0xFF1A1B26)
        } else {
            palette(0xFFE6E7ED, 0xFFF2F3F7, 0xFFD8DAE4, 0xFF343B58, 0xFF40434F, 0xFF969DB1, 0xFF2959AA, 0xFFFFFFFF, 0xFF8C4351, 0xFFFFFFFF)
        }
    }

private fun palette(
    canvas: Long,
    surface: Long,
    surfaceVariant: Long,
    textPrimary: Long,
    textSecondary: Long,
    outline: Long,
    accent: Long,
    onAccent: Long,
    danger: Long,
    onDanger: Long,
): AndroidThemePalette = AndroidThemePalette(
    canvas = Color(canvas),
    surface = Color(surface),
    surfaceVariant = Color(surfaceVariant),
    textPrimary = Color(textPrimary),
    textSecondary = Color(textSecondary),
    outline = Color(outline),
    accent = Color(accent),
    onAccent = Color(onAccent),
    danger = Color(danger),
    onDanger = Color(onDanger),
)

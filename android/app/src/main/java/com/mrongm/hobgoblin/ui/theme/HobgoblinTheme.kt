package com.mrongm.hobgoblin.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object HobgoblinColors {
    const val RelayTealHex = "#2E6F6A"
    const val MuxCopperHex = "#B86A3B"
    const val LiveMossHex = "#507A61"
    const val FrostCanvasHex = "#F3F7F6"
    const val NightInkHex = "#132027"
    const val FaultRedHex = "#C44949"
    const val AccentHex = RelayTealHex
    const val SuccessHex = LiveMossHex
    const val WarningHex = "#D97706"
    const val DestructiveHex = FaultRedHex
    const val TerminalBackgroundHex = "#0B0F14"
    const val TerminalForegroundHex = "#E5E7EB"
    const val TerminalOverlayBackgroundHex = "#111827"
    const val TerminalOverlayForegroundHex = TerminalForegroundHex
    const val TerminalInputBackgroundHex = "#111827"
    const val TerminalInputBorderHex = "#334155"
    const val TerminalInputForegroundHex = TerminalForegroundHex
    const val TerminalInputPlaceholderHex = "#94A3B8"
    const val TerminalActionForegroundHex = "#60A5FA"
    const val TerminalDisabledForegroundHex = "#94A3B8"

    val RelayTeal = Color(0xFF2E6F6A)
    val MuxCopper = Color(0xFFB86A3B)
    val LiveMoss = Color(0xFF507A61)
    val FrostCanvas = Color(0xFFF3F7F6)
    val NightInk = Color(0xFF132027)
    val FaultRed = Color(0xFFC44949)
    val Accent = RelayTeal
    val Success = LiveMoss
    val Warning = Color(0xFFD97706)
    val Destructive = FaultRed
    val TerminalBackground = Color(0xFF0B0F14)
    val TerminalForeground = Color(0xFFE5E7EB)
    val TerminalOverlayBackground = Color(0xFF111827)
    val TerminalOverlayForeground = TerminalForeground
    val TerminalInputBackground = Color(0xFF111827)
    val TerminalInputBorder = Color(0xFF334155)
    val TerminalInputForeground = TerminalForeground
    val TerminalInputPlaceholder = Color(0xFF94A3B8)
    val TerminalActionForeground = Color(0xFF60A5FA)
    val TerminalDisabledForeground = Color(0xFF94A3B8)
}

object HobgoblinSpacing {
    val Xs = 4.dp
    val Sm = 8.dp
    val Md = 16.dp
    val Lg = 24.dp
    val Xl = 32.dp
    val TwoXl = 48.dp
    val ThreeXl = 64.dp
}

private val LightScheme = lightColorScheme(
    primary = HobgoblinColors.Accent,
    secondary = HobgoblinColors.MuxCopper,
    tertiary = HobgoblinColors.LiveMoss,
    error = HobgoblinColors.Destructive,
    background = HobgoblinColors.FrostCanvas,
    surface = Color(0xFFFFFFFF),
    onBackground = HobgoblinColors.NightInk,
    onSurface = HobgoblinColors.NightInk,
)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF82B9B3),
    secondary = Color(0xFFE3A16F),
    tertiary = Color(0xFF91B79A),
    error = HobgoblinColors.Destructive,
    background = HobgoblinColors.NightInk,
    surface = Color(0xFF1A292F),
    onBackground = Color(0xFFE5E7EB),
    onSurface = Color(0xFFE5E7EB),
)

@Composable
fun HobgoblinTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = MaterialTheme.typography,
        content = content,
    )
}

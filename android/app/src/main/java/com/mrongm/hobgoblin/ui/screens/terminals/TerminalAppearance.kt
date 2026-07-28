package com.mrongm.hobgoblin.ui.screens.terminals

import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.data.TerminalAppearance
import com.mrongm.hobgoblin.ui.text.LocalizedText
import com.termux.terminal.TextStyle

internal data class TerminalPalette(
    val backgroundArgb: Int,
    val foregroundArgb: Int,
    val surfaceArgb: Int,
    val dividerArgb: Int,
    val actionArgb: Int,
    val mutedArgb: Int,
    val selectionArgb: Int,
    val inputBackgroundArgb: Int,
    val inputForegroundArgb: Int,
    val ansiArgb: List<Int>,
)

internal fun nextTerminalAppearance(current: TerminalAppearance): TerminalAppearance = when (current) {
    TerminalAppearance.Light -> TerminalAppearance.Dark
    TerminalAppearance.Dark -> TerminalAppearance.Light
}

internal fun terminalAppearanceToggleText(current: TerminalAppearance): LocalizedText = when (current) {
    TerminalAppearance.Light -> LocalizedText(R.string.terminal_appearance_dark)
    TerminalAppearance.Dark -> LocalizedText(R.string.terminal_appearance_light)
}

internal fun terminalPalette(appearance: TerminalAppearance): TerminalPalette = when (appearance) {
    TerminalAppearance.Dark -> DarkTerminalPalette
    TerminalAppearance.Light -> LightTerminalPalette
}

internal fun applyTerminalPalette(colors: IntArray, palette: TerminalPalette) {
    require(colors.size > TextStyle.COLOR_INDEX_CURSOR) { "Complete terminal color table is required" }
    palette.ansiArgb.forEachIndexed { index, color ->
        colors[index] = color
    }
    colors[TextStyle.COLOR_INDEX_FOREGROUND] = palette.foregroundArgb
    colors[TextStyle.COLOR_INDEX_BACKGROUND] = palette.backgroundArgb
    colors[TextStyle.COLOR_INDEX_CURSOR] = palette.actionArgb
}

private val DarkTerminalPalette = TerminalPalette(
    backgroundArgb = 0xFF0A0E12.toInt(),
    foregroundArgb = 0xFFE7EDF3.toInt(),
    surfaceArgb = 0xFF121820.toInt(),
    dividerArgb = 0xFF293544.toInt(),
    actionArgb = 0xFF65B9FF.toInt(),
    mutedArgb = 0xFF91A0AE.toInt(),
    selectionArgb = 0x665CA9E6,
    inputBackgroundArgb = 0xFF223044.toInt(),
    inputForegroundArgb = 0xFFF7FAFC.toInt(),
    ansiArgb = listOf(
        0xFF0A0E12.toInt(),
        0xFFFF6B72.toInt(),
        0xFF7BC88F.toInt(),
        0xFFE6C66A.toInt(),
        0xFF65B9FF.toInt(),
        0xFFC792EA.toInt(),
        0xFF70D7D0.toInt(),
        0xFFDCE5EC.toInt(),
        0xFF52606D.toInt(),
        0xFFFF8E94.toInt(),
        0xFF9ADDAB.toInt(),
        0xFFF2D989.toInt(),
        0xFF8CCBFF.toInt(),
        0xFFD8B4F0.toInt(),
        0xFF98E5DF.toInt(),
        0xFFF7FAFC.toInt(),
    ),
)

private val LightTerminalPalette = TerminalPalette(
    backgroundArgb = 0xFFF3F6F8.toInt(),
    foregroundArgb = 0xFF17212B.toInt(),
    surfaceArgb = 0xFFE7EDF2.toInt(),
    dividerArgb = 0xFFC4CFD8.toInt(),
    actionArgb = 0xFF246EA8.toInt(),
    mutedArgb = 0xFF60717F.toInt(),
    selectionArgb = 0x664C91C6,
    inputBackgroundArgb = 0xFFFFFFFF.toInt(),
    inputForegroundArgb = 0xFF111820.toInt(),
    ansiArgb = listOf(
        0xFF1B2733.toInt(),
        0xFFA52D38.toInt(),
        0xFF39764A.toInt(),
        0xFF806000.toInt(),
        0xFF246EA8.toInt(),
        0xFF70419A.toInt(),
        0xFF1B6B73.toInt(),
        0xFF5D6B77.toInt(),
        0xFF87939E.toInt(),
        0xFFC24650.toInt(),
        0xFF4D8D5D.toInt(),
        0xFF9A7400.toInt(),
        0xFF3B83BC.toInt(),
        0xFF8757AD.toInt(),
        0xFF2F8188.toInt(),
        0xFF17212B.toInt(),
    ),
)

package dev.hobgoblin.android.ui.screens.terminals

import dev.hobgoblin.android.data.TerminalAppearance

internal data class TerminalPalette(
    val backgroundArgb: Int,
    val foregroundArgb: Int,
    val surfaceArgb: Int,
    val dividerArgb: Int,
    val actionArgb: Int,
    val mutedArgb: Int,
    val selectionArgb: Int,
    val ansiArgb: List<Int>,
)

internal fun nextTerminalAppearance(current: TerminalAppearance): TerminalAppearance = when (current) {
    TerminalAppearance.Light -> TerminalAppearance.Dark
    TerminalAppearance.Dark -> TerminalAppearance.Light
}

internal fun terminalAppearanceToggleLabel(current: TerminalAppearance): String = when (current) {
    TerminalAppearance.Light -> "Dark"
    TerminalAppearance.Dark -> "Light"
}

internal fun terminalPalette(appearance: TerminalAppearance): TerminalPalette = when (appearance) {
    TerminalAppearance.Dark -> DarkTerminalPalette
    TerminalAppearance.Light -> LightTerminalPalette
}

private val DarkTerminalPalette = TerminalPalette(
    backgroundArgb = 0xFF0A0E12.toInt(),
    foregroundArgb = 0xFFE7EDF3.toInt(),
    surfaceArgb = 0xFF121820.toInt(),
    dividerArgb = 0xFF293544.toInt(),
    actionArgb = 0xFF65B9FF.toInt(),
    mutedArgb = 0xFF91A0AE.toInt(),
    selectionArgb = 0x665CA9E6,
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

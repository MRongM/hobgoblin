package dev.hobgoblin.android.ui.screens.terminals

import android.view.KeyEvent
import com.termux.terminal.KeyHandler

internal fun terminalTextBytes(
    text: CharSequence,
    ctrlPressed: Boolean = false,
    altPressed: Boolean = false,
): ByteArray {
    val translatedText = buildString {
        text.forEachIndexed { index, char ->
            val normalized = if (char == '\n') '\r' else char
            append(if (ctrlPressed && index == 0) terminalControlText(normalized) ?: normalized else normalized)
        }
    }
    val prefix = if (altPressed) "\u001B" else ""
    return "$prefix$translatedText".toByteArray(Charsets.UTF_8)
}

private fun terminalControlText(char: Char): String? =
    terminalControlCharacter(char) ?: when (char) {
        '/', '-' -> "\u001F"
        else -> null
    }

internal fun terminalKeyBytes(
    keyCode: Int,
    action: Int = KeyEvent.ACTION_DOWN,
    ctrlPressed: Boolean = false,
    altPressed: Boolean = false,
    shiftPressed: Boolean = false,
    cursorKeysApplicationMode: Boolean = false,
    keypadApplicationMode: Boolean = false,
): ByteArray? {
    if (action != KeyEvent.ACTION_DOWN) return null

    val control = terminalControlInput(
        keyCode = keyCode,
        ctrlPressed = ctrlPressed,
        action = action,
    )
    if (control != null) return control.toByteArray(Charsets.UTF_8)

    var keyMode = 0
    if (ctrlPressed) keyMode = keyMode or KeyHandler.KEYMOD_CTRL
    if (altPressed) keyMode = keyMode or KeyHandler.KEYMOD_ALT
    if (shiftPressed) keyMode = keyMode or KeyHandler.KEYMOD_SHIFT

    return KeyHandler.getCode(
        keyCode,
        keyMode,
        cursorKeysApplicationMode,
        keypadApplicationMode,
    )?.toByteArray(Charsets.UTF_8)
}

internal fun terminalExtraKeyBytes(
    key: TerminalExtraKey,
    ctrlPressed: Boolean = false,
    altPressed: Boolean = false,
    cursorKeysApplicationMode: Boolean = false,
    keypadApplicationMode: Boolean = false,
): ByteArray? {
    val keyCode = when (key) {
        TerminalExtraKey.Escape -> KeyEvent.KEYCODE_ESCAPE
        TerminalExtraKey.Slash -> return terminalTextBytes("/", ctrlPressed, altPressed)
        TerminalExtraKey.Minus -> return terminalTextBytes("-", ctrlPressed, altPressed)
        TerminalExtraKey.Home -> KeyEvent.KEYCODE_MOVE_HOME
        TerminalExtraKey.ArrowUp -> KeyEvent.KEYCODE_DPAD_UP
        TerminalExtraKey.End -> KeyEvent.KEYCODE_MOVE_END
        TerminalExtraKey.PageUp -> KeyEvent.KEYCODE_PAGE_UP
        TerminalExtraKey.Tab -> KeyEvent.KEYCODE_TAB
        TerminalExtraKey.Control,
        TerminalExtraKey.Alt,
        -> return null
        TerminalExtraKey.ArrowLeft -> KeyEvent.KEYCODE_DPAD_LEFT
        TerminalExtraKey.ArrowDown -> KeyEvent.KEYCODE_DPAD_DOWN
        TerminalExtraKey.ArrowRight -> KeyEvent.KEYCODE_DPAD_RIGHT
        TerminalExtraKey.PageDown -> KeyEvent.KEYCODE_PAGE_DOWN
    }
    return terminalKeyBytes(
        keyCode = keyCode,
        ctrlPressed = ctrlPressed,
        altPressed = altPressed,
        cursorKeysApplicationMode = cursorKeysApplicationMode,
        keypadApplicationMode = keypadApplicationMode,
    )
}

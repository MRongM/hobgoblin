package dev.hobgoblin.android.data

enum class TerminalAppearance(val storedValue: String) {
    Light("light"),
    Dark("dark"),
}

internal fun terminalAppearance(storedValue: String?): TerminalAppearance =
    TerminalAppearance.entries.firstOrNull { it.storedValue == storedValue } ?: TerminalAppearance.Dark

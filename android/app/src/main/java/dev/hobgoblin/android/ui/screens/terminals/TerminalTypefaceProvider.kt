package dev.hobgoblin.android.ui.screens.terminals

import android.content.Context
import android.graphics.Typeface
import dev.hobgoblin.android.R

internal fun <T : Any> terminalResourceOrFallback(
    fallback: T,
    loadResource: () -> T?,
): T = runCatching { loadResource() }.getOrNull() ?: fallback

internal object TerminalTypefaceProvider {
    @Volatile
    private var cachedTypeface: Typeface? = null

    fun terminalTypeface(context: Context): Typeface {
        val cached = cachedTypeface
        if (cached != null) return cached
        val resolved = terminalResourceOrFallback(fallback = Typeface.MONOSPACE) {
            context.resources.getFont(R.font.hobgoblin_terminal_cjk_regular)
        }
        cachedTypeface = resolved
        return resolved
    }
}

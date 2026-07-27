package com.mrongm.hobgoblin.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class HobgoblinThemeTest {
    @Test
    fun `terminal banner colors use dark terminal contrast`() {
        assertEquals("#111827", HobgoblinColors.TerminalOverlayBackgroundHex)
        assertEquals(HobgoblinColors.TerminalForegroundHex, HobgoblinColors.TerminalOverlayForegroundHex)
        assertNotEquals("#FFFFFF", HobgoblinColors.TerminalOverlayBackgroundHex.uppercase())
    }

    @Test
    fun `terminal input colors use visible dark surface contrast`() {
        assertEquals("#111827", HobgoblinColors.TerminalInputBackgroundHex)
        assertEquals(HobgoblinColors.TerminalForegroundHex, HobgoblinColors.TerminalInputForegroundHex)
        assertEquals("#94A3B8", HobgoblinColors.TerminalInputPlaceholderHex)
        assertNotEquals(HobgoblinColors.TerminalBackgroundHex, HobgoblinColors.TerminalInputBorderHex)
    }
}

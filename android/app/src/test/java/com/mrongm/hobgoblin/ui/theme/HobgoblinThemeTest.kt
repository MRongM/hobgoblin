package com.mrongm.hobgoblin.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class HobgoblinThemeTest {
    @Test
    fun `field console palette gives tmux and host state distinct semantic roles`() {
        assertEquals("#2E6F6A", HobgoblinColors.RelayTealHex)
        assertEquals("#B86A3B", HobgoblinColors.MuxCopperHex)
        assertEquals("#507A61", HobgoblinColors.LiveMossHex)
        assertEquals("#F3F7F6", HobgoblinColors.FrostCanvasHex)
        assertEquals("#132027", HobgoblinColors.NightInkHex)
        assertEquals("#C44949", HobgoblinColors.FaultRedHex)
    }

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

package com.mrongm.hobgoblin.ui.screens.terminals

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class HobgoblinTerminalMouseContractTest {
    @Test
    fun `touch and hardware wheel scrolling honor terminal mouse tracking`() {
        val source = terminalViewSource()

        assertTrue(source.contains("private fun scrollVertically("))
        assertTrue(source.contains("emulator.isMouseTrackingActive"))
        assertTrue(source.contains("emulator.sendMouseEvent("))
        assertTrue(source.contains("scrollVertically(event, deltaRows)"))
        assertTrue(source.contains("scrollVertically(event, rows)"))
        assertTrue(source.contains("scrollVertically(mouseScrollCell, verticalRows)"))
    }

    private fun terminalViewSource(): String {
        val relativePath =
            "src/main/java/com/mrongm/hobgoblin/ui/screens/terminals/HobgoblinTerminalView.kt"
        return listOf(File(relativePath), File("app/$relativePath"), File("android/app/$relativePath"))
            .firstOrNull(File::isFile)
            ?.readText()
            ?: error("HobgoblinTerminalView.kt not found")
    }
}

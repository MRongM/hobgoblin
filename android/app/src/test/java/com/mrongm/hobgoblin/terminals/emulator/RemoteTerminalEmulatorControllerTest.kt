package com.mrongm.hobgoblin.terminals.emulator

import com.mrongm.hobgoblin.data.TerminalAppearance
import com.mrongm.hobgoblin.ui.screens.terminals.applyTerminalPalette
import com.mrongm.hobgoblin.ui.screens.terminals.terminalPalette
import com.termux.terminal.TextStyle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteTerminalEmulatorControllerTest {
    @Test
    fun `append output updates visible text and notifies observers`() {
        val controller = controller()
        var notifyCount = 0
        val observer = controller.observe { notifyCount += 1 }

        controller.appendOutput("hello\r\n".toByteArray(Charsets.UTF_8))

        assertEquals(
            "hello",
            controller.emulator.getSelectedText(
                0,
                0,
                controller.emulator.mColumns - 1,
                controller.emulator.mRows - 1,
            ).trimEnd(),
        )
        assertEquals(1, notifyCount)

        observer.close()
    }

    @Test
    fun `resize updates local emulator size and calls remote resize`() {
        val resizes = mutableListOf<Pair<Int, Int>>()
        val controller = controller(
            resizeRemote = { cols, rows ->
                resizes += cols to rows
                true
            },
        )

        controller.resize(columns = 100, rows = 30)

        assertEquals(100, controller.emulator.mColumns)
        assertEquals(30, controller.emulator.mRows)
        assertEquals(listOf(100 to 30), resizes)
    }

    @Test
    fun `detach prevents terminal output writes from reaching session`() {
        val sent = mutableListOf<String>()
        val controller = controller(
            sendInputBytes = { bytes ->
                sent += bytes.toString(Charsets.UTF_8)
                true
            },
        )

        controller.detach()
        controller.output.write("ignored")

        assertTrue(controller.output.isDetached)
        assertEquals(emptyList<String>(), sent)
    }

    @Test
    fun `observer can detach without closing emulator controller`() {
        val controller = controller()
        var notifyCount = 0
        val observer = controller.observe { notifyCount += 1 }

        observer.close()
        controller.appendOutput("after close".toByteArray(Charsets.UTF_8))

        assertEquals(0, notifyCount)
        assertFalse(controller.output.isDetached)
    }

    @Test
    fun `remote OSC color change preserves the terminal requested foreground`() {
        val controller = controller()
        val palette = terminalPalette(TerminalAppearance.Dark)
        val colors = controller.emulator.mColors.mCurrentColors
        applyTerminalPalette(colors, palette)

        controller.appendOutput("\u001B]10;#d97757\u0007".toByteArray(Charsets.UTF_8))

        assertEquals(0xFFD97757.toInt(), colors[TextStyle.COLOR_INDEX_FOREGROUND])
    }

    private fun controller(
        sendInputBytes: (ByteArray) -> Boolean = { true },
        resizeRemote: (Int, Int) -> Boolean = { _, _ -> true },
    ): RemoteTerminalEmulatorController = RemoteTerminalEmulatorController(
        sessionId = "terminal-1",
        initialColumns = 80,
        initialRows = 24,
        postToMain = { action -> action() },
        sendInputBytes = sendInputBytes,
        resizeRemote = resizeRemote,
    )
}

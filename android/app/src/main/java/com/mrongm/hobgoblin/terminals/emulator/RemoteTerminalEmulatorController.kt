package com.mrongm.hobgoblin.terminals.emulator

import android.os.Handler
import android.os.Looper
import com.termux.terminal.TerminalEmulator
import java.util.UUID

class RemoteTerminalEmulatorController(
    val sessionId: String,
    initialColumns: Int = 80,
    initialRows: Int = 24,
    private val postToMain: ((() -> Unit) -> Unit) = mainThreadPoster(),
    sendInputBytes: (ByteArray) -> Boolean,
    private val resizeRemote: (Int, Int) -> Boolean,
) {
    private val observers = linkedMapOf<String, () -> Unit>()
    private val colorObservers = linkedMapOf<String, () -> Unit>()
    private var colorsChangedDuringAppend = false
    val output: RemoteTerminalOutput = RemoteTerminalOutput(
        sendInputBytes = sendInputBytes,
        onColorsChanged = { colorsChangedDuringAppend = true },
    )
    private val client = TerminalEmulatorSessionClient()
    val emulator: TerminalEmulator = TerminalEmulator(
        output,
        initialColumns,
        initialRows,
        TerminalEmulator.DEFAULT_TERMINAL_TRANSCRIPT_ROWS,
        client,
    )

    fun appendOutput(bytes: ByteArray) {
        val frame = bytes.copyOf()
        postToMain {
            colorsChangedDuringAppend = false
            emulator.append(frame, frame.size)
            if (colorsChangedDuringAppend) notifyColorObservers()
            notifyObservers()
        }
    }

    fun resize(columns: Int, rows: Int) {
        val safeColumns = columns.coerceAtLeast(MinColumns)
        val safeRows = rows.coerceAtLeast(MinRows)
        postToMain {
            emulator.resize(safeColumns, safeRows)
            resizeRemote(safeColumns, safeRows)
            notifyObservers()
        }
    }

    fun visibleText(): String = emulator.getSelectedText(
        0,
        0,
        emulator.mColumns - 1,
        emulator.mRows - 1,
    ).trimEnd()

    fun observe(onChanged: () -> Unit): AutoCloseable {
        val observerId = UUID.randomUUID().toString()
        observers[observerId] = onChanged
        return AutoCloseable {
            observers.remove(observerId)
        }
    }

    fun observeColorChanges(onChanged: () -> Unit): AutoCloseable {
        val observerId = UUID.randomUUID().toString()
        colorObservers[observerId] = onChanged
        return AutoCloseable {
            colorObservers.remove(observerId)
        }
    }

    fun detach() {
        output.detach()
        observers.clear()
        colorObservers.clear()
    }

    private fun notifyObservers() {
        observers.values.forEach { it() }
    }

    private fun notifyColorObservers() {
        colorObservers.values.forEach { it() }
    }

    companion object {
        private const val MinColumns = 2
        private const val MinRows = 2

        private fun mainThreadPoster(): ((() -> Unit) -> Unit) {
            val handler = Handler(Looper.getMainLooper())
            return { action -> handler.post(action) }
        }
    }
}

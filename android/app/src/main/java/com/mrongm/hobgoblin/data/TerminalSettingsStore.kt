package com.mrongm.hobgoblin.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.mrongm.hobgoblin.terminals.MaxTerminalHeartbeatIntervalSeconds
import com.mrongm.hobgoblin.terminals.MaxTerminalHeartbeatFailureThreshold
import com.mrongm.hobgoblin.terminals.MinTerminalHeartbeatIntervalSeconds
import com.mrongm.hobgoblin.terminals.MinTerminalHeartbeatFailureThreshold
import com.mrongm.hobgoblin.terminals.TerminalHeartbeatIntervalSeconds
import com.mrongm.hobgoblin.terminals.TerminalHeartbeatFailureThreshold

class TerminalSettingsStore private constructor(
    private val preferences: SharedPreferences,
) {
    fun loadKeepAliveIntervalSeconds(): Long =
        preferences.getLong(KeyKeepAliveIntervalSeconds, TerminalHeartbeatIntervalSeconds)
            .coerceIn(MinTerminalHeartbeatIntervalSeconds..MaxTerminalHeartbeatIntervalSeconds)

    fun setKeepAliveIntervalSeconds(inputSeconds: Long) {
        val normalized = inputSeconds.coerceIn(MinTerminalHeartbeatIntervalSeconds..MaxTerminalHeartbeatIntervalSeconds)
        preferences.edit { putLong(KeyKeepAliveIntervalSeconds, normalized) }
    }

    fun loadHeartbeatFailureThreshold(): Int =
        preferences.getInt(KeyHeartbeatFailureThreshold, TerminalHeartbeatFailureThreshold)
            .coerceIn(MinTerminalHeartbeatFailureThreshold..MaxTerminalHeartbeatFailureThreshold)

    fun setHeartbeatFailureThreshold(inputCount: Int) {
        val normalized = inputCount.coerceIn(MinTerminalHeartbeatFailureThreshold..MaxTerminalHeartbeatFailureThreshold)
        preferences.edit { putInt(KeyHeartbeatFailureThreshold, normalized) }
    }

    fun loadTerminalFitToScreen(): Boolean =
        preferences.getBoolean(KeyTerminalFitToScreen, true)

    fun setTerminalFitToScreen(input: Boolean) {
        preferences.edit { putBoolean(KeyTerminalFitToScreen, input) }
    }

    fun loadTerminalAppearance(): TerminalAppearance =
        terminalAppearance(preferences.getString(KeyTerminalAppearance, null))

    fun setTerminalAppearance(appearance: TerminalAppearance) {
        preferences.edit { putString(KeyTerminalAppearance, appearance.storedValue) }
    }

    companion object {
        private const val PreferencesName = "hobgoblin-terminal-settings"
        private const val KeyKeepAliveIntervalSeconds = "terminal_keepalive_interval_seconds"
        private const val KeyHeartbeatFailureThreshold = "terminal_heartbeat_failure_threshold"
        private const val KeyTerminalFitToScreen = "terminal_fit_to_screen"
        private const val KeyTerminalAppearance = "terminal_appearance"

        fun create(context: Context): TerminalSettingsStore =
            TerminalSettingsStore(context.getSharedPreferences(PreferencesName, Context.MODE_PRIVATE))
    }
}

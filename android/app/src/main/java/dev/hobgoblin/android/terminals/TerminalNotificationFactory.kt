package dev.hobgoblin.android.terminals

import androidx.annotation.StringRes
import dev.hobgoblin.android.R

const val TerminalSessionIntentExtra = "dev.hobgoblin.android.extra.TERMINAL_SESSION_ID"

data class TerminalNotificationText(
    @param:StringRes val resourceId: Int,
    val formatArgs: List<Any> = emptyList(),
)

data class TerminalNotificationContent(
    val title: TerminalNotificationText,
    val text: TerminalNotificationText,
    val terminalSessionId: String?,
)

object TerminalNotificationFactory {
    const val NotificationId = 1001
    const val ChannelId = "terminal_sessions"

    fun contentFor(sessions: List<TerminalSessionRecord>): TerminalNotificationContent {
        val running = sessions.filter { it.status == TerminalSessionStatus.Running }
        val first = firstRunningSession(running)
        val count = running.size
        val title = when (count) {
            0 -> TerminalNotificationText(R.string.notification_terminals_running_zero)
            1 -> TerminalNotificationText(R.string.notification_terminals_running_one)
            else -> TerminalNotificationText(R.string.notification_terminals_running_many, listOf(count))
        }
        val text = first?.targetLabel
            ?.let { TerminalNotificationText(R.string.common_value, listOf(it)) }
            ?: TerminalNotificationText(R.string.notification_no_active_terminal)
        return TerminalNotificationContent(
            title = title,
            text = text,
            terminalSessionId = first?.id,
        )
    }

    fun firstRunningSession(sessions: List<TerminalSessionRecord>): TerminalSessionRecord? =
        sessions
            .filter { it.status == TerminalSessionStatus.Running }
            .minByOrNull { it.openedAt }
}

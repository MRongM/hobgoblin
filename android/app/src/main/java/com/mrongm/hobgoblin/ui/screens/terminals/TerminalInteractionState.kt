package com.mrongm.hobgoblin.ui.screens.terminals

import android.view.KeyEvent
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.terminals.TerminalDisconnectedReason
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionState
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.ui.text.LocalizedText
import java.net.URI

internal const val TerminalQuickConfirmInput = "YES"
internal const val TerminalQuickCancelInput = "NO"

internal const val TerminalDefaultFocusMode = false
internal const val TerminalStickToBottomThresholdPx = 48

internal fun terminalBackgroundSwipeTriggered(
    horizontalDistancePx: Float,
    thresholdPx: Float,
): Boolean = thresholdPx > 0f && horizontalDistancePx >= thresholdPx

internal enum class TerminalExtraKey {
    Escape,
    Slash,
    Minus,
    Home,
    ArrowUp,
    End,
    PageUp,
    Tab,
    Control,
    Alt,
    ArrowLeft,
    ArrowDown,
    ArrowRight,
    PageDown,
}

internal val TerminalTermuxExtraKeyRows = listOf(
    listOf(
        TerminalExtraKey.Escape,
        TerminalExtraKey.Slash,
        TerminalExtraKey.Minus,
        TerminalExtraKey.Home,
        TerminalExtraKey.ArrowUp,
        TerminalExtraKey.End,
        TerminalExtraKey.PageUp,
    ),
    listOf(
        TerminalExtraKey.Tab,
        TerminalExtraKey.Control,
        TerminalExtraKey.Alt,
        TerminalExtraKey.ArrowLeft,
        TerminalExtraKey.ArrowDown,
        TerminalExtraKey.ArrowRight,
        TerminalExtraKey.PageDown,
    ),
)

internal fun terminalExtraKeyLabel(
    key: TerminalExtraKey,
    ctrlModifierActive: Boolean,
    altModifierActive: Boolean,
): String = when (key) {
    TerminalExtraKey.Escape -> "ESC"
    TerminalExtraKey.Slash -> "/"
    TerminalExtraKey.Minus -> "-"
    TerminalExtraKey.Home -> "HOME"
    TerminalExtraKey.ArrowUp -> "↑"
    TerminalExtraKey.End -> "END"
    TerminalExtraKey.PageUp -> "PGUP"
    TerminalExtraKey.Tab -> "TAB"
    TerminalExtraKey.Control -> if (ctrlModifierActive) "CTRL on" else "CTRL"
    TerminalExtraKey.Alt -> if (altModifierActive) "ALT on" else "ALT"
    TerminalExtraKey.ArrowLeft -> "←"
    TerminalExtraKey.ArrowDown -> "↓"
    TerminalExtraKey.ArrowRight -> "→"
    TerminalExtraKey.PageDown -> "PGDN"
}

internal enum class TerminalHobgoblinAction {
    Reconnect,
    Enter,
    Backspace,
    ControlC,
    ControlL,
    Paste,
}

internal val TerminalHobgoblinPrimaryActions = listOf(
    TerminalHobgoblinAction.Reconnect,
    TerminalHobgoblinAction.Enter,
    TerminalHobgoblinAction.Backspace,
    TerminalHobgoblinAction.ControlC,
    TerminalHobgoblinAction.ControlL,
    TerminalHobgoblinAction.Paste,
)

internal fun terminalHobgoblinActionText(action: TerminalHobgoblinAction): LocalizedText = when (action) {
    TerminalHobgoblinAction.Reconnect -> LocalizedText(R.string.terminal_action_reconnect)
    TerminalHobgoblinAction.Enter -> LocalizedText(R.string.common_value, listOf("ENTER"))
    TerminalHobgoblinAction.Backspace -> LocalizedText(R.string.common_value, listOf("⌫"))
    TerminalHobgoblinAction.ControlC -> LocalizedText(R.string.common_value, listOf("CTRL+C"))
    TerminalHobgoblinAction.ControlL -> LocalizedText(R.string.common_value, listOf("CTRL+L"))
    TerminalHobgoblinAction.Paste -> LocalizedText(R.string.terminal_action_paste)
}

internal fun terminalChromeVisible(focusMode: Boolean): Boolean = !focusMode

internal fun terminalFocusActionText(focusMode: Boolean): LocalizedText =
    LocalizedText(if (focusMode) R.string.terminal_exit_focus else R.string.terminal_focus)

internal fun terminalFocusExitHandleVisible(focusMode: Boolean): Boolean = focusMode

internal fun terminalBackExitsFocus(focusMode: Boolean): Boolean = focusMode

internal fun terminalSessionRemotePath(remotePath: String): String =
    remotePath.ifBlank { "/" }.trimEnd('/').ifEmpty { "/" }

private fun TerminalSessionStatus.terminalWorkspacePriority(): Int = when (this) {
    TerminalSessionStatus.Starting,
    TerminalSessionStatus.Running -> 0
    TerminalSessionStatus.Exited,
    TerminalSessionStatus.Failed,
    TerminalSessionStatus.Disconnected -> 1
}

private val terminalWorkspaceSessionComparator: Comparator<TerminalSessionRecord> =
    compareBy<TerminalSessionRecord> { it.status.terminalWorkspacePriority() }
        .thenByDescending { it.lastActivityAt ?: it.openedAt }
        .thenBy { it.openedAt }

private val terminalWorkspaceCreatedSessionComparator: Comparator<TerminalSessionRecord> =
    compareBy<TerminalSessionRecord> { it.openedAt }
        .thenBy { it.id }

internal fun terminalWorkspaceOrderedSessions(
    sessions: List<TerminalSessionRecord>,
    hostId: String,
    remotePath: String,
): List<TerminalSessionRecord> = terminalWorkspaceOrderedSessions(
    sessions = sessions,
    hostIds = setOf(hostId),
    remotePath = remotePath,
)

internal fun terminalWorkspaceOrderedSessions(
    sessions: List<TerminalSessionRecord>,
    hostIds: Set<String>,
    remotePath: String,
): List<TerminalSessionRecord> {
    return terminalWorkspaceFilteredSessions(
        sessions = sessions,
        hostIds = hostIds,
        remotePath = remotePath,
    ).sortedWith(terminalWorkspaceSessionComparator)
}

internal fun terminalWorkspaceCreatedSessions(
    sessions: List<TerminalSessionRecord>,
    hostId: String,
    remotePath: String,
): List<TerminalSessionRecord> = terminalWorkspaceCreatedSessions(
    sessions = sessions,
    hostIds = setOf(hostId),
    remotePath = remotePath,
)

internal fun terminalWorkspaceCreatedSessions(
    sessions: List<TerminalSessionRecord>,
    hostIds: Set<String>,
    remotePath: String,
): List<TerminalSessionRecord> {
    return terminalWorkspaceFilteredSessions(
        sessions = sessions,
        hostIds = hostIds,
        remotePath = remotePath,
    ).sortedWith(terminalWorkspaceCreatedSessionComparator)
}

internal fun terminalGlobalProjectCreatedSessions(
    sessions: List<TerminalSessionRecord>,
): List<TerminalSessionRecord> {
    return sessions
        .filter { it.repositoryId != null }
        .sortedWith(terminalWorkspaceCreatedSessionComparator)
}

internal fun terminalOverviewOrderedSessions(
    sessions: List<TerminalSessionRecord>,
): List<TerminalSessionRecord> = sessions.sortedWith(terminalWorkspaceSessionComparator.thenBy { it.id })

internal fun terminalCycleSessionId(
    sessions: List<TerminalSessionRecord>,
    activeSessionId: String?,
    direction: Int,
): String? {
    if (sessions.size <= 1) return null
    val currentIndex = sessions.indexOfFirst { it.id == activeSessionId }.takeIf { it >= 0 } ?: 0
    val nextIndex = (currentIndex + direction).mod(sessions.size)
    return sessions[nextIndex].id
}

internal fun terminalWorkspaceSessionCountsByPath(
    sessions: List<TerminalSessionRecord>,
    hostId: String,
): List<Pair<String, Int>> =
    terminalWorkspaceSessionCountsByPath(
        sessions = sessions,
        hostIds = setOf(hostId),
    )

internal fun terminalWorkspaceSessionCountsByPath(
    sessions: List<TerminalSessionRecord>,
    hostIds: Set<String>,
): List<Pair<String, Int>> =
    terminalWorkspaceHostSessions(sessions = sessions, hostIds = hostIds)
        .groupBy { terminalSessionRemotePath(it.remotePath) }
        .map { (path, values) -> path to values.size }
        .sortedBy { it.first }

private fun terminalWorkspaceFilteredSessions(
    sessions: List<TerminalSessionRecord>,
    hostId: String,
    remotePath: String,
): List<TerminalSessionRecord> = terminalWorkspaceFilteredSessions(
    sessions = sessions,
    hostIds = setOf(hostId),
    remotePath = remotePath,
)

private fun terminalWorkspaceFilteredSessions(
    sessions: List<TerminalSessionRecord>,
    hostIds: Set<String>,
    remotePath: String,
): List<TerminalSessionRecord> {
    val path = terminalSessionRemotePath(remotePath)
    return sessions.filter { it.hostId in hostIds && terminalSessionRemotePath(it.remotePath) == path }
}

private fun terminalWorkspaceHostSessions(
    sessions: List<TerminalSessionRecord>,
    hostId: String,
): List<TerminalSessionRecord> = terminalWorkspaceHostSessions(
    sessions = sessions,
    hostIds = setOf(hostId),
)

private fun terminalWorkspaceHostSessions(
    sessions: List<TerminalSessionRecord>,
    hostIds: Set<String>,
): List<TerminalSessionRecord> {
    return sessions.filter { it.hostId in hostIds }
}

internal fun terminalStickToBottom(
    scrollValue: Int,
    maxValue: Int,
    thresholdPx: Int = TerminalStickToBottomThresholdPx,
): Boolean = maxValue == 0 || scrollValue >= maxValue - thresholdPx

internal fun terminalInputAvailable(state: TerminalSessionState): Boolean =
    state is TerminalSessionState.Connected

internal fun terminalCommandInputEnabled(state: TerminalSessionState): Boolean =
    terminalInputAvailable(state)

internal fun terminalCommandInputPlaceholderText(state: TerminalSessionState): LocalizedText =
    if (terminalCommandInputEnabled(state)) {
        LocalizedText(R.string.terminal_type_command)
    } else {
        terminalInputUnavailableText(state) ?: LocalizedText(R.string.terminal_not_connected)
    }

internal const val TerminalCommandInputDefaultVisible = false

internal fun terminalCommandInputVisibilityActionText(visible: Boolean): LocalizedText =
    LocalizedText(if (visible) R.string.terminal_hide_command_input else R.string.terminal_show_command_input)

internal fun terminalReconnectAvailable(state: TerminalSessionState): Boolean = when (state) {
    TerminalSessionState.Idle,
    is TerminalSessionState.Exited,
    is TerminalSessionState.Failed,
    is TerminalSessionState.Disconnected,
    -> true
    TerminalSessionState.Connecting,
    is TerminalSessionState.Connected,
    is TerminalSessionState.Resizing,
    -> false
}

internal fun terminalSessionReconnectAvailable(session: TerminalSessionRecord): Boolean = when (session.status) {
    TerminalSessionStatus.Exited,
    TerminalSessionStatus.Failed,
    TerminalSessionStatus.Disconnected,
    -> true
    TerminalSessionStatus.Starting,
    TerminalSessionStatus.Running,
    -> false
}

internal data class TerminalDetailInlineActions(
    val reconnectEnabled: Boolean,
    val closeEnabled: Boolean,
)

internal fun terminalDetailInlineActions(state: TerminalSessionState): TerminalDetailInlineActions =
    TerminalDetailInlineActions(
        reconnectEnabled = terminalReconnectAvailable(state),
        closeEnabled = true,
    )

internal fun terminalCloseConfirmationText(targetLabel: String): LocalizedText =
    LocalizedText(R.string.terminal_close_confirmation, listOf(targetLabel))

internal fun terminalInputUnavailableText(state: TerminalSessionState): LocalizedText? = when (state) {
    TerminalSessionState.Idle -> LocalizedText(R.string.terminal_not_connected)
    TerminalSessionState.Connecting -> LocalizedText(R.string.terminal_connecting_message)
    is TerminalSessionState.Connected -> null
    is TerminalSessionState.Resizing -> LocalizedText(R.string.terminal_resizing_message)
    is TerminalSessionState.Exited -> LocalizedText(R.string.terminal_disconnected_general)
    is TerminalSessionState.Failed -> LocalizedText(R.string.terminal_disconnected_general)
    is TerminalSessionState.Disconnected -> terminalDisconnectedText(state.reason, state.message)
}

internal fun terminalLineInput(value: String): String = "$value\r"

internal const val TerminalSelectedTextMaxLength = 4096

internal sealed interface TerminalSelectedTextBrowserAction {
    data class OpenUrl(val url: String) : TerminalSelectedTextBrowserAction
    data class Search(val query: String) : TerminalSelectedTextBrowserAction
}

internal fun terminalSelectedTextBrowserAction(
    selectedText: String,
    maxLength: Int = TerminalSelectedTextMaxLength,
): TerminalSelectedTextBrowserAction? {
    val normalized = selectedText
        .trim()
        .replace(Regex("\\s+"), " ")
        .take(maxLength.coerceAtLeast(1))
    if (normalized.isBlank()) return null

    return terminalDirectBrowserUrl(normalized)
        ?.let(TerminalSelectedTextBrowserAction::OpenUrl)
        ?: TerminalSelectedTextBrowserAction.Search(normalized)
}

private fun terminalDirectBrowserUrl(value: String): String? {
    if (value.any { it.isWhitespace() || it.isISOControl() }) return null
    val uri = runCatching { URI(value) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") return null
    if (uri.host.isNullOrBlank()) return null
    return value
}

internal fun terminalQuickInput(value: String): String = "$value\r"

internal fun terminalControlCharacter(key: Char): String? {
    val letter = key.uppercaseChar()
    if (letter !in 'A'..'Z') return null
    return (letter.code - 'A'.code + 1).toChar().toString()
}

internal fun terminalControlInput(keyCode: Int, ctrlPressed: Boolean, action: Int = KeyEvent.ACTION_DOWN): String? {
    if (!ctrlPressed || action != KeyEvent.ACTION_DOWN) return null
    return when (keyCode) {
        KeyEvent.KEYCODE_C -> "\u0003"
        in KeyEvent.KEYCODE_A..KeyEvent.KEYCODE_Z -> {
            val letter = ('A'.code + (keyCode - KeyEvent.KEYCODE_A)).toChar()
            terminalControlCharacter(letter)
        }
        else -> null
    }
}

internal fun terminalViewportText(state: TerminalSessionState): String = when (state) {
    is TerminalSessionState.Connected -> state.output
    is TerminalSessionState.Failed -> state.output
    is TerminalSessionState.Exited -> state.output
    is TerminalSessionState.Disconnected -> state.output
    TerminalSessionState.Connecting,
    is TerminalSessionState.Resizing,
    TerminalSessionState.Idle,
    -> ""
}

internal fun terminalFallbackVisible(hasEmulatorController: Boolean): Boolean =
    !hasEmulatorController

internal fun terminalSessionBannerText(state: TerminalSessionState): LocalizedText? = when (state) {
    TerminalSessionState.Connecting -> LocalizedText(R.string.terminal_banner_connecting)
    is TerminalSessionState.Resizing -> LocalizedText(R.string.terminal_banner_resizing)
    is TerminalSessionState.Failed -> LocalizedText(
        R.string.terminal_failed_with_message,
        listOf(LocalizedText(R.string.terminal_disconnected_general), state.message),
    )
    is TerminalSessionState.Exited -> LocalizedText(
        R.string.terminal_exited_with_reason,
        listOf(terminalReasonText(state.reason)),
    )
    is TerminalSessionState.Disconnected -> terminalDisconnectedText(state.reason, state.message)
    TerminalSessionState.Idle,
    is TerminalSessionState.Connected,
    -> null
}

internal fun terminalViewportBannerMessage(sessionBanner: String?, notice: String? = null): String? {
    val cleanedNotice = notice?.trim()?.takeIf { it.isNotEmpty() }
    return listOfNotNull(cleanedNotice, sessionBanner)
        .distinct()
        .joinToString("\n")
        .takeIf { it.isNotEmpty() }
}

internal fun terminalSessionStatusText(state: TerminalSessionState): LocalizedText = when (state) {
    TerminalSessionState.Idle -> LocalizedText(R.string.terminal_status_idle)
    TerminalSessionState.Connecting -> LocalizedText(R.string.terminal_status_connecting)
    is TerminalSessionState.Connected -> LocalizedText(R.string.terminal_status_connected)
    is TerminalSessionState.Resizing -> LocalizedText(R.string.terminal_status_resizing)
    is TerminalSessionState.Exited -> LocalizedText(
        R.string.terminal_status_with_detail,
        listOf(LocalizedText(R.string.terminal_status_exited), terminalReasonText(state.reason)),
    )
    is TerminalSessionState.Failed -> LocalizedText(
        R.string.terminal_status_with_detail,
        listOf(LocalizedText(R.string.terminal_status_failed), terminalReasonText(state.reason)),
    )
    is TerminalSessionState.Disconnected -> LocalizedText(
        R.string.terminal_status_with_detail,
        listOf(LocalizedText(R.string.terminal_status_disconnected), terminalReasonWithDetailText(state.reason, state.message)),
    )
}

internal fun terminalDisplayText(state: TerminalSessionState, sessionBanner: String?): String {
    val viewport = terminalViewportText(state)
    val banner = sessionBanner ?: return viewport
    return if (viewport.isBlank()) banner else "$viewport\n$banner"
}

private fun terminalDisconnectedText(
    reason: TerminalDisconnectedReason,
    detail: String? = null,
): LocalizedText = LocalizedText(
    R.string.terminal_disconnected_detail,
    listOf(terminalReasonWithDetailText(reason, detail)),
)

private fun terminalReasonWithDetailText(
    reason: TerminalDisconnectedReason,
    detail: String? = null,
): LocalizedText {
    val cleanDetail = detail
        ?.trim()
        ?.takeIf { it.isNotBlank() && it != "disconnected" }
    val reasonText = terminalReasonText(reason)
    return if (cleanDetail == null) {
        reasonText
    } else {
        LocalizedText(R.string.terminal_status_with_detail, listOf(reasonText, cleanDetail))
    }
}

private fun terminalReasonText(reason: TerminalDisconnectedReason): LocalizedText = when (reason) {
    TerminalDisconnectedReason.UserClosed -> LocalizedText(R.string.terminal_reason_user_closed)
    TerminalDisconnectedReason.RemoteExited -> LocalizedText(R.string.terminal_reason_remote_exited)
    TerminalDisconnectedReason.SshDisconnected -> LocalizedText(R.string.terminal_reason_ssh_disconnected)
    TerminalDisconnectedReason.AndroidServiceStopped -> LocalizedText(R.string.terminal_reason_android_service_stopped)
    TerminalDisconnectedReason.TerminalWriteTimeout -> LocalizedText(R.string.terminal_reason_write_timeout)
    TerminalDisconnectedReason.TerminalFailure -> LocalizedText(R.string.terminal_reason_failure)
}

internal fun terminalTargetLabel(repositoryTitle: String?, remotePath: String): String {
    val path = remotePath.ifBlank { "/" }
    val title = repositoryTitle?.takeIf { it.isNotBlank() }
    return if (title == null) path else "$title - $path"
}

internal fun terminalSessionDisplayName(index: Int): String = "terminal-${index + 1}"

internal fun terminalSessionDisplayName(
    session: TerminalSessionRecord,
    fallbackIndex: Int,
): String = session.displayName.ifBlank { terminalSessionDisplayName(fallbackIndex) }

internal fun terminalScreenTitle(
    sessionId: String?,
    sessions: List<TerminalSessionRecord>,
    hostId: String,
    remotePath: String,
): String {
    return terminalScreenTitle(
        sessionId = sessionId,
        sessions = sessions,
        hostIds = setOf(hostId),
        remotePath = remotePath,
    )
}

internal fun terminalScreenTitle(
    sessionId: String?,
    sessions: List<TerminalSessionRecord>,
    hostIds: Set<String>,
    remotePath: String,
): String {
    val path = terminalSessionRemotePath(remotePath)
    val workspaceSessions = terminalWorkspaceCreatedSessions(
        sessions = sessions,
        hostIds = hostIds,
        remotePath = path,
    )
    val index = workspaceSessions.indexOfFirst { it.id == sessionId }.takeIf { it >= 0 } ?: 0
    val activeSession = workspaceSessions.firstOrNull { it.id == sessionId }
    val label = activeSession?.let { terminalSessionDisplayName(it, index) } ?: terminalSessionDisplayName(index)
    return "$label $path"
}

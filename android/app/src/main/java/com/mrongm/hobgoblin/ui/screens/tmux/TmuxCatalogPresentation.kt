package com.mrongm.hobgoblin.ui.screens.tmux

import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxServerTarget
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol

internal enum class HostTmuxServerSource {
    Default,
    Project,
}

internal enum class HostTmuxSessionAction {
    Reconnect,
    Close,
    Delete,
    Open,
}

internal const val HostTmuxCloseRemoteOnDeleteDefault = false

internal fun hostTmuxPathTitle(initialPath: String): String =
    initialPath.substringAfterLast('/').ifBlank { "/" }

internal fun hostTmuxPathIsImported(
    hostId: String,
    initialPath: String,
    repositories: List<RemoteRepositoryProfile>,
): Boolean {
    val normalizedPath = TmuxSessionProtocol.normalizePath(initialPath)
    return repositories.any { repository ->
        repository.hostProfileId == hostId &&
            TmuxSessionProtocol.normalizePath(repository.remotePath) == normalizedPath
    }
}

internal fun hostTmuxProtocolNameSuffix(value: String): String {
    val suffix = value.takeLast(ProtocolNameSuffixChars)
    return if (suffix.length == value.length) suffix else "…$suffix"
}

internal fun hostTmuxServerSource(server: TmuxServerTarget): HostTmuxServerSource = when (server) {
    TmuxServerTarget.Default -> HostTmuxServerSource.Default
    is TmuxServerTarget.Named -> HostTmuxServerSource.Project
}

internal fun hostTmuxSessionActions(session: TerminalSessionRecord?): List<HostTmuxSessionAction> = when (session?.status) {
    null -> listOf(HostTmuxSessionAction.Open)
    TerminalSessionStatus.Starting,
    TerminalSessionStatus.Running,
    -> listOf(
        HostTmuxSessionAction.Close,
        HostTmuxSessionAction.Delete,
        HostTmuxSessionAction.Open,
    )
    TerminalSessionStatus.Exited,
    TerminalSessionStatus.Failed,
    TerminalSessionStatus.Disconnected,
    -> listOf(
        HostTmuxSessionAction.Reconnect,
        HostTmuxSessionAction.Delete,
        HostTmuxSessionAction.Open,
    )
}

internal fun hostTmuxSessionAccessibilityLabel(session: HostDiscoveredTmuxSession): String {
    val server = when (val target = session.server) {
        TmuxServerTarget.Default -> "legacy-default"
        is TmuxServerTarget.Named -> target.serverName
    }
    return listOf(
        "terminal-${session.terminalNumber}",
        session.identity.initialPath,
        server,
        session.identity.sessionName,
        session.attachedClients.toString(),
    ).joinToString(", ")
}

private const val ProtocolNameSuffixChars = 8

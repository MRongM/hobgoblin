package com.mrongm.hobgoblin.ui.screens.hosts

import com.mrongm.hobgoblin.navigation.AppRoute
import com.mrongm.hobgoblin.navigation.HostDetailTab
import com.mrongm.hobgoblin.terminals.HostDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.TerminalSessionRecord
import com.mrongm.hobgoblin.terminals.TerminalSessionStatus
import com.mrongm.hobgoblin.terminals.TmuxServerTarget

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

internal fun hostDetailRoute(hostId: String): AppRoute.HostDetail =
    AppRoute.HostDetail(hostId = hostId, selectedTab = HostDetailTab.Projects)

internal fun hostDetailNeedsTmuxScan(route: AppRoute): Boolean =
    route is AppRoute.HostDetail && route.selectedTab == HostDetailTab.Tmux

internal fun hostTmuxPathTitle(initialPath: String): String =
    initialPath.substringAfterLast('/').ifBlank { "/" }

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

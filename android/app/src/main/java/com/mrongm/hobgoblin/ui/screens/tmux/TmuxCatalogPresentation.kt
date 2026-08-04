package com.mrongm.hobgoblin.ui.screens.tmux

import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryProfile
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectPathResolution
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

internal data class HostTmuxProjectImportOption(
    val kind: RemoteProjectKind?,
    val remotePath: String,
    val imported: Boolean,
)

internal fun hostTmuxProjectImportOptions(
    hostId: String,
    initialPath: String,
    resolution: RemoteProjectPathResolution?,
    savedPathResolutions: Map<String, RemoteProjectPathResolution>,
    repositories: List<RemoteRepositoryProfile>,
): List<HostTmuxProjectImportOption> {
    if (resolution == null) {
        return listOf(
            HostTmuxProjectImportOption(
                kind = null,
                remotePath = initialPath,
                imported = hostTmuxPathIsImported(hostId, initialPath, repositories),
            ),
        )
    }

    fun isImported(kind: RemoteProjectKind, remotePath: String): Boolean {
        val normalizedPath = TmuxSessionProtocol.normalizePath(remotePath)
        return repositories.any { repository ->
            if (repository.hostProfileId != hostId || repository.kind != kind) return@any false
            val savedPath = savedPathResolutions[repository.remotePath]?.let { saved ->
                when (repository.kind) {
                    RemoteProjectKind.GitRepository -> saved.projectPath
                    RemoteProjectKind.PlainWorkspace -> saved.worktreePath
                }
            } ?: repository.remotePath
            TmuxSessionProtocol.normalizePath(savedPath) == normalizedPath
        }
    }

    val targets = when (resolution.kind) {
        RemoteProjectKind.GitRepository -> listOf(
            RemoteProjectKind.GitRepository to resolution.projectPath,
            RemoteProjectKind.PlainWorkspace to resolution.worktreePath,
        )
        RemoteProjectKind.PlainWorkspace -> listOf(
            RemoteProjectKind.PlainWorkspace to resolution.worktreePath,
        )
    }
    return targets.map { (kind, remotePath) ->
        HostTmuxProjectImportOption(
            kind = kind,
            remotePath = remotePath,
            imported = isImported(kind, remotePath),
        )
    }
}

internal fun hostTmuxProtocolNameSuffix(value: String): String {
    val suffix = value.takeLast(ProtocolNameSuffixChars)
    return if (suffix.length == value.length) suffix else "…$suffix"
}

internal fun hostTmuxSessionTitle(session: HostDiscoveredTmuxSession): String =
    session.terminalNumber?.let { terminalNumber -> "terminal-$terminalNumber" }
        ?: session.sessionName

internal fun hostTmuxProtocolSessionName(session: HostDiscoveredTmuxSession): String? =
    session.identity?.sessionName

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
        session.terminalNumber?.let { "terminal-$it" } ?: session.sessionName,
        session.initialPath,
        server,
        session.sessionName,
        session.attachedClients.toString(),
    ).joinToString(", ")
}

private const val ProtocolNameSuffixChars = 8

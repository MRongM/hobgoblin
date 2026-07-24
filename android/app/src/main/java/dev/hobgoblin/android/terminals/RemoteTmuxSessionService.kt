package dev.hobgoblin.android.terminals

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.ssh.SshClientFacade
import dev.hobgoblin.android.ssh.SshCommandResult
import dev.hobgoblin.android.ssh.SshConnectionSecrets

sealed interface RemoteTmuxCloseResult {
    data object Closed : RemoteTmuxCloseResult

    data object Missing : RemoteTmuxCloseResult

    data class Failed(val message: String) : RemoteTmuxCloseResult
}

sealed interface RemoteTmuxDiscoveryResult {
    data class Found(val sessions: List<DiscoveredTmuxSession>) : RemoteTmuxDiscoveryResult

    data class Failed(val message: String) : RemoteTmuxDiscoveryResult
}

class RemoteTmuxSessionService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun discoverAssociatedSessions(
        target: RemoteTarget,
        projectRoot: String,
        allowedInitialPaths: Set<String>,
    ): RemoteTmuxDiscoveryResult = try {
        if (TmuxSessionProtocol.normalizePath(projectRoot) == null) {
            return RemoteTmuxDiscoveryResult.Failed("Invalid tmux discovery project root")
        }
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before discovering tmux sessions."
        }
        val secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint)
        val listed = client.runCommand(
            target = target,
            script = TmuxSessionProtocol.listDiscoverableSessionsScript(projectRoot),
            secrets = secrets,
        )
        if (!listed.ok) {
            val message = listed.failureMessage()
            return if (isEmptyDiscoveryMessage(message)) {
                RemoteTmuxDiscoveryResult.Found(emptyList())
            } else {
                RemoteTmuxDiscoveryResult.Failed(message)
            }
        }
        val sessions = TmuxSessionProtocol.parseDiscoverableSessions(
            output = listed.stdout,
            projectRoot = projectRoot,
            allowedInitialPaths = allowedInitialPaths,
        ) ?: return RemoteTmuxDiscoveryResult.Failed("Invalid tmux discovery scope")
        RemoteTmuxDiscoveryResult.Found(sessions)
    } catch (error: Throwable) {
        RemoteTmuxDiscoveryResult.Failed(error.message?.takeIf { it.isNotBlank() } ?: error::class.java.simpleName)
    }

    fun closeAssociatedSession(
        target: RemoteTarget,
        identity: TmuxSessionIdentity,
        projectRoot: String,
    ): RemoteTmuxCloseResult = try {
        require(TmuxSessionProtocol.isCurrentSessionName(identity.sessionName)) {
            "Invalid Hobgoblin tmux session name"
        }
        require(TmuxSessionProtocol.normalizePath(identity.initialPath) == identity.initialPath) {
            "Invalid Hobgoblin tmux initial path"
        }
        require(TmuxSessionProtocol.normalizePath(projectRoot) == projectRoot) {
            "Invalid Hobgoblin tmux project root"
        }
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before closing the tmux session."
        }
        val secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint)
        val listed = client.runCommand(
            target = target,
            script = TmuxSessionProtocol.listSessionsScript(projectRoot),
            secrets = secrets,
        )
        if (!listed.ok) {
            val message = listed.failureMessage()
            return if (isMissingTmuxMessage(message)) {
                RemoteTmuxCloseResult.Missing
            } else {
                RemoteTmuxCloseResult.Failed(message)
            }
        }
        val sessions = TmuxSessionProtocol.parseSessionList(listed.stdout, projectRoot)
            ?: return RemoteTmuxCloseResult.Failed("tmux returned an invalid session list")
        val matchedSession = sessions.firstOrNull { session -> TmuxSessionProtocol.matches(identity, session) }
        if (matchedSession == null) {
            return RemoteTmuxCloseResult.Missing
        }

        val killScript = TmuxSessionProtocol.killSessionScript(projectRoot, identity.sessionName, matchedSession.serverName)
            ?: return RemoteTmuxCloseResult.Failed("Invalid Hobgoblin tmux session name")
        val killed = client.runCommand(target = target, script = killScript, secrets = secrets)
        if (killed.ok) {
            RemoteTmuxCloseResult.Closed
        } else {
            val message = killed.failureMessage()
            if (isMissingTmuxMessage(message)) {
                RemoteTmuxCloseResult.Missing
            } else {
                RemoteTmuxCloseResult.Failed(message)
            }
        }
    } catch (error: Throwable) {
        RemoteTmuxCloseResult.Failed(error.message?.takeIf { it.isNotBlank() } ?: error::class.java.simpleName)
    }

    private fun SshCommandResult.failureMessage(): String =
        message.takeIf { it.isNotBlank() }
            ?: stderr.takeIf { it.isNotBlank() }
            ?: "tmux command failed"

    private fun isMissingTmuxMessage(message: String): Boolean = MissingTmuxPattern.containsMatchIn(message)

    private fun isEmptyDiscoveryMessage(message: String): Boolean =
        message.trim() == "exit 127" || isMissingTmuxMessage(message)

    private companion object {
        val MissingTmuxPattern = Regex(
            "(?:no server running|failed to connect to server|no sessions|can't find session|session not found)",
            RegexOption.IGNORE_CASE,
        )
    }
}

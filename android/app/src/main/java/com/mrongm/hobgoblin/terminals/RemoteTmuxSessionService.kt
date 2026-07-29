package com.mrongm.hobgoblin.terminals

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.ssh.SshClientFacade
import com.mrongm.hobgoblin.ssh.SshCommandResult
import com.mrongm.hobgoblin.ssh.SshConnectionSecrets

sealed interface RemoteTmuxCloseResult {
    data object Closed : RemoteTmuxCloseResult

    data object Missing : RemoteTmuxCloseResult

    data class Failed(val message: String) : RemoteTmuxCloseResult
}

sealed interface RemoteTmuxDiscoveryResult {
    data class Found(val sessions: List<DiscoveredTmuxSession>) : RemoteTmuxDiscoveryResult

    data class Failed(val message: String) : RemoteTmuxDiscoveryResult
}

sealed interface RemoteTmuxBatchDiscoveryResult {
    data class Found(
        val sessions: List<ScopedDiscoveredTmuxSession>,
    ) : RemoteTmuxBatchDiscoveryResult

    data class Failed(
        val message: String,
    ) : RemoteTmuxBatchDiscoveryResult
}

sealed interface RemoteHostTmuxDiscoveryResult {
    data class Loaded(
        val sessions: List<HostDiscoveredTmuxSession>,
    ) : RemoteHostTmuxDiscoveryResult

    data class Failed(
        val message: String,
    ) : RemoteHostTmuxDiscoveryResult
}

class RemoteTmuxSessionService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun discoverHostSessions(target: RemoteTarget): RemoteHostTmuxDiscoveryResult = try {
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before discovering tmux sessions."
        }
        val secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint)
        val listed = client.runCommand(
            target = target,
            script = TmuxSessionProtocol.hostSessionDiscoveryCommand(),
            secrets = secrets,
        )
        if (!listed.ok) {
            RemoteHostTmuxDiscoveryResult.Failed(listed.failureMessage())
        } else {
            val sessions = TmuxSessionProtocol.parseHostSessionDiscoveryOutput(listed.stdout)
            if (sessions == null) {
                RemoteHostTmuxDiscoveryResult.Failed("tmux returned an invalid host session list")
            } else {
                RemoteHostTmuxDiscoveryResult.Loaded(sessions)
            }
        }
    } catch (error: Throwable) {
        RemoteHostTmuxDiscoveryResult.Failed(
            error.message?.takeIf { it.isNotBlank() } ?: error::class.java.simpleName,
        )
    }

    fun closeHostSession(
        target: RemoteTarget,
        discovery: HostDiscoveredTmuxSession,
    ): RemoteTmuxCloseResult = try {
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before closing the tmux session."
        }
        val secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint)
        val listed = client.runCommand(
            target = target,
            script = TmuxSessionProtocol.hostServerSessionListCommand(discovery.server),
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
        val sessions = TmuxSessionProtocol.parseHostSessionDiscoveryOutput(listed.stdout)
            ?: return RemoteTmuxCloseResult.Failed("tmux returned an invalid host session list")
        val exactSession = sessions.firstOrNull { current ->
            current.server == discovery.server &&
                current.sessionName == discovery.sessionName &&
                if (discovery.identity == null) {
                    current.identity == null
                } else {
                    current.identity == discovery.identity &&
                        current.terminalNumber == discovery.terminalNumber
                }
        } ?: return RemoteTmuxCloseResult.Missing
        val killScript = TmuxSessionProtocol.hostSessionKillCommand(
            server = exactSession.server,
            sessionName = exactSession.sessionName,
        ) ?: return RemoteTmuxCloseResult.Failed("Invalid tmux session name")
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
        RemoteTmuxCloseResult.Failed(
            error.message?.takeIf { it.isNotBlank() } ?: error::class.java.simpleName,
        )
    }

    fun discoverAssociatedSessions(
        target: RemoteTarget,
        projectRoot: String,
        allowedInitialPaths: Set<String>,
    ): RemoteTmuxDiscoveryResult = when (
        val result = discoverAssociatedSessions(
            target = target,
            scopes = listOf(TmuxDiscoveryScope(projectRoot, allowedInitialPaths)),
        )
    ) {
        is RemoteTmuxBatchDiscoveryResult.Found -> RemoteTmuxDiscoveryResult.Found(
            result.sessions.map { scoped -> scoped.discovery },
        )
        is RemoteTmuxBatchDiscoveryResult.Failed -> RemoteTmuxDiscoveryResult.Failed(result.message)
    }

    fun discoverAssociatedSessions(
        target: RemoteTarget,
        scopes: List<TmuxDiscoveryScope>,
    ): RemoteTmuxBatchDiscoveryResult = try {
        val normalizedScopes = TmuxSessionProtocol.normalizeDiscoveryScopes(scopes)
            ?: return RemoteTmuxBatchDiscoveryResult.Failed("Invalid tmux discovery scope")
        if (normalizedScopes.isEmpty()) return RemoteTmuxBatchDiscoveryResult.Found(emptyList())
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before discovering tmux sessions."
        }
        val secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint)
        val listed = client.runCommand(
            target = target,
            script = TmuxSessionProtocol.listDiscoverableSessionsScript(normalizedScopes),
            secrets = secrets,
        )
        if (!listed.ok) {
            val message = listed.failureMessage()
            return if (isEmptyDiscoveryMessage(message)) {
                RemoteTmuxBatchDiscoveryResult.Found(emptyList())
            } else {
                RemoteTmuxBatchDiscoveryResult.Failed(message)
            }
        }
        val sessions = TmuxSessionProtocol.parseDiscoverableSessions(
            output = listed.stdout,
            scopes = normalizedScopes,
        ) ?: return RemoteTmuxBatchDiscoveryResult.Failed("Invalid tmux discovery scope")
        RemoteTmuxBatchDiscoveryResult.Found(sessions)
    } catch (error: Throwable) {
        RemoteTmuxBatchDiscoveryResult.Failed(
            error.message?.takeIf { it.isNotBlank() } ?: error::class.java.simpleName,
        )
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
        isMissingTmuxMessage(message)

    private companion object {
        val MissingTmuxPattern = Regex(
            "(?:no server running|failed to connect to server|no sessions|can't find session|session not found)",
            RegexOption.IGNORE_CASE,
        )
    }
}

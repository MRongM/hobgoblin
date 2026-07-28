package com.mrongm.hobgoblin.terminals

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.data.ssh.SecureIdentityStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.ssh.SshConnectionSecrets
import com.mrongm.hobgoblin.ssh.SshPublicKeyEncoding
import com.mrongm.hobgoblin.ssh.SshjClients
import com.mrongm.hobgoblin.ssh.SshPrivateKeys
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.connection.channel.Channel
import net.schmizz.sshj.connection.channel.direct.PTYMode
import net.schmizz.sshj.connection.channel.direct.Session
import net.schmizz.sshj.transport.verification.HostKeyVerifier

class SshTerminalService(
    private val identityStore: SecureIdentityStore? = null,
    private val hostKeyTrustStore: HostKeyTrustStore? = null,
    private val keepAliveIntervalSeconds: () -> Long = { TerminalHeartbeatIntervalSeconds },
) : TerminalSessionFactory {
    // Shares the same SSHJ boundary and trust expectations as SshClientFacade.kt.
    override fun openShell(
        target: RemoteTarget,
        secrets: SshConnectionSecrets,
        startupContext: TerminalStartupContext?,
        cols: Int,
        rows: Int,
        onOutput: (ByteArray) -> Unit,
        onExit: () -> Unit,
        onFailure: (Throwable) -> Unit,
    ): TerminalSession {
        val client = SshjClients.create()
        val interval = keepAliveIntervalSeconds()
            .coerceIn(MinTerminalHeartbeatIntervalSeconds..MaxTerminalHeartbeatIntervalSeconds)
        client.getConnection().getKeepAlive().setKeepAliveInterval(interval.toInt())
        client.addHostKeyVerifier(capturingVerifier(target, secrets.acceptedHostFingerprint))
        client.connect(target.host, target.port)
        val identityBytes = secrets.identityBytes ?: target.identityRefId?.let { identityStore?.loadProtectedBytesById(it) }
        if (identityBytes != null) {
            client.authPublickey(target.user, SshPrivateKeys.keyProvider(client, identityBytes, secrets.passphrase))
        } else {
            client.authPublickey(target.user)
        }

        val sshSession = client.startSession()
        sshSession.allocatePTY("xterm-256color", cols, rows, 0, 0, emptyMap<PTYMode, Int>())
        val resizeChannel = requireNotNull(sshSession as? Session.Shell) {
            "SSH session channel does not support PTY resize"
        }
        val remoteCommand = SshTerminalStartupCommand.remoteCommandForTarget(target, startupContext)
        val terminalChannel: Channel = if (remoteCommand == null) {
            sshSession.startShell()
        } else {
            sshSession.exec(remoteCommand)
        }
        val terminalSession = SshTerminalSession(
            id = UUID.randomUUID().toString(),
            client = client,
            sshSession = sshSession,
            terminalChannel = terminalChannel,
            resizeChannel = resizeChannel,
            onExit = onExit,
            onFailure = onFailure,
        )
        terminalSession.startReader(onOutput)
        terminalSession.scheduleStartupInput(
            input = SshTerminalStartupCommand.initialInputForTarget(target, startupContext),
            onOutput = onOutput,
        )
        return terminalSession
    }

    private fun capturingVerifier(target: RemoteTarget, expectedFingerprint: String?): HostKeyVerifier =
        object : HostKeyVerifier {
            override fun verify(hostname: String, port: Int, key: java.security.PublicKey): Boolean {
                val fingerprint = SshPublicKeyEncoding.fingerprint(key)
                return TerminalHostKeyPolicy.accepts(
                    target = target,
                    fingerprint = fingerprint,
                    explicitFingerprint = expectedFingerprint,
                    trustStore = hostKeyTrustStore,
                )
            }

            override fun findExistingAlgorithms(hostname: String, port: Int): MutableList<String> = mutableListOf()
        }

}

internal object SshTerminalStartupCommand {
    const val InputDelayMillis = 150L

    fun initialInputForTarget(
        target: RemoteTarget,
        startupContext: TerminalStartupContext?,
    ): String? {
        if (startupContext != null) return null
        val normalizedPath = normalizeRemotePath(target.remotePath)
        if (normalizedPath == "/") return null
        return "cd ${shellQuote(normalizedPath)} && pwd\r"
    }

    fun remoteCommandForTarget(
        target: RemoteTarget,
        startupContext: TerminalStartupContext?,
    ): String? {
        if (startupContext == null) return null
        val normalizedPath = normalizeRemotePath(target.remotePath)

        val tmuxIdentity = startupContext.tmuxIdentity
        val loginShellCommand = "exec \"${'$'}{SHELL:-/bin/sh}\" -l"
        val script = if (tmuxIdentity != null) {
            val tmuxCommand = requireNotNull(
                when (startupContext.tmuxStartupPolicy) {
                    TmuxStartupPolicy.AttachOrCreate -> TmuxSessionProtocol.attachOrCreateCommand(
                        tmuxIdentity,
                        startupContext.terminalId,
                        startupContext.repositoryRemotePath,
                    )
                    TmuxStartupPolicy.AttachExisting -> TmuxSessionProtocol.attachExistingCommand(
                        tmuxIdentity,
                        startupContext.terminalId,
                        startupContext.repositoryRemotePath,
                    )
                },
            ) { "Tmux terminal number must be positive" }
            listOf(
                "cd ${shellQuote(normalizedPath)} || exit",
                TmuxSessionProtocol.tmuxExecutableResolverScript(),
                "if ! ${TmuxSessionProtocol.tmuxExecutableResolverInvocation()}; then " +
                    "printf '%s\\n' 'Tmux is unavailable. Use New terminal (Native).' >&2; exit 127; fi",
                tmuxCommand,
                "tmux_status=${'$'}?",
                "if [ \"${'$'}tmux_status\" -ne 0 ]; then " +
                    "printf '%s\\n' 'Tmux failed to start. Use New terminal (Native).' >&2; fi",
                "exit \"${'$'}tmux_status\"",
            ).joinToString("; ")
        } else {
            "cd ${shellQuote(normalizedPath)} || exit; $loginShellCommand"
        }
        return "exec /bin/sh -lc ${shellQuote(script)}"
    }

    fun startupInputFailureOutput(error: Throwable): String =
        "\r\nStartup cd failed: ${error.toTerminalDetail()}\r\n"

    private fun normalizeRemotePath(remotePath: String): String {
        val value = remotePath.ifEmpty { "/" }
        return requireNotNull(TmuxSessionProtocol.normalizePath(value)) {
            "Remote terminal path must be a safe absolute path"
        }
    }

    private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

    private fun Throwable.toTerminalDetail(): String {
        val message = message?.trim()?.takeIf { it.isNotBlank() }
        val className = this::class.java.simpleName.takeIf { it.isNotBlank() }
            ?: this::class.java.name
        return message ?: className
    }

}

internal object TerminalHostKeyPolicy {
    fun accepts(
        target: RemoteTarget,
        fingerprint: String,
        explicitFingerprint: String?,
        trustStore: HostKeyTrustStore?,
    ): Boolean {
        if (explicitFingerprint != null) return explicitFingerprint == fingerprint
        return trustStore?.evaluate(target, fingerprint) is HostKeyTrust.Trusted
    }
}

private class SshTerminalSession(
    override val id: String,
    private val client: SSHClient,
    private val sshSession: Session,
    private val terminalChannel: Channel,
    private val resizeChannel: Session.Shell,
    private val onExit: () -> Unit,
    private val onFailure: (Throwable) -> Unit,
) : TerminalSession {
    private val open = AtomicBoolean(true)

    override fun isConnected(): Boolean = runCatching {
        open.get() && client.isConnected && sshSession.isOpen && terminalChannel.isOpen
    }.getOrDefault(false)

    fun startReader(onOutput: (ByteArray) -> Unit) {
        thread(name = "hobgoblin-ssh-terminal-$id", isDaemon = true) {
            runCatching {
                val buffer = ByteArray(4096)
                while (open.get()) {
                    val count = terminalChannel.inputStream.read(buffer)
                    if (count < 0) break
                    if (count > 0) onOutput(buffer.copyOf(count))
                }
            }.onFailure {
                if (open.get()) onFailure(it)
            }
            if (open.getAndSet(false)) onExit()
        }
    }

    fun scheduleStartupInput(input: String?, onOutput: (ByteArray) -> Unit) {
        if (input == null) return
        thread(name = "hobgoblin-ssh-terminal-startup-$id", isDaemon = true) {
            runCatching {
                Thread.sleep(SshTerminalStartupCommand.InputDelayMillis)
                if (!open.get()) return@thread
                sendInputBytes(input.toByteArray(StandardCharsets.UTF_8))
            }.onFailure {
                if (open.get()) {
                    onOutput(SshTerminalStartupCommand.startupInputFailureOutput(it).toByteArray(StandardCharsets.UTF_8))
                }
            }
        }
    }

    override fun sendInputBytes(value: ByteArray) {
        terminalChannel.outputStream.write(value)
        terminalChannel.outputStream.flush()
    }

    override fun resize(cols: Int, rows: Int) {
        resizeChannel.changeWindowDimensions(cols, rows, 0, 0)
    }

    override fun close() {
        if (!open.getAndSet(false)) return
        runCatching { terminalChannel.close() }
        runCatching { sshSession.close() }
        runCatching { client.close() }
    }
}

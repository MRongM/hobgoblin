package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.data.ssh.SshIdentityMaterialStore
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import java.net.BindException
import java.net.InetSocketAddress
import java.net.ServerSocket
import kotlin.concurrent.thread
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.connection.channel.direct.Parameters
import net.schmizz.sshj.transport.verification.HostKeyVerifier

interface SshLocalForwardClient : AutoCloseable {
    fun connect(host: String, port: Int, acceptedFingerprint: String?)
    fun authenticatePublicKey(user: String, identityBytes: ByteArray)
    fun startLocalForward(localHost: String, localPort: Int, remoteHost: String, remotePort: Int): AutoCloseable
}

interface SshHostFingerprintReader {
    fun fetch(target: RemoteTarget): String
}

class SshjHostFingerprintReader : SshHostFingerprintReader {
    override fun fetch(target: RemoteTarget): String =
        SshjInitializationClient().fetchHostFingerprint(target)
}

class SshLocalPortForwardService(
    private val identityStore: SshIdentityMaterialStore,
    private val hostKeyTrustStore: HostKeyTrustStore,
    private val hostFingerprintReader: SshHostFingerprintReader = SshjHostFingerprintReader(),
    private val clientFactory: () -> SshLocalForwardClient = { SshjLocalForwardClient() },
) : HostPortForwardService {
    override fun open(host: SshHostProfile, rule: HostPortForwardRule): HostPortForwardSession {
        val identityRefId = host.identityRefId
            ?: throw SshLocalPortForwardException("Configure an SSH identity before starting port forwarding")
        val target = RemoteTarget.fromHostProfile(host)
        val fingerprint = fetchTrustedFingerprint(target)
        val identityBytes = identityStore.loadProtectedBytesById(identityRefId)
        val client = clientFactory()
        return runCatching {
            client.connect(host.host, host.port, fingerprint)
            client.authenticatePublicKey(host.user, identityBytes)
            val forward = client.startLocalForward(
                localHost = rule.localBindAddress.value,
                localPort = rule.localPort,
                remoteHost = RemoteLoopback,
                remotePort = rule.remotePort,
            )
            SshLocalPortForwardSession(
                hostId = host.id,
                ruleId = rule.id,
                localBindAddress = rule.localBindAddress,
                localPort = rule.localPort,
                forward = forward,
                client = client,
            )
        }.getOrElse { error ->
            runCatching { client.close() }
            throw mapForwardException(error, rule)
        }
    }

    private fun fetchTrustedFingerprint(target: RemoteTarget): String {
        val current = hostFingerprintReader.fetch(target)
        if (hostKeyTrustStore.evaluate(target, current) !is HostKeyTrust.Trusted) {
            throw SshLocalPortForwardException("Trust this host key before starting port forwarding")
        }
        return current
    }

    private fun mapForwardException(error: Throwable, rule: HostPortForwardRule): SshLocalPortForwardException {
        if (error is SshLocalPortForwardException) return error
        val bind = generateSequence(error) { it.cause }.firstOrNull { it is BindException }
        if (bind != null) {
            return SshLocalPortForwardException("Local port ${rule.localBindAddress.value}:${rule.localPort} is unavailable", error)
        }
        return SshLocalPortForwardException(error.message?.takeIf { it.isNotBlank() } ?: "Port forward failed", error)
    }

    private companion object {
        const val RemoteLoopback = "127.0.0.1"
    }
}

private class SshLocalPortForwardSession(
    override val hostId: String,
    override val ruleId: String,
    override val localBindAddress: HostPortForwardBindAddress,
    override val localPort: Int,
    private val forward: AutoCloseable,
    private val client: AutoCloseable,
) : HostPortForwardSession {
    override fun close() {
        runCatching { forward.close() }
        runCatching { client.close() }
    }
}

class SshjLocalForwardClient : SshLocalForwardClient {
    private val client: SSHClient = SshjClients.create()

    override fun connect(host: String, port: Int, acceptedFingerprint: String?) {
        client.addHostKeyVerifier(
            object : HostKeyVerifier {
                override fun verify(hostname: String, port: Int, key: java.security.PublicKey): Boolean {
                    val fingerprint = SshPublicKeyEncoding.fingerprint(key)
                    return acceptedFingerprint == null || acceptedFingerprint == fingerprint
                }

                override fun findExistingAlgorithms(hostname: String, port: Int): MutableList<String> = mutableListOf()
            },
        )
        client.connect(host, port)
    }

    override fun authenticatePublicKey(user: String, identityBytes: ByteArray) {
        client.authPublickey(user, SshPrivateKeys.keyProvider(client, identityBytes, passphrase = null))
    }

    override fun startLocalForward(localHost: String, localPort: Int, remoteHost: String, remotePort: Int): AutoCloseable {
        val serverSocket = ServerSocket()
        serverSocket.reuseAddress = true
        serverSocket.bind(InetSocketAddress(localHost, localPort))
        val forwarder = client.newLocalPortForwarder(
            Parameters(localHost, localPort, remoteHost, remotePort),
            serverSocket,
        )
        val listenThread = thread(name = "hobgoblin-port-forward-$localHost-$localPort", isDaemon = true) {
            runCatching { forwarder.listen() }
        }
        return AutoCloseable {
            runCatching { forwarder.close() }
            runCatching { serverSocket.close() }
            runCatching { listenThread.interrupt() }
        }
    }

    override fun close() {
        client.close()
    }
}

class SshLocalPortForwardException(
    override val message: String,
    override val cause: Throwable? = null,
) : RuntimeException(message, cause)

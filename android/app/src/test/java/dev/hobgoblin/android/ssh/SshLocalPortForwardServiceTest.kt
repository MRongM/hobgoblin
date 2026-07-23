package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.data.ssh.SshIdentityMaterialStore
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.domain.ssh.RemoteTarget
import dev.hobgoblin.android.domain.ssh.SshHostProfile
import dev.hobgoblin.android.domain.ssh.SshIdentityRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SshLocalPortForwardServiceTest {
    @Test
    fun `open maps selected local endpoint to remote loopback`() {
        val client = FakeSshLocalForwardClient()
        val service = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { client },
        )
        val host = host()
        val rule = rule(
            bindAddress = HostPortForwardBindAddress.AllInterfaces,
            localPort = 8080,
            remotePort = 3000,
        )

        service.open(host, rule)

        assertEquals("example.com", client.connectedHost)
        assertEquals(22, client.connectedPort)
        assertEquals("lee", client.authenticatedUser)
        assertEquals("private-key", client.identity.decodeToString())
        assertEquals("0.0.0.0", client.localHost)
        assertEquals(8080, client.localPort)
        assertEquals("127.0.0.1", client.remoteHost)
        assertEquals(3000, client.remotePort)
    }

    @Test
    fun `open rejects host without identity`() {
        val service = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { FakeSshLocalForwardClient() },
        )

        val error = assertThrows(SshLocalPortForwardException::class.java) {
            service.open(host(identityRefId = null), rule())
        }

        assertEquals("Configure an SSH identity before starting port forwarding", error.message)
    }

    @Test
    fun `open rejects untrusted host key`() {
        val service = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(trusted = false),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { FakeSshLocalForwardClient() },
        )

        val error = assertThrows(SshLocalPortForwardException::class.java) {
            service.open(host(), rule())
        }

        assertEquals("Trust this host key before starting port forwarding", error.message)
    }

    @Test
    fun `close releases forward and ssh client`() {
        val client = FakeSshLocalForwardClient()
        val session = SshLocalPortForwardService(
            identityStore = FakeIdentityStore(),
            hostKeyTrustStore = FakeTrustStore(),
            hostFingerprintReader = FakeFingerprintReader(),
            clientFactory = { client },
        ).open(host(), rule())

        session.close()

        assertEquals(listOf("forward", "client"), client.closed)
    }

    private fun host(identityRefId: String? = "identity-1"): SshHostProfile =
        SshHostProfile(id = "host-1", alias = "Dev", host = "example.com", user = "lee", port = 22, identityRefId = identityRefId)

    private fun rule(
        bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
        localPort: Int = 8080,
        remotePort: Int = 3000,
    ): HostPortForwardRule =
        HostPortForwardRule(id = "rule-1", name = "Web", localBindAddress = bindAddress, localPort = localPort, remotePort = remotePort)

    private class FakeIdentityStore : SshIdentityMaterialStore {
        override fun importPrivateKey(displayName: String, keyBytes: ByteArray): SshIdentityRef {
            throw UnsupportedOperationException("not used")
        }

        override fun loadProtectedBytesById(identityId: String): ByteArray = "private-key".toByteArray()
    }

    private class FakeTrustStore(private val trusted: Boolean = true) : HostKeyTrustStore {
        override fun evaluate(target: RemoteTarget, fingerprint: String): HostKeyTrust =
            if (trusted) HostKeyTrust.Trusted(fingerprint) else HostKeyTrust.Unknown

        override fun trust(target: RemoteTarget, fingerprint: String): HostKeyTrust.Trusted =
            HostKeyTrust.Trusted(fingerprint)
    }

    private class FakeFingerprintReader : SshHostFingerprintReader {
        override fun fetch(target: RemoteTarget): String = "SHA256:test"
    }

    private class FakeSshLocalForwardClient : SshLocalForwardClient {
        var connectedHost: String? = null
        var connectedPort: Int? = null
        var authenticatedUser: String? = null
        lateinit var identity: ByteArray
        var localHost: String? = null
        var localPort: Int? = null
        var remoteHost: String? = null
        var remotePort: Int? = null
        val closed = mutableListOf<String>()

        override fun connect(host: String, port: Int, acceptedFingerprint: String?) {
            connectedHost = host
            connectedPort = port
        }

        override fun authenticatePublicKey(user: String, identityBytes: ByteArray) {
            authenticatedUser = user
            identity = identityBytes
        }

        override fun startLocalForward(localHost: String, localPort: Int, remoteHost: String, remotePort: Int): AutoCloseable {
            this.localHost = localHost
            this.localPort = localPort
            this.remoteHost = remoteHost
            this.remotePort = remotePort
            return AutoCloseable { closed.add("forward") }
        }

        override fun close() {
            closed.add("client")
        }
    }
}

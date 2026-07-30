package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustPolicy
import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.data.ssh.SshIdentityMaterialStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.domain.ssh.SshIdentityRef
import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SshInitializationServiceTest {
    @Test
    fun `initialize automatically trusts a first seen host key before installing`() {
        val trustStore = FakeHostKeyTrustStore(trustedFingerprint = null)
        val client = FakeInitializationClient(fingerprint = "SHA256:new")
        val password = "temporary-password".toCharArray()

        val result = service(
            hostKeyStore = trustStore,
            client = client,
            fingerprint = "SHA256:new",
        ).initialize(profile(), password)

        assertEquals(listOf("SHA256:new"), trustStore.trustedFingerprints)
        assertEquals("generated-identity", result.profile.identityRefId)
        assertEquals(1, client.installedPublicKeys.size)
        assertTrue(password.all { it == '\u0000' })
    }

    @Test
    fun `initialize does not rewrite matching host trust`() {
        val trustStore = FakeHostKeyTrustStore(trustedFingerprint = "SHA256:new")

        service(
            hostKeyStore = trustStore,
            fingerprint = "SHA256:new",
        ).initialize(profile(), "temporary-password".toCharArray())

        assertTrue(trustStore.trustedFingerprints.isEmpty())
    }

    @Test
    fun `changed host key blocks identity generation and installation`() {
        val identityStore = FakeIdentityStore()
        val client = FakeInitializationClient(fingerprint = "SHA256:new")
        val keyGenerator = FakeSshKeyGenerator()
        val password = "temporary-password".toCharArray()

        val error = assertThrows(SshHostKeyChangedException::class.java) {
            service(
                identityStore = identityStore,
                hostKeyStore = FakeHostKeyTrustStore("SHA256:old"),
                client = client,
                keyGenerator = keyGenerator,
                fingerprint = "SHA256:new",
            ).initialize(profile(), password)
        }

        assertEquals("SHA256:old", error.previousFingerprint)
        assertEquals("SHA256:new", error.currentFingerprint)
        assertTrue(keyGenerator.generatedProfiles.isEmpty())
        assertTrue(identityStore.importedPayloads.isEmpty())
        assertTrue(client.installedPublicKeys.isEmpty())
        assertTrue(password.all { it == '\u0000' })
    }

    @Test
    fun `explicitly rejected host key remains blocked`() {
        val password = "temporary-password".toCharArray()

        val error = assertThrows(SshInitializationException::class.java) {
            service(
                hostKeyStore = FakeHostKeyTrustStore(
                    trustedFingerprint = null,
                    evaluatedTrust = HostKeyTrust.Rejected("SHA256:new"),
                ),
                fingerprint = "SHA256:new",
            ).initialize(profile(), password)
        }

        assertEquals("Host key rejected", error.message)
        assertTrue(password.all { it == '\u0000' })
    }

    @Test
    fun `initialize generates app identity and installs its public key after host key trust`() {
        val identityStore = FakeIdentityStore()
        val client = FakeInitializationClient(fingerprint = "SHA256:new")
        val keyGenerator = FakeSshKeyGenerator()
        val password = "temporary-password".toCharArray()
        val service = service(
            identityStore = identityStore,
            client = client,
            keyGenerator = keyGenerator,
            trustedFingerprint = "SHA256:new",
            fingerprint = "SHA256:new",
        )

        val result = service.initialize(profile(), password)

        assertEquals("generated-identity", result.profile.identityRefId)
        assertEquals("ssh-ed25519 generated-public-key hobgoblin-android", client.installedPublicKeys.single())
        assertEquals("temporary-password", client.passwords.single())
        assertTrue(password.all { it == '\u0000' })
        assertEquals(listOf("generated-private-key"), identityStore.importedPayloads)
    }

    @Test
    fun `initialize reuses existing identity and never stores the temporary password`() {
        val identityStore = FakeIdentityStore(existingBytesById = mapOf("identity-1" to "existing-private-key".toByteArray()))
        val client = FakeInitializationClient(fingerprint = "SHA256:new")
        val publicKeyReader = FakePublicKeyReader("ssh-ed25519 existing-public-key imported")
        val password = "secret".toCharArray()
        val service = service(
            identityStore = identityStore,
            client = client,
            publicKeyReader = publicKeyReader,
            trustedFingerprint = "SHA256:new",
            fingerprint = "SHA256:new",
        )

        val result = service.initialize(profile(identityRefId = "identity-1"), password)

        assertEquals("identity-1", result.profile.identityRefId)
        assertEquals(emptyList<String>(), identityStore.importedPayloads)
        assertEquals(listOf("ssh-ed25519 existing-public-key imported"), client.installedPublicKeys)
        assertEquals(listOf("existing-private-key"), publicKeyReader.seenPrivateKeys)
        assertEquals(emptyList<String>(), identityStore.savedPasswords)
        assertTrue(password.all { it == '\u0000' })
    }

    @Test
    fun `initialize replaces unreadable existing identity with a generated identity`() {
        val identityStore = FakeIdentityStore(existingBytesById = mapOf("identity-1" to "bad-private-key".toByteArray()))
        val client = FakeInitializationClient(fingerprint = "SHA256:new")
        val password = "secret".toCharArray()
        val service = service(
            identityStore = identityStore,
            client = client,
            keyGenerator = FakeSshKeyGenerator(),
            publicKeyReader = FailingPublicKeyReader(),
            trustedFingerprint = "SHA256:new",
            fingerprint = "SHA256:new",
        )

        val result = service.initialize(profile(identityRefId = "identity-1"), password)

        assertEquals("generated-identity", result.profile.identityRefId)
        assertEquals(listOf("generated-private-key"), identityStore.importedPayloads)
        assertEquals(listOf("ssh-ed25519 generated-public-key hobgoblin-android"), client.installedPublicKeys)
    }


    @Test
    fun `default generator produces an SSH public key line and private key payload`() {
        val generated = DefaultSshKeyGenerator().generate(profile())

        assertTrue(generated.publicKeyLine.startsWith("ssh-rsa "))
        assertTrue(generated.privateKeyBytes.decodeToString().startsWith("-----BEGIN PRIVATE KEY-----"))
    }

    @Test
    fun `default generator private key can be read back for public key authentication`() {
        val generated = DefaultSshKeyGenerator().generate(profile())

        val publicKeyLine = SshjPublicKeyReader().publicKeyLine(generated.privateKeyBytes)

        assertTrue(publicKeyLine.startsWith("ssh-rsa "))
    }

    @Test
    fun `authorized keys installation ignores comment differences for the same key material`() {
        withAuthorizedKeys("ssh-rsa AAAATEST previous-comment\n") { home, authorizedKeys ->
            runInstallScript(home, "ssh-rsa AAAATEST imported")

            assertEquals(
                listOf("ssh-rsa AAAATEST previous-comment"),
                Files.readAllLines(authorizedKeys),
            )
        }
    }

    @Test
    fun `authorized keys installation preserves options on matching key material`() {
        withAuthorizedKeys("from=\"192.0.2.10\" ssh-rsa AAAATEST restricted\n") { home, authorizedKeys ->
            runInstallScript(home, "ssh-rsa AAAATEST imported")

            assertEquals(
                listOf("from=\"192.0.2.10\" ssh-rsa AAAATEST restricted"),
                Files.readAllLines(authorizedKeys),
            )
        }
    }

    @Test
    fun `authorized keys installation appends different key material`() {
        withAuthorizedKeys("ssh-rsa AAAAOLD existing\n") { home, authorizedKeys ->
            runInstallScript(home, "ssh-rsa AAAANEW hobgoblin-android")

            assertEquals(
                listOf(
                    "ssh-rsa AAAAOLD existing",
                    "ssh-rsa AAAANEW hobgoblin-android",
                ),
                Files.readAllLines(authorizedKeys),
            )
        }
    }

    private inline fun withAuthorizedKeys(
        initialContent: String,
        block: (home: Path, authorizedKeys: Path) -> Unit,
    ) {
        val home = Files.createTempDirectory("hobgoblin-authorized-keys-test")
        val authorizedKeys = Files.createDirectories(home.resolve(".ssh")).resolve("authorized_keys")
        Files.writeString(authorizedKeys, initialContent)
        try {
            block(home, authorizedKeys)
        } finally {
            home.toFile().deleteRecursively()
        }
    }

    private fun runInstallScript(home: Path, publicKeyLine: String) {
        val process = ProcessBuilder("/bin/sh", "-c", authorizedKeysInstallScript(publicKeyLine))
            .redirectErrorStream(true)
            .apply { environment()["HOME"] = home.toString() }
            .start()
        val output = process.inputStream.bufferedReader().use { it.readText() }

        assertEquals(output, 0, process.waitFor())
    }

    private fun service(
        identityStore: FakeIdentityStore = FakeIdentityStore(),
        client: FakeInitializationClient = FakeInitializationClient(fingerprint = "SHA256:new"),
        keyGenerator: SshKeyGenerator = FakeSshKeyGenerator(),
        publicKeyReader: SshPublicKeyReader = FakePublicKeyReader("ssh-ed25519 existing-public-key imported"),
        trustedFingerprint: String? = null,
        fingerprint: String = "SHA256:new",
        hostKeyStore: FakeHostKeyTrustStore = FakeHostKeyTrustStore(trustedFingerprint),
    ): SshInitializationService = SshInitializationService(
        identityStore = identityStore,
        hostKeyStore = hostKeyStore,
        client = client.also { it.fingerprint = fingerprint },
        keyGenerator = keyGenerator,
        publicKeyReader = publicKeyReader,
    )

    private fun profile(identityRefId: String? = null): SshHostProfile = SshHostProfile.create(
        alias = "Dev",
        host = "example.com",
        user = "lee",
        identityRefId = identityRefId,
    )

    private class FakeIdentityStore(
        private val existingBytesById: Map<String, ByteArray> = emptyMap(),
    ) : SshIdentityMaterialStore {
        val importedPayloads = mutableListOf<String>()
        val savedPasswords = mutableListOf<String>()

        override fun importPrivateKey(displayName: String, keyBytes: ByteArray): SshIdentityRef {
            importedPayloads.add(keyBytes.decodeToString())
            return SshIdentityRef(
                id = "generated-identity",
                displayName = displayName,
                protectedPath = "/tmp/generated-identity",
                importedAtMillis = 1L,
            )
        }

        override fun loadProtectedBytesById(identityId: String): ByteArray =
            existingBytesById.getValue(identityId)
    }

    private class FakeHostKeyTrustStore(
        private var trustedFingerprint: String?,
        private val evaluatedTrust: HostKeyTrust? = null,
    ) : HostKeyTrustStore {
        val trustedFingerprints = mutableListOf<String>()

        override fun evaluate(target: RemoteTarget, fingerprint: String): HostKeyTrust =
            evaluatedTrust ?: HostKeyTrustPolicy.evaluate(trustedFingerprint, fingerprint)

        override fun trust(target: RemoteTarget, fingerprint: String): HostKeyTrust.Trusted {
            trustedFingerprints += fingerprint
            trustedFingerprint = fingerprint
            return HostKeyTrust.Trusted(fingerprint)
        }
    }

    private class FakeInitializationClient(
        var fingerprint: String,
    ) : SshInitializationClient {
        val installedPublicKeys = mutableListOf<String>()
        val passwords = mutableListOf<String>()

        override fun fetchHostFingerprint(target: RemoteTarget): String = fingerprint

        override fun installPublicKey(
            target: RemoteTarget,
            password: CharArray,
            expectedFingerprint: String,
            publicKeyLine: String,
        ) {
            assertEquals(fingerprint, expectedFingerprint)
            passwords.add(password.concatToString())
            installedPublicKeys.add(publicKeyLine)
        }
    }

    private class FakeSshKeyGenerator : SshKeyGenerator {
        val generatedProfiles = mutableListOf<SshHostProfile>()

        override fun generate(profile: SshHostProfile): GeneratedSshKey {
            generatedProfiles += profile
            return GeneratedSshKey(
                privateKeyBytes = "generated-private-key".toByteArray(),
                publicKeyLine = "ssh-ed25519 generated-public-key hobgoblin-android",
            )
        }
    }

    private class FakePublicKeyReader(private val publicKeyLine: String) : SshPublicKeyReader {
        val seenPrivateKeys = mutableListOf<String>()

        override fun publicKeyLine(privateKeyBytes: ByteArray): String {
            seenPrivateKeys.add(privateKeyBytes.decodeToString())
            return publicKeyLine
        }
    }

    private class FailingPublicKeyReader : SshPublicKeyReader {
        override fun publicKeyLine(privateKeyBytes: ByteArray): String {
            throw IllegalArgumentException("Unsupported private key")
        }
    }
}

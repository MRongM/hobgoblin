package com.mrongm.hobgoblin.data.ssh

import com.mrongm.hobgoblin.data.HostProfileCodec
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import com.mrongm.hobgoblin.domain.ssh.SshIdentityRef
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SecureIdentityStoreTest {
    @Test
    fun `identity metadata stores a reference without raw key text`() {
        val identity = SshIdentityRef(
            id = "identity-1",
            displayName = "id_ed25519",
            protectedPath = "/app/ssh-identities/identity-1.identity",
            importedAtMillis = 1L,
        )
        val host = SshHostProfile.create(
            alias = "Dev",
            host = "example.com",
            user = "lee",
            identityRefId = identity.id,
        )

        val payload = HostProfileCodec.encode(listOf(host))

        assertEquals(identity.id, HostProfileCodec.decode(payload).single().identityRefId)
        assertFalse(payload.contains("OPENSSH"))
        assertFalse(payload.contains("raw key bytes"))
    }

    @Test
    fun `encrypted identity record round trips as protected payload`() {
        val record = EncryptedIdentityRecord(ivBase64 = "iv", encryptedPayloadBase64 = "payload")

        assertEquals(record, EncryptedIdentityRecord.deserialize(record.serialize()))
    }

    @Test
    fun `host profile serialization rejects secret field names`() {
        val payload = HostProfileCodec.encode(
            listOf(SshHostProfile.create(alias = "Dev", host = "example.com", user = "lee", identityRefId = "id-1")),
        )

        assertFalse(payload.contains("password", ignoreCase = true))
        assertFalse(payload.contains("passphrase", ignoreCase = true))
        assertFalse(payload.contains("privateKey", ignoreCase = true))
        assertFalse(payload.contains("rawKey", ignoreCase = true))
        assertTrue(payload.isNotBlank())
    }

    @Test
    fun `private key export writes original bytes and clears plaintext`() {
        val privateKey = "generic-private-key".toByteArray()
        val output = ByteArrayOutputStream()

        writePrivateKey(output) { privateKey }

        assertEquals("generic-private-key", output.toString(Charsets.UTF_8.name()))
        assertTrue(privateKey.all { it == 0.toByte() })
    }

    @Test
    fun `private key export clears plaintext when writing fails`() {
        val privateKey = "generic-private-key".toByteArray()
        val failingOutput = object : OutputStream() {
            override fun write(value: Int) {
                throw IOException("write failed")
            }
        }

        assertThrows(IOException::class.java) {
            writePrivateKey(failingOutput) { privateKey }
        }

        assertTrue(privateKey.all { it == 0.toByte() })
    }
}

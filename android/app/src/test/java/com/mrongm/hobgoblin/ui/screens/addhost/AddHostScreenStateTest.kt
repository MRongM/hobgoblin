package com.mrongm.hobgoblin.ui.screens.addhost

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile

class AddHostScreenStateTest {
    @Test
    fun `saved host edit always exposes connectivity diagnostics`() {
        assertFalse(shouldShowSavedHostDiagnostics(initialHost = null))
        assertTrue(shouldShowSavedHostDiagnostics(host(identityRefId = null)))
        assertTrue(shouldShowSavedHostDiagnostics(host(identityRefId = "identity-1")))
    }

    @Test
    fun `new hosts default to root user while edited hosts keep existing user`() {
        assertEquals("root", initialHostUser(null))
        assertEquals(
            "deploy",
            initialHostUser(
                SshHostProfile.create(
                    alias = "Dev",
                    host = "example.com",
                    user = "deploy",
                ),
            ),
        )
    }

    @Test
    fun `optional ssh initialization requires valid manual host fields`() {
        assertFalse(canOfferSshInitialization(host = "", user = "lee", port = "22"))
        assertFalse(canOfferSshInitialization(host = "example.com", user = "", port = "22"))
        assertFalse(canOfferSshInitialization(host = "example.com", user = "lee", port = "0"))
        assertTrue(canOfferSshInitialization(host = "example.com", user = "lee", port = "22"))
    }

    @Test
    fun `initialized identity is used when no imported identity is selected`() {
        assertEquals(
            "generated-id",
            resolveHostIdentityRefId(
                selectedIdentityId = null,
                initializedIdentityRefId = "generated-id",
                existingIdentityRefId = null,
            ),
        )
    }

    @Test
    fun `selected imported identity takes precedence over initialized identity`() {
        assertEquals(
            "imported-id",
            resolveHostIdentityRefId(
                selectedIdentityId = "imported-id",
                initializedIdentityRefId = "generated-id",
                existingIdentityRefId = "existing-id",
            ),
        )
    }

    @Test
    fun `private key export is available only while editing with an effective identity`() {
        assertFalse(
            canExportPrivateKey(
                initialHost = null,
                identityRefId = "identity-1",
                exportAvailable = true,
            ),
        )
        assertFalse(
            canExportPrivateKey(
                initialHost = host(identityRefId = null),
                identityRefId = null,
                exportAvailable = true,
            ),
        )
        assertFalse(
            canExportPrivateKey(
                initialHost = host(identityRefId = "identity-1"),
                identityRefId = "identity-1",
                exportAvailable = false,
            ),
        )
        assertTrue(
            canExportPrivateKey(
                initialHost = host(identityRefId = "identity-1"),
                identityRefId = "imported-identity",
                exportAvailable = true,
            ),
        )
    }

    @Test
    fun `private key export filename is host-derived and path-safe`() {
        assertEquals(
            "hobgoblin-Dev_staging-private-key",
            privateKeyExportFileName(host(identityRefId = "identity-1", alias = " Dev / staging ")),
        )
    }

    @Test
    fun `connection test result is applied only to the latest draft generation`() {
        assertTrue(isLatestConnectionTest(requestGeneration = 3, currentGeneration = 3))
        assertFalse(isLatestConnectionTest(requestGeneration = 2, currentGeneration = 3))
    }

    @Test
    fun `ssh initialization submission rejects repeated starts until completion`() {
        val submission = SshInitializationSubmission()

        assertTrue(submission.tryStart())
        assertTrue(submission.inProgress)
        assertFalse(submission.tryStart())
    }

    @Test
    fun `ssh initialization submission allows retry after completion`() {
        val submission = SshInitializationSubmission()
        assertTrue(submission.tryStart())

        submission.finish()

        assertFalse(submission.inProgress)
        assertTrue(submission.tryStart())
    }

    private fun host(identityRefId: String?, alias: String = "Dev"): SshHostProfile =
        SshHostProfile.create(
            alias = alias,
            host = "example.test",
            user = "dev",
            identityRefId = identityRefId,
        )
}

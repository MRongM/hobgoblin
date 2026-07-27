package com.mrongm.hobgoblin.ui.screens.addhost

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import com.mrongm.hobgoblin.ssh.SshInitializationCheck
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
    fun `temporary password input is visible after manual host fields are valid`() {
        assertTrue(shouldShowSshInitializationPasswordInput(enabled = true, check = null))
        assertTrue(
            shouldShowSshInitializationPasswordInput(
                enabled = true,
                check = SshInitializationCheck.NeedsServerPassword,
            ),
        )
        assertFalse(shouldShowSshInitializationPasswordInput(enabled = false, check = null))
        assertFalse(
            shouldShowSshInitializationPasswordInput(
                enabled = true,
                check = SshInitializationCheck.NeedsHostKeyTrust("SHA256:test"),
            ),
        )
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
    fun `connection test result is applied only to the latest draft generation`() {
        assertTrue(isLatestConnectionTest(requestGeneration = 3, currentGeneration = 3))
        assertFalse(isLatestConnectionTest(requestGeneration = 2, currentGeneration = 3))
    }

    private fun host(identityRefId: String?): SshHostProfile =
        SshHostProfile.create(
            alias = "Dev",
            host = "example.test",
            user = "dev",
            identityRefId = identityRefId,
        )
}

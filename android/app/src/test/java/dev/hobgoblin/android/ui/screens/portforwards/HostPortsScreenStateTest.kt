package dev.hobgoblin.android.ui.screens.portforwards

import dev.hobgoblin.android.R
import dev.hobgoblin.android.domain.ssh.HostPortForwardBindAddress
import dev.hobgoblin.android.domain.ssh.HostPortForwardRule
import dev.hobgoblin.android.ssh.HostPortForwardStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostPortsScreenStateTest {
    @Test
    fun `draft defaults to loopback bind address`() {
        val draft = HostPortForwardDraft()

        assertEquals(HostPortForwardBindAddress.Loopback, draft.bindAddress)
        assertFalse(shouldShowLanWarning(draft.bindAddress))
    }

    @Test
    fun `lan bind address shows warning`() {
        assertTrue(shouldShowLanWarning(HostPortForwardBindAddress.AllInterfaces))
    }

    @Test
    fun `draft validation creates trimmed rule`() {
        val result = validatePortForwardDraft(
            draft = HostPortForwardDraft(name = "  Web  ", localPort = "8080", remotePort = "3000"),
            existingRules = emptyList(),
            editingRuleId = null,
        )

        assertTrue(result is PortForwardDraftValidation.Valid)
        val rule = (result as PortForwardDraftValidation.Valid).rule
        assertEquals("Web", rule.name)
        assertEquals(8080, rule.localPort)
        assertEquals(3000, rule.remotePort)
    }

    @Test
    fun `draft validation rejects duplicate local endpoint`() {
        val existing = HostPortForwardRule.create(name = "A", localPort = 8080, remotePort = 3000)
        val result = validatePortForwardDraft(
            draft = HostPortForwardDraft(localPort = "8080", remotePort = "3001"),
            existingRules = listOf(existing),
            editingRuleId = null,
        )

        assertEquals(
            PortForwardDraftValidation.Invalid(
                PortForwardDraftError.DuplicateLocalEndpoint("127.0.0.1", 8080),
            ),
            result,
        )
    }

    @Test
    fun `status label maps runtime states`() {
        assertEquals(R.string.ports_status_stopped, portForwardStatusLabelResource(HostPortForwardStatus.Stopped))
        assertEquals(R.string.ports_status_starting, portForwardStatusLabelResource(HostPortForwardStatus.Starting))
        assertEquals(R.string.ports_status_running, portForwardStatusLabelResource(HostPortForwardStatus.Running(1L)))
        assertEquals(R.string.ports_status_failed, portForwardStatusLabelResource(HostPortForwardStatus.Failed("denied")))
    }
}

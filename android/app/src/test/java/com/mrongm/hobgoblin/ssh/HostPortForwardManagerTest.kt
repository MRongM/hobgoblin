package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.domain.ssh.HostPortForwardBindAddress
import com.mrongm.hobgoblin.domain.ssh.HostPortForwardRule
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HostPortForwardManagerTest {
    @Test
    fun `start opens service and marks rule running`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service, clock = { 100L })
        val host = host()
        val rule = rule(localPort = 8080)

        val status = manager.start(host, rule)

        assertEquals(HostPortForwardStatus.Running(startedAtMillis = 100L), status)
        assertEquals(listOf("host-1:rule-8080"), service.opened)
        assertEquals(status, manager.status(rule.id))
    }

    @Test
    fun `start is idempotent for an already running rule`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val host = host()
        val rule = rule(localPort = 8080)

        manager.start(host, rule)
        val second = manager.start(host, rule)

        assertTrue(second is HostPortForwardStatus.Running)
        assertEquals(1, service.opened.size)
    }

    @Test
    fun `start rejects another running rule on the same local endpoint`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val host = host()
        val first = rule(id = "first", localPort = 8080)
        val second = rule(id = "second", localPort = 8080)

        manager.start(host, first)
        val status = manager.start(host, second)

        assertEquals(
            HostPortForwardStatus.Failed("Local port 127.0.0.1:8080 is already running"),
            status,
        )
        assertEquals(1, service.opened.size)
    }

    @Test
    fun `stop closes the running session and marks rule stopped`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val rule = rule(localPort = 8080)

        manager.start(host(), rule)
        manager.stop(rule.id)

        assertEquals(HostPortForwardStatus.Stopped, manager.status(rule.id))
        assertEquals(listOf("rule-8080"), service.closed)
    }

    @Test
    fun `stop for host closes only sessions owned by that host`() {
        val service = FakeHostPortForwardService()
        val manager = HostPortForwardManager(service = service)
        val first = rule(id = "first", localPort = 8080)
        val second = rule(id = "second", localPort = 9090)

        manager.start(host(id = "host-1"), first)
        manager.start(host(id = "host-2"), second)
        manager.stopForHost("host-1")

        assertEquals(HostPortForwardStatus.Stopped, manager.status(first.id))
        assertTrue(manager.status(second.id) is HostPortForwardStatus.Running)
        assertEquals(listOf("first"), service.closed)
    }

    @Test
    fun `observers receive status changes`() {
        val manager = HostPortForwardManager(service = FakeHostPortForwardService(), clock = { 7L })
        val observed = mutableListOf<Map<String, HostPortForwardStatus>>()
        val rule = rule(localPort = 8080)

        val observer = manager.observeStatuses { observed.add(it) }
        manager.start(host(), rule)
        manager.stop(rule.id)
        observer.close()

        assertEquals(emptyMap<String, HostPortForwardStatus>(), observed[0])
        assertEquals(HostPortForwardStatus.Starting, observed[1][rule.id])
        assertEquals(HostPortForwardStatus.Running(7L), observed[2][rule.id])
        assertEquals(HostPortForwardStatus.Stopped, observed[3][rule.id])
    }

    private fun host(id: String = "host-1"): SshHostProfile =
        SshHostProfile(id = id, alias = "Dev", host = "example.com", user = "lee", port = 22, identityRefId = "identity-1")

    private fun rule(
        id: String = "rule-8080",
        localPort: Int,
        bindAddress: HostPortForwardBindAddress = HostPortForwardBindAddress.Loopback,
    ): HostPortForwardRule =
        HostPortForwardRule(id = id, name = "Web", localBindAddress = bindAddress, localPort = localPort, remotePort = 3000)

    private class FakeHostPortForwardService : HostPortForwardService {
        val opened = mutableListOf<String>()
        val closed = mutableListOf<String>()

        override fun open(host: SshHostProfile, rule: HostPortForwardRule): HostPortForwardSession {
            opened.add("${host.id}:${rule.id}")
            return object : HostPortForwardSession {
                override val hostId: String = host.id
                override val ruleId: String = rule.id
                override val localBindAddress: HostPortForwardBindAddress = rule.localBindAddress
                override val localPort: Int = rule.localPort

                override fun close() {
                    closed.add(rule.id)
                }
            }
        }
    }
}

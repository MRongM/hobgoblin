package dev.hobgoblin.android.domain.ssh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class HostPortForwardRuleTest {
    @Test
    fun `port forward rule trims name and defaults loopback bind address`() {
        val rule = HostPortForwardRule.create(
            name = "  Web app  ",
            localPort = 8080,
            remotePort = 3000,
        )

        assertEquals("Web app", rule.name)
        assertEquals(HostPortForwardBindAddress.Loopback, rule.localBindAddress)
        assertEquals("127.0.0.1:8080 -> 127.0.0.1:3000", rule.generatedDisplayName)
    }

    @Test
    fun `bind address parses only supported local values`() {
        assertEquals(HostPortForwardBindAddress.Loopback, HostPortForwardBindAddress.fromValue("127.0.0.1"))
        assertEquals(HostPortForwardBindAddress.AllInterfaces, HostPortForwardBindAddress.fromValue("0.0.0.0"))
        assertThrows(IllegalArgumentException::class.java) {
            HostPortForwardBindAddress.fromValue("192.168.1.5")
        }
    }

    @Test
    fun `port forward rule rejects ports outside ssh range`() {
        assertThrows(IllegalArgumentException::class.java) {
            HostPortForwardRule.create(name = "", localPort = 0, remotePort = 3000)
        }
        assertThrows(IllegalArgumentException::class.java) {
            HostPortForwardRule.create(name = "", localPort = 8080, remotePort = 65536)
        }
    }

    @Test
    fun `host rejects duplicate local endpoints within one profile`() {
        val first = HostPortForwardRule.create(name = "A", localPort = 8080, remotePort = 3000)
        val second = HostPortForwardRule.create(name = "B", localPort = 8080, remotePort = 3001)

        val error = assertThrows(IllegalArgumentException::class.java) {
            SshHostProfile.create(
                alias = "Dev",
                host = "example.com",
                user = "lee",
                portForwards = listOf(first, second),
            )
        }

        assertTrue(error.message.orEmpty().contains("Local port forward endpoints must be unique"))
    }
}

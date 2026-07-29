package com.mrongm.hobgoblin.ui.screens.hosts

import androidx.compose.ui.graphics.Color
import com.mrongm.hobgoblin.R
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HostsScreenStateTest {
    @Test
    fun `host temporary terminal opens at home directory without a project`() {
        assertEquals("/", HOST_TEMPORARY_TERMINAL_REMOTE_PATH)
        assertTrue(isHostTemporaryTerminal("/", repositoryId = null))
        assertFalse(isHostTemporaryTerminal("/", repositoryId = null, returnsToHostDetail = true))
        assertFalse(isHostTemporaryTerminal("~", repositoryId = null))
        assertFalse(isHostTemporaryTerminal("/", repositoryId = "repo-1"))
    }

    @Test
    fun `host temporary terminal route defers session startup to terminal screen`() {
        val route = hostTemporaryTerminalRoute("host-1")

        assertEquals("host-1", route.hostId)
        assertEquals(HOST_TEMPORARY_TERMINAL_REMOTE_PATH, route.remotePath)
        assertNull(route.repositoryId)
        assertNull(route.terminalSessionId)
    }

    @Test
    fun `host health defaults to offline`() {
        assertEquals(HostHealth.Offline, hostHealth(host(lastDiagnosticStatus = null)))
    }

    @Test
    fun `host health only exposes online and offline states`() {
        assertEquals(
            listOf(R.string.common_status_online, R.string.common_status_offline),
            HostHealth.entries.map(::hostHealthLabelResource),
        )
    }

    @Test
    fun `host health maps persisted diagnostics to online and offline labels`() {
        assertEquals(HostHealth.Online, hostHealth(host(lastDiagnosticStatus = "healthy")))
        assertEquals(HostHealth.Offline, hostHealth(host(lastDiagnosticStatus = "unhealthy")))
        assertEquals(HostHealth.Offline, hostHealth(host(lastDiagnosticStatus = "pending")))
        assertEquals(R.string.common_status_online, hostHealthLabelResource(HostHealth.Online))
        assertEquals(R.string.common_status_offline, hostHealthLabelResource(HostHealth.Offline))
    }

    @Test
    fun `host health indicator colors are scoped to the status dot`() {
        assertEquals(Color(0xFF137333), hostHealthIndicatorColor(HostHealth.Online))
        assertEquals(Color(0xFFC5221F), hostHealthIndicatorColor(HostHealth.Offline))
    }

    @Test
    fun `host ports are available only for saved hosts`() {
        assertTrue(canOpenHostPorts(host(lastDiagnosticStatus = null)))
    }

    @Test
    fun `host card primary action opens host detail`() {
        val source = hostsScreenSource()

        assertTrue(source.contains("onOpenHostDetail: (String) -> Unit"))
        assertTrue(source.contains("onClick = onOpenHostDetail"))
    }

    @Test
    fun `non-empty host list starts directly with host cards`() {
        assertFalse(hostsScreenSource().contains("R.string.hosts_saved_heading"))
    }

    @Test
    fun `host cards show localized project counts including zero`() {
        val source = hostsScreenSource()

        assertTrue(source.contains("projectCountByHostId: Map<String, Int> = emptyMap()"))
        assertTrue(source.contains("projectCount = projectCountByHostId[host.id] ?: 0"))
        assertTrue(source.contains("R.plurals.hosts_project_count"))
    }

    private fun host(lastDiagnosticStatus: String?): SshHostProfile =
        SshHostProfile.create(
            alias = "Dev",
            host = "example.com",
            user = "lee",
            identityRefId = "identity-1",
        ).copy(lastDiagnosticStatus = lastDiagnosticStatus)

    private fun hostsScreenSource(): String = listOf(
        File("src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreen.kt"),
        File("app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreen.kt"),
        File("android/app/src/main/java/com/mrongm/hobgoblin/ui/screens/hosts/HostsScreen.kt"),
    ).firstOrNull(File::isFile)?.readText() ?: error("HostsScreen.kt not found")
}

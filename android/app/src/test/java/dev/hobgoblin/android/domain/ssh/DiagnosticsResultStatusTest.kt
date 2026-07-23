package dev.hobgoblin.android.domain.ssh

import org.junit.Assert.assertEquals
import org.junit.Test

class DiagnosticsResultStatusTest {
    @Test
    fun `successful diagnostics record a healthy host status`() {
        val host = host()

        assertEquals(
            "healthy",
            host.withDiagnosticResult(resultFor(host, ok = true)).lastDiagnosticStatus,
        )
    }

    @Test
    fun `failed diagnostics record an unhealthy host status`() {
        val host = host()

        assertEquals(
            "unhealthy",
            host.withDiagnosticResult(resultFor(host, ok = false)).lastDiagnosticStatus,
        )
    }

    private fun host(): SshHostProfile = SshHostProfile.create(
        alias = "Test host",
        host = "example.com",
        user = "deploy",
        identityRefId = "identity-1",
    )

    private fun resultFor(host: SshHostProfile, ok: Boolean): DiagnosticsResult = DiagnosticsResult(
        target = RemoteTarget.fromHostProfile(host),
        ok = ok,
        stages = emptyList(),
    )
}

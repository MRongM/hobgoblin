package com.mrongm.hobgoblin.ui.screens.addhost

import com.mrongm.hobgoblin.domain.ssh.DiagnosticStage
import com.mrongm.hobgoblin.domain.ssh.DiagnosticStageResult
import com.mrongm.hobgoblin.domain.ssh.DiagnosticStatus
import com.mrongm.hobgoblin.domain.ssh.DiagnosticsResult
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class HostInitializationFlowTest {
    @Test
    fun `diagnostics receive the initialized profile after key installation`() {
        val calls = mutableListOf<String>()
        val draft = host(identityRefId = null)
        val initialized = host(identityRefId = "identity-1")

        val result = runHostInitializationFlow(
            draftProfile = draft,
            password = "secret".toCharArray(),
            initialize = { input, _ ->
                calls += "initialize:${input.identityRefId}"
                initialized
            },
            diagnose = { input ->
                calls += "diagnose:${input.identityRefId}"
                diagnostics(input, ok = true)
            },
        )

        assertEquals(listOf("initialize:null", "diagnose:identity-1"), calls)
        assertEquals(initialized, result.profile)
        assertTrue(result is HostInitializationFlowResult.Diagnosed)
    }

    @Test
    fun `initialization failure prevents diagnostics`() {
        var diagnosticCalls = 0

        assertThrows(IllegalStateException::class.java) {
            runHostInitializationFlow(
                draftProfile = host(identityRefId = null),
                password = "secret".toCharArray(),
                initialize = { _, _ -> error("install failed") },
                diagnose = {
                    diagnosticCalls += 1
                    diagnostics(it, ok = true)
                },
            )
        }

        assertEquals(0, diagnosticCalls)
    }

    @Test
    fun `diagnostic exception retains the initialized profile`() {
        val initialized = host(identityRefId = "identity-1")

        val result = runHostInitializationFlow(
            draftProfile = host(identityRefId = null),
            password = "secret".toCharArray(),
            initialize = { _, _ -> initialized },
            diagnose = { error("shell unavailable") },
        )

        assertTrue(result is HostInitializationFlowResult.DiagnosticFailed)
        assertEquals(initialized, result.profile)
        assertEquals(
            "shell unavailable",
            (result as HostInitializationFlowResult.DiagnosticFailed).error.message,
        )
    }

    private fun host(identityRefId: String?): SshHostProfile = SshHostProfile.create(
        alias = "Development",
        host = "example.test",
        user = "developer",
        identityRefId = identityRefId,
    )

    private fun diagnostics(profile: SshHostProfile, ok: Boolean): DiagnosticsResult = DiagnosticsResult(
        target = RemoteTarget.fromHostProfile(profile),
        ok = ok,
        stages = listOf(
            DiagnosticStageResult(DiagnosticStage.SSH, DiagnosticStatus.Passed),
            DiagnosticStageResult(DiagnosticStage.Shell, DiagnosticStatus.Passed),
        ),
    )
}

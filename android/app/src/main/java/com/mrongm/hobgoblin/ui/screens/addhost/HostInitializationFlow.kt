package com.mrongm.hobgoblin.ui.screens.addhost

import com.mrongm.hobgoblin.domain.ssh.DiagnosticsResult
import com.mrongm.hobgoblin.domain.ssh.SshHostProfile

internal sealed interface HostInitializationFlowResult {
    val profile: SshHostProfile

    data class Diagnosed(
        override val profile: SshHostProfile,
        val diagnostics: DiagnosticsResult,
    ) : HostInitializationFlowResult

    data class DiagnosticFailed(
        override val profile: SshHostProfile,
        val error: Throwable,
    ) : HostInitializationFlowResult
}

internal fun runHostInitializationFlow(
    draftProfile: SshHostProfile,
    password: CharArray,
    initialize: (SshHostProfile, CharArray) -> SshHostProfile,
    diagnose: (SshHostProfile) -> DiagnosticsResult,
): HostInitializationFlowResult {
    val initializedProfile = initialize(draftProfile, password)
    return runCatching { diagnose(initializedProfile) }.fold(
        onSuccess = { HostInitializationFlowResult.Diagnosed(initializedProfile, it) },
        onFailure = { HostInitializationFlowResult.DiagnosticFailed(initializedProfile, it) },
    )
}

package dev.hobgoblin.android.ssh

import dev.hobgoblin.android.data.ssh.HostKeyTrustStore
import dev.hobgoblin.android.domain.ssh.HostKeyTrust
import dev.hobgoblin.android.domain.ssh.RemoteRepositoryWorktree
import dev.hobgoblin.android.domain.ssh.RemoteTarget

class RemoteWorktreeService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun createWorktree(
        target: RemoteTarget,
        source: WorktreeCreationSource,
        worktreePath: String,
    ) {
        val fingerprint = trustedFingerprint(target)
        val createArguments = when (source) {
            is WorktreeCreationSource.ExistingLocal ->
                "-- ${shellQuote(worktreePath)} ${shellQuote(source.branch)}"
            is WorktreeCreationSource.TrackRemote ->
                "-b ${shellQuote(source.localBranch)} --track -- ${shellQuote(worktreePath)} ${shellQuote(source.remoteRef)}"
        }
        val result = client.runCommand(
            target = target,
            script = "git -C ${shellQuote(target.remotePath)} worktree add $createArguments",
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        require(result.ok) { result.message.ifBlank { result.stderr.ifBlank { "Remote worktree create failed" } } }
    }

    fun removeWorktree(target: RemoteTarget, worktree: RemoteRepositoryWorktree) {
        val safety = evaluateWorktreeRemoval(worktree)
        require(safety.allowed) { safety.reason ?: "Remote worktree remove is blocked" }
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = "git -C ${shellQuote(target.remotePath)} worktree remove ${shellQuote(worktree.path)}",
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        require(result.ok) { result.message.ifBlank { result.stderr.ifBlank { "Remote worktree remove failed" } } }
    }

    private fun trustedFingerprint(target: RemoteTarget): String {
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before changing remote worktrees."
        }
        return fingerprint
    }
}

sealed interface WorktreeCreationSource {
    data class ExistingLocal(val branch: String) : WorktreeCreationSource
    data class TrackRemote(
        val remoteRef: String,
        val localBranch: String,
    ) : WorktreeCreationSource
}

data class WorktreeRemovalSafety(
    val allowed: Boolean,
    val reason: String?,
    val blockReason: WorktreeRemovalBlockReason? = null,
)

enum class WorktreeRemovalBlockReason {
    Primary,
    Dirty,
    Locked,
    Missing,
    ProtectedBranch,
}

fun evaluateWorktreeRemoval(worktree: RemoteRepositoryWorktree): WorktreeRemovalSafety = when {
    worktree.isPrimary -> WorktreeRemovalSafety(
        false,
        "Primary worktree cannot be removed.",
        WorktreeRemovalBlockReason.Primary,
    )
    worktree.isDirty -> WorktreeRemovalSafety(
        false,
        "Dirty worktree cannot be removed.",
        WorktreeRemovalBlockReason.Dirty,
    )
    worktree.isLocked -> WorktreeRemovalSafety(
        false,
        "Locked worktree cannot be removed.",
        WorktreeRemovalBlockReason.Locked,
    )
    worktree.isMissing -> WorktreeRemovalSafety(
        false,
        "Missing worktree cleanup is not supported here.",
        WorktreeRemovalBlockReason.Missing,
    )
    isProtectedBranch(worktree.branch) -> WorktreeRemovalSafety(
        false,
        "Protected branch worktree cannot be removed.",
        WorktreeRemovalBlockReason.ProtectedBranch,
    )
    else -> WorktreeRemovalSafety(true, null)
}

fun worktreeRemovalConfirmationText(worktree: RemoteRepositoryWorktree): String =
    "Remove remote worktree ${worktree.path} from the SSH server? This does not delete the branch."

private fun isProtectedBranch(branch: String?): Boolean {
    val value = branch ?: return false
    return value == "main" || value == "master" || value == "develop" || value.startsWith("release/")
}

private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

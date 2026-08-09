package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget

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
        val safety = evaluateWorktreeRemoval(target.remotePath, worktree)
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
    IdentityChanged,
}

fun evaluateWorktreeRemoval(
    repositoryPath: String,
    worktree: RemoteRepositoryWorktree,
): WorktreeRemovalSafety {
    val pathIdentifiesPrimary = normalizeRemoteWorktreePath(repositoryPath) ==
        normalizeRemoteWorktreePath(worktree.path)
    if (pathIdentifiesPrimary != worktree.isPrimary) {
        return WorktreeRemovalSafety(
            false,
            "Worktree identity changed; refresh and try again.",
            WorktreeRemovalBlockReason.IdentityChanged,
        )
    }
    return when {
        pathIdentifiesPrimary -> WorktreeRemovalSafety(
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
        else -> WorktreeRemovalSafety(true, null)
    }
}

private fun normalizeRemoteWorktreePath(value: String): String {
    val collapsed = value.trim().replace(Regex("/+"), "/")
    return if (collapsed == "/") collapsed else collapsed.trimEnd('/')
}

private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

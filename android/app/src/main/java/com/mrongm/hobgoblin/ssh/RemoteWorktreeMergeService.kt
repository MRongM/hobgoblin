package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositorySnapshot
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget

class RemoteWorktreeMergeService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun mergeInto(
        target: RemoteTarget,
        destination: RemoteRepositoryWorktree,
        sourceBranch: String,
    ) {
        val destinationSafety = evaluateMergeDestination(destination)
        require(destinationSafety.allowed) { destinationSafety.reason ?: "Merge destination is unavailable." }
        val destinationBranch = requireNotNull(destination.branch)
        require(sourceBranch.isNotBlank()) { "Merge source branch is required." }
        require(sourceBranch != destinationBranch) { "Merge source and destination branches must differ." }

        executeMerge(
            target = target,
            script = remoteMergeScript(
                repositoryPath = target.remotePath,
                destination = destination,
                sourceBranch = sourceBranch,
            ),
        )
    }

    fun mergeOut(
        target: RemoteTarget,
        source: RemoteRepositoryWorktree,
        destination: RemoteRepositoryWorktree,
    ) {
        val sourceSafety = evaluateMergeOutSource(source)
        require(sourceSafety.allowed) { sourceSafety.reason ?: "Merge source is unavailable." }
        val destinationSafety = evaluateMergeDestination(destination)
        require(destinationSafety.allowed) { destinationSafety.reason ?: "Merge destination is unavailable." }
        require(source.path != destination.path) { "Merge source and destination worktrees must differ." }
        val sourceBranch = requireNotNull(source.branch)
        val destinationBranch = requireNotNull(destination.branch)
        require(sourceBranch != destinationBranch) { "Merge source and destination branches must differ." }

        executeMerge(
            target = target,
            script = remoteMergeScript(
                repositoryPath = target.remotePath,
                destination = destination,
                sourceBranch = sourceBranch,
                source = source,
            ),
        )
    }

    private fun executeMerge(target: RemoteTarget, script: String) {
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = script,
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        if (!result.ok) {
            val preflightReason = parseRemoteWorktreeMergePreflightReason(result.stderr)
                ?: parseRemoteWorktreeMergePreflightReason(result.message)
            if (preflightReason != null) {
                throw RemoteWorktreeMergePreflightException(preflightReason)
            }
            throw IllegalArgumentException(
                result.message.ifBlank { result.stderr.ifBlank { "Remote worktree merge failed" } },
            )
        }
    }

    private fun trustedFingerprint(target: RemoteTarget): String {
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before merging remote worktrees."
        }
        return fingerprint
    }
}

enum class RemoteWorktreeMergePreflightReason {
    IdentityChanged,
    Detached,
    StatusUnavailable,
    Dirty,
    SourceBranchMissing,
}

class RemoteWorktreeMergePreflightException(
    val reason: RemoteWorktreeMergePreflightReason,
) : IllegalArgumentException("Remote worktree merge preflight failed: ${reason.name}")

enum class WorktreeMergeBlockReason {
    Detached,
    Dirty,
    Missing,
    Bare,
}

data class WorktreeMergeSafety(
    val allowed: Boolean,
    val reason: String? = null,
    val blockReason: WorktreeMergeBlockReason? = null,
)

data class WorktreeMergeDestination(
    val worktree: RemoteRepositoryWorktree,
    val safety: WorktreeMergeSafety,
)

fun evaluateMergeDestination(worktree: RemoteRepositoryWorktree): WorktreeMergeSafety = when {
    worktree.isMissing -> blockedMerge(
        "Missing worktree cannot be a merge destination.",
        WorktreeMergeBlockReason.Missing,
    )
    worktree.isBare -> blockedMerge(
        "Bare worktree cannot be a merge destination.",
        WorktreeMergeBlockReason.Bare,
    )
    worktree.branch.isNullOrBlank() -> blockedMerge(
        "Detached worktree cannot be a merge destination.",
        WorktreeMergeBlockReason.Detached,
    )
    worktree.isDirty -> blockedMerge(
        "Destination worktree has uncommitted changes.",
        WorktreeMergeBlockReason.Dirty,
    )
    else -> WorktreeMergeSafety(allowed = true)
}

fun evaluateMergeOutSource(worktree: RemoteRepositoryWorktree): WorktreeMergeSafety = when {
    worktree.isMissing -> blockedMerge(
        "Missing worktree cannot be a merge source.",
        WorktreeMergeBlockReason.Missing,
    )
    worktree.isBare -> blockedMerge(
        "Bare worktree cannot be a merge source.",
        WorktreeMergeBlockReason.Bare,
    )
    worktree.branch.isNullOrBlank() -> blockedMerge(
        "Detached worktree cannot be a merge source.",
        WorktreeMergeBlockReason.Detached,
    )
    worktree.isDirty -> blockedMerge(
        "Source worktree has uncommitted changes.",
        WorktreeMergeBlockReason.Dirty,
    )
    else -> WorktreeMergeSafety(allowed = true)
}

fun mergeIntoSourceBranches(
    snapshot: RemoteRepositorySnapshot,
    destination: RemoteRepositoryWorktree,
): List<String> = snapshot.branches
    .map { it.name }
    .filter { it != destination.branch }

fun mergeOutDestinationWorktrees(
    snapshot: RemoteRepositorySnapshot,
    source: RemoteRepositoryWorktree,
): List<WorktreeMergeDestination> = snapshot.worktrees
    .filter { candidate ->
        candidate.path != source.path &&
            candidate.branch != source.branch &&
            (candidate.isBare || candidate.isMissing || !candidate.branch.isNullOrBlank())
    }
    .map { candidate ->
        WorktreeMergeDestination(candidate, evaluateMergeDestination(candidate))
    }

private fun blockedMerge(
    reason: String,
    blockReason: WorktreeMergeBlockReason,
): WorktreeMergeSafety = WorktreeMergeSafety(
    allowed = false,
    reason = reason,
    blockReason = blockReason,
)

internal fun remoteMergeScript(
    repositoryPath: String,
    destination: RemoteRepositoryWorktree,
    sourceBranch: String,
    source: RemoteRepositoryWorktree? = null,
): String {
    val destinationBranch = requireNotNull(destination.branch)
    val sourceRef = "refs/heads/$sourceBranch"
    return buildList {
        add("set -eu")
        add(commonDirectoryAssignment("repository", repositoryPath))
        add(rootDirectoryAssignment("repository", repositoryPath))
        add(exactRootCheck("repository", repositoryPath))
        source?.let { worktree ->
            addAll(
                worktreePreflightLines(
                    role = "source",
                    path = worktree.path,
                    expectedBranch = requireNotNull(worktree.branch),
                ),
            )
        }
        addAll(
            worktreePreflightLines(
                role = "destination",
                path = destination.path,
                expectedBranch = destinationBranch,
            ),
        )
        add(
            "git -C ${shellQuote(repositoryPath)} show-ref --verify --quiet " +
                shellQuote(sourceRef) +
                " || ${preflightFailureCommand(RemoteWorktreeMergePreflightReason.SourceBranchMissing, 47)}",
        )
        add("git -C ${shellQuote(destination.path)} merge -- ${shellQuote(sourceRef)}")
    }.joinToString("\n")
}

private fun worktreePreflightLines(
    role: String,
    path: String,
    expectedBranch: String,
): List<String> {
    val commonDirectoryVariable = "${role}_common_dir"
    val branchVariable = "${role}_branch"
    val statusVariable = "${role}_status"
    return listOf(
        commonDirectoryAssignment(role, path),
        "[ \"\$$commonDirectoryVariable\" = \"\$repository_common_dir\" ] || " +
            preflightFailureCommand(RemoteWorktreeMergePreflightReason.IdentityChanged, 42),
        rootDirectoryAssignment(role, path),
        exactRootCheck(role, path),
        "$branchVariable=\$(git -C ${shellQuote(path)} symbolic-ref --quiet --short HEAD 2>/dev/null) || " +
            preflightFailureCommand(RemoteWorktreeMergePreflightReason.Detached, 43),
        "[ \"\$$branchVariable\" = ${shellQuote(expectedBranch)} ] || " +
            preflightFailureCommand(RemoteWorktreeMergePreflightReason.IdentityChanged, 44),
        "$statusVariable=\$(git -C ${shellQuote(path)} status --porcelain) || " +
            preflightFailureCommand(RemoteWorktreeMergePreflightReason.StatusUnavailable, 45),
        "[ -z \"\$$statusVariable\" ] || " +
            preflightFailureCommand(RemoteWorktreeMergePreflightReason.Dirty, 46),
    )
}

private fun commonDirectoryAssignment(
    variablePrefix: String,
    path: String,
): String = "${variablePrefix}_common_dir=\$(git -C ${shellQuote(path)} " +
    "rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || " +
    preflightFailureCommand(RemoteWorktreeMergePreflightReason.IdentityChanged, 41)

private fun rootDirectoryAssignment(variablePrefix: String, path: String): String =
    "${variablePrefix}_root=\$(git -C ${shellQuote(path)} " +
        "rev-parse --path-format=absolute --show-toplevel 2>/dev/null) || " +
        preflightFailureCommand(RemoteWorktreeMergePreflightReason.IdentityChanged, 41)

private fun exactRootCheck(variablePrefix: String, path: String): String =
    "[ \"\$${variablePrefix}_root\" = ${shellQuote(path)} ] || " +
        preflightFailureCommand(RemoteWorktreeMergePreflightReason.IdentityChanged, 42)

private fun preflightFailureCommand(
    reason: RemoteWorktreeMergePreflightReason,
    exitCode: Int,
): String = "{ printf '%s\\n' ${shellQuote(WorktreeMergePreflightPrefix + reason.name)} >&2; exit $exitCode; }"

private fun parseRemoteWorktreeMergePreflightReason(output: String): RemoteWorktreeMergePreflightReason? =
    output.lineSequence()
        .map(String::trim)
        .firstNotNullOfOrNull { line ->
            val reasonName = line.removePrefix(WorktreeMergePreflightPrefix).takeIf { it != line }
            RemoteWorktreeMergePreflightReason.entries.firstOrNull { it.name == reasonName }
        }

private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

private const val WorktreeMergePreflightPrefix = "__HOBGOBLIN_ANDROID_WORKTREE_MERGE__:"

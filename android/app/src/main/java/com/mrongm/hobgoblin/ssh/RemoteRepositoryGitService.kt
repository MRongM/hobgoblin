package com.mrongm.hobgoblin.ssh

import com.mrongm.hobgoblin.data.ssh.HostKeyTrustStore
import com.mrongm.hobgoblin.domain.ssh.HostKeyTrust
import com.mrongm.hobgoblin.domain.ssh.RemoteDirectoryEntry
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectInspection
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectKind
import com.mrongm.hobgoblin.domain.ssh.RemoteProjectPathResolution
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryBranch
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryCommit
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositorySnapshot
import com.mrongm.hobgoblin.domain.ssh.RemoteRepositoryWorktree
import com.mrongm.hobgoblin.domain.ssh.RemoteTarget

class RemoteRepositoryGitService(
    private val client: SshClientFacade,
    private val hostKeyStore: HostKeyTrustStore,
) {
    fun browseDirectories(target: RemoteTarget): List<RemoteDirectoryEntry> {
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = browseDirectoriesScript(target.remotePath),
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        require(result.ok) { result.message.ifBlank { result.stderr.ifBlank { "Remote directory browse failed" } } }
        return parseRemoteDirectoryEntries(result.stdout)
    }

    fun inspectProject(target: RemoteTarget): RemoteProjectInspection {
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = projectInspectionScript(target.remotePath),
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        require(result.ok) { result.message.ifBlank { result.stderr.ifBlank { "Project validation failed" } } }
        return parseRemoteProjectInspection(target.remotePath, result.stdout)
    }

    fun resolveProjectPaths(
        target: RemoteTarget,
        remotePaths: List<String>,
    ): Map<String, RemoteProjectPathResolution> {
        val uniquePaths = remotePaths.distinct()
        if (uniquePaths.isEmpty()) return emptyMap()
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = projectPathResolutionScript(uniquePaths),
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        require(result.ok) { result.message.ifBlank { result.stderr.ifBlank { "Project path resolution failed" } } }
        return parseRemoteProjectPathResolutions(result.stdout)
    }

    fun loadSnapshot(target: RemoteTarget): RemoteRepositorySnapshot {
        val fingerprint = trustedFingerprint(target)
        val result = client.runCommand(
            target = target,
            script = snapshotScript(target.remotePath),
            secrets = SshConnectionSecrets(acceptedHostFingerprint = fingerprint),
        )
        require(result.ok) { result.message.ifBlank { result.stderr.ifBlank { "Repository snapshot failed" } } }
        return parseRemoteRepositorySnapshot(result.stdout)
    }

    private fun trustedFingerprint(target: RemoteTarget): String {
        val fingerprint = client.fetchHostFingerprint(target)
        require(hostKeyStore.evaluate(target, fingerprint) is HostKeyTrust.Trusted) {
            "Trust this host key before loading repository data."
        }
        return fingerprint
    }
}

internal fun parseRemoteDirectoryEntries(output: String): List<RemoteDirectoryEntry> =
    output.lineSequence()
        .filter { it.isNotBlank() }
        .mapNotNull { line ->
            val fields = line.split(DirectoryFieldSeparator, limit = 2)
            val name = fields.getOrNull(0).orEmpty()
            val path = fields.getOrNull(1).orEmpty()
            if (name.isBlank() || path.isBlank()) {
                null
            } else {
                RemoteDirectoryEntry(name = name, path = normalizeRemoteDirectoryPath(path), isDirectory = true)
            }
        }
        .toList()

private fun normalizeRemoteDirectoryPath(path: String): String {
    val normalized = path.replace(Regex("/{2,}"), "/")
    return normalized.ifBlank { "/" }
}

internal fun parseRemoteProjectInspection(requestedPath: String, output: String): RemoteProjectInspection {
    val sections = parseMarkedSections(output, ProjectInspectMarkers)
    val kindValue = sections[ProjectKindMarker].orEmpty().firstOrNull { it.isNotBlank() }.orEmpty()
    val kind = requireNotNull(RemoteProjectKind.fromStorageValue(kindValue)) {
        "Remote project kind is missing or unsupported."
    }
    val resolvedPath = sections[ProjectPathMarker].orEmpty().firstOrNull { it.isNotBlank() }.orEmpty()
    require(resolvedPath.startsWith("/")) { "Remote project path is invalid." }
    val worktreePath = sections[ProjectWorktreeMarker].orEmpty()
        .firstOrNull { it.isNotBlank() }
        ?: resolvedPath
    require(worktreePath.startsWith("/")) { "Remote worktree path is invalid." }
    return RemoteProjectInspection(
        requestedPath = requestedPath,
        resolvedPath = resolvedPath,
        kind = kind,
        currentRef = sections[ProjectCurrentMarker].orEmpty().firstOrNull { it.isNotBlank() },
        defaultBranch = sections[ProjectDefaultMarker].orEmpty().firstOrNull { it.isNotBlank() },
        worktreePath = worktreePath,
    )
}

internal fun parseRemoteProjectPathResolutions(output: String): Map<String, RemoteProjectPathResolution> =
    output.lineSequence()
        .filter { it.isNotBlank() }
        .mapNotNull { line ->
            val fields = line.split(BranchFieldSeparator, limit = 4)
            val requestedPath = fields.getOrNull(0).orEmpty()
            val kind = fields.getOrNull(1)?.let(RemoteProjectKind::fromStorageValue)
            val worktreePath = fields.getOrNull(2).orEmpty()
            val projectPath = fields.getOrNull(3).orEmpty()
            if (
                kind == null ||
                !requestedPath.startsWith("/") ||
                !worktreePath.startsWith("/") ||
                !projectPath.startsWith("/")
            ) {
                null
            } else {
                RemoteProjectPathResolution(
                    requestedPath = requestedPath,
                    kind = kind,
                    projectPath = projectPath,
                    worktreePath = worktreePath,
                )
            }
        }
        .associateBy(RemoteProjectPathResolution::requestedPath)

internal fun parseRemoteRepositorySnapshot(output: String): RemoteRepositorySnapshot {
    val sections = parseMarkedSections(output, SnapshotMarkers)

    val worktreeChangeCounts = parseWorktreeStatus(sections[WorktreeStatusMarker].orEmpty())
    val worktrees = parseWorktrees(sections[WorktreesMarker].orEmpty(), worktreeChangeCounts)
    val worktreeByBranch = worktrees.mapNotNull { worktree ->
        worktree.branch?.let { branch -> branch to worktree.path }
    }.toMap()
    val defaultBranch = sections[DefaultMarker].orEmpty().firstOrNull { it.isNotBlank() }
    val branches = sections[BranchesMarker].orEmpty()
        .filter { it.isNotBlank() }
        .map { line ->
            val fields = line.split(BranchFieldSeparator, limit = 2)
            val name = fields.firstOrNull().orEmpty()
            RemoteRepositoryBranch(
                name = name,
                isCurrent = fields.getOrNull(1)?.trim() == "*",
                isDefault = name == defaultBranch,
                worktreePath = worktreeByBranch[name],
            )
        }
        .filter { it.name.isNotBlank() }
    val statusLines = sections[StatusMarker].orEmpty().filter { it.isNotBlank() }
    val remoteBranches = sections[RemoteBranchesMarker].orEmpty()
        .mapNotNull { line ->
            val fields = line.split(BranchFieldSeparator, limit = 2)
            val name = fields.firstOrNull().orEmpty()
            val symbolicTarget = fields.getOrNull(1).orEmpty()
            name.takeIf {
                it.isNotBlank() && symbolicTarget.isBlank() && !it.endsWith("/HEAD")
            }
        }
        .distinct()

    return RemoteRepositorySnapshot(
        currentRef = sections[CurrentMarker].orEmpty().firstOrNull { it.isNotBlank() },
        defaultBranch = defaultBranch,
        statusLines = statusLines,
        statusChangeCount = statusLines.size,
        branches = branches,
        commits = parseCommits(sections[CommitsMarker].orEmpty()),
        worktrees = worktrees,
        remoteBranches = remoteBranches,
    )
}

private fun parseMarkedSections(output: String, markers: Set<String>): Map<String, List<String>> {
    val sections = mutableMapOf<String, MutableList<String>>()
    var currentMarker: String? = null
    output.lineSequence().forEach { line ->
        if (line in markers) {
            currentMarker = line
            sections.getOrPut(line) { mutableListOf() }
        } else {
            currentMarker?.let { sections.getOrPut(it) { mutableListOf() }.add(line) }
        }
    }
    return sections
}

private fun browseDirectoriesScript(remotePath: String): String {
    val path = shellQuote(remotePath)
    return """
        base=${path}
        cd "${'$'}base" 2>/dev/null || exit 20
        base=${'$'}(pwd -P)
        if [ "${'$'}base" != "/" ]; then printf '%s\t%s\n' '..' "${'$'}(dirname "${'$'}base")"; fi
        for name in .* *; do
          [ "${'$'}name" = "." ] && continue
          [ "${'$'}name" = ".." ] && continue
          [ -e "${'$'}name" ] || continue
          [ -d "${'$'}name" ] || continue
          printf '%s\t%s\n' "${'$'}name" "${'$'}base/${'$'}name"
        done
    """.trimIndent()
}

private fun projectInspectionScript(remotePath: String): String {
    val requestedPath = shellQuote(remotePath)
    return """
        requested=$requestedPath
        [ -d "${'$'}requested" ] || { printf '%s\n' 'Remote path is not a directory' >&2; exit 20; }
        [ -r "${'$'}requested" ] || { printf '%s\n' 'Remote path is not readable' >&2; exit 20; }
        resolved=${'$'}(cd "${'$'}requested" 2>/dev/null && pwd -P) || { printf '%s\n' 'Remote path is not readable' >&2; exit 20; }
        top=${'$'}(git -C "${'$'}resolved" rev-parse --show-toplevel 2>/dev/null || true)
        if [ -n "${'$'}top" ]; then
          kind=git
          worktree=${'$'}top
          primary_worktree=${'$'}(git -C "${'$'}top" worktree list --porcelain 2>/dev/null | awk '/^worktree / { print substr(${'$'}0, 10); exit }')
          if [ -n "${'$'}primary_worktree" ]; then resolved=${'$'}primary_worktree; else resolved=${'$'}top; fi
        else
          kind=plain
          worktree=${'$'}resolved
        fi
        printf '%s\n' ${shellQuote(ProjectKindMarker)}
        printf '%s\n' "${'$'}kind"
        printf '%s\n' ${shellQuote(ProjectPathMarker)}
        printf '%s\n' "${'$'}resolved"
        printf '%s\n' ${shellQuote(ProjectWorktreeMarker)}
        printf '%s\n' "${'$'}worktree"
        printf '%s\n' ${shellQuote(ProjectCurrentMarker)}
        if [ "${'$'}kind" = git ]; then git -C "${'$'}resolved" symbolic-ref --short HEAD 2>/dev/null || git -C "${'$'}resolved" rev-parse --short HEAD 2>/dev/null || true; fi
        printf '%s\n' ${shellQuote(ProjectDefaultMarker)}
        if [ "${'$'}kind" = git ]; then git -C "${'$'}resolved" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true; fi
    """.trimIndent()
}

private fun projectPathResolutionScript(remotePaths: List<String>): String {
    val invocations = remotePaths.joinToString("\n") { remotePath ->
        "resolve_project_path ${shellQuote(remotePath)}"
    }
    return """
        resolve_project_path() {
          requested=${'$'}1
          [ -d "${'$'}requested" ] || return 0
          [ -r "${'$'}requested" ] || return 0
          resolved=${'$'}(cd "${'$'}requested" 2>/dev/null && pwd -P) || return 0
          worktree=${'$'}(git -C "${'$'}resolved" rev-parse --show-toplevel 2>/dev/null || true)
          if [ -n "${'$'}worktree" ]; then
            kind=git
            project=${'$'}(git -C "${'$'}worktree" worktree list --porcelain 2>/dev/null | awk '/^worktree / { print substr(${'$'}0, 10); exit }')
            [ -n "${'$'}project" ] || project=${'$'}worktree
          else
            kind=plain
            worktree=${'$'}resolved
            project=${'$'}resolved
          fi
          printf '%s\000%s\000%s\000%s\n' "${'$'}requested" "${'$'}kind" "${'$'}worktree" "${'$'}project"
        }
        $invocations
    """.trimIndent()
}

private fun snapshotScript(remotePath: String): String {
    val repo = shellQuote(remotePath)
    return listOf(
        "git -C $repo rev-parse --show-toplevel >/dev/null || exit 21",
        "printf '%s\\n' ${shellQuote(CurrentMarker)}",
        "git -C $repo symbolic-ref --short HEAD 2>/dev/null || git -C $repo rev-parse --short HEAD 2>/dev/null || true",
        "printf '%s\\n' ${shellQuote(DefaultMarker)}",
        "git -C $repo symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true",
        "printf '%s\\n' ${shellQuote(StatusMarker)}",
        "git -C $repo status --short",
        "printf '%s\\n' ${shellQuote(CommitsMarker)}",
        "git -C $repo log -n 20 --format='%h%x00%s%x00%an%x00%cr' 2>/dev/null || true",
        "printf '%s\\n' ${shellQuote(BranchesMarker)}",
        "git -C $repo for-each-ref --format='%(refname:short)%00%(HEAD)' refs/heads/",
        "printf '%s\\n' ${shellQuote(RemoteBranchesMarker)}",
        "git -C $repo for-each-ref --format='%(refname:short)%00%(symref)' refs/remotes/",
        "printf '%s\\n' ${shellQuote(WorktreesMarker)}",
        "git -C $repo worktree list --porcelain",
        "printf '%s\\n' ${shellQuote(WorktreeStatusMarker)}",
        "git -C $repo worktree list --porcelain | awk '/^worktree /{print substr(${'$'}0,10)}' | while IFS= read -r wt; do count=${'$'}(git -C \"${'$'}wt\" status --short 2>/dev/null | wc -l | tr -d ' '); printf '%s\\000%s\\n' \"${'$'}wt\" \"${'$'}count\"; done",
    ).joinToString("\n")
}

private fun parseCommits(lines: List<String>): List<RemoteRepositoryCommit> =
    lines.filter { it.isNotBlank() }
        .mapNotNull { line ->
            val fields = line.split(BranchFieldSeparator, limit = 4)
            val shortHash = fields.getOrNull(0).orEmpty()
            val subject = fields.getOrNull(1).orEmpty()
            if (shortHash.isBlank() || subject.isBlank()) {
                null
            } else {
                RemoteRepositoryCommit(
                    shortHash = shortHash,
                    subject = subject,
                    authorName = fields.getOrNull(2)?.takeIf { it.isNotBlank() },
                    relativeDate = fields.getOrNull(3)?.takeIf { it.isNotBlank() },
                )
            }
        }

private fun parseWorktreeStatus(lines: List<String>): Map<String, Int> =
    lines.filter { it.isNotBlank() }
        .mapNotNull { line ->
            val fields = line.split(BranchFieldSeparator, limit = 2)
            val path = fields.getOrNull(0).orEmpty()
            val count = fields.getOrNull(1)?.trim()?.toIntOrNull() ?: 0
            if (path.isBlank()) null else path to count
        }
        .toMap()

private fun parseWorktrees(lines: List<String>, changeCountsByPath: Map<String, Int>): List<RemoteRepositoryWorktree> {
    val worktrees = mutableListOf<RemoteRepositoryWorktree>()
    var path: String? = null
    var branch: String? = null
    var isBare = false
    var isLocked = false
    var isMissing = false

    fun flush() {
        val currentPath = path ?: return
        val isPrimary = worktrees.isEmpty()
        val changeCount = changeCountsByPath[currentPath] ?: 0
        worktrees += RemoteRepositoryWorktree(
            path = currentPath,
            branch = branch,
            isPrimary = isPrimary,
            isLinked = !isPrimary,
            isBare = isBare,
            isLocked = isLocked,
            isMissing = isMissing,
            isDirty = changeCount > 0,
            changeCount = changeCount,
        )
        path = null
        branch = null
        isBare = false
        isLocked = false
        isMissing = false
    }

    (lines + "").forEach { line ->
        when {
            line.isBlank() -> flush()
            line.startsWith("worktree ") -> path = line.removePrefix("worktree ")
            line.startsWith("branch ") -> branch = line.removePrefix("branch ").removePrefix("refs/heads/")
            line == "bare" -> isBare = true
            line.startsWith("locked") -> isLocked = true
            line.startsWith("prunable") -> isMissing = true
        }
    }
    return worktrees
}

private fun shellQuote(value: String): String = "'${value.replace("'", "'\"'\"'")}'"

private const val CurrentMarker = "__HOBGOBLIN_ANDROID_CURRENT__"
private const val DefaultMarker = "__HOBGOBLIN_ANDROID_DEFAULT__"
private const val StatusMarker = "__HOBGOBLIN_ANDROID_STATUS__"
private const val CommitsMarker = "__HOBGOBLIN_ANDROID_COMMITS__"
private const val BranchesMarker = "__HOBGOBLIN_ANDROID_BRANCHES__"
private const val RemoteBranchesMarker = "__HOBGOBLIN_ANDROID_REMOTE_BRANCHES__"
private const val WorktreesMarker = "__HOBGOBLIN_ANDROID_WORKTREES__"
private const val WorktreeStatusMarker = "__HOBGOBLIN_ANDROID_WORKTREE_STATUS__"
private const val ProjectKindMarker = "__HOBGOBLIN_ANDROID_PROJECT_KIND__"
private const val ProjectPathMarker = "__HOBGOBLIN_ANDROID_PROJECT_PATH__"
private const val ProjectWorktreeMarker = "__HOBGOBLIN_ANDROID_PROJECT_WORKTREE__"
private const val ProjectCurrentMarker = "__HOBGOBLIN_ANDROID_PROJECT_CURRENT__"
private const val ProjectDefaultMarker = "__HOBGOBLIN_ANDROID_PROJECT_DEFAULT__"
private const val DirectoryFieldSeparator = '\t'
private const val BranchFieldSeparator = '\u0000'

private val SnapshotMarkers = setOf(
    CurrentMarker,
    DefaultMarker,
    StatusMarker,
    CommitsMarker,
    BranchesMarker,
    RemoteBranchesMarker,
    WorktreesMarker,
    WorktreeStatusMarker,
)
private val ProjectInspectMarkers = setOf(
    ProjectKindMarker,
    ProjectPathMarker,
    ProjectWorktreeMarker,
    ProjectCurrentMarker,
    ProjectDefaultMarker,
)

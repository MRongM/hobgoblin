package com.mrongm.hobgoblin.data

import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceAuxiliaryMode
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceAuxiliaryRecord
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceBranchOrigin
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceGroupRecord
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceOperationKind
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceProgress
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceRecord
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceRegistry
import com.mrongm.hobgoblin.domain.workspace.BranchWorkspaceRepositoryRecord
import com.mrongm.hobgoblin.domain.workspace.WorkspaceConfigRecord
import com.mrongm.hobgoblin.domain.workspace.WorkspaceConfigRegistry
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject

object WorkspaceRegistryCodec {
    private const val CurrentVersion = 1
    private const val RemoteRootPrefix = "ssh-config://"

    fun decodeWorkspaceConfigs(payload: String): WorkspaceConfigRegistry {
        val root = JSONObject(payload)
        require(root.getInt("version") == CurrentVersion) { "Unsupported workspace registry version" }
        val seenRoots = mutableSetOf<String>()
        val workspaces = root.requireArray("workspaces").mapObjects { workspace ->
            val rootId = workspace.requireRootId()
            require(seenRoots.add(rootId)) { "Duplicate workspace root" }
            val seenRepositories = mutableSetOf<String>()
            val repositories = workspace.requireArray("repo").mapStrings { repositoryName ->
                require(isRepositoryName(repositoryName)) { "Invalid workspace repository" }
                require(seenRepositories.add(repositoryName)) { "Duplicate workspace repository" }
                repositoryName
            }
            require(repositories.isNotEmpty()) { "Workspace repositories must not be empty" }
            WorkspaceConfigRecord(rootId = rootId, repositoryNames = repositories)
        }
        return WorkspaceConfigRegistry(version = CurrentVersion, workspaces = workspaces)
    }

    fun decodeBranchWorkspaces(payload: String): BranchWorkspaceRegistry {
        val root = JSONObject(payload)
        require(root.getInt("version") == CurrentVersion) { "Unsupported branch workspace registry version" }
        val seenRoots = mutableSetOf<String>()
        val workspaces = root.requireArray("workspaces").mapObjects { group ->
            val rootId = group.requireRootId()
            require(seenRoots.add(rootId)) { "Duplicate branch workspace root" }
            val branchWorkspaces = decodeBranchWorkspaceList(group.requireArray("branchWorkspaces"), rootId)
            BranchWorkspaceGroupRecord(rootId = rootId, branchWorkspaces = branchWorkspaces)
        }
        return BranchWorkspaceRegistry(version = CurrentVersion, workspaces = workspaces)
    }

    private fun decodeBranchWorkspaceList(array: JSONArray, rootId: String): List<BranchWorkspaceRecord> {
        val seenIds = mutableSetOf<String>()
        val seenBranches = mutableSetOf<String>()
        val seenDirectories = mutableSetOf<String>()
        return array.mapObjects { manifest ->
            val decoded = decodeBranchWorkspace(manifest, rootId)
            require(seenIds.add(decoded.id)) { "Duplicate branch workspace id" }
            require(seenBranches.add(decoded.branch)) { "Duplicate branch workspace branch" }
            require(seenDirectories.add(decoded.directoryName)) { "Duplicate branch workspace directory" }
            decoded
        }
    }

    private fun decodeBranchWorkspace(manifest: JSONObject, rootId: String): BranchWorkspaceRecord {
        val id = manifest.requireExactText("id")
        require(manifest.requireExactText("rootId") == rootId) { "Branch workspace root mismatch" }
        val branch = manifest.requireExactText("branch")
        val directoryName = manifest.requireExactText("directoryName")
        require(isBranchWorkspaceDirectoryName(directoryName)) { "Invalid branch workspace directory" }
        val workspaceRootPath = rootPath(rootId)
        val expectedPath = joinPath(workspaceRootPath, directoryName)
        if (!rootId.startsWith(RemoteRootPrefix)) {
            require(TmuxSessionProtocol.normalizePath(expectedPath) == expectedPath) { "Branch workspace path is invalid" }
        }
        require(manifest.requireExactText("path") == expectedPath) { "Branch workspace path mismatch" }

        val seenNames = mutableSetOf<String>()
        val repositories = manifest.requireArray("repositories").mapObjects { member ->
            decodeRepository(member, branch, expectedPath).also { decoded ->
                require(seenNames.add(decoded.repositoryName)) { "Duplicate branch workspace member" }
            }
        }
        require(repositories.isNotEmpty()) { "Branch workspace repositories must not be empty" }

        val auxiliaryEntries = manifest.requireArray("auxiliaryEntries").mapObjects { entry ->
            decodeAuxiliary(entry, workspaceRootPath, expectedPath).also { decoded ->
                require(seenNames.add(decoded.name)) { "Duplicate branch workspace entry" }
            }
        }.filterNot { entry -> entry.progress == BranchWorkspaceProgress.Complete }

        return BranchWorkspaceRecord(
            id = id,
            rootId = rootId,
            branch = branch,
            directoryName = directoryName,
            path = expectedPath,
            repositories = repositories,
            auxiliaryEntries = auxiliaryEntries,
            operation = manifest.optionalObject("operation")?.let(::decodeOperation),
        )
    }

    private fun decodeRepository(
        member: JSONObject,
        branch: String,
        workspacePath: String,
    ): BranchWorkspaceRepositoryRecord {
        val repositoryName = member.requireExactText("repositoryName")
        require(isRepositoryName(repositoryName)) { "Invalid branch workspace repository" }
        require(member.requireExactText("targetBranch") == branch) { "Branch workspace target branch mismatch" }
        val worktreePath = member.requireExactText("worktreePath")
        require(worktreePath == joinPath(workspacePath, repositoryName)) { "Branch workspace worktree path mismatch" }
        return BranchWorkspaceRepositoryRecord(
            repositoryName = repositoryName,
            targetBranch = branch,
            baseBranch = member.requireExactText("baseBranch"),
            branchOrigin = when (member.requireExactText("branchOrigin")) {
                "created" -> BranchWorkspaceBranchOrigin.Created
                "pre-existing" -> BranchWorkspaceBranchOrigin.PreExisting
                else -> throw IllegalArgumentException("Invalid branch origin")
            },
            worktreePath = worktreePath,
            progress = member.requireProgress("progress"),
            branchCleanupProgress = member.optionalProgress("branchCleanupProgress"),
            upstreamCleanupProgress = member.optionalProgress("upstreamCleanupProgress"),
            lastError = member.optionalExactText("lastError"),
        )
    }

    private fun decodeAuxiliary(
        entry: JSONObject,
        rootPath: String,
        workspacePath: String,
    ): BranchWorkspaceAuxiliaryRecord {
        val name = entry.requireExactText("name")
        require(isRepositoryName(name)) { "Invalid branch workspace auxiliary entry" }
        val mode = when (entry.requireExactText("mode")) {
            "symlink" -> BranchWorkspaceAuxiliaryMode.Symlink
            "copy" -> BranchWorkspaceAuxiliaryMode.Copy
            else -> throw IllegalArgumentException("Invalid auxiliary mode")
        }
        val sourcePath = entry.requireExactText("sourcePath")
        val targetPath = entry.requireExactText("targetPath")
        require(sourcePath == joinPath(rootPath, name)) { "Auxiliary source path mismatch" }
        require(targetPath == joinPath(workspacePath, name)) { "Auxiliary target path mismatch" }
        val copyBaseline = entry.optionalExactText("copyBaseline")
        require(mode != BranchWorkspaceAuxiliaryMode.Symlink || copyBaseline == null) {
            "Symlink auxiliary entry must not have a copy baseline"
        }
        return BranchWorkspaceAuxiliaryRecord(
            name = name,
            mode = mode,
            sourcePath = sourcePath,
            targetPath = targetPath,
            copyBaseline = copyBaseline,
            progress = entry.requireProgress("progress"),
            lastError = entry.optionalExactText("lastError"),
        )
    }

    private fun decodeOperation(operation: JSONObject): BranchWorkspaceOperationKind =
        when (operation.requireExactText("kind")) {
            "create" -> BranchWorkspaceOperationKind.Create
            "extend" -> BranchWorkspaceOperationKind.Extend
            "reduce" -> BranchWorkspaceOperationKind.Reduce
            "repair" -> BranchWorkspaceOperationKind.Repair
            "remove" -> BranchWorkspaceOperationKind.Remove
            else -> throw IllegalArgumentException("Invalid branch workspace operation")
        }

    private fun JSONObject.requireRootId(): String {
        val rootId = requireExactText("rootId")
        require(normalizeRootId(rootId) == rootId) { "Workspace root is not normalized" }
        return rootId
    }

    private fun normalizeRootId(rootId: String): String? =
        if (rootId.startsWith(RemoteRootPrefix)) normalizeRemoteRootId(rootId) else TmuxSessionProtocol.normalizePath(rootId)

    private fun normalizeRemoteRootId(rootId: String): String? {
        val remainder = rootId.removePrefix(RemoteRootPrefix)
        val pathIndex = remainder.indexOf('/')
        if (pathIndex <= 0) return null
        val encodedAlias = remainder.substring(0, pathIndex)
        val encodedPath = remainder.substring(pathIndex)
        val alias = decodeUriComponent(encodedAlias) ?: return null
        val remotePath = decodeUriComponent(encodedPath.replace("+", "%20")) ?: return null
        if (!isSafeText(alias) || normalizeRemotePath(remotePath) != remotePath) return null
        return rootId
    }

    private fun rootPath(rootId: String): String =
        if (rootId.startsWith(RemoteRootPrefix)) {
            val encodedPath = rootId.removePrefix(RemoteRootPrefix).substringAfter('/')
            requireNotNull(decodeUriComponent("/$encodedPath".replace("+", "%20")))
        } else {
            rootId
        }

    private fun normalizeRemotePath(path: String): String? {
        val trimmed = path.trim()
        if (!trimmed.startsWith('/') || !isSafeText(trimmed)) return null
        val normalized = trimmed.replace(Regex("/+"), "/").removeSuffix("/")
        return normalized.ifEmpty { "/" }
    }

    private fun joinPath(parent: String, child: String): String =
        if (parent == "/") "/$child" else "${parent.removeSuffix("/")}/$child"

    private fun isRepositoryName(value: String): Boolean =
        isSafeText(value) && value == value.trim() && value != "." && value != ".." &&
            !value.contains('/') && !value.contains('\\')

    private fun isBranchWorkspaceDirectoryName(value: String): Boolean =
        isRepositoryName(value) && (value.startsWith("hobgoblin-") || value.startsWith("goblin-"))

    private fun isSafeText(value: String): Boolean =
        value.isNotEmpty() && value.none { character -> character == '\u0000' || character.code < 0x20 || character.code == 0x7f }

    private fun decodeUriComponent(value: String): String? = runCatching {
        URLDecoder.decode(value, StandardCharsets.UTF_8.name())
    }.getOrNull()

    private fun JSONObject.requireArray(name: String): JSONArray = getJSONArray(name)

    private fun JSONObject.requireExactText(name: String): String = getString(name).also { value ->
        require(value == value.trim() && isSafeText(value)) { "Invalid $name" }
    }

    private fun JSONObject.optionalExactText(name: String): String? {
        if (!has(name)) return null
        require(!isNull(name)) { "Invalid $name" }
        return requireExactText(name)
    }

    private fun JSONObject.optionalObject(name: String): JSONObject? {
        if (!has(name)) return null
        require(!isNull(name)) { "Invalid $name" }
        return getJSONObject(name)
    }

    private fun JSONObject.requireProgress(name: String): BranchWorkspaceProgress =
        progress(requireExactText(name))

    private fun JSONObject.optionalProgress(name: String): BranchWorkspaceProgress? =
        optionalExactText(name)?.let(::progress)

    private fun progress(value: String): BranchWorkspaceProgress = when (value) {
        "pending" -> BranchWorkspaceProgress.Pending
        "complete" -> BranchWorkspaceProgress.Complete
        "removed" -> BranchWorkspaceProgress.Removed
        "failed" -> BranchWorkspaceProgress.Failed
        else -> throw IllegalArgumentException("Invalid branch workspace progress")
    }

    private inline fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
        (0 until length()).map { index -> transform(getJSONObject(index)) }

    private inline fun <T> JSONArray.mapStrings(transform: (String) -> T): List<T> =
        (0 until length()).map { index -> transform(getString(index)) }
}

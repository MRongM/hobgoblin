package com.mrongm.hobgoblin.domain.workspace

import com.mrongm.hobgoblin.terminals.TmuxSessionIdentity

data class WorkspaceConfigRegistry(
    val version: Int,
    val workspaces: List<WorkspaceConfigRecord>,
)

data class WorkspaceConfigRecord(
    val rootId: String,
    val repositoryNames: List<String>,
)

data class BranchWorkspaceRegistry(
    val version: Int,
    val workspaces: List<BranchWorkspaceGroupRecord>,
)

data class BranchWorkspaceGroupRecord(
    val rootId: String,
    val branchWorkspaces: List<BranchWorkspaceRecord>,
)

data class BranchWorkspaceRecord(
    val id: String,
    val rootId: String,
    val branch: String,
    val directoryName: String,
    val path: String,
    val repositories: List<BranchWorkspaceRepositoryRecord>,
    val auxiliaryEntries: List<BranchWorkspaceAuxiliaryRecord>,
    val operation: BranchWorkspaceOperationKind?,
)

data class BranchWorkspaceRepositoryRecord(
    val repositoryName: String,
    val targetBranch: String,
    val baseBranch: String,
    val branchOrigin: BranchWorkspaceBranchOrigin,
    val worktreePath: String,
    val progress: BranchWorkspaceProgress,
    val branchCleanupProgress: BranchWorkspaceProgress?,
    val upstreamCleanupProgress: BranchWorkspaceProgress?,
    val lastError: String?,
)

data class BranchWorkspaceAuxiliaryRecord(
    val name: String,
    val mode: BranchWorkspaceAuxiliaryMode,
    val sourcePath: String,
    val targetPath: String,
    val copyBaseline: String?,
    val progress: BranchWorkspaceProgress,
    val lastError: String?,
)

enum class BranchWorkspaceProgress {
    Pending,
    Complete,
    Removed,
    Failed,
}

enum class BranchWorkspaceOperationKind {
    Create,
    Extend,
    Reduce,
    Repair,
    Remove,
}

enum class BranchWorkspaceBranchOrigin {
    Created,
    PreExisting,
}

enum class BranchWorkspaceAuxiliaryMode {
    Symlink,
    Copy,
}

data class RemoteWorkspaceCatalogSnapshot(
    val hostId: String,
    val workspaces: List<RemoteConfiguredWorkspaceSnapshot>,
)

data class RemoteConfiguredWorkspaceSnapshot(
    val rootPath: String,
    val repositories: List<RemoteWorkspaceRepositorySnapshot>,
    val branchWorkspaces: List<RemoteBranchWorkspaceSnapshot>,
    val branchWorkspaceError: String? = null,
    val tmuxDiscoveryError: String? = null,
)

data class RemoteWorkspaceRepositorySnapshot(
    val name: String,
    val path: String,
    val availability: RemotePathAvailability,
)

data class RemoteBranchWorkspaceSnapshot(
    val id: String,
    val branch: String,
    val path: String,
    val operation: RemoteBranchWorkspaceOperation?,
    val rootAvailability: RemotePathAvailability,
    val members: List<RemoteBranchWorkspaceMemberSnapshot>,
    val terminalGroups: List<RemoteWorkspaceTmuxGroup> = emptyList(),
)

data class RemoteBranchWorkspaceMemberSnapshot(
    val repositoryName: String,
    val repositoryRootPath: String,
    val worktreePath: String,
    val progress: String,
    val availability: RemotePathAvailability,
)

enum class RemotePathAvailability {
    Unknown,
    Available,
    Unavailable,
}

enum class RemoteBranchWorkspaceOperation {
    Create,
    Extend,
    Reduce,
    Repair,
    Remove,
}

sealed interface RemoteWorkspaceTmuxLocation {
    data object Root : RemoteWorkspaceTmuxLocation

    data class Repository(
        val repositoryName: String,
    ) : RemoteWorkspaceTmuxLocation
}

data class RemoteWorkspaceTmuxGroup(
    val location: RemoteWorkspaceTmuxLocation,
    val terminals: List<RemoteWorkspaceTmuxTerminal>,
)

data class RemoteWorkspaceTmuxTerminal(
    val projectRoot: String,
    val workingDirectory: String,
    val terminalNumber: Int,
    val identity: TmuxSessionIdentity,
)

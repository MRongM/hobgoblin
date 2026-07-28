package com.mrongm.hobgoblin.domain.workspace

import com.mrongm.hobgoblin.terminals.ScopedDiscoveredTmuxSession
import com.mrongm.hobgoblin.terminals.TmuxDiscoveryScope
import com.mrongm.hobgoblin.terminals.TmuxSessionProtocol

fun workspaceTmuxDiscoveryScopes(
    workspace: RemoteConfiguredWorkspaceSnapshot,
): List<TmuxDiscoveryScope> {
    val rootPath = workspace.rootPath.normalizedAbsolutePath() ?: return emptyList()
    val allowedPathsByProject = linkedMapOf<String, LinkedHashSet<String>>()
    allowedPathsByProject[rootPath] = workspace.branchWorkspaces
        .mapNotNullTo(linkedSetOf()) { branchWorkspace -> branchWorkspace.path.normalizedAbsolutePath() }

    workspace.repositories.forEach { repository ->
        repository.path.normalizedAbsolutePath()?.let { projectRoot ->
            allowedPathsByProject.putIfAbsent(projectRoot, linkedSetOf())
        }
    }
    workspace.branchWorkspaces.forEach { branchWorkspace ->
        branchWorkspace.members.forEach { member ->
            val projectRoot = member.repositoryRootPath.normalizedAbsolutePath() ?: return@forEach
            val worktreePath = member.worktreePath.normalizedAbsolutePath() ?: return@forEach
            allowedPathsByProject.getOrPut(projectRoot, ::linkedSetOf).add(worktreePath)
        }
    }

    return allowedPathsByProject.map { (projectRoot, allowedPaths) ->
        TmuxDiscoveryScope(projectRoot = projectRoot, allowedInitialPaths = allowedPaths)
    }
}

fun projectWorkspaceTmuxSessions(
    workspace: RemoteConfiguredWorkspaceSnapshot,
    discoveries: List<ScopedDiscoveredTmuxSession>,
): RemoteConfiguredWorkspaceSnapshot = workspace.copy(
    branchWorkspaces = workspace.branchWorkspaces.map { branchWorkspace ->
        val rootGroup = RemoteWorkspaceTmuxGroup(
            location = RemoteWorkspaceTmuxLocation.Root,
            terminals = discoveries.terminalsFor(
                projectRoot = workspace.rootPath,
                workingDirectory = branchWorkspace.path,
            ),
        )
        val memberGroups = branchWorkspace.members.map { member ->
            RemoteWorkspaceTmuxGroup(
                location = RemoteWorkspaceTmuxLocation.Repository(member.repositoryName),
                terminals = discoveries.terminalsFor(
                    projectRoot = member.repositoryRootPath,
                    workingDirectory = member.worktreePath,
                ),
            )
        }
        branchWorkspace.copy(terminalGroups = listOf(rootGroup) + memberGroups)
    },
)

private fun List<ScopedDiscoveredTmuxSession>.terminalsFor(
    projectRoot: String,
    workingDirectory: String,
): List<RemoteWorkspaceTmuxTerminal> = asSequence()
    .filter { scoped ->
        scoped.projectRoot == projectRoot && scoped.discovery.identity.initialPath == workingDirectory
    }
    .map { scoped ->
        RemoteWorkspaceTmuxTerminal(
            projectRoot = projectRoot,
            workingDirectory = workingDirectory,
            terminalNumber = scoped.discovery.terminalNumber,
            identity = scoped.discovery.identity,
        )
    }
    .sortedBy { terminal -> terminal.terminalNumber }
    .toList()

private fun String.normalizedAbsolutePath(): String? =
    TmuxSessionProtocol.normalizePath(this)?.takeIf { normalized -> normalized == this }

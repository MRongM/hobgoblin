import path from 'node:path'
import { getRepositoryWorktrees } from '#/server/modules/repo-read-paths.ts'
import {
  inspectBranchWorkspacePath,
  listBranchWorkspaceChildren,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId, normalizeRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import { isBranchWorkspaceDirectoryName } from '#/shared/branch-workspaces.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

export interface BranchWorkspaceDiscoveredMember {
  repositoryName: string
  repositoryId: string
  worktreePath: string
  branch: string
}

export interface BranchWorkspaceDiscoveredDirectory {
  directoryName: string
  path: string
  branch: string
  members: BranchWorkspaceDiscoveredMember[]
}

export interface BranchWorkspaceDiscoveryDependencies {
  listChildren?: typeof listBranchWorkspaceChildren
  inspectPath?: typeof inspectBranchWorkspacePath
  getWorktrees?: typeof getRepositoryWorktrees
}

export async function discoverBranchWorkspaceDirectories(
  rootId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceDiscoveryDependencies = {},
): Promise<BranchWorkspaceDiscoveredDirectory[]> {
  signal?.throwIfAborted()
  const rootPath = workspaceRepositoryPath(rootId)
  if (!rootPath) return []

  const listChildren = dependencies.listChildren ?? listBranchWorkspaceChildren
  const inspectPath = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const getWorktrees = dependencies.getWorktrees ?? getRepositoryWorktrees
  const names = await listChildren(rootId, rootPath, signal)
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const results: BranchWorkspaceDiscoveredDirectory[] = []

  // Sort directory names before probing to keep discovery deterministic across filesystems.
  for (const directoryName of [...names].sort(compareText)) {
    signal?.throwIfAborted()
    if (!isBranchWorkspaceDirectoryName(directoryName)) continue
    const candidatePath = pathApi.join(rootPath, directoryName)
    const inspection = await inspectPath(rootId, candidatePath, signal).catch(() => null)
    if (!inspection?.exists || inspection.kind !== 'directory') continue

    const childNames = await listChildren(rootId, candidatePath, signal).catch(() => [])
    const members: BranchWorkspaceDiscoveredMember[] = []
    for (const repositoryName of [...childNames].sort(compareText)) {
      signal?.throwIfAborted()
      if (!isWorkspaceRepositoryName(repositoryName)) continue
      const worktreePath = pathApi.join(candidatePath, repositoryName)
      const childInspection = await inspectPath(rootId, worktreePath, signal).catch(() => null)
      if (!childInspection?.exists || childInspection.kind !== 'directory') continue
      const worktrees = await getWorktrees(repositoryIdAtPath(rootId, worktreePath), signal).catch(() => [])
      signal?.throwIfAborted()
      const worktree = worktrees.find(
        (entry) =>
          !entry.isBare &&
          !entry.isPrunable &&
          sameHostPath(rootId, entry.path, worktreePath) &&
          typeof entry.branch === 'string',
      )
      if (!worktree?.branch) continue
      const primary = worktrees.find((entry) => entry.isPrimary)
      members.push({
        repositoryName,
        repositoryId: repositoryIdAtPath(rootId, primary?.path ?? worktreePath),
        worktreePath,
        branch: worktree.branch,
      })
    }
    if (members.length === 0) continue
    results.push({
      directoryName,
      path: candidatePath,
      branch: members[0]!.branch,
      members,
    })
  }

  return results
}

function sameHostPath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : sameLocalFilePath(left, right)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function repositoryIdAtPath(rootId: string, repositoryPath: string): string {
  const remote = parseRemoteRepoId(rootId)
  return remote ? normalizeRemoteRepoId({ ...remote, remotePath: repositoryPath }) : repositoryPath
}

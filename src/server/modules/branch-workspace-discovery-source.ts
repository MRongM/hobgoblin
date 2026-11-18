import path from 'node:path'
import { readdir, realpath, stat } from 'node:fs/promises'
import { getRepositoryWorktrees } from '#/server/modules/repo-read-paths.ts'
import type {
  inspectBranchWorkspacePath,
  listBranchWorkspaceChildren,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { repositoryIdAtPath, workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import {
  isBranchWorkspaceDirectoryName,
  isSafeBranchWorkspaceFolderName,
  type BranchWorkspaceMemberKind,
} from '#/shared/branch-workspaces.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { discoverRemoteBranchWorkspaceDirectories } from '#/system/ssh/branch-workspaces.ts'

export interface BranchWorkspaceDiscoveredMember {
  repositoryName: string
  repositoryId: string
  worktreePath: string
  branch: string
  kind?: BranchWorkspaceMemberKind
  head?: string
  memberId?: string
}

export interface BranchWorkspaceDiscoveredDirectory {
  directoryName: string
  path: string
  branch: string
  members: BranchWorkspaceDiscoveredMember[]
}

export interface BranchWorkspaceDiscoveryDependencies {
  registeredDirectoryNames?: readonly string[]
  resolveRemoteTarget?: typeof resolveRepositoryRemoteTarget
  discoverRemote?: typeof discoverRemoteBranchWorkspaceDirectories
  listChildren?: typeof listBranchWorkspaceChildren
  inspectPath?: typeof inspectBranchWorkspacePath
  getWorktrees?: typeof getRepositoryWorktrees
}

export async function discoverBranchWorkspaceDirectories(
  rootId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceDiscoveryDependencies = {},
  directoryNames?: readonly string[],
): Promise<BranchWorkspaceDiscoveredDirectory[]> {
  signal?.throwIfAborted()
  const rootPath = workspaceRepositoryPath(rootId)
  if (!rootPath) return []

  const remote = parseRemoteRepoId(rootId)
  if (remote) {
    const { target } = await (dependencies.resolveRemoteTarget ?? resolveRepositoryRemoteTarget)(remote, signal)
    const directories = await (dependencies.discoverRemote ?? discoverRemoteBranchWorkspaceDirectories)(
      target,
      rootPath,
      {
        signal,
        ...(directoryNames ? { directoryNames } : {}),
        registeredDirectoryNames: dependencies.registeredDirectoryNames,
      },
    )
    signal?.throwIfAborted()
    return directories.map((directory) => ({
      ...directory,
      members: directory.members.map(({ repositoryPath, ...member }) => ({
        ...member,
        repositoryId: repositoryIdAtPath(rootId, repositoryPath),
      })),
    }))
  }

  const listChildren =
    dependencies.listChildren ?? (async (_rootId: string, folderPath: string) => await readdir(folderPath))
  const getWorktrees = dependencies.getWorktrees ?? getRepositoryWorktrees
  const names = directoryNames ?? (await listChildren(rootId, rootPath, signal))
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const results: BranchWorkspaceDiscoveredDirectory[] = []

  // Sort directory names before probing to keep discovery deterministic across filesystems.
  for (const directoryName of [...names].sort(compareText)) {
    signal?.throwIfAborted()
    if (
      (!directoryNames && !isSafeBranchWorkspaceFolderName(directoryName)) ||
      (!directoryNames &&
        !dependencies.registeredDirectoryNames?.includes(directoryName) &&
        !isBranchWorkspaceDirectoryName(directoryName))
    )
      continue
    const candidatePath = pathApi.join(rootPath, directoryName)
    const rootInfo = await stat(candidatePath).catch(() => null)
    if (!rootInfo?.isDirectory()) continue

    const members: BranchWorkspaceDiscoveredMember[] = []
    const observe = async (
      repositoryName: string,
      memberPath: string,
    ): Promise<BranchWorkspaceDiscoveredMember | null> => {
      const actualPath = await realpath(memberPath).catch(() => memberPath)
      const worktrees = await getWorktrees(repositoryIdAtPath(rootId, memberPath), signal).catch(() => [])
      signal?.throwIfAborted()
      const actual = worktrees.find(
        (entry) => !entry.isBare && !entry.isPrunable && sameHostPath(rootId, entry.path, actualPath),
      )
      if (!actual) return null
      const primary = worktrees.find((entry) => entry.isPrimary)
      return {
        repositoryName,
        repositoryId: repositoryIdAtPath(rootId, primary?.path ?? actual.path),
        worktreePath: actual.path,
        branch: actual.branch ?? '',
        kind: actual.isPrimary ? 'repository' : 'worktree',
        ...(actual.head ? { head: actual.head } : {}),
      }
    }
    const own = await observe(pathApi.basename(candidatePath) || candidatePath, candidatePath)
    if (own) members.push(own)
    else {
      const childNames = await listChildren(rootId, candidatePath, signal).catch(() => [])
      for (const repositoryName of [...childNames].sort(compareText)) {
        signal?.throwIfAborted()
        if (repositoryName === '.git') continue
        const memberPath = pathApi.join(candidatePath, repositoryName)
        if (!(await stat(memberPath).catch(() => null))?.isDirectory()) continue
        const member = await observe(repositoryName, memberPath)
        if (member) members.push(member)
      }
    }
    results.push({
      directoryName,
      path: candidatePath,
      branch: members[0]?.branch ?? '',
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

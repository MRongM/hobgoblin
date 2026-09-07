import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  readBranchWorkspaceManifests,
  type BranchWorkspaceManifestSourceSnapshot,
} from '#/server/modules/branch-workspace-source.ts'
import {
  discoverBranchWorkspaceDirectories,
  type BranchWorkspaceDiscoveredDirectory,
  type BranchWorkspaceDiscoveredMember,
} from '#/server/modules/branch-workspace-discovery-source.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import type { BranchWorkspaceManifest, BranchWorkspaceRepositoryMember } from '#/shared/branch-workspaces.ts'
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export interface BranchWorkspaceCatalogDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
  discoverDirectories?: typeof discoverBranchWorkspaceDirectories
}

/** A read-only catalog. Discovery never registers or repairs persisted records. */
export async function readBranchWorkspaceCatalog(
  rootId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceCatalogDependencies = {},
): Promise<BranchWorkspaceManifestSourceSnapshot> {
  const normalizedRootId = workspaceRootId(rootId)
  signal?.throwIfAborted()
  const [stored, discovered] = await Promise.all([
    (dependencies.readManifests ?? readBranchWorkspaceManifests)(normalizedRootId),
    (dependencies.discoverDirectories ?? discoverBranchWorkspaceDirectories)(normalizedRootId, signal).catch(
      (error: unknown) => {
        signal?.throwIfAborted()
        return []
      },
    ),
  ])
  signal?.throwIfAborted()
  const remaining = new Set(discovered)
  const manifests = (stored.kind === 'ready' ? stored.manifests : []).map((manifest) => {
    const directory = discovered.find((entry) => samePath(rootId, manifest.path, entry.path))
    if (!directory) return manifest
    remaining.delete(directory)
    const operationInProgress = manifest.operation && manifest.operation.kind !== 'repair'
    const actual = directory.members.map((member) =>
      actualMember(
        member,
        manifest.repositories.find((entry) => entry.repositoryName === member.repositoryName),
      ),
    )
    return {
      ...manifest,
      repositories: operationInProgress
        ? manifest.repositories.map((member) => ({
            ...member,
            repositoryId:
              actual.find((entry) => entry.repositoryName === member.repositoryName)?.repositoryId ??
              member.repositoryId,
          }))
        : actual,
    }
  })
  for (const directory of remaining) manifests.push(discoveredManifest(normalizedRootId, directory))
  return { kind: 'ready', manifests }
}

function actualMember(
  member: BranchWorkspaceDiscoveredMember,
  stored?: BranchWorkspaceRepositoryMember,
): BranchWorkspaceRepositoryMember {
  const sameBranch = stored?.targetBranch === member.branch
  return {
    repositoryName: member.repositoryName,
    repositoryId: member.repositoryId,
    targetBranch: member.branch,
    creationBase: sameBranch ? stored.creationBase : { kind: 'localBranch', branch: member.branch },
    syncBeforeCreate: sameBranch ? stored.syncBeforeCreate : false,
    branchOrigin: sameBranch ? stored.branchOrigin : 'pre-existing',
    worktreePath: member.worktreePath,
    progress: 'complete',
  }
}

function discoveredManifest(rootId: string, directory: BranchWorkspaceDiscoveredDirectory): BranchWorkspaceManifest {
  return {
    id: `branch-workspace:${createHash('sha256').update(`${rootId}\0${directory.directoryName}`).digest('hex').slice(0, 16)}`,
    rootId,
    branch: directory.branch,
    directoryName: directory.directoryName,
    path: directory.path,
    repositories: directory.members.map((member) => actualMember(member)),
    auxiliaryEntries: [],
  }
}

function samePath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : sameLocalFilePath(left, right)
}

import {
  readBranchWorkspaceManifests,
  type BranchWorkspaceManifestSourceSnapshot,
} from '#/server/modules/branch-workspace-source.ts'
import {
  discoverBranchWorkspaceDirectories,
  type BranchWorkspaceDiscoveredDirectory,
  type BranchWorkspaceDiscoveredMember,
} from '#/server/modules/branch-workspace-discovery-source.ts'
import { branchWorkspaceStorageRootId, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import type { BranchWorkspaceManifest, BranchWorkspaceRepositoryMember } from '#/shared/branch-workspaces.ts'

export interface BranchWorkspaceCatalogDependencies {
  target?: { branchWorkspaceId: string } | { branch: string }
  readManifests?: typeof readBranchWorkspaceManifests
  discoverDirectories?: typeof discoverBranchWorkspaceDirectories
}

/** Registered folder locations are durable; members and branches are always live Git observations. */
export async function readBranchWorkspaceCatalog(
  rootId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceCatalogDependencies = {},
): Promise<
  BranchWorkspaceManifestSourceSnapshot & {
    discoveredDirectories?: BranchWorkspaceDiscoveredDirectory[]
    registryError?: string
  }
> {
  const root = workspaceRootId(rootId)
  const stored = await (dependencies.readManifests ?? readBranchWorkspaceManifests)(root)
  signal?.throwIfAborted()
  if (stored.kind !== 'ready') return stored
  const target = dependencies.target
  const selected = target
    ? stored.manifests.find((manifest) =>
        'branchWorkspaceId' in target
          ? manifest.id === target.branchWorkspaceId
          : !!target.branch && manifest.branch === target.branch,
      )
    : undefined
  const groups = new Map<string, BranchWorkspaceManifest[]>()
  for (const manifest of selected ? [selected] : stored.manifests) {
    const scope = branchWorkspaceStorageRootId(manifest),
      group = groups.get(scope) ?? []
    group.push(manifest)
    groups.set(scope, group)
  }
  const discover = dependencies.discoverDirectories ?? discoverBranchWorkspaceDirectories
  const discovered = (
    await Promise.all(
      [...groups].map(async ([scope, manifests]) => {
        const names = manifests.map((manifest) => manifest.directoryName)
        return await discover(scope, signal, { registeredDirectoryNames: names }, names).catch(() => {
          signal?.throwIfAborted()
          return []
        })
      }),
    )
  ).flat()
  signal?.throwIfAborted()
  return {
    kind: 'ready',
    manifests: stored.manifests.map((manifest) => {
      const directory = discovered.find((entry) => entry.path === manifest.path)
      return {
        id: manifest.id,
        rootId: manifest.rootId,
        branch: '',
        directoryName: manifest.directoryName,
        path: manifest.path,
        parentDirectory: manifest.parentDirectory,
        repositories: directory?.members.map(observedMember) ?? [],
        auxiliaryEntries: [],
      }
    }),
    discoveredDirectories: discovered,
  }
}

function observedMember(member: BranchWorkspaceDiscoveredMember): BranchWorkspaceRepositoryMember {
  return {
    repositoryName: member.repositoryName,
    kind: member.kind ?? 'worktree',
    repositoryId: member.repositoryId,
    worktreePath: member.worktreePath,
    targetBranch: member.branch,
    currentBranch: member.branch || null,
    ...(member.head ? { head: member.head } : {}),
    creationBase: { kind: 'localBranch', branch: member.branch || 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'pre-existing',
    progress: 'complete',
  }
}

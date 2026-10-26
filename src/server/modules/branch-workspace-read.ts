import path from 'node:path'
import {
  inspectBranchWorkspacePath,
  listBranchWorkspaceAuxiliaryCandidates,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'
import { discoverBranchWorkspaceDirectories } from '#/server/modules/branch-workspace-discovery-source.ts'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { branchWorkspaceStorageRootId, workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { getRepositorySnapshot } from '#/server/modules/repo-read-paths.ts'
import type {
  BranchWorkspaceActiveOperation,
  BranchWorkspaceReadResult,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

interface BranchWorkspaceReadDependencies {
  branchWorkspaceId?: string
  readManifests?: typeof readBranchWorkspaceManifests
  readConfig?: typeof readWorkspaceConfig
  readRepositorySnapshot?: typeof getRepositorySnapshot
  discoverDirectories?: typeof discoverBranchWorkspaceDirectories
  inspectPath?: typeof inspectBranchWorkspacePath
  listCandidates?: typeof listBranchWorkspaceAuxiliaryCandidates
  readActiveOperation?: (
    rootId: string,
    branchWorkspaceId: string,
  ) => BranchWorkspaceActiveOperation | null | Promise<BranchWorkspaceActiveOperation | null>
}

export async function readBranchWorkspaceSnapshot(
  rootId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceReadDependencies = {},
): Promise<BranchWorkspaceReadResult> {
  try {
    const [catalog, config] = await Promise.all([
      readBranchWorkspaceCatalog(rootId, signal, {
        readManifests: dependencies.readManifests,
        discoverDirectories: dependencies.discoverDirectories,
        ...(dependencies.branchWorkspaceId ? { target: { branchWorkspaceId: dependencies.branchWorkspaceId } } : {}),
      }),
      (dependencies.readConfig ?? readWorkspaceConfig)(rootId),
    ])
    signal?.throwIfAborted()
    if (catalog.kind === 'invalid')
      return { ok: true, rootId, items: [], auxiliaryCandidates: [], registryError: catalog.message }
    const all = catalog.kind === 'ready' ? catalog.manifests : []
    const pathApi = isRemoteRepoId(rootId) ? path.posix : path
    const names = new Set([
      ...(config.kind === 'ready' ? config.config.repo : []),
      ...all
        .filter((manifest) => pathApi.dirname(manifest.path) === workspaceRepositoryPath(rootId))
        .map((manifest) => manifest.directoryName),
    ])
    const auxiliaryCandidates = await (dependencies.listCandidates ?? listBranchWorkspaceAuxiliaryCandidates)(
      rootId,
      names,
      signal,
    ).catch(() => {
      signal?.throwIfAborted()
      return []
    })
    const items: BranchWorkspaceSnapshot[] = await Promise.all(
      all
        .filter((manifest) => !dependencies.branchWorkspaceId || manifest.id === dependencies.branchWorkspaceId)
        .map(async (manifest) => {
          const observed =
            catalog.kind === 'ready'
              ? catalog.discoveredDirectories?.find((directory) => directory.path === manifest.path)
              : undefined
          const inspection = observed
            ? { exists: true, kind: 'directory' }
            : await (dependencies.inspectPath ?? inspectBranchWorkspacePath)(
                branchWorkspaceStorageRootId(manifest),
                manifest.path,
                signal,
              ).catch(() => null)
          const available = !!inspection?.exists && inspection.kind === 'directory'
          const operation = await dependencies.readActiveOperation?.(rootId, manifest.id)
          return {
            id: manifest.id,
            rootId: manifest.rootId,
            branch: '',
            directoryName: manifest.directoryName,
            path: manifest.path,
            ...(manifest.parentDirectory ? { parentDirectory: manifest.parentDirectory } : {}),
            state: { kind: 'ready' as const },
            available,
            issues: available ? [] : [{ kind: 'root-missing' as const }],
            repositories: manifest.repositories.map((member) => ({ ...member, ready: true })),
            auxiliaryEntries: [],
            ...(operation ? { activeOperation: operation } : {}),
          }
        }),
    )
    return { ok: true, rootId, items, auxiliaryCandidates }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return {
      ok: false,
      message:
        message === 'cancelled' || message.startsWith('workspace.') || message.startsWith('error.')
          ? message
          : 'workspace.branch-workspace.read-failed',
    }
  }
}

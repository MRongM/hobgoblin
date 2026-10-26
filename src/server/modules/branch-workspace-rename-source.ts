import path from 'node:path'
import type { BranchWorkspaceFolderRenameResult } from '#/shared/branch-workspace-folders.ts'
import { isSafeBranchWorkspaceFolderName } from '#/shared/branch-workspaces.ts'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import { renameLocalWorkspaceFolder, type WorkspaceFolderRenameReply } from '#/system/git/workspace-folder-rename.ts'
import {
  readAllBranchWorkspaceManifests,
  readBranchWorkspaceManifests,
  relocateBranchWorkspaceFolderRecords,
  type BranchWorkspaceSourceDependencies,
} from '#/server/modules/branch-workspace-source.ts'
import { repositoryIdAtPath, workspaceRepositoryPath, workspaceRootId } from '#/server/modules/workspace-paths.ts'

const activeLocations = new Set<string>()

/** Filesystem/Git work is complete before persisting folder locations; failed writes trigger reversal. */
export async function renameBranchWorkspaceFolder(
  rootId: string,
  branchWorkspaceId: string,
  directoryName: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceFolderRenameResult> {
  const root = workspaceRootId(rootId),
    remote = parseRemoteRepoId(root)
  const pathApi = remote ? path.posix : path
  let previousPath: string | undefined, nextPath: string | undefined, locationKey: string | undefined
  let locationLocked = false
  try {
    signal?.throwIfAborted()
    if (!isSafeBranchWorkspaceFolderName(directoryName)) throw new Error('workspace.branch-workspace.invalid-directory')
    const snapshot = await readBranchWorkspaceManifests(root, dependencies)
    if (snapshot.kind === 'invalid') throw new Error(snapshot.message)
    const folder =
      snapshot.kind === 'ready' ? snapshot.manifests.find((item) => item.id === branchWorkspaceId) : undefined
    if (!folder) throw new Error('workspace.branch-workspace.directory-unavailable')
    previousPath = folder.path
    nextPath = pathApi.join(pathApi.dirname(previousPath), directoryName)
    if (nextPath === previousPath)
      return { ok: true, branchWorkspaceId, previousPath, path: nextPath, affectedRootIds: [] }
    const host = remote ? `${remote.transport ?? 'ssh'}:${remote.alias}` : 'local'
    locationKey = `${host}\0${pathApi.dirname(previousPath)}`
    if (activeLocations.has(locationKey)) throw new Error('workspace.branch-workspace.operation-in-progress')
    activeLocations.add(locationKey)
    locationLocked = true
    const all = await readAllBranchWorkspaceManifests(dependencies)
    if (all.kind === 'invalid') throw new Error(all.message)
    const protectedPaths = new Set<string>([workspaceRepositoryPath(root)!])
    if (all.kind === 'ready') {
      for (const item of all.manifests) {
        const itemRemote = parseRemoteRepoId(item.rootId)
        const sameHost = remote
          ? itemRemote?.alias === remote.alias && itemRemote?.transport === remote.transport
          : !itemRemote
        if (sameHost) protectedPaths.add(workspaceRepositoryPath(item.rootId)!)
      }
    }
    const target = remote ? (await resolveRepositoryRemoteTarget(remote, signal)).target : undefined
    const metadata = (value: WorkspaceFolderRenameReply) => ({
      pathMappings: value.pathMappings ?? [],
      affectedRepositoryIds: (value.repositoryPaths ?? []).map((folder) => repositoryIdAtPath(root, folder)),
    })
    const relocate = async (from: string, to: string, cancel?: AbortSignal): Promise<WorkspaceFolderRenameReply> => {
      cancel?.throwIfAborted()
      const input = { previousPath: from, path: to, protectedPaths: [...protectedPaths] }
      if (!target) return await renameLocalWorkspaceFolder(input, cancel)
      // Once remote mutation starts, allow it to finish/rollback rather than kill SSH mid-rename.
      const response = await runRemoteCommand(
        target,
        { type: 'renameWorkspaceFolder', ...input },
        { timeoutMs: 300_000 },
      )
      if (!response.ok) throw new Error(response.message ?? 'workspace.branch-workspace.remote-operation-failed')
      const value = JSON.parse(response.stdout) as WorkspaceFolderRenameReply
      if (typeof value.ok !== 'boolean' || value.previousPath !== from || (value.path !== from && value.path !== to))
        throw new Error('workspace.branch-workspace.remote-invalid-response')
      if (
        value.pathMappings !== undefined &&
        (!Array.isArray(value.pathMappings) ||
          value.pathMappings.some(
            (item) =>
              !item ||
              typeof item.previousPath !== 'string' ||
              typeof item.path !== 'string' ||
              !pathApi.isAbsolute(item.previousPath) ||
              !pathApi.isAbsolute(item.path),
          ))
      )
        throw new Error('workspace.branch-workspace.remote-invalid-response')
      if (
        value.repositoryPaths !== undefined &&
        (!Array.isArray(value.repositoryPaths) ||
          value.repositoryPaths.some((item) => typeof item !== 'string' || !pathApi.isAbsolute(item)))
      )
        throw new Error('workspace.branch-workspace.remote-invalid-response')
      return value
    }
    const result = await relocate(previousPath, nextPath, signal)
    if (!result.ok) {
      const affectedRootIds =
        result.path !== previousPath
          ? await relocateBranchWorkspaceFolderRecords(
              root,
              branchWorkspaceId,
              previousPath,
              result.path,
              dependencies,
              result.pathMappings,
            ).catch(() => [root])
          : []
      return {
        ok: false,
        branchWorkspaceId,
        previousPath,
        path: result.path,
        affectedRootIds,
        ...metadata(result),
        message: result.message ?? 'workspace.branch-workspace.rename.failed',
      }
    }
    try {
      signal?.throwIfAborted()
      const affectedRootIds = await relocateBranchWorkspaceFolderRecords(
        root,
        branchWorkspaceId,
        previousPath,
        nextPath,
        dependencies,
        result.pathMappings,
      )
      return { ok: true, branchWorkspaceId, previousPath, path: nextPath, affectedRootIds, ...metadata(result) }
    } catch (error) {
      const restored = await relocate(nextPath, previousPath).catch(() => null)
      if (!restored?.ok) {
        if (!restored)
          return {
            ok: false,
            branchWorkspaceId,
            previousPath,
            affectedRootIds: [root],
            message: 'workspace.branch-workspace.rename.rollback-failed',
          }
        const actualPath = restored.path
        const affectedRootIds =
          actualPath !== previousPath
            ? await relocateBranchWorkspaceFolderRecords(
                root,
                branchWorkspaceId,
                previousPath,
                actualPath,
                dependencies,
                result.pathMappings,
              ).catch(() => [root])
            : []
        return {
          ok: false,
          branchWorkspaceId,
          previousPath,
          path: actualPath,
          affectedRootIds,
          ...(actualPath !== previousPath
            ? metadata(result)
            : { affectedRepositoryIds: metadata(result).affectedRepositoryIds }),
          message: 'workspace.branch-workspace.rename.rollback-failed',
        }
      }
      throw error
    }
  } catch (error) {
    return {
      ok: false,
      branchWorkspaceId,
      ...(previousPath ? { previousPath } : {}),
      message: signal?.aborted
        ? 'workspace.branch-workspace.rename.cancelled'
        : error instanceof Error && /^(workspace\.|error\.)/.test(error.message)
          ? error.message
          : 'workspace.branch-workspace.rename.failed',
    }
  } finally {
    if (locationLocked && locationKey) activeLocations.delete(locationKey)
  }
}

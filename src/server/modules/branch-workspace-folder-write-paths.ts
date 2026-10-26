import {
  registerBranchWorkspaceFolder,
  unregisterBranchWorkspaceFolder,
  readBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'
import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { renameBranchWorkspaceFolder } from '#/server/modules/branch-workspace-rename-source.ts'
import { readBranchWorkspaceSnapshot } from '#/server/modules/branch-workspace-read.ts'
import { acquireFolderMutationScopes } from '#/server/modules/folder-mutation-locks.ts'
import { repositoryIdAtPath, workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { isSafeBranchWorkspaceFolderName } from '#/shared/branch-workspaces.ts'
import type { BranchWorkspaceFolderRenameResult } from '#/shared/branch-workspace-folders.ts'
import {
  publishWorkspaceInvalidation,
  publishWorkspaceConfigurationInvalidation,
  publishRepoQueryInvalidation,
} from '#/server/modules/invalidation-broker.ts'
import type { BranchWorkspaceExecuteResult } from '#/shared/branch-workspaces.ts'

interface FolderWriteDependencies {
  isOperationActive?: (rootId: string) => boolean
  relocateTerminalPaths?: (input: {
    rootId: string
    branchWorkspaceId: string
    previousPath: string
    path: string
  }) => Promise<unknown>
}

/** Registration changes records; explicit rename also relocates the folder and its Git metadata. */
export function createBranchWorkspaceFolderWriteService(dependencies: FolderWriteDependencies = {}) {
  const active = new Set<string>()
  function message(error: unknown): string {
    return error instanceof Error && /^(workspace\.|error\.)/.test(error.message)
      ? error.message
      : 'workspace.branch-workspace.folder-register.failed'
  }
  function changed(rootId: string) {
    publishWorkspaceConfigurationInvalidation(rootId)
    publishWorkspaceInvalidation(rootId)
  }
  return {
    isActive(rootId: string) {
      return active.has(rootId)
    },
    async register(rootId: string, folderPath: string): Promise<BranchWorkspaceExecuteResult> {
      if (active.has(rootId) || dependencies.isOperationActive?.(rootId)) {
        return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
      }
      active.add(rootId)
      try {
        const result = await registerBranchWorkspaceFolder(rootId, folderPath)
        changed(rootId)
        return { ok: true, branchWorkspaceId: result.branchWorkspaceId }
      } catch (error) {
        return { ok: false, message: message(error) }
      } finally {
        active.delete(rootId)
      }
    },
    async unregister(rootId: string, branchWorkspaceId: string): Promise<{ ok: boolean; message?: string }> {
      if (active.has(rootId) || dependencies.isOperationActive?.(rootId)) {
        return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
      }
      active.add(rootId)
      try {
        await unregisterBranchWorkspaceFolder(rootId, branchWorkspaceId)
        changed(rootId)
        return { ok: true }
      } catch (error) {
        return { ok: false, message: message(error) }
      } finally {
        active.delete(rootId)
      }
    },
    async rename(
      rootId: string,
      branchWorkspaceId: string,
      directoryName: string,
      signal?: AbortSignal,
    ): Promise<BranchWorkspaceFolderRenameResult> {
      if (!isSafeBranchWorkspaceFolderName(directoryName))
        return { ok: false, message: 'workspace.branch-workspace.invalid-directory' }
      if (active.has(rootId) || dependencies.isOperationActive?.(rootId)) {
        return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
      }
      active.add(rootId)
      let release: (() => void) | null = null
      try {
        const registry = await readBranchWorkspaceManifests(rootId)
        if (registry.kind !== 'ready') return { ok: false, message: 'workspace.branch-workspace.read-failed' }
        const folder = registry.manifests.find((item) => item.id === branchWorkspaceId)
        if (!folder) return { ok: false, message: 'workspace.branch-workspace.read-failed' }
        const pathApi = isRemoteRepoId(rootId) ? path.posix : path
        const nextPath = pathApi.join(pathApi.dirname(folder.path), directoryName)
        const canonicalPath = isRemoteRepoId(rootId)
          ? folder.path
          : await realpath(folder.path).catch(() => folder.path)
        release = acquireFolderMutationScopes([
          { repoId: rootId, path: folder.path },
          { repoId: rootId, path: canonicalPath },
          { repoId: rootId, path: nextPath },
        ])
        if (!release) return { ok: false, message: 'workspace.branch-workspace.operation-in-progress' }
        const snapshot = await readBranchWorkspaceSnapshot(rootId, signal)
        const repositoryIds = new Set(
          snapshot.ok
            ? snapshot.items
                .filter((item) => item.id === branchWorkspaceId)
                .flatMap((item) =>
                  item.repositories.flatMap((repository) => (repository.repositoryId ? [repository.repositoryId] : [])),
                )
            : [],
        )
        const result = await renameBranchWorkspaceFolder(rootId, branchWorkspaceId, directoryName, signal)
        let relocationFailed = false
        if (result.previousPath && result.path && result.previousPath !== result.path) {
          try {
            const mappings = new Map(
              [{ previousPath: result.previousPath, path: result.path }, ...(result.pathMappings ?? [])].map(
                (mapping) => [mapping.previousPath, mapping],
              ),
            )
            for (const mapping of mappings.values()) {
              await dependencies.relocateTerminalPaths?.({ rootId, branchWorkspaceId, ...mapping })
            }
          } catch {
            relocationFailed = true
          }
          for (const id of [...repositoryIds]) {
            const repositoryPath = workspaceRepositoryPath(id)
            if (!repositoryPath) continue
            const relative = pathApi.relative(result.previousPath, repositoryPath)
            if (
              !relative ||
              (relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative))
            ) {
              repositoryIds.add(repositoryIdAtPath(id, pathApi.join(result.path, relative)))
            }
          }
        }
        for (const id of result.affectedRepositoryIds ?? []) repositoryIds.add(id)
        for (const id of repositoryIds) publishRepoQueryInvalidation({ repoId: id, query: 'repo-snapshot' })
        for (const affectedRootId of new Set([rootId, ...(result.affectedRootIds ?? [])])) changed(affectedRootId)
        if (relocationFailed && result.ok)
          return { ...result, ok: false, message: 'workspace.branch-workspace.rename.state-refresh-failed' }
        return result
      } catch (error) {
        return {
          ok: false,
          message: signal?.aborted
            ? 'workspace.branch-workspace.rename.cancelled'
            : error instanceof Error && /^(workspace\.|error\.)/.test(error.message)
              ? error.message
              : 'workspace.branch-workspace.rename.failed',
        }
      } finally {
        release?.()
        active.delete(rootId)
      }
    },
  }
}

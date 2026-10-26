import {
  registerBranchWorkspaceFolder,
  unregisterBranchWorkspaceFolder,
} from '#/server/modules/branch-workspace-source.ts'
import {
  publishWorkspaceInvalidation,
  publishWorkspaceConfigurationInvalidation,
} from '#/server/modules/invalidation-broker.ts'
import type { BranchWorkspaceExecuteResult } from '#/shared/branch-workspaces.ts'

interface FolderWriteDependencies {
  isOperationActive?: (rootId: string) => boolean
}

/** Folder registration changes application records, never its branches or disk contents. */
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
  }
}

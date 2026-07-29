import { publishWorkspaceInvalidation } from '#/server/modules/invalidation-broker.ts'
import { cleanupBranchWorkspaceRegistry } from '#/server/modules/branch-workspace-source.ts'
import type { BranchWorkspaceRegistryCleanupResult } from '#/shared/branch-workspaces.ts'

interface BranchWorkspaceRegistryWriteDependencies {
  cleanup?: typeof cleanupBranchWorkspaceRegistry
  publishInvalidation?: typeof publishWorkspaceInvalidation
}

export async function cleanupBranchWorkspaceRegistryRecords(
  rootId: string,
  dependencies: BranchWorkspaceRegistryWriteDependencies = {},
): Promise<BranchWorkspaceRegistryCleanupResult> {
  try {
    const publishInvalidation = dependencies.publishInvalidation ?? publishWorkspaceInvalidation
    const result = await (dependencies.cleanup ?? cleanupBranchWorkspaceRegistry)()
    if (result.ok && result.outcome !== 'unchanged') publishInvalidation(rootId)
    return result
  } catch {
    return { ok: false, message: 'workspace.branch-workspace.cleanup-failed' }
  }
}

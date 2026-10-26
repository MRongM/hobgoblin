import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  BranchWorkspaceCloneRequest,
  BranchWorkspaceClonePlanResult,
  BranchWorkspaceCloneExecuteResult,
  BranchWorkspaceCloneProgress,
} from '#/shared/branch-workspace-clone.ts'

export async function planBranchWorkspaceClone(
  request: BranchWorkspaceCloneRequest,
): Promise<BranchWorkspaceClonePlanResult> {
  return await postServerJson('/api/workspace/branch-workspaces/clone/plan', request)
}
export async function executeBranchWorkspaceClone(
  planToken: string,
  sourceToken?: string,
): Promise<BranchWorkspaceCloneExecuteResult> {
  return await postServerJson('/api/workspace/branch-workspaces/clone/execute', { planToken, sourceToken })
}
export async function abortBranchWorkspaceClone(rootId: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/branch-workspaces/clone/abort', { rootId })
}
export async function readBranchWorkspaceCloneProgress(
  planToken: string,
): Promise<BranchWorkspaceCloneProgress | null> {
  return await postServerJson('/api/workspace/branch-workspaces/clone/progress', { planToken })
}

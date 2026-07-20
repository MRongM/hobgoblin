import type { WorkspaceConfig, WorkspaceDiscoveryResult } from '#/shared/workspace.ts'
import type {
  WorkspaceWorktreeBatchResult,
  WorkspaceWorktreePlanRequest,
  WorkspaceWorktreePlanResult,
} from '#/shared/workspace-worktrees.ts'
import { postServerJson } from '#/web/lib/server-fetch.ts'

export async function discoverWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/discover', { rootPath })
}

export async function restoreWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/restore', { rootPath })
}

export async function configureWorkspace(rootPath: string, config: WorkspaceConfig): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/configure', { rootPath, config })
}

export async function planWorkspaceWorktree(
  rootPath: string,
  request: WorkspaceWorktreePlanRequest,
): Promise<WorkspaceWorktreePlanResult> {
  return await postServerJson('/api/workspace/worktrees/plan', { rootPath, request })
}

export async function executeWorkspaceWorktree(
  rootPath: string,
  input: { planToken: string; approveBootstrap: boolean },
): Promise<WorkspaceWorktreeBatchResult> {
  return await postServerJson('/api/workspace/worktrees/execute', { rootPath, ...input })
}

export async function abortWorkspaceWorktree(rootPath: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/worktrees/abort', { rootPath })
}

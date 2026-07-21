import type { WorkspaceConfig, WorkspaceDiscoveryResult } from '#/shared/workspace.ts'
import type {
  BranchWorkspaceExecuteInput,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlanRequest,
  BranchWorkspacePlanResult,
  BranchWorkspaceReadResult,
  BranchWorkspaceReorderResult,
} from '#/shared/branch-workspaces.ts'
import type {
  BranchWorkspaceGitActionExecuteInput,
  BranchWorkspaceGitActionPlanRequest,
  BranchWorkspaceGitActionPlanResult,
  BranchWorkspaceGitActionResult,
} from '#/shared/branch-workspace-git-actions.ts'
import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  WorkspacePullExecuteInput,
  WorkspacePullPlanResult,
  WorkspacePullResult,
} from '#/shared/workspace-pull.ts'

export async function discoverWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/discover', { rootPath })
}

export async function restoreWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/restore', { rootPath })
}

export async function configureWorkspace(rootPath: string, config: WorkspaceConfig): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/configure', { rootPath, config })
}

export async function readBranchWorkspaces(rootId: string, signal?: AbortSignal): Promise<BranchWorkspaceReadResult> {
  return await postServerJson('/api/workspace/branch-workspaces/read', { rootId }, { signal })
}

export async function planBranchWorkspace(
  rootId: string,
  request: BranchWorkspacePlanRequest,
): Promise<BranchWorkspacePlanResult> {
  return await postServerJson('/api/workspace/branch-workspaces/plan', { rootId, request })
}

export async function executeBranchWorkspace(
  rootId: string,
  input: BranchWorkspaceExecuteInput,
): Promise<BranchWorkspaceExecuteResult> {
  return await postServerJson('/api/workspace/branch-workspaces/execute', { rootId, ...input })
}

export async function abortBranchWorkspace(rootId: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/branch-workspaces/abort', { rootId })
}

export async function reorderBranchWorkspaces(
  rootId: string,
  orderedIds: string[],
): Promise<BranchWorkspaceReorderResult> {
  return await postServerJson('/api/workspace/branch-workspaces/reorder', { rootId, orderedIds })
}

export async function planBranchWorkspaceGitAction(
  rootId: string,
  request: BranchWorkspaceGitActionPlanRequest,
): Promise<BranchWorkspaceGitActionPlanResult> {
  return await postServerJson('/api/workspace/branch-workspaces/git-actions/plan', { rootId, request })
}

export async function executeBranchWorkspaceGitAction(
  rootId: string,
  input: BranchWorkspaceGitActionExecuteInput,
): Promise<BranchWorkspaceGitActionResult | { ok: false; message: string }> {
  return await postServerJson('/api/workspace/branch-workspaces/git-actions/execute', { rootId, input })
}

export async function abortBranchWorkspaceGitAction(rootId: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/branch-workspaces/git-actions/abort', { rootId })
}

export async function planWorkspacePull(rootId: string): Promise<WorkspacePullPlanResult> {
  return await postServerJson('/api/workspace/pull/plan', { rootId })
}

export async function executeWorkspacePull(
  rootId: string,
  input: WorkspacePullExecuteInput,
): Promise<WorkspacePullResult> {
  return await postServerJson('/api/workspace/pull/execute', { rootId, ...input })
}

export async function abortWorkspacePull(rootId: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/pull/abort', { rootId })
}

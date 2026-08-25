import type { WorkspaceConfig, WorkspaceDiscoveryResult } from '#/shared/workspace.ts'
import type {
  BranchWorkspaceExecuteInput,
  BranchWorkspaceExecuteResult,
  BranchWorkspacePlanRequest,
  BranchWorkspacePlanResult,
  BranchWorkspaceReadResult,
  BranchWorkspaceRegistryCleanupResult,
  BranchWorkspaceReorderResult,
} from '#/shared/branch-workspaces.ts'
import type {
  BranchWorkspaceGitActionExecuteInput,
  BranchWorkspaceGitActionPlanRequest,
  BranchWorkspaceGitActionPlanResult,
  BranchWorkspaceGitActionResult,
} from '#/shared/branch-workspace-git-actions.ts'
import type {
  BranchWorkspaceDependencyExecuteInput,
  BranchWorkspaceDependencyExecuteResult,
  BranchWorkspaceDependencyPlanRequest,
  BranchWorkspaceDependencyPlanResult,
  BranchWorkspaceDependencyReadResult,
} from '#/shared/branch-workspace-dependencies.ts'
import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  WorkspaceRecoveryExecuteInput,
  WorkspaceRecoveryExecuteResult,
  WorkspaceRecoveryPlanResult,
} from '#/shared/workspace-recovery.ts'

export async function discoverWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/discover', { rootPath })
}

export async function restoreWorkspace(rootPath: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/restore', { rootPath })
}

export async function importWorkspace(rootPath: string, sourceToken?: string): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/import', {
    rootPath,
    ...(sourceToken ? { sourceToken } : {}),
  })
}

export async function configureWorkspace(rootPath: string, config: WorkspaceConfig): Promise<WorkspaceDiscoveryResult> {
  return await postServerJson('/api/workspace/configure', { rootPath, config })
}

export async function planWorkspaceRecovery(rootId: string): Promise<WorkspaceRecoveryPlanResult> {
  return await postServerJson('/api/workspace/recovery/plan', { rootId })
}

export async function executeWorkspaceRecovery(
  rootId: string,
  input: WorkspaceRecoveryExecuteInput,
): Promise<WorkspaceRecoveryExecuteResult> {
  return await postServerJson('/api/workspace/recovery/execute', { rootId, input })
}

export async function abortWorkspaceRecovery(rootId: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/recovery/abort', { rootId })
}

export async function readBranchWorkspaces(rootId: string, signal?: AbortSignal): Promise<BranchWorkspaceReadResult> {
  return await postServerJson('/api/workspace/branch-workspaces/read', { rootId }, { signal })
}

export async function cleanupBranchWorkspaceRegistry(rootId: string): Promise<BranchWorkspaceRegistryCleanupResult> {
  return await postServerJson('/api/workspace/branch-workspaces/cleanup', { rootId })
}

export async function planBranchWorkspace(
  rootId: string,
  request: BranchWorkspacePlanRequest,
  signal?: AbortSignal,
): Promise<BranchWorkspacePlanResult> {
  return signal
    ? await postServerJson('/api/workspace/branch-workspaces/plan', { rootId, request }, { signal })
    : await postServerJson('/api/workspace/branch-workspaces/plan', { rootId, request })
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

export async function readBranchWorkspaceDependencies(
  rootId: string,
  branchWorkspaceId: string,
  signal?: AbortSignal,
): Promise<BranchWorkspaceDependencyReadResult> {
  return await postServerJson(
    '/api/workspace/branch-workspaces/dependencies/read',
    { rootId, branchWorkspaceId },
    { signal },
  )
}

export async function planBranchWorkspaceDependencies(
  rootId: string,
  request: BranchWorkspaceDependencyPlanRequest,
  signal?: AbortSignal,
): Promise<BranchWorkspaceDependencyPlanResult> {
  return signal
    ? await postServerJson('/api/workspace/branch-workspaces/dependencies/plan', { rootId, request }, { signal })
    : await postServerJson('/api/workspace/branch-workspaces/dependencies/plan', { rootId, request })
}

export async function executeBranchWorkspaceDependencies(
  rootId: string,
  input: BranchWorkspaceDependencyExecuteInput,
): Promise<BranchWorkspaceDependencyExecuteResult> {
  return await postServerJson('/api/workspace/branch-workspaces/dependencies/execute', { rootId, input })
}

export async function abortBranchWorkspaceDependencies(rootId: string): Promise<{ ok: boolean }> {
  return await postServerJson('/api/workspace/branch-workspaces/dependencies/abort', { rootId })
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

import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  WorktreeDependencyReadInput,
  WorktreeDependencyReadResult,
  WorktreeDependencyPlanRequest,
  WorktreeDependencyPlanResult,
  WorktreeDependencyExecuteResult,
  WorktreeDependencyTarget,
} from '#/shared/worktree-dependencies.ts'

export async function readWorktreeDependencies(
  input: WorktreeDependencyReadInput,
  signal?: AbortSignal,
): Promise<WorktreeDependencyReadResult> {
  return await postServerJson('/api/repo/worktree-dependencies/read', input, { signal })
}

export async function planWorktreeDependencies(
  request: WorktreeDependencyPlanRequest,
  signal?: AbortSignal,
): Promise<WorktreeDependencyPlanResult> {
  return await postServerJson('/api/repo/worktree-dependencies/plan', request, { signal })
}

export async function executeWorktreeDependencies(planToken: string): Promise<WorktreeDependencyExecuteResult> {
  return await postServerJson('/api/repo/worktree-dependencies/execute', { planToken })
}

export async function abortWorktreeDependencies(target: WorktreeDependencyTarget): Promise<{ ok: boolean }> {
  return await postServerJson('/api/repo/worktree-dependencies/abort', target)
}

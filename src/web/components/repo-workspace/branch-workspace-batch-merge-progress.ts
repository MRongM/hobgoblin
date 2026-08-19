import type {
  BranchWorkspaceBatchMergeInPlan,
  BranchWorkspaceBatchMergeInSourceInput,
  BranchWorkspaceBatchMergeOutPlan,
  BranchWorkspaceBatchMergeOutTargetInput,
  BranchWorkspaceGitActionResult,
  BranchWorkspaceGitActionStep,
  BranchWorkspaceMergeMode,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'
import { repositoryMergeBranchSelectionKey } from '#/shared/repository-merge-branch.ts'
import {
  projectBranchWorkspaceBatchProgress,
  type BranchWorkspaceBatchProgress,
} from './branch-workspace-batch-progress.ts'

export type { BranchWorkspaceBatchProgress as BranchWorkspaceBatchMergeProgress } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchMemberProgress as BranchWorkspaceBatchMergeMemberProgress } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchStepProgress as BranchWorkspaceBatchMergeStepProgress } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchStepStatus as BranchWorkspaceBatchMergeStepStatus } from './branch-workspace-batch-progress.ts'
export type { BranchWorkspaceBatchMemberStatus as BranchWorkspaceBatchMergeMemberStatus } from './branch-workspace-batch-progress.ts'

export function projectBranchWorkspaceBatchMergeInProgress(
  plan: BranchWorkspaceBatchMergeInPlan,
  sources: BranchWorkspaceBatchMergeInSourceInput[],
  mode: BranchWorkspaceMergeMode,
  activeOperation: BranchWorkspaceActiveOperation | null,
  result: BranchWorkspaceGitActionResult | null,
): BranchWorkspaceBatchProgress {
  const selected = new Map(sources.map((source) => [source.repositoryName, source.source]))
  return projectBranchWorkspaceBatchProgress({
    members: plan.members,
    selectedRepositoryNames: [...selected.keys()],
    stepsFor: (member): readonly BranchWorkspaceGitActionStep[] => {
      const source = selected.get(member.repositoryName)
      const fetchSteps = source?.kind === 'remote' ? (['fetch'] as const) : []
      return mode === 'merge' ? [...fetchSteps, 'merge'] : ['pull', ...fetchSteps, 'merge', 'push']
    },
    activeOperation,
    result,
  })
}

export function projectBranchWorkspaceBatchMergeOutProgress(
  plan: BranchWorkspaceBatchMergeOutPlan,
  targets: BranchWorkspaceBatchMergeOutTargetInput[],
  mode: BranchWorkspaceMergeMode,
  activeOperation: BranchWorkspaceActiveOperation | null,
  result: BranchWorkspaceGitActionResult | null,
): BranchWorkspaceBatchProgress {
  const selected = new Map(targets.map((target) => [target.repositoryName, target.destination]))
  return projectBranchWorkspaceBatchProgress({
    members: plan.members,
    selectedRepositoryNames: [...selected.keys()],
    stepsFor: (member): readonly BranchWorkspaceGitActionStep[] => {
      const destination = member.destinationBranches.find((candidate) => {
        const selection = selected.get(member.repositoryName)
        return (
          selection !== undefined &&
          repositoryMergeBranchSelectionKey(candidate.destination) === repositoryMergeBranchSelectionKey(selection)
        )
      })
      if (destination?.destination.kind === 'remote') {
        return ['fetch', 'prepare', 'merge', 'push', 'cleanup']
      }
      return [
        'prepare',
        ...(mode === 'merge' ? (['merge'] as const) : (['pull', 'merge', 'push'] as const)),
        ...(destination?.requiresTemporaryWorktree ? (['cleanup'] as const) : []),
      ]
    },
    activeOperation,
    result,
  })
}

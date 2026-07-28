import type {
  BranchWorkspaceGitActionResult,
  BranchWorkspaceGitActionStep,
  BranchWorkspaceBatchMergePlan,
  BranchWorkspaceBatchMergeTargetInput,
  BranchWorkspaceMergeMode,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'

export type BranchWorkspaceBatchMergeStepStatus = 'pending' | 'active' | 'complete' | 'failed'
export type BranchWorkspaceBatchMergeMemberStatus = 'unselected' | BranchWorkspaceBatchMergeStepStatus

export interface BranchWorkspaceBatchMergeStepProgress {
  step: Exclude<BranchWorkspaceGitActionStep, 'commit'>
  status: BranchWorkspaceBatchMergeStepStatus
}

export interface BranchWorkspaceBatchMergeMemberProgress {
  repositoryName: string
  selected: boolean
  status: BranchWorkspaceBatchMergeMemberStatus
  steps: BranchWorkspaceBatchMergeStepProgress[]
}

export interface BranchWorkspaceBatchMergeProgress {
  members: BranchWorkspaceBatchMergeMemberProgress[]
  completedCount: number
  totalCount: number
}

export function projectBranchWorkspaceBatchMergeProgress(
  plan: BranchWorkspaceBatchMergePlan,
  targets: BranchWorkspaceBatchMergeTargetInput[],
  mode: BranchWorkspaceMergeMode,
  activeOperation: BranchWorkspaceActiveOperation | null,
  result: BranchWorkspaceGitActionResult | null,
): BranchWorkspaceBatchMergeProgress {
  const selected = new Map(targets.map((target) => [target.repositoryName, target.destinationBranch]))
  const selectedMembers = plan.members.filter((member) => selected.has(member.repositoryName))
  const completedCount = result
    ? selectedMembers.filter(
        (member) =>
          result.members.find((candidate) => candidate.repositoryName === member.repositoryName)?.phase === 'succeeded',
      ).length
    : Math.min(activeOperation?.completedCount ?? 0, selectedMembers.length)

  return {
    members: plan.members.map((member) => {
      if (!selected.has(member.repositoryName)) {
        return { repositoryName: member.repositoryName, selected: false, status: 'unselected', steps: [] }
      }

      const selectedIndex = selectedMembers.findIndex((candidate) => candidate.repositoryName === member.repositoryName)
      const memberResult = result?.members.find((candidate) => candidate.repositoryName === member.repositoryName)
      const destination = member.destinationBranches.find(
        (candidate) => candidate.branch === selected.get(member.repositoryName),
      )
      const steps: Array<Exclude<BranchWorkspaceGitActionStep, 'commit'>> = [
        'prepare',
        ...(mode === 'merge' ? (['merge'] as const) : (['pull', 'merge', 'push'] as const)),
        ...(destination?.requiresTemporaryWorktree ? (['cleanup'] as const) : []),
      ]
      const stepProgress = steps.map((step) => ({
        step,
        status: projectStepStatus(
          step,
          steps,
          selectedIndex,
          completedCount,
          member.repositoryName,
          activeOperation,
          memberResult,
        ),
      }))

      return {
        repositoryName: member.repositoryName,
        selected: true,
        status: memberStatus(stepProgress),
        steps: stepProgress,
      }
    }),
    completedCount,
    totalCount: selectedMembers.length,
  }
}

function projectStepStatus(
  step: BranchWorkspaceBatchMergeStepProgress['step'],
  steps: readonly BranchWorkspaceBatchMergeStepProgress['step'][],
  selectedIndex: number,
  completedCount: number,
  repositoryName: string,
  activeOperation: BranchWorkspaceActiveOperation | null,
  result: BranchWorkspaceGitActionResult['members'][number] | undefined,
): BranchWorkspaceBatchMergeStepStatus {
  if (result?.phase === 'succeeded') return 'complete'
  if (result?.phase === 'failed' && result.step) {
    const currentIndex = steps.indexOf(result.step as BranchWorkspaceBatchMergeStepProgress['step'])
    const stepIndex = steps.indexOf(step)
    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'failed'
    return 'pending'
  }
  if (result) return 'pending'
  if (selectedIndex < completedCount) return 'complete'
  if (activeOperation?.repositoryName !== repositoryName || !activeOperation.step) return 'pending'

  const currentIndex = steps.indexOf(activeOperation.step as BranchWorkspaceBatchMergeStepProgress['step'])
  const stepIndex = steps.indexOf(step)
  if (stepIndex < currentIndex) return 'complete'
  if (stepIndex === currentIndex) return 'active'
  return 'pending'
}

function memberStatus(steps: BranchWorkspaceBatchMergeStepProgress[]): BranchWorkspaceBatchMergeMemberStatus {
  if (steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'active')) return 'active'
  if (steps.every((step) => step.status === 'complete')) return 'complete'
  return 'pending'
}

import type {
  BranchWorkspaceGitActionMemberResult,
  BranchWorkspaceGitActionResult,
  BranchWorkspaceGitActionStep,
} from '#/shared/branch-workspace-git-actions.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'

export type BranchWorkspaceBatchStepStatus = 'pending' | 'active' | 'complete' | 'failed'
export type BranchWorkspaceBatchMemberStatus = 'unselected' | BranchWorkspaceBatchStepStatus

export interface BranchWorkspaceBatchStepProgress {
  step: BranchWorkspaceGitActionStep
  status: BranchWorkspaceBatchStepStatus
}

export interface BranchWorkspaceBatchMemberProgress {
  repositoryName: string
  selected: boolean
  status: BranchWorkspaceBatchMemberStatus
  steps: BranchWorkspaceBatchStepProgress[]
}

export interface BranchWorkspaceBatchProgress {
  members: BranchWorkspaceBatchMemberProgress[]
  completedCount: number
  totalCount: number
}

export interface ProjectBranchWorkspaceBatchProgressInput<TMember extends { repositoryName: string }> {
  members: readonly TMember[]
  selectedRepositoryNames: readonly string[]
  stepsFor: (member: TMember) => readonly BranchWorkspaceGitActionStep[]
  activeOperation: BranchWorkspaceActiveOperation | null
  result: BranchWorkspaceGitActionResult | null
}

export function projectBranchWorkspaceBatchProgress<TMember extends { repositoryName: string }>(
  input: ProjectBranchWorkspaceBatchProgressInput<TMember>,
): BranchWorkspaceBatchProgress {
  const selected = new Set(input.selectedRepositoryNames)
  const selectedMembers = input.members.filter((member) => selected.has(member.repositoryName))
  const resultMembers = input.result?.members
  const completedCount = resultMembers
    ? selectedMembers.filter(
        (member) =>
          resultMembers.find((candidate) => candidate.repositoryName === member.repositoryName)?.phase === 'succeeded',
      ).length
    : Math.min(input.activeOperation?.completedCount ?? 0, selectedMembers.length)

  const members = input.members.map<BranchWorkspaceBatchMemberProgress>((member) => {
    if (!selected.has(member.repositoryName)) {
      return { repositoryName: member.repositoryName, selected: false, status: 'unselected', steps: [] }
    }
    const selectedIndex = selectedMembers.findIndex((candidate) => candidate.repositoryName === member.repositoryName)
    const memberResult = resultMembers?.find((candidate) => candidate.repositoryName === member.repositoryName)
    const steps = input.stepsFor(member)
    const stepProgress = steps.map<BranchWorkspaceBatchStepProgress>((step) => ({
      step,
      status: projectStepStatus(
        step,
        steps,
        selectedIndex,
        completedCount,
        member.repositoryName,
        input.activeOperation,
        memberResult,
      ),
    }))
    return {
      repositoryName: member.repositoryName,
      selected: true,
      status: memberStatus(stepProgress),
      steps: stepProgress,
    }
  })

  return { members, completedCount, totalCount: selectedMembers.length }
}

function projectStepStatus(
  step: BranchWorkspaceGitActionStep,
  steps: readonly BranchWorkspaceGitActionStep[],
  selectedIndex: number,
  completedCount: number,
  repositoryName: string,
  activeOperation: BranchWorkspaceActiveOperation | null,
  memberResult: BranchWorkspaceGitActionMemberResult | undefined,
): BranchWorkspaceBatchStepStatus {
  if (memberResult?.phase === 'succeeded') return 'complete'
  if (memberResult?.phase === 'failed' && memberResult.step) {
    const currentIndex = steps.indexOf(memberResult.step)
    const stepIndex = steps.indexOf(step)
    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'failed'
    return 'pending'
  }
  if (memberResult) return 'pending'
  const activeStep = branchWorkspaceActiveMemberStep(activeOperation, repositoryName)
  if (activeStep) {
    const currentIndex = steps.indexOf(activeStep)
    const stepIndex = steps.indexOf(step)
    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'active'
    return 'pending'
  }
  if (activeOperation?.completedRepositoryNames?.includes(repositoryName)) return 'complete'
  if (activeOperation?.completedRepositoryNames) return 'pending'
  if (selectedIndex < completedCount) return 'complete'
  return 'pending'
}

export function branchWorkspaceActiveMemberStep(
  activeOperation: BranchWorkspaceActiveOperation | null,
  repositoryName: string,
): BranchWorkspaceGitActionStep | undefined {
  if (!activeOperation) return undefined
  if (activeOperation.activeMembers) {
    return activeOperation.activeMembers.find((member) => member.repositoryName === repositoryName)?.step
  }
  return activeOperation.repositoryName === repositoryName ? activeOperation.step : undefined
}

function memberStatus(steps: readonly BranchWorkspaceBatchStepProgress[]): BranchWorkspaceBatchMemberStatus {
  if (steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'active')) return 'active'
  if (steps.length > 0 && steps.every((step) => step.status === 'complete')) return 'complete'
  return 'pending'
}

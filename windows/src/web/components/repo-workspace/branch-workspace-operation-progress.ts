import type {
  BranchWorkspacePlan,
  BranchWorkspacePlanStep,
  BranchWorkspaceProgress,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'

export type BranchWorkspaceStepProgressStatus = 'pending' | 'active' | 'complete' | 'failed'

export interface BranchWorkspaceStepProgress {
  step: BranchWorkspacePlanStep
  status: BranchWorkspaceStepProgressStatus
}

export interface BranchWorkspaceOperationProgress {
  steps: BranchWorkspaceStepProgress[]
  completedCount: number
  totalCount: number
}

interface BranchWorkspaceOperationProgressOptions {
  executing: boolean
  failed: boolean
}

export function projectBranchWorkspaceOperationProgress(
  plan: BranchWorkspacePlan,
  snapshot: BranchWorkspaceSnapshot | null,
  options: BranchWorkspaceOperationProgressOptions,
): BranchWorkspaceOperationProgress {
  const statuses: BranchWorkspaceStepProgressStatus[] = plan.steps.map((step) =>
    durableStepStatus(plan.operation, step, snapshot),
  )
  let latestSettledIndex = -1
  for (let index = 0; index < statuses.length; index += 1) {
    if (statuses[index] === 'complete' || statuses[index] === 'failed') latestSettledIndex = index
  }
  for (let index = 0; index < latestSettledIndex; index += 1) {
    if (statuses[index] === 'pending') statuses[index] = 'complete'
  }

  const hasDurableFailure = statuses.includes('failed')
  const firstPendingIndex = statuses.indexOf('pending')
  if (firstPendingIndex >= 0 && options.failed && !hasDurableFailure) {
    statuses[firstPendingIndex] = 'failed'
  } else if (firstPendingIndex >= 0 && options.executing && !hasDurableFailure) {
    statuses[firstPendingIndex] = 'active'
  }

  return {
    steps: plan.steps.map((step, index) => ({ step, status: statuses[index] ?? 'pending' })),
    completedCount: statuses.filter((status) => status === 'complete').length,
    totalCount: statuses.length,
  }
}

function durableStepStatus(
  operation: BranchWorkspacePlan['operation'],
  step: BranchWorkspacePlanStep,
  snapshot: BranchWorkspaceSnapshot | null,
): Exclude<BranchWorkspaceStepProgressStatus, 'active'> {
  if (!snapshot) return 'pending'

  if (step.kind === 'create-directory') {
    const unavailable = snapshot.issues.some(
      (issue) => issue.kind === 'root-missing' || issue.kind === 'root-not-directory',
    )
    return unavailable ? 'pending' : 'complete'
  }
  if (step.kind === 'remove-directory') return 'pending'

  if (step.kind === 'create-worktree' || step.kind === 'remove-worktree') {
    const member = snapshot.repositories.find((candidate) => candidate.repositoryName === step.repositoryName)
    if (!member) return 'pending'
    return progressStatus(member.progress, step.kind === 'create-worktree' ? 'complete' : 'removed')
  }

  if (step.kind === 'delete-local-branch' || step.kind === 'delete-upstream-branch') {
    const member = snapshot.repositories.find((candidate) => candidate.repositoryName === step.repositoryName)
    if (!member) return 'pending'
    const progress = step.kind === 'delete-local-branch' ? member.branchCleanupProgress : member.upstreamCleanupProgress
    return progressStatus(progress, 'complete')
  }

  const entry = snapshot.auxiliaryEntries.find((candidate) => candidate.name === step.entryName)
  if (step.kind === 'copy-entry' || step.kind === 'symlink-entry') {
    if (!entry) return operation === 'create' ? 'complete' : 'pending'
    return progressStatus(entry.progress, 'complete')
  }
  if (step.kind === 'remove-entry') {
    if (step.id.startsWith('unmanaged:') || !entry) return 'pending'
    return progressStatus(entry.progress, 'removed')
  }
  return 'pending'
}

function progressStatus(
  progress: BranchWorkspaceProgress | undefined,
  completedProgress: Extract<BranchWorkspaceProgress, 'complete' | 'removed'>,
): Exclude<BranchWorkspaceStepProgressStatus, 'active'> {
  if (progress === 'failed') return 'failed'
  return progress === completedProgress ? 'complete' : 'pending'
}

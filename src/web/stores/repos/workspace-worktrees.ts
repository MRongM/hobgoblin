import type { RepoState, ReposStore } from '#/web/stores/repos/types.ts'

type WorkspaceWorktreeState = Pick<ReposStore, 'repos' | 'workspaceProjects'>

export interface WorkspaceBatchBranchChoices {
  baseBranches: string[]
  removableBranches: string[]
}

const emptyChoices: WorkspaceBatchBranchChoices = { baseBranches: [], removableBranches: [] }
const branchNameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function workspaceBatchBranchChoices(
  state: WorkspaceWorktreeState,
  rootId: string,
): WorkspaceBatchBranchChoices {
  const workspace = state.workspaceProjects[rootId]
  if (!workspace?.configured || workspace.repositoryIds.length === 0) return emptyChoices
  const repositories = workspace.repositoryIds.map((repoId) => state.repos[repoId])
  if (repositories.some((repo) => !repo || repo.availability.phase !== 'available')) return emptyChoices

  const availableRepositories = repositories as RepoState[]
  const commonNames = intersectBranchNames(availableRepositories)
  const baseBranches = [...commonNames].sort((left, right) => {
    const preference = branchPreference(left, availableRepositories) - branchPreference(right, availableRepositories)
    return preference || branchNameCollator.compare(left, right)
  })
  const removableBranches = [...commonNames]
    .filter((branch) => availableRepositories.every((repo) => isLinkedWorktreeBranch(repo, branch)))
    .sort(branchNameCollator.compare)
  return { baseBranches, removableBranches }
}

function intersectBranchNames(repositories: RepoState[]): Set<string> {
  const [first, ...rest] = repositories
  const common = new Set(first!.data.branches.map((branch) => branch.name))
  for (const repo of rest) {
    const names = new Set(repo.data.branches.map((branch) => branch.name))
    for (const name of common) if (!names.has(name)) common.delete(name)
  }
  return common
}

function branchPreference(branch: string, repositories: RepoState[]): number {
  if (repositories.every((repo) => repo.data.branches.find((candidate) => candidate.name === branch)?.isDefault)) {
    return 0
  }
  if (branch === 'main') return 1
  if (branch === 'master') return 2
  return 3
}

function isLinkedWorktreeBranch(repo: RepoState, branch: string): boolean {
  const candidate = repo.data.branches.find((entry) => entry.name === branch)
  const worktreePath = candidate?.worktree?.path
  if (!worktreePath) return false
  return worktreePath !== repo.id && repo.data.worktreesByPath[worktreePath]?.isMain !== true
}

export type RepositoryDependencySource =
  | { id: 'primary'; kind: 'primary' }
  | { id: `branch:${string}`; kind: 'branch'; branch: string; worktreePath: string }

export interface RepositoryDependencySourceSet {
  initial: RepositoryDependencySource
  primary: Extract<RepositoryDependencySource, { kind: 'primary' }>
  alternatives: RepositoryDependencySource[]
}

export function repositoryDependencySources(input: {
  baseBranch: string
  primaryWorktreePath?: string
  sourceWorktreeByBranch?: Readonly<Record<string, string>>
}): RepositoryDependencySourceSet {
  const primary = { id: 'primary', kind: 'primary' } as const
  const baseWorktreePath = input.sourceWorktreeByBranch?.[input.baseBranch]
  const initial =
    baseWorktreePath && baseWorktreePath !== input.primaryWorktreePath
      ? branchSource(input.baseBranch, baseWorktreePath)
      : primary
  const alternatives: RepositoryDependencySource[] = []
  const seenPaths = new Set<string>()
  if (baseWorktreePath) seenPaths.add(baseWorktreePath)
  if (input.primaryWorktreePath) seenPaths.add(input.primaryWorktreePath)
  if (initial.kind !== 'primary') alternatives.push(primary)

  for (const [branch, worktreePath] of Object.entries(input.sourceWorktreeByBranch ?? {})) {
    if (branch === input.baseBranch || seenPaths.has(worktreePath)) continue
    seenPaths.add(worktreePath)
    alternatives.push(branchSource(branch, worktreePath))
  }

  return { initial, primary, alternatives }
}

function branchSource(branch: string, worktreePath: string): Extract<RepositoryDependencySource, { kind: 'branch' }> {
  return { id: `branch:${branch}`, kind: 'branch', branch, worktreePath }
}

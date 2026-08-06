export interface RepositoryDependencyWorktree {
  path: string
  branch?: string
  head?: string
  isDetached?: boolean
  isMain: boolean
  isPrunable?: boolean
}

export type RepositoryDependencySource =
  | { id: string; kind: 'primary'; worktreePath: string; branch?: string }
  | { id: string; kind: 'branch'; worktreePath: string; branch: string }
  | { id: string; kind: 'detached'; worktreePath: string; head?: string }

export interface RepositoryDependencySourceSet {
  initial: RepositoryDependencySource | null
  options: RepositoryDependencySource[]
}

export function repositoryDependencySources(input: {
  contextBranch: string
  worktrees: readonly RepositoryDependencyWorktree[]
}): RepositoryDependencySourceSet {
  const sources: RepositoryDependencySource[] = []
  const seenPaths = new Set<string>()
  for (const worktree of input.worktrees) {
    if (!worktree.path || worktree.isPrunable || seenPaths.has(worktree.path)) continue
    seenPaths.add(worktree.path)
    sources.push(toDependencySource(worktree))
  }

  sources.sort(compareDependencySources)
  const initial =
    sources.find((source) => source.kind === 'branch' && source.branch === input.contextBranch) ??
    sources.find((source) => source.kind === 'primary') ??
    sources[0] ??
    null
  return { initial, options: sources }
}

function toDependencySource(worktree: RepositoryDependencyWorktree): RepositoryDependencySource {
  const id = `worktree:${worktree.path}`
  if (worktree.isMain) {
    return {
      id,
      kind: 'primary',
      worktreePath: worktree.path,
      ...(worktree.branch ? { branch: worktree.branch } : {}),
    }
  }
  if (worktree.branch && !worktree.isDetached) {
    return { id, kind: 'branch', branch: worktree.branch, worktreePath: worktree.path }
  }
  return {
    id,
    kind: 'detached',
    worktreePath: worktree.path,
    ...(worktree.head ? { head: worktree.head } : {}),
  }
}

function compareDependencySources(left: RepositoryDependencySource, right: RepositoryDependencySource): number {
  const priority = { primary: 0, branch: 1, detached: 2 } as const
  const priorityDifference = priority[left.kind] - priority[right.kind]
  return priorityDifference || left.worktreePath.localeCompare(right.worktreePath)
}

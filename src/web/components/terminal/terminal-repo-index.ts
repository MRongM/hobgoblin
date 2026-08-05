import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import type { ReposStore } from '#/web/stores/repos/types.ts'
import type { TerminalRepoIndex } from '#/web/components/terminal/types.ts'

function stringRecordEqual(left: Record<string, string> = {}, right: Record<string, string> = {}): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key])
}

export function repoIndexFromRepos(repos: ReposStore['repos']): TerminalRepoIndex {
  const index: TerminalRepoIndex = {}
  for (const [repoRoot, repo] of Object.entries(repos)) {
    const branchByWorktreePath: Record<string, string> = {}
    if (repo.isGitRepo === false) {
      const workspacePath = repoPlainWorkspacePath(repo) ?? repoRoot
      branchByWorktreePath[workspacePath] = NON_GIT_WORKSPACE_TERMINAL_BRANCH
    } else {
      for (const branch of repo.data.branches) {
        const worktreePath = branch.worktree?.path
        if (worktreePath) branchByWorktreePath[worktreePath] = branch.name
      }
    }
    index[repoRoot] = {
      instanceToken: repo.instanceToken,
      branchByWorktreePath,
    }
  }
  return index
}

export function repoIndexEqual(a: TerminalRepoIndex, b: TerminalRepoIndex): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const repoRoot of aKeys) {
    const current = a[repoRoot]
    const next = b[repoRoot]
    if (!current || !next) return false
    if (current.instanceToken !== next.instanceToken) return false
    if (!stringRecordEqual(current.branchByWorktreePath, next.branchByWorktreePath)) return false
    if (!stringRecordEqual(current.branchWorkspaceIdByWorktreePath, next.branchWorkspaceIdByWorktreePath)) return false
  }
  return true
}

export function repoIndexWithBranchWorkspaces(
  repoIndex: TerminalRepoIndex,
  branchWorkspaces: readonly BranchWorkspaceSnapshot[],
): TerminalRepoIndex {
  if (branchWorkspaces.length === 0) return repoIndex
  const next: TerminalRepoIndex = { ...repoIndex }
  const clonedRoots = new Set<string>()
  for (const workspace of branchWorkspaces) {
    if (!workspace.available) continue
    const root = next[workspace.rootId]
    if (!root) continue
    if (!clonedRoots.has(workspace.rootId)) {
      next[workspace.rootId] = {
        ...root,
        branchByWorktreePath: { ...root.branchByWorktreePath },
        branchWorkspaceIdByWorktreePath: { ...root.branchWorkspaceIdByWorktreePath },
      }
      clonedRoots.add(workspace.rootId)
    }
    next[workspace.rootId]!.branchByWorktreePath[workspace.path] = workspace.branch
    next[workspace.rootId]!.branchWorkspaceIdByWorktreePath![workspace.path] = workspace.id
  }
  return next
}

export function branchForTerminalWorktree(
  repoIndex: TerminalRepoIndex,
  repoRoot: string,
  worktreePath: string,
): string | null {
  return repoIndex[repoRoot]?.branchByWorktreePath[worktreePath] ?? null
}

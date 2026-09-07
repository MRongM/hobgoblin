import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { addResolvedRepo } from '#/web/stores/repos/lifecycle-write-paths.ts'
import type { ReposStore } from '#/web/stores/repos/types.ts'
import { normalizeRemoteTarget, parseRemoteRepoId } from '#/shared/remote-repo.ts'

export function projectDiscoveredBranchWorkspaceRepositories(
  state: Pick<ReposStore, 'repos' | 'order' | 'restorableRepoCache'>,
  rootId: string,
  items: readonly BranchWorkspaceSnapshot[],
): { repos: ReposStore['repos']; order: string[]; refreshIds: string[] } {
  let repos = state.repos
  let order = state.order
  const refreshIds: string[] = []
  const root = state.repos[rootId]
  if (!root) return { repos, order, refreshIds }
  for (const item of items) {
    if (item.rootId !== rootId) continue
    for (const member of item.repositories) {
      if (!member.repositoryId || !member.ready || member.progress === 'removed') continue
      const remote = parseRemoteRepoId(member.repositoryId)
      const target = remote && root.remote.target ? normalizeRemoteTarget({ ...root.remote.target, ...remote }) : null
      if (remote && !target) continue
      const existing = repos[member.repositoryId]
      const opened = addResolvedRepo(
        { repos, order, restorableRepoCache: state.restorableRepoCache },
        {
          id: member.repositoryId,
          name: member.repositoryName,
          isGitRepo: true,
          ...(!existing ? { workspaceRootId: rootId } : {}),
          ...(target ? { target } : {}),
        },
      )
      repos = opened.repos
      order = opened.order
      if (
        opened.changed ||
        !existing?.data.branches.some(
          (branch) => branch.name === member.targetBranch && branch.worktree?.path === member.worktreePath,
        )
      )
        refreshIds.push(member.repositoryId)
    }
  }
  return { repos, order, refreshIds: [...new Set(refreshIds)] }
}

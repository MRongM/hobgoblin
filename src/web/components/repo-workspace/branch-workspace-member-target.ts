import type { BranchWorkspaceRepositorySnapshot } from '#/shared/branch-workspaces.ts'
import type { WorkspaceRepositoryCandidate } from '#/shared/workspace.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

export interface BranchWorkspaceMemberTarget {
  repositoryId: string
  repositoryName: string
  targetBranch: string
  checkedOutBranch: string
  worktreePath: string
}

export type BranchWorkspaceMemberResolution =
  | { ok: true; target: BranchWorkspaceMemberTarget; warning?: string }
  | { ok: false; reason: string }

interface ResolveBranchWorkspaceMemberTargetInput {
  member: BranchWorkspaceRepositorySnapshot
  repositoryIds: readonly string[]
  candidates: readonly WorkspaceRepositoryCandidate[]
  repos: Readonly<Record<string, RepoState | undefined>>
}

export function resolveBranchWorkspaceMemberTarget({
  member,
  repositoryIds,
  candidates,
  repos,
}: ResolveBranchWorkspaceMemberTargetInput): BranchWorkspaceMemberResolution {
  const candidate = candidates.find((entry) => entry.name === member.repositoryName && repositoryIds.includes(entry.id))
  if (!candidate) {
    return { ok: false, reason: 'workspace.branch-workspace.member-unconfigured' }
  }

  const repository = repos[candidate.id]
  if (!repository || repository.availability.phase !== 'available') {
    return { ok: false, reason: 'workspace.branch-workspace.member-unavailable' }
  }
  const branchAtMemberPath = repository.data.branches.find(
    (entry) => entry.worktree?.path === member.worktreePath,
  )
  if (branchAtMemberPath) {
    const warning =
      branchAtMemberPath.name !== member.targetBranch
        ? 'workspace.branch-workspace.member-branch-drift'
        : !member.ready
          ? 'workspace.branch-workspace.member-not-ready'
          : null
    return {
      ok: true,
      target: {
        repositoryId: candidate.id,
        repositoryName: member.repositoryName,
        targetBranch: member.targetBranch,
        checkedOutBranch: branchAtMemberPath.name,
        worktreePath: member.worktreePath,
      },
      ...(warning ? { warning } : {}),
    }
  }
  if (!member.ready) return { ok: false, reason: 'workspace.branch-workspace.member-not-ready' }

  const branch = repository.data.branches.find((entry) => entry.name === member.targetBranch)
  if (!branch?.worktree?.path) {
    return { ok: false, reason: 'workspace.branch-workspace.member-branch-missing' }
  }
  if (branch.worktree.path !== member.worktreePath) {
    return { ok: false, reason: 'workspace.branch-workspace.member-worktree-mismatch' }
  }

  return {
    ok: true,
    target: {
      repositoryId: candidate.id,
      repositoryName: member.repositoryName,
      targetBranch: member.targetBranch,
      checkedOutBranch: member.targetBranch,
      worktreePath: member.worktreePath,
    },
  }
}

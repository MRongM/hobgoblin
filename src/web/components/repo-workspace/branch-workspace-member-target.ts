import type { BranchWorkspaceRepositorySnapshot } from '#/shared/branch-workspaces.ts'
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import type { WorkspaceRepositoryCandidate } from '#/shared/workspace.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'

export interface BranchWorkspaceMemberTarget {
  repositoryId: string
  repositoryName: string
  targetBranch: string
  checkedOutBranch: string | null
  head?: string
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

export function branchWorkspaceMemberRepositoryId(
  member: BranchWorkspaceRepositorySnapshot,
  repositoryIds: readonly string[],
  candidates: readonly WorkspaceRepositoryCandidate[],
): string | null {
  return (
    member.repositoryId ??
    candidates.find((entry) => entry.name === member.repositoryName && repositoryIds.includes(entry.id))?.id ??
    null
  )
}

export function resolveBranchWorkspaceMemberTarget({
  member,
  repositoryIds,
  candidates,
  repos,
}: ResolveBranchWorkspaceMemberTargetInput): BranchWorkspaceMemberResolution {
  const repositoryId = branchWorkspaceMemberRepositoryId(member, repositoryIds, candidates)
  if (!repositoryId) {
    return { ok: false, reason: 'workspace.branch-workspace.member-unconfigured' }
  }

  const repository = repos[repositoryId]
  if (!repository || repository.availability.phase !== 'available') {
    return { ok: false, reason: 'workspace.branch-workspace.member-unavailable' }
  }
  const branchAtMemberPath = repository.data.branches.find(
    (entry) => entry.worktree?.path && sameLocalFilePath(entry.worktree.path, member.worktreePath),
  )
  const worktree = Object.values(repository.data.worktreesByPath).find((entry) =>
    sameLocalFilePath(entry.path, member.worktreePath),
  )
  if (worktree?.isPrunable) return { ok: false, reason: 'workspace.branch-workspace.member-unavailable' }
  if (member.ready && (member.currentBranch === null || worktree?.isDetached)) {
    return {
      ok: true,
      target: {
        repositoryId,
        repositoryName: member.repositoryName,
        targetBranch: member.targetBranch,
        checkedOutBranch: null,
        worktreePath: member.worktreePath,
        ...((member.head ?? worktree?.head) ? { head: member.head ?? worktree?.head } : {}),
      },
    }
  }
  if (branchAtMemberPath) {
    return {
      ok: true,
      target: {
        repositoryId,
        repositoryName: member.repositoryName,
        targetBranch: member.targetBranch,
        checkedOutBranch: branchAtMemberPath.name,
        worktreePath: member.worktreePath,
      },
    }
  }
  if (!member.ready) return { ok: false, reason: 'workspace.branch-workspace.member-not-ready' }

  const branch = repository.data.branches.find((entry) => entry.name === member.targetBranch)
  if (!branch?.worktree?.path) {
    return { ok: false, reason: 'workspace.branch-workspace.member-branch-missing' }
  }
  if (!sameLocalFilePath(branch.worktree.path, member.worktreePath)) {
    return { ok: false, reason: 'workspace.branch-workspace.member-worktree-mismatch' }
  }

  return {
    ok: true,
    target: {
      repositoryId,
      repositoryName: member.repositoryName,
      targetBranch: member.targetBranch,
      checkedOutBranch: member.targetBranch,
      worktreePath: member.worktreePath,
    },
  }
}

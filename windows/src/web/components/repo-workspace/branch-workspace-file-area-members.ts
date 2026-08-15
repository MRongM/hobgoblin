import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import type { WorkspaceRepositoryCandidate } from '#/shared/workspace.ts'
import {
  resolveBranchWorkspaceMemberTarget,
  type BranchWorkspaceMemberTarget,
} from '#/web/components/repo-workspace/branch-workspace-member-target.ts'
import type { RepoState, WorkspaceProjectState } from '#/web/stores/repos/types.ts'

export type BranchWorkspaceFileAreaMember =
  | { ok: true; repositoryName: string; repo: RepoState; target: BranchWorkspaceMemberTarget; warning?: string }
  | { ok: false; repositoryName: string; reason: string }

export function resolveBranchWorkspaceFileAreaMembers({
  workspace,
  project,
  repos,
}: {
  workspace: BranchWorkspaceSnapshot
  project: Pick<WorkspaceProjectState, 'repositoryIds' | 'candidates'> | undefined
  repos: Readonly<Record<string, RepoState | undefined>>
}): BranchWorkspaceFileAreaMember[] {
  const repositoryIds = project?.repositoryIds ?? []
  const candidates: readonly WorkspaceRepositoryCandidate[] = project?.candidates ?? []

  return workspace.repositories.map((member) => {
    const resolution = resolveBranchWorkspaceMemberTarget({ member, repositoryIds, candidates, repos })
    if (!resolution.ok) return { ok: false, repositoryName: member.repositoryName, reason: resolution.reason }
    const repo = repos[resolution.target.repositoryId]
    if (!repo) {
      return {
        ok: false,
        repositoryName: member.repositoryName,
        reason: 'workspace.branch-workspace.member-unavailable',
      }
    }
    return {
      ok: true,
      repositoryName: member.repositoryName,
      repo,
      target: resolution.target,
      ...(resolution.warning ? { warning: resolution.warning } : {}),
    }
  })
}

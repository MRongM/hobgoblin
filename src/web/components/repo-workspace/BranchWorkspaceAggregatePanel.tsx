import { useMemo } from 'react'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { EmptyState, ScrollPane } from '#/web/components/Layout.tsx'
import { ProjectChangesPanel } from '#/web/components/repo-workspace/ProjectChangesPanel.tsx'
import { ProjectHistoryPanel } from '#/web/components/repo-workspace/ProjectHistoryPanel.tsx'
import { ProjectLocalPanel } from '#/web/components/repo-workspace/ProjectLocalPanel.tsx'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'
import { ProjectStatusPanel } from '#/web/components/repo-workspace/ProjectStatusPanel.tsx'
import { resolveBranchWorkspaceFileAreaMembers } from '#/web/components/repo-workspace/branch-workspace-file-area-members.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

export function BranchWorkspaceAggregatePanel({
  workspace,
  kind,
  onRevealPath,
}: {
  workspace: BranchWorkspaceSnapshot
  kind: 'status' | 'changes' | 'history' | 'local' | 'remoteBranches'
  onRevealPath?: (memberDirectoryName: string, relativePath: string) => void
}) {
  const t = useT()
  const project = useReposStore((state) => state.workspaceProjects[workspace.rootId])
  const repos = useReposStore((state) => state.repos)
  const members = useMemo(
    () => resolveBranchWorkspaceFileAreaMembers({ workspace, project, repos }),
    [project, repos, workspace],
  )
  const testId = `branch-workspace-${kind}-panel`

  return (
    <div data-testid={testId} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollPane>
        <div className="divide-y divide-separator">
          {members.map((member) => (
            <section
              key={member.ok ? `${member.repositoryName}:${member.target.worktreePath}` : member.repositoryName}
              data-branch-workspace-member={member.repositoryName}
            >
              <header className="sticky top-0 z-10 border-b border-separator bg-toolbar px-3 py-2 text-xs font-medium">
                {member.repositoryName}
              </header>
              {member.ok ? (
                <div className="flex min-h-64 flex-col">
                  {member.warning ? (
                    <div className="border-b border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning">
                      {t(member.warning)}
                    </div>
                  ) : null}
                  {kind === 'status' ? (
                    <ProjectStatusPanel
                      repoId={member.target.repositoryId}
                      target={{ branchName: member.target.checkedOutBranch, worktreePath: member.target.worktreePath }}
                    />
                  ) : kind === 'changes' ? (
                    <ProjectChangesPanel
                      repoId={member.target.repositoryId}
                      target={{ branchName: member.target.checkedOutBranch, worktreePath: member.target.worktreePath }}
                      onRevealPath={(relativePath) => onRevealPath?.(member.repositoryName, relativePath)}
                    />
                  ) : kind === 'history' ? (
                    <ProjectHistoryPanel
                      repoId={member.target.repositoryId}
                      target={{
                        branchName: member.target.checkedOutBranch,
                        worktreePath: member.target.worktreePath,
                      }}
                      onRevealPath={(relativePath) => onRevealPath?.(member.repositoryName, relativePath)}
                    />
                  ) : kind === 'local' ? (
                    <ProjectLocalPanel repoId={member.target.repositoryId} />
                  ) : (
                    <ProjectRemoteBranchesPanel repoId={member.target.repositoryId} />
                  )}
                </div>
              ) : (
                <EmptyState title={t(member.reason)} />
              )}
            </section>
          ))}
        </div>
      </ScrollPane>
    </div>
  )
}

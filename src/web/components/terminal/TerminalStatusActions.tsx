import { Globe } from 'lucide-react'
import { useMemo } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { openExternalUrl } from '#/web/app-shell-client.ts'
import { Tip } from '#/web/components/Tip.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalSnapshot } from '#/web/components/terminal/terminal-session-store.ts'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { useLanInfoQuery } from '#/web/settings-queries.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { repoPlainWorkspacePath } from '#/web/stores/repos/capabilities.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { useBranchWorkspaceMemberScope } from '#/web/components/repo-workspace/BranchWorkspaceMemberContext.tsx'

interface Props {
  repoId: string
}

interface TerminalStatusTarget {
  branch: string
  worktreePath: string
}

export function TerminalStatusActions({ repoId }: Props) {
  const t = useT()
  const branchWorkspaceMemberScope = useBranchWorkspaceMemberScope()
  const target = useStoreWithEqualityFn(
    useReposStore,
    (state): TerminalStatusTarget | null => {
      const repo = state.repos[repoId]
      const plainWorkspacePath = repoPlainWorkspacePath(repo)
      if (plainWorkspacePath) {
        return {
          branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
          worktreePath: plainWorkspacePath,
        }
      }
      const branchName = repo?.ui.selectedBranch ?? repo?.data.currentBranch
      const branch = branchName ? repo?.data.branches.find((candidate) => candidate.name === branchName) : null
      const worktreePath = branch?.worktree?.path
      return branch && worktreePath ? { branch: branch.name, worktreePath } : null
    },
    (left, right) =>
      left === right || (!!left && !!right && left.branch === right.branch && left.worktreePath === right.worktreePath),
  )
  const terminalKey = target ? worktreeTerminalKey(repoId, target.worktreePath) : null
  const sessions = useWorktreeTerminalSnapshot(terminalKey).sessions
  const selectedSession = sessions.find((session) => session.selected) ?? sessions[0] ?? null
  const { data: lanInfo } = useLanInfoQuery()
  const browserUrl = useMemo(() => {
    if (!target || !lanInfo) return null
    const accessHost = lanInfo.host === '0.0.0.0' ? '127.0.0.1' : lanInfo.host
    return buildTerminalDeepLinkUrl(`http://${accessHost}:${lanInfo.port}`, {
      repoId,
      worktreePath: target.worktreePath,
      branch: target.branch,
      terminalId: selectedSession?.terminalId,
      ...(branchWorkspaceMemberScope
        ? {
            branchWorkspaceScope: {
              workspaceRootId: branchWorkspaceMemberScope.workspaceRootId,
              branchWorkspaceId: branchWorkspaceMemberScope.branchWorkspaceId,
            },
          }
        : {}),
    })
  }, [branchWorkspaceMemberScope, lanInfo, repoId, selectedSession?.terminalId, target])

  if (!target) return null

  return (
    <Tip label={t('terminal.open-in-browser-title')}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          if (browserUrl) void openExternalUrl(browserUrl)
        }}
        disabled={!browserUrl}
        aria-label={t('terminal.open-in-browser')}
      >
        <Globe />
      </Button>
    </Tip>
  )
}

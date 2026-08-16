import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type { MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { runTerminalDeepLinkCommand } from '#/web/commands/workspace-commands.ts'
import { clearTerminalDeepLinkParams, parseTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import {
  useTerminalSessionContext,
  useTerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { useRepoTerminalSyncReady } from '#/web/components/terminal/terminal-session-store.ts'
import { branchWorkspaceQueryOptions } from '#/web/branch-workspace-queries.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'

interface TerminalDeepLinkConsumerProps {
  sessionReady: boolean
  navigation: MainWindowNavigationActions
}

export function TerminalDeepLinkConsumer({ sessionReady, navigation }: TerminalDeepLinkConsumerProps) {
  const t = useT()
  const consumedRef = useRef(false)
  const terminalCommands = useTerminalSessionContext()
  const terminalRead = useTerminalSessionReadContext()
  const target = useMemo(() => parseTerminalDeepLinkUrl(window.location.href), [])
  const terminalSyncReady = useRepoTerminalSyncReady(target?.repoId ?? null)

  useEffect(() => {
    if (!sessionReady || consumedRef.current || !target) return
    if (target.terminalId && !terminalSyncReady) return

    const targetToConsume = target
    consumedRef.current = true
    void consumeTerminalDeepLink()

    async function consumeTerminalDeepLink(): Promise<void> {
      const scope = targetToConsume.branchWorkspaceScope
      if (scope && useReposStore.getState().workspaceProjects[scope.workspaceRootId]) {
        await mainWindowQueryClient
          .ensureQueryData(branchWorkspaceQueryOptions(scope.workspaceRootId))
          .catch(() => undefined)
      }

      const handled = runTerminalDeepLinkCommand({
        target: targetToConsume,
        navigation,
        setDetailCollapsed: useReposStore.getState().setDetailCollapsed,
        terminalSessions: {
          worktreeSnapshot: terminalRead.worktreeSnapshot,
          selectTerminal: terminalCommands.selectTerminal,
        },
        onBranchWorkspaceScopeFallback: () => {
          toast.warning(t('workspace.branch-workspace.deep-link-fallback'))
        },
      })
      if (!handled) return

      const url = clearTerminalDeepLinkParams(window.location.href)
      const next = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState(null, '', next)
    }
  }, [
    navigation,
    sessionReady,
    target,
    terminalCommands.selectTerminal,
    terminalRead.worktreeSnapshot,
    terminalSyncReady,
    t,
  ])

  return null
}

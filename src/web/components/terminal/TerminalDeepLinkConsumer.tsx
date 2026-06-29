import { useEffect, useRef } from 'react'
import type { MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { runTerminalDeepLinkCommand } from '#/web/commands/workspace-commands.ts'
import { parseTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import {
  useTerminalSessionContext,
  useTerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'

interface TerminalDeepLinkConsumerProps {
  sessionReady: boolean
  navigation: MainWindowNavigationActions
}

export function TerminalDeepLinkConsumer({ sessionReady, navigation }: TerminalDeepLinkConsumerProps) {
  const consumedRef = useRef(false)
  const terminalCommands = useTerminalSessionContext()
  const terminalRead = useTerminalSessionReadContext()

  useEffect(() => {
    if (!sessionReady || consumedRef.current) return
    const target = parseTerminalDeepLinkUrl(window.location.href)
    if (!target) return

    consumedRef.current = true
    const handled = runTerminalDeepLinkCommand({
      target,
      navigation,
      setDetailCollapsed: useReposStore.getState().setDetailCollapsed,
      terminalSessions: {
        worktreeSnapshot: terminalRead.worktreeSnapshot,
        selectTerminal: terminalCommands.selectTerminal,
      },
    })
    if (handled) clearTerminalDeepLinkParams()
  }, [navigation, sessionReady, terminalCommands.selectTerminal, terminalRead.worktreeSnapshot])

  return null
}

function clearTerminalDeepLinkParams(): void {
  const url = new URL(window.location.href)
  for (const key of ['view', 'repo', 'worktree', 'branch', 'terminal']) {
    url.searchParams.delete(key)
  }
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(null, '', next)
}

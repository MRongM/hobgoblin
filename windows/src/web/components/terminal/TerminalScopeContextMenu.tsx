import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import {
  useTerminalSessionContext,
  useTerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { parseWorktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useTerminalAggregateCount } from '#/web/components/terminal/terminal-session-store.ts'
import { useT } from '#/web/stores/i18n.ts'

interface CloseTerminalScopeResult {
  count: number
  disabled: boolean
  label: string
  requestClose: () => void
  dialog: ReactNode
}

export function useCloseTerminalScope(worktreeTerminalKeys: readonly string[]): CloseTerminalScopeResult {
  const t = useT()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const count = useTerminalAggregateCount(worktreeTerminalKeys)
  const { worktreeSnapshot } = useTerminalSessionReadContext()
  const { closeTerminalAndDismissDetailIfLast } = useTerminalSessionContext()
  const disabled = count === 0

  function requestClose(): void {
    if (disabled) return
    setConfirmOpen(true)
  }

  function closeAllTerminals(): void {
    setConfirmOpen(false)
    for (const worktreeKey of worktreeTerminalKeys) {
      const scope = parseWorktreeTerminalKey(worktreeKey)
      if (!scope) continue
      const sessionKeys = worktreeSnapshot(worktreeKey).sessions.map((session) => session.key)
      for (const sessionKey of sessionKeys) {
        closeTerminalAndDismissDetailIfLast(sessionKey, scope)
      }
    }
  }

  return {
    count,
    disabled,
    label: t('terminal.close-all'),
    requestClose,
    dialog: (
      <ConfirmDialog
        open={confirmOpen}
        title={t('terminal.close-all-confirm-title')}
        message={t('terminal.close-all-confirm-body', { count })}
        confirmLabel={t('terminal.close-all-confirm-confirm')}
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={closeAllTerminals}
      />
    ),
  }
}

import type { TerminalDescriptor, TerminalSessionBase } from '#/web/components/terminal/types.ts'
import { terminalSessionKey, worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'

export function terminalDescriptor(base: TerminalSessionBase, terminalId: string, index: number): TerminalDescriptor {
  const terminalWorktreeKey = worktreeTerminalKey(base.repoRoot, base.worktreePath)
  return {
    ...base,
    worktreeTerminalKey: terminalWorktreeKey,
    terminalId,
    index,
    key: terminalSessionKey(base.repoRoot, base.worktreePath, terminalId),
  }
}

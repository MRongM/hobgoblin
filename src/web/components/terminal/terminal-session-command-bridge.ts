import type { WorktreeTerminalSnapshot, TerminalSessionBase } from '#/web/components/terminal/types.ts'
import type { TerminalLaunchMode, WindowsInternalTerminalShellOverride } from '#/shared/terminal.ts'

interface TerminalSessionCommandBridge {
  worktreeSnapshot: (worktreeTerminalKey: string) => WorktreeTerminalSnapshot
  createTerminal: (
    base: TerminalSessionBase,
    launchMode?: TerminalLaunchMode,
    windowsInternalTerminalShell?: WindowsInternalTerminalShellOverride,
  ) => Promise<string>
  selectTerminal: (worktreeTerminalKey: string, key: string) => void
  waitForInputReady: (key: string) => Promise<boolean>
  writeInput: (key: string, data: string) => void
}

let bridge: TerminalSessionCommandBridge | null = null

export function setTerminalSessionCommandBridge(next: TerminalSessionCommandBridge | null): () => void {
  bridge = next
  return () => {
    if (bridge === next) bridge = null
  }
}

export function readTerminalSessionCommandBridge(): TerminalSessionCommandBridge | null {
  return bridge
}

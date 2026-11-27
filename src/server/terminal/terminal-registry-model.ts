import type { TerminalAgentProvider, TerminalSessionPhase, TerminalWindowsPtyBackend } from '#/shared/terminal.ts'

export const TERMINAL_RECORD_PHASES = ['opening', 'restarting', 'open', 'error', 'closed', 'interrupted'] as const
export type TerminalRecordPhase = TerminalSessionPhase | 'interrupted'

export const TERMINAL_RECORD_REASONS = [
  'exited',
  'closed',
  'restarted',
  'launch_failed',
  'worker_lost',
  'server_stopped',
] as const
export type TerminalRecordReason = (typeof TERMINAL_RECORD_REASONS)[number]

export interface TerminalRegistryLocation {
  repoId: string
  worktreePath: string
}

export interface TerminalRecordBackend {
  transport: 'local' | 'ssh' | 'wsl'
  kind: 'pty' | 'tmux'
  windowsPty?: TerminalWindowsPtyBackend
}

export interface TerminalLifecycleEvent {
  id: string
  executionId: string
  workspaceId: string
  worktreeId: string
  cwd: string
  title?: string | null
  backend: TerminalRecordBackend
  agentProvider: TerminalAgentProvider | null
  detectedAgentProvider?: TerminalAgentProvider
  phase: TerminalRecordPhase
  reason: TerminalRecordReason | null
}

export interface TerminalRecordTitle {
  terminalId: string
  executionId: string
  title: string | null
}

export function detectTerminalAgent(processName: string, title: string | null): TerminalAgentProvider | undefined {
  const command = processName
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/\.exe$/i, '')
    .toLowerCase()
  if (command === 'codex' || command === 'claude') return command
  if (title === 'Codex' || title === 'Codex CLI') return 'codex'
  if (title === 'Claude Code') return 'claude'
}

export interface TerminalRecord extends TerminalLifecycleEvent {
  revision: number
  lastEventSeq: number
  createdAt: string
  updatedAt: string
  executionStartedAt: string
}

export interface TerminalRecordPageInput {
  limit: number
  cursor?: number
  workspaceId?: string
  state?: 'running' | 'exited'
}

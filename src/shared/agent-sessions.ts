export const AGENT_SESSIONS_PREFIX = '/api/agent-sessions'
export const MAX_AGENT_PROMPT_LENGTH = 64 * 1024

export type AgentProvider = 'codex' | 'claude'

export interface AgentProject {
  id: string
  name: string
  active: boolean
}

export interface AgentWorktree {
  id: string
  name: string
  branch: string | null
  primary: boolean
}

export interface AgentSubworkspace {
  id: string
  name: string
  root: AgentWorktree | null
  worktrees: AgentWorktree[]
}

export interface AgentTargetCatalog {
  worktrees: AgentWorktree[]
  subworkspaces: AgentSubworkspace[]
}

export interface AgentSessionSummary {
  id: string
  workspaceId: string
  worktreeId: string
  provider: AgentProvider
  status: 'closed' | 'working' | 'failed' | 'ready'
  revision?: number
  mode?: 'background' | 'terminal' | 'native'
  terminalLink?: {
    terminalId: string
    executionId: string
    source: 'explicit' | 'detected' | 'manual'
  } | null
  terminalActive: boolean
  structuredWritable?: boolean
  nativeCodex?: boolean
  terminalWritable?: boolean
  createdAt: string
  updatedAt: string
  latestTurn: {
    requestId: string
    prompt: string
    state: 'working' | 'completed' | 'failed' | 'cancelled'
    error: string | null
  } | null
}

export interface AgentSessionDetail extends AgentSessionSummary {
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
}

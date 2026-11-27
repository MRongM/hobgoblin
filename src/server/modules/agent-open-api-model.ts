import * as v from 'valibot'
import { CONVERSATION_PROVIDERS } from '#/server/modules/conversation-open-api-model.ts'
import type { AgentProviderResult } from '#/server/modules/agent-open-api-provider.ts'
import { MAX_AGENT_PROMPT_LENGTH } from '#/shared/agent-sessions.ts'

const IdSchema = v.pipe(v.string(), v.uuid())
const turnInput = {
  requestId: IdSchema,
  prompt: v.pipe(
    v.string(),
    v.maxLength(MAX_AGENT_PROMPT_LENGTH),
    v.check((value) => Boolean(value.trim())),
  ),
}
export const AgentTurnInputSchema = v.strictObject({
  ...turnInput,
  expectedRevision: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(1))),
})
export const CreateAgentSessionSchema = v.strictObject({
  mode: v.literal('background'),
  provider: v.picklist(CONVERSATION_PROVIDERS),
  worktreeId: v.optional(v.pipe(v.string(), v.regex(/^[a-f0-9]{24}$/))),
  ...turnInput,
})

const terminalCreateFields = {
  worktreeId: v.optional(v.pipe(v.string(), v.regex(/^[a-f0-9]{24}$/))),
  launchMode: v.optional(v.picklist(['native', 'tmux-if-available'] as const)),
  windowsInternalTerminalShell: v.optional(v.picklist(['wsl', 'powershell'] as const)),
}
export const CreateTerminalSchema = v.strictObject(terminalCreateFields)
export const StartTerminalAgentSchema = v.strictObject({
  ...terminalCreateFields,
  provider: v.picklist(CONVERSATION_PROVIDERS),
})

export type CreateAgentSession = v.InferOutput<typeof CreateAgentSessionSchema>
export type AgentTurnInput = v.InferOutput<typeof AgentTurnInputSchema>
export type AgentError = Extract<AgentProviderResult, { ok: false }>['error'] | 'interrupted'
export type TerminalAgentLinkSource = 'explicit' | 'detected' | 'manual'

export interface TerminalAgentLink {
  terminalId: string
  executionId: string
  source: TerminalAgentLinkSource
}

export interface AgentWorkspaceTarget {
  workspaceId: string
  worktreeId: string
  repoId: string
  cwd: string
}

export interface AgentSessionRecord extends AgentWorkspaceTarget {
  id: string
  provider: CreateAgentSession['provider']
  providerSessionId: string | null
  revision: number
  terminalId: string | null
  terminalExecutionId: string | null
  terminalLinkSource: TerminalAgentLinkSource | null
  nativeCodex: 0 | 1
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export type AgentSessionCursor = Pick<AgentSessionRecord, 'id' | 'updatedAt'>

export interface AgentTurnRecord extends AgentTurnInput {
  sessionId: string
  state: 'working' | 'completed' | 'failed' | 'cancelled'
  error: AgentError | null
  createdAt: string
  finishedAt: string | null
}

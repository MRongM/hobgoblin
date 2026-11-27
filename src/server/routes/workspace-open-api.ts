import { Hono, type Context } from 'hono'
import * as v from 'valibot'
import { CreateTerminalSchema, StartTerminalAgentSchema } from '#/server/modules/agent-open-api-model.ts'
import type { AgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { detectTerminalAgent } from '#/server/terminal/terminal-registry-model.ts'
import { WorkspaceTerminalInputSchema, TerminalControlIdSchema } from '#/server/modules/conversation-open-api-model.ts'
import type { ConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import type { OpenApiKeyStore } from '#/server/modules/open-api-key-source.ts'
import { createBackgroundAgentRoutes } from '#/server/routes/background-agent-sessions.ts'
import { createNativeSessionTerminalRoutes } from '#/server/routes/native-session-terminal.ts'
import {
  errorResponse,
  limitBody,
  readBody,
  requireBearer,
  terminalControlMessages,
} from '#/server/routes/open-api-http.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import type {
  CallTerminalControl,
  WorkspaceTerminalControlAction,
  TerminalOpenApiControlResult,
} from '#/server/terminal/terminal-open-api-control.ts'
import {
  TERMINAL_OUTPUT_EXCERPT_MAX_CHARACTERS,
  TerminalSessionIdSchema,
  type TerminalCreateInput,
  type TerminalSessionSummary,
} from '#/shared/terminal.ts'

const TERMINALS = '/workspaces/:workspaceId/terminals'
const TERMINAL_PATH = `${TERMINALS}/:terminalId`
const TERMINAL_AGENTS = '/workspaces/:workspaceId/terminal-sessions'
const TERMINAL_AGENT_PATH = `${TERMINAL_AGENTS}/:terminalId`

export interface WorkspaceTerminalInventory {
  list: (repoId: string) => ReturnType<ServerTerminalHost['listSessions']>
  excerpt: ServerTerminalHost['getOutputExcerpt']
  create?: (input: TerminalCreateInput) => Promise<TerminalSessionSummary | null>
  close?: (input: Parameters<ServerTerminalHost['close']>[1]) => ReturnType<ServerTerminalHost['close']>
}

function terminalSummary(terminal: TerminalSessionSummary, conversationId: string | null) {
  return {
    id: terminal.sessionId,
    phase: terminal.phase,
    processName: terminal.processName,
    title: terminal.canonicalTitle,
    provider: terminal.agentProvider ?? detectTerminalAgent(terminal.processName, terminal.canonicalTitle) ?? null,
    conversationId,
  }
}

function notFound(c: Context, target: 'workspace' | 'session' | 'turn' | 'terminal') {
  return errorResponse(c, 404, `${target}_not_found`, `Hobgoblin ${target} not found`)
}

export function createWorkspaceOpenApiRoutes(options: {
  keys: OpenApiKeyStore
  agents: AgentOpenApiRuntime
  store: ConversationOpenApiStore
  prefix: string
  terminals?: WorkspaceTerminalInventory
  callControl?: CallTerminalControl
}) {
  const { keys, agents, store, prefix, terminals, callControl } = options
  const routes = new Hono()
  const authorize = requireBearer(keys, true)

  async function listOpenTerminals(repoId: string) {
    return ((await terminals?.list(repoId)) ?? []).filter((entry) => entry.phase === 'open')
  }

  async function terminalControl(c: Context, action: WorkspaceTerminalControlAction, agentOnly = false) {
    if (!callControl) return errorResponse(c, 503, 'terminal_control_disabled', 'OpenAPI terminal control is disabled')
    const { workspaceId, terminalId, controlId } = c.req.param()
    if (!v.is(TerminalSessionIdSchema, terminalId)) return notFound(c, 'terminal')
    if (controlId !== undefined && !v.is(TerminalControlIdSchema, controlId)) {
      return errorResponse(c, 400, 'invalid_control_id', 'Invalid control ID')
    }
    const workspace = await agents.workspace(workspaceId)
    if (!workspace) return notFound(c, 'workspace')
    if (agentOnly || action.action === 'close') {
      const terminal = (await listOpenTerminals(workspace.repoId)).find((entry) => entry.sessionId === terminalId)
      if (!terminal || (agentOnly && !terminal.agentProvider)) return notFound(c, agentOnly ? 'session' : 'terminal')
      if (action.action === 'close' && terminal.agentProvider) {
        if (!terminals?.close)
          return errorResponse(c, 503, 'terminal_control_disabled', 'Terminal control is unavailable')
        try {
          const closed = await terminals.close({
            sessionId: terminalId,
            expectedRepoId: workspace.repoId,
            closeTmuxSession: terminal.tmuxBacked === true,
          })
          return closed.ok
            ? c.body(null, 204)
            : errorResponse(c, 409, 'terminal_close_failed', 'Unable to close the AI terminal')
        } catch {
          return errorResponse(c, 503, 'session_unavailable', terminalControlMessages.session_unavailable)
        }
      }
    }
    let result: TerminalOpenApiControlResult
    try {
      result = await callControl({ ...action, repoId: workspace.repoId, sessionId: terminalId })
    } catch {
      const reason = action.action === 'write' ? 'input_delivery_unknown' : 'session_unavailable'
      return errorResponse(c, 503, reason, terminalControlMessages[reason])
    }
    if (!result.ok) {
      if (
        result.reason === 'session_unavailable' &&
        (action.action === 'close' || (action.action === 'write' && !('controlId' in action)))
      ) {
        return notFound(c, agentOnly ? 'session' : 'terminal')
      }
      const status = result.reason === 'input_delivery_unknown' ? 503 : 409
      return errorResponse(c, status, result.reason, terminalControlMessages[result.reason])
    }
    if (result.action !== action.action) throw new Error('Unexpected terminal control response')
    if (result.action === 'write') return c.json({ accepted: true, delivery: 'unconfirmed' }, 202)
    if (result.action !== 'acquire') return c.body(null, 204)
    const location = `${prefix}/workspaces/${workspaceId}/terminals/${terminalId}/control/${result.controlId}`
    c.header('Location', location)
    return c.json(
      { controlId: result.controlId, terminalSessionId: result.terminalSessionId, expiresAt: result.expiresAt },
      201,
    )
  }

  async function writeTerminal(c: Context, agentOnly = false) {
    const input = await readBody(c, WorkspaceTerminalInputSchema)
    if (input instanceof Response) return input
    const controlId = c.req.param('controlId')
    return terminalControl(
      c,
      { action: 'write', ...input, ...(controlId === undefined ? {} : { controlId }) },
      agentOnly,
    )
  }

  async function readTerminal(c: Context, agentOnly = false) {
    const workspace = await agents.workspace(c.req.param('workspaceId') ?? '')
    if (!workspace) return notFound(c, 'workspace')
    const id = c.req.param('terminalId')
    const terminal = (await listOpenTerminals(workspace.repoId)).find((entry) => entry.sessionId === id)
    if (!terminal || (agentOnly && !terminal.agentProvider)) return notFound(c, agentOnly ? 'session' : 'terminal')
    const link = store.listConversations({ terminalSessionId: terminal.sessionId })[0]?.id ?? null
    const excerpt = await terminals?.excerpt({
      sessionId: terminal.sessionId,
      maxCharacters: TERMINAL_OUTPUT_EXCERPT_MAX_CHARACTERS,
    })
    return c.json({ ...terminalSummary(terminal, link), excerpt: excerpt?.output || null })
  }

  async function listTerminals(c: Context, agentOnly = false) {
    const workspace = await agents.workspace(c.req.param('workspaceId') ?? '')
    if (!workspace) return notFound(c, 'workspace')
    const open = await listOpenTerminals(workspace.repoId)
    const items = agentOnly ? open.filter((terminal) => terminal.agentProvider) : open
    const linked = store.conversationIdsByTerminal(items.map((terminal) => terminal.sessionId))
    const list = items.map((terminal) => terminalSummary(terminal, linked.get(terminal.sessionId) ?? null))
    return agentOnly ? c.json({ sessions: list }) : c.json({ terminals: list })
  }

  async function createTerminal(c: Context, agent: boolean) {
    if (!terminals?.create)
      return errorResponse(c, 503, 'terminal_control_disabled', 'Terminal creation is unavailable')
    const input = await readBody(c, agent ? StartTerminalAgentSchema : CreateTerminalSchema)
    if (input instanceof Response) return input
    const workspace = await agents.workspace(c.req.param('workspaceId') ?? '')
    if (!workspace) return notFound(c, 'workspace')
    const target = await agents.terminalWorktree(workspace, input.worktreeId, c.req.raw.signal)
    if (!target) return errorResponse(c, 404, 'worktree_not_found', 'Hobgoblin worktree not found')
    if (c.req.raw.signal.aborted) return errorResponse(c, 503, 'request_cancelled', 'Terminal creation was cancelled')
    let terminal: TerminalSessionSummary | null
    try {
      terminal = await terminals.create({
        ...target,
        repoRoot: workspace.repoId,
        kind: 'additional',
        launchMode: input.launchMode ?? 'native',
        windowsInternalTerminalShell: input.windowsInternalTerminalShell,
        agentProvider: 'provider' in input ? input.provider : undefined,
      })
    } catch {
      return errorResponse(
        c,
        503,
        'terminal_create_unknown',
        'Terminal creation could not be confirmed. List open terminals before retrying.',
      )
    }
    if (!terminal)
      return errorResponse(c, 409, 'terminal_create_failed', 'Unable to open a terminal on the selected worktree')
    const collection = agent ? 'terminal-sessions' : 'terminals'
    c.header('Location', `${prefix}/workspaces/${workspace.id}/${collection}/${terminal.sessionId}`)
    const link = agent ? store.conversationIdsByTerminal([terminal.sessionId]).get(terminal.sessionId) : undefined
    return c.json(terminalSummary(terminal, link ?? null), 201)
  }

  routes.get(TERMINALS, authorize, (c) => listTerminals(c))
  routes.post(TERMINALS, authorize, limitBody, (c) => createTerminal(c, false))
  routes.get(TERMINAL_PATH, authorize, (c) => readTerminal(c))
  routes.get(TERMINAL_AGENTS, authorize, (c) => listTerminals(c, true))
  routes.post(TERMINAL_AGENTS, authorize, limitBody, (c) => createTerminal(c, true))
  routes.get(TERMINAL_AGENT_PATH, authorize, (c) => readTerminal(c, true))
  routes.delete(TERMINAL_AGENT_PATH, authorize, (c) => terminalControl(c, { action: 'close' }, true))
  routes.post(`${TERMINAL_AGENT_PATH}/input`, authorize, limitBody, (c) => writeTerminal(c, true))
  routes.post(`${TERMINAL_AGENT_PATH}/control`, authorize, (c) => terminalControl(c, { action: 'acquire' }, true))
  routes.post(`${TERMINAL_AGENT_PATH}/control/:controlId/input`, authorize, limitBody, (c) => writeTerminal(c, true))
  routes.delete(TERMINAL_PATH, authorize, (c) => terminalControl(c, { action: 'close' }))
  routes.post(`${TERMINAL_PATH}/input`, authorize, limitBody, (c) => writeTerminal(c))
  routes.post(`${TERMINAL_PATH}/control`, authorize, (c) => terminalControl(c, { action: 'acquire' }))
  routes.post(`${TERMINAL_PATH}/control/:controlId/input`, authorize, limitBody, (c) => writeTerminal(c))
  routes.delete(`${TERMINAL_PATH}/control/:controlId`, authorize, (c) =>
    terminalControl(c, { action: 'release', controlId: c.req.param('controlId') }),
  )
  routes.route(
    '/',
    createBackgroundAgentRoutes({
      agents,
      authorize,
      prefix,
      callControl,
      async readTerminals(repoId) {
        const open = await listOpenTerminals(repoId)
        const linked = store.conversationIdsByTerminal(open.map((entry) => entry.sessionId))
        return open.map((entry) => terminalSummary(entry, linked.get(entry.sessionId) ?? null))
      },
    }),
  )
  routes.route('/', createNativeSessionTerminalRoutes({ agents, authorize, prefix, callControl }))
  return routes
}

import { Hono, type Context, type MiddlewareHandler } from 'hono'
import * as v from 'valibot'
import { AgentTurnInputSchema, CreateAgentSessionSchema } from '#/server/modules/agent-open-api-model.ts'
import type { AgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { errorResponse, limitBody, readBody, terminalControlMessages } from '#/server/routes/open-api-http.ts'
import type { CallTerminalControl } from '#/server/terminal/terminal-open-api-control.ts'

const sessionCursorSchema = v.tuple([v.pipe(v.string(), v.isoTimestamp()), v.pipe(v.string(), v.uuid())])

function readSessionCursor(raw: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(raw)) return null
  try {
    const cursor = v.safeParse(sessionCursorSchema, JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return cursor.success ? { updatedAt: cursor.output[0], id: cursor.output[1] } : null
  } catch {
    return null
  }
}

function notFound(c: Context, target: 'workspace' | 'session' | 'turn') {
  return errorResponse(c, 404, target + '_not_found', 'Hobgoblin ' + target + ' not found')
}

function accepted(
  c: Context,
  result: Awaited<ReturnType<AgentOpenApiRuntime['create']>>,
  prefix: string,
  agents: AgentOpenApiRuntime,
) {
  if (!result.ok) {
    const code = result.error
    const status =
      code === 'unavailable' || code === 'native_delivery_unknown' ? 503 : code.endsWith('_not_found') ? 404 : 409
    const messages = {
      session_working: 'The session is working. Read its status before sending a new prompt.',
      desktop_terminal_active: 'The desktop terminal owns this session until it exits and syncs its history.',
      native_terminal_unavailable: 'Open this Codex session in the shared desktop App Server to send a message.',
      native_delivery_unknown: 'Codex did not confirm this submission. Check the session before sending again.',
      native_turn_rejected: 'The native Codex session rejected this submission.',
      terminal_input_required: 'Send input through the linked terminal.',
      revision_conflict: 'The session has changed. Read its current revision before sending a new turn.',
      control_in_use: terminalControlMessages.control_in_use,
      interactive_input_active: terminalControlMessages.interactive_input_active,
      session_closed: 'The agent session is closed.',
      request_conflict: 'This request ID has already been used for a different turn.',
      unavailable: 'The agent runtime is unavailable.',
    }
    const message =
      code in messages
        ? messages[code as keyof typeof messages]
        : 'The requested workspace, worktree or session is unavailable.'
    const sessionId = c.req.param('sessionId')
    const current = status === 409 && sessionId ? agents.getSessionStatus(sessionId) : null
    return current
      ? c.json(
          { error: { code, message }, current, ...(result.controller ? { controller: result.controller } : {}) },
          409,
        )
      : errorResponse(c, status, code, message)
  }
  const { sessionId, requestId } = result
  const query = prefix === '/api/open/v1' && c.req.query('native') === '1' ? '?native=1' : ''
  c.header('Location', prefix + '/sessions/' + sessionId + '/turns/' + requestId + query)
  return c.json({ sessionId, requestId }, 202)
}

export function createBackgroundAgentRoutes({
  agents,
  authorize,
  prefix,
  readTerminals,
  callControl,
}: {
  agents: AgentOpenApiRuntime
  authorize: MiddlewareHandler
  prefix: string
  readTerminals?: (repoId: string) => Promise<unknown[]>
  callControl?: CallTerminalControl
}) {
  const routes = new Hono()
  const nativeClient = (c: Context) => prefix === '/api/open/v1' && c.req.query('native') === '1'

  routes.get('/sessions', authorize, async (c) => {
    const limit = Number(c.req.query('limit') ?? 30)
    const encodedCursor = c.req.query('cursor')
    const cursor = encodedCursor === undefined ? undefined : readSessionCursor(encodedCursor)
    const search = c.req.query('q')?.trim() ?? ''
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || cursor === null || search.length > 256) {
      return errorResponse(c, 400, 'invalid_request', 'Invalid session page parameters')
    }
    const { sessions, workspaces, next } = await agents.listSessionPage({
      limit,
      cursor,
      search,
      discoverNative: nativeClient(c),
      refresh: c.req.query('refresh') === '1',
    })
    const nextCursor = next ? Buffer.from(JSON.stringify([next.updatedAt, next.id])).toString('base64url') : null
    return c.json({ sessions, workspaces, nextCursor })
  })
  routes.get('/workspaces', authorize, async (c) => c.json({ workspaces: await agents.listWorkspaces() }))
  routes.get('/workspaces/:workspaceId/worktrees', authorize, async (c) => {
    const worktrees = await agents.listWorktrees(c.req.param('workspaceId'), c.req.raw.signal)
    return worktrees ? c.json({ worktrees }) : notFound(c, 'workspace')
  })
  routes.get('/workspaces/:workspaceId/targets', authorize, async (c) => {
    const targets = await agents.listTargets(c.req.param('workspaceId'), c.req.raw.signal)
    return targets ? c.json(targets) : notFound(c, 'workspace')
  })
  routes.get('/workspaces/:workspaceId/sessions', authorize, async (c) => {
    const workspace = await agents.workspace(c.req.param('workspaceId'))
    if (!workspace) return notFound(c, 'workspace')
    if (nativeClient(c)) await agents.synchronizeNativeWorkspace(workspace, c.req.query('refresh') === '1')
    const sessions = agents.listSessions(workspace.id)
    return c.json(readTerminals ? { sessions, terminals: await readTerminals(workspace.repoId) } : { sessions })
  })
  routes.post('/workspaces/:workspaceId/sessions', authorize, limitBody, async (c) => {
    const input = await readBody(c, CreateAgentSessionSchema)
    if (input instanceof Response) return input
    return accepted(c, await agents.create(c.req.param('workspaceId'), input), prefix, agents)
  })
  routes.get('/sessions/:sessionId', authorize, async (c) => {
    const id = c.req.param('sessionId')
    if (nativeClient(c) || prefix.endsWith('/muse')) await agents.refreshNativeSessionHistory(id)
    const session = agents.getSession(id)
    return session ? c.json(session) : notFound(c, 'session')
  })
  routes.get('/sessions/:sessionId/status', authorize, async (c) => {
    const id = c.req.param('sessionId')
    await agents.synchronizeNativeSession(id)
    const session = agents.getSessionStatus(id)
    return session ? c.json(session) : notFound(c, 'session')
  })
  function readHistory(kind: 'turns' | 'messages') {
    return async (c: Context) => {
      const id = c.req.param('sessionId') ?? ''
      const limit = Number(c.req.query('limit') ?? 50)
      const cursor = c.req.query('beforeSeq')
      const before = cursor === undefined ? undefined : Number(cursor)
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
      )
        return errorResponse(c, 400, 'invalid_request', 'Invalid session history page parameters')
      if (before === undefined) await agents.refreshNativeSessionHistory(id)
      const result = agents.getSessionHistory(id, limit, before, kind)
      if (!result) return notFound(c, 'session')
      return c.json({ [kind]: result.items, revision: result.revision, nextCursor: result.nextCursor })
    }
  }
  routes.get('/sessions/:sessionId/messages', authorize, readHistory('messages'))
  routes.get('/sessions/:sessionId/turns', authorize, readHistory('turns'))
  routes.delete('/sessions/:sessionId', authorize, (c) => {
    const id = c.req.param('sessionId')
    if (agents.isTerminalActive(id)) {
      return errorResponse(c, 409, 'desktop_terminal_active', 'The session is open in a desktop terminal')
    }
    return agents.closeSession(id) ? c.body(null, 204) : notFound(c, 'session')
  })
  routes.post('/sessions/:sessionId/turns', authorize, limitBody, async (c) => {
    const input = await readBody(c, AgentTurnInputSchema)
    if (input instanceof Response) return input
    const id = c.req.param('sessionId')
    const result = await agents.sendTurn(id, input, callControl)
    return accepted(c, result, prefix, agents)
  })
  routes.get('/sessions/:sessionId/turns/:requestId', authorize, async (c) => {
    const { sessionId, requestId } = c.req.param()
    await agents.synchronizeNativeSession(sessionId)
    const turn = agents.getTurn(sessionId, requestId)
    return turn ? c.json(turn) : notFound(c, 'turn')
  })
  routes.delete('/sessions/:sessionId/turns/:requestId', authorize, (c) => {
    const { sessionId, requestId } = c.req.param()
    const result = agents.cancelTurn(sessionId, requestId)
    if (result.ok) return c.json(result.turn)
    if (result.error === 'turn_not_found') return notFound(c, 'turn')
    return errorResponse(c, 409, result.error, 'The agent turn is no longer running')
  })
  return routes
}

import { Hono, type Context, type MiddlewareHandler } from 'hono'
import * as v from 'valibot'
import type { AgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import {
  CONVERSATION_PROVIDERS,
  WorkspaceTerminalInputSchema,
  TerminalControlIdSchema,
} from '#/server/modules/conversation-open-api-model.ts'
import { errorResponse, limitBody, readBody, terminalControlMessages } from '#/server/routes/open-api-http.ts'
import type {
  CallTerminalControl,
  WorkspaceTerminalControlAction,
} from '#/server/terminal/terminal-open-api-control.ts'
import { TerminalSessionIdSchema } from '#/shared/terminal.ts'

const LinkSchema = v.strictObject({
  provider: v.picklist(CONVERSATION_PROVIDERS),
  providerSessionId: v.optional(v.pipe(v.string(), v.uuid())),
})
const InputSchema = v.strictObject({
  ...WorkspaceTerminalInputSchema.entries,
  controlId: v.optional(TerminalControlIdSchema),
})

export function createNativeSessionTerminalRoutes(options: {
  agents: AgentOpenApiRuntime
  authorize: MiddlewareHandler
  prefix: string
  callControl?: CallTerminalControl
}) {
  const { agents, authorize, prefix, callControl } = options
  const routes = new Hono()
  routes.get('/terminal-records/:terminalId/session', authorize, (c) => {
    const session = agents.getTerminalSession(c.req.param('terminalId'))
    return session ? c.json(session) : errorResponse(c, 404, 'session_not_found', 'Hob terminal session not found')
  })
  routes.post('/terminal-records/:terminalId/session', authorize, limitBody, async (c) => {
    const id = c.req.param('terminalId')
    if (!v.is(TerminalSessionIdSchema, id))
      return errorResponse(c, 400, 'invalid_request', 'Invalid terminal identifier')
    const input = await readBody(c, LinkSchema)
    if (input instanceof Response) return input
    const result = await agents.attachTerminal(id, input.provider, input.providerSessionId, c.req.raw.signal)
    if ('session' in result) return c.json(result.session)
    if (result.error === 'terminal_not_found') return errorResponse(c, 404, result.error, 'Open Hob terminal not found')
    if (result.error === 'history_unavailable')
      return errorResponse(c, 503, result.error, 'Unable to verify the provider history for this terminal')
    return errorResponse(c, 409, result.error, 'The terminal or provider thread already has a conflicting session link')
  })

  async function control(c: Context, action: WorkspaceTerminalControlAction | { action: 'status' }) {
    if (!callControl) return errorResponse(c, 503, 'terminal_control_disabled', 'Terminal control is unavailable')
    const id = c.req.param('sessionId') ?? ''
    const current = agents.getSessionStatus(id)
    if (!current) return errorResponse(c, 404, 'session_not_found', 'Hob session not found')
    const terminal = agents.terminalControlTarget(id)
    if (!terminal) {
      return c.json(
        {
          error: { code: 'session_unavailable', message: terminalControlMessages.session_unavailable },
          current,
          control: null,
        },
        409,
      )
    }
    const target = { repoId: terminal.repoId, sessionId: terminal.id, expectedExecutionId: terminal.executionId }
    const call = (operation: WorkspaceTerminalControlAction | { action: 'status' }) =>
      callControl({ ...target, ...operation })
    try {
      const result = await call(action)
      if (!result.ok) {
        const status = result.reason === 'input_delivery_unknown' ? 503 : 409
        const presence =
          status === 409
            ? await Promise.resolve()
                .then(() => call({ action: 'status' }))
                .catch(() => null)
            : null
        const control = presence?.ok && presence.action === 'status' ? presence : null
        return c.json(
          {
            error: { code: result.reason, message: terminalControlMessages[result.reason] },
            current: agents.getSessionStatus(id),
            control,
          },
          status,
        )
      }
      if (result.action === 'status') {
        const { executionId, controller, connected, expiresAt } = result
        return c.json({
          revision: current.revision,
          terminalId: terminal.id,
          executionId,
          controller,
          connected,
          expiresAt,
        })
      }
      if (result.action === 'acquire') {
        c.header('Location', `${prefix}/sessions/${id}/control/${result.controlId}`)
        return c.json(
          {
            controlId: result.controlId,
            terminalSessionId: terminal.id,
            executionId: terminal.executionId,
            expiresAt: result.expiresAt,
          },
          201,
        )
      }
      if (result.action === 'write') return c.json({ accepted: true, delivery: 'unconfirmed' }, 202)
      return c.body(null, 204)
    } catch {
      const code = action.action === 'write' ? 'input_delivery_unknown' : 'session_unavailable'
      return errorResponse(c, 503, code, terminalControlMessages[code])
    }
  }

  routes.get('/sessions/:sessionId/control', authorize, (c) => control(c, { action: 'status' }))
  routes.post('/sessions/:sessionId/control', authorize, (c) => control(c, { action: 'acquire' }))
  routes.post('/sessions/:sessionId/input', authorize, limitBody, async (c) => {
    const input = await readBody(c, InputSchema)
    if (input instanceof Response) return input
    const { controlId, ...write } = input
    return control(c, { action: 'write', ...write, ...(controlId ? { controlId } : {}) })
  })
  routes.delete('/sessions/:sessionId/control/:controlId', authorize, (c) => {
    const id = c.req.param('controlId')
    if (!v.is(TerminalControlIdSchema, id)) return errorResponse(c, 400, 'invalid_control_id', 'Invalid control ID')
    return control(c, { action: 'release', controlId: id })
  })
  return routes
}

import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Hono } from 'hono'
import * as v from 'valibot'
import type { AgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { CONVERSATION_PROVIDERS } from '#/server/modules/conversation-open-api-model.ts'
import type { ConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import type { OpenApiKeyStore } from '#/server/modules/open-api-key-source.ts'
import { limitBody, readBody, requireBearer } from '#/server/routes/open-api-http.ts'
import { MAX_AGENT_PROMPT_LENGTH } from '#/shared/agent-sessions.ts'

const id = v.pipe(v.string(), v.uuid())
const workspaceId = v.pipe(v.string(), v.regex(/^[a-f0-9]{24}$/))
const schema = v.strictObject({
  model: v.picklist(CONVERSATION_PROVIDERS),
  messages: v.pipe(
    v.array(
      v.strictObject({
        role: v.picklist(['system', 'developer', 'user', 'assistant']),
        content: v.pipe(v.string(), v.maxLength(MAX_AGENT_PROMPT_LENGTH)),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
  stream: v.optional(v.literal(false)),
  n: v.optional(v.literal(1)),
  metadata: v.optional(
    v.strictObject({
      hob_workspace_id: v.optional(workspaceId),
      hob_worktree_id: v.optional(workspaceId),
      hob_session_id: v.optional(id),
      hob_request_id: v.optional(id),
    }),
  ),
})

export function createOpenAiChatCompatibilityRoutes({
  agents,
  store,
  keys,
}: {
  agents: AgentOpenApiRuntime
  store: Pick<ConversationOpenApiStore, 'readTurnReply'>
  keys: OpenApiKeyStore
}) {
  const routes = new Hono()
  routes.post('/chat/completions', requireBearer(keys, true), limitBody, async (c) => {
    const payload = await readBody(c, schema)
    if (payload instanceof Response) return payload
    const {
      hob_workspace_id: workspace,
      hob_worktree_id: worktree,
      hob_session_id: sessionId,
      hob_request_id: requestId = randomUUID(),
    } = payload.metadata ?? {}
    const latest = payload.messages.at(-1)
    const prompt =
      sessionId || payload.messages.length === 1
        ? (latest?.content ?? '')
        : payload.messages.map(({ role, content }) => `${role}:\n${content}`).join('\n\n')
    const fail = (status: 400 | 404 | 409 | 502 | 503 | 504, code: string, message: string) =>
      c.json({ error: { code, message, type: status < 500 ? 'invalid_request_error' : 'server_error' } }, status)
    if (latest?.role !== 'user' || !latest.content.trim() || prompt.length > MAX_AGENT_PROMPT_LENGTH)
      return fail(400, 'invalid_messages', 'Supply a final user message within the Hob prompt limit')
    if (Boolean(sessionId) === Boolean(workspace) || (sessionId && worktree))
      return fail(400, 'invalid_metadata', 'Supply either hob_workspace_id or hob_session_id')
    if (sessionId) {
      const session = agents.getSessionStatus(sessionId)
      if (!session) return fail(404, 'session_not_found', 'Hob session not found')
      if (session.mode !== 'background' || session.provider !== payload.model)
        return fail(409, 'incompatible_session', 'Select a background session with the requested provider')
    }
    const submitted = sessionId
      ? await agents.continue(sessionId, { requestId, prompt })
      : await agents.create(workspace!, {
          requestId,
          prompt,
          provider: payload.model,
          mode: 'background',
          worktreeId: worktree,
        })
    if (!submitted.ok) {
      const status = submitted.error.endsWith('_not_found') ? 404 : submitted.error === 'unavailable' ? 503 : 409
      return fail(status, submitted.error, 'Unable to submit the Hob turn')
    }
    c.header('X-Hob-Session-Id', submitted.sessionId)
    c.header('X-Hob-Request-Id', submitted.requestId)
    c.header('Location', `/api/open/v1/sessions/${submitted.sessionId}/turns/${submitted.requestId}`)
    const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(30_000)])
    while (!signal.aborted) {
      const turn = agents.getTurn(submitted.sessionId, submitted.requestId)
      if (!turn) return fail(404, 'turn_not_found', 'Hob turn not found')
      if (turn.state === 'completed') {
        const content = store.readTurnReply(submitted.sessionId, submitted.requestId)
        if (content === null) return fail(502, 'reply_unavailable', 'The Hob turn reply is unavailable')
        return c.json({
          id: `chatcmpl-${requestId}`,
          object: 'chat.completion',
          created: Math.floor(Date.parse(turn.createdAt) / 1_000),
          model: payload.model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop', logprobs: null }],
        })
      }
      if (turn.state !== 'working') return fail(502, turn.error ?? turn.state, 'The Hob turn did not complete')
      await delay(200, undefined, { signal }).catch(() => undefined)
    }
    return fail(
      504,
      'turn_pending',
      'The Hob turn is still pending. Follow Location or retry with the same hob_request_id',
    )
  })
  return routes
}

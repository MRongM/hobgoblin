import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import * as v from 'valibot'
import { serverLogger } from '#/server/logger.ts'
import {
  errorResponse,
  readBody,
  limitBody,
  requireBearer,
  terminalControlMessages,
} from '#/server/routes/open-api-http.ts'
import {
  AcquireTerminalControlSchema,
  CONVERSATION_DELETE_MODES,
  ConversationFiltersSchema,
  CreateConversationSchema,
  CreateMessageSchema,
  TerminalControlIdSchema,
  TerminalControlInputSchema,
  UpdateConversationSchema,
  UpdateMessageSchema,
} from '#/server/modules/conversation-open-api-model.ts'
import type { ConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import type { AgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { createWorkspaceOpenApiRoutes, type WorkspaceTerminalInventory } from '#/server/routes/workspace-open-api.ts'
import { workspaceOpenApiComponents, workspaceOpenApiPaths } from '#/server/routes/workspace-open-api-document.ts'
import { museOpenApiDocument } from '#/server/routes/muse-open-api-document.ts'
import type { OpenApiKeyStore } from '#/server/modules/open-api-key-source.ts'
import {
  CONVERSATION_OPEN_API_PREFIX,
  conversationOpenApiDocument,
  terminalRegistryOpenApiPaths,
  terminalTranscriptOpenApiPaths,
} from '#/server/routes/conversation-open-api-document.ts'
import type { CallTerminalControl } from '#/server/terminal/terminal-open-api-control.ts'
import type { TerminalRegistry } from '#/server/terminal/terminal-registry-source.ts'
import type { TerminalTranscript } from '#/server/terminal/terminal-transcript-source.ts'
import { createTerminalRegistryRoutes } from '#/server/routes/terminal-registry.ts'
import { createOpenAiChatCompatibilityRoutes } from '#/server/routes/openai-chat-compat.ts'

export interface ConversationOpenApiOptions {
  keys: OpenApiKeyStore
  store: ConversationOpenApiStore
  agents?: AgentOpenApiRuntime
  terminalRegistry?: Pick<TerminalRegistry, 'has' | 'list'>
  terminalTranscript?: Pick<TerminalTranscript, 'list'>
}

function missingConversation(c: Context) {
  return errorResponse(c, 404, 'conversation_not_found', 'Conversation not found')
}

function missingMessage(c: Context) {
  return errorResponse(c, 404, 'message_not_found', 'Message not found in this conversation')
}

function addControlRoutes(routes: Hono, options: ConversationOpenApiOptions, callControl?: CallTerminalControl): void {
  const path = '/conversations/:conversationId/control'
  if (!callControl) {
    routes.all(`${path}/*`, (c) =>
      errorResponse(c, 503, 'terminal_control_disabled', 'OpenAPI terminal control is disabled'),
    )
    return
  }
  routes.use(`${path}/*`, requireBearer(options.keys, true))

  function linkedSession(c: Context, conversationId: string): string | Response {
    const conversation = options.store.getConversationSummary(conversationId)
    if (!conversation) return missingConversation(c)
    return (
      conversation.terminalSessionId ??
      errorResponse(c, 409, 'terminal_not_linked', 'Conversation has no linked terminal')
    )
  }

  routes.post(path, limitBody, async (c) => {
    const conversationId = c.req.param('conversationId')
    const input = await readBody(c, AcquireTerminalControlSchema)
    if (input instanceof Response) return input
    const sessionId = linkedSession(c, conversationId)
    if (sessionId instanceof Response) return sessionId
    if (sessionId !== input.terminalSessionId) {
      return errorResponse(c, 409, 'terminal_link_changed', 'Conversation is linked to a different terminal')
    }
    const result = await callControl({ action: 'acquire', conversationId, sessionId })
    if (!result.ok) return errorResponse(c, 409, result.reason, terminalControlMessages[result.reason])
    if (result.action !== 'acquire') throw new Error('Unexpected terminal control response')
    const { controlId, terminalSessionId, expiresAt } = result
    c.header('Location', `${CONVERSATION_OPEN_API_PREFIX}/conversations/${conversationId}/control/${controlId}`)
    return c.json({ controlId, terminalSessionId, expiresAt }, 201)
  })

  routes.post(`${path}/:controlId/input`, limitBody, async (c) => {
    const { conversationId, controlId } = c.req.param()
    if (!v.is(TerminalControlIdSchema, controlId))
      return errorResponse(c, 400, 'invalid_control_id', 'Invalid control ID')
    const input = await readBody(c, TerminalControlInputSchema)
    if (input instanceof Response) return input
    const sessionId = linkedSession(c, conversationId)
    if (sessionId instanceof Response) return sessionId
    const result = await callControl({ action: 'write', conversationId, sessionId, controlId, data: input.data })
    return result.ok ? c.body(null, 202) : errorResponse(c, 409, result.reason, terminalControlMessages[result.reason])
  })

  routes.delete(`${path}/:controlId`, async (c) => {
    const { conversationId, controlId } = c.req.param()
    if (!v.is(TerminalControlIdSchema, controlId))
      return errorResponse(c, 400, 'invalid_control_id', 'Invalid control ID')
    const result = await callControl({ action: 'release', conversationId, controlId })
    return result.ok ? c.body(null, 204) : errorResponse(c, 409, result.reason, terminalControlMessages[result.reason])
  })
}

export function createConversationOpenApiRoutes(
  options?: ConversationOpenApiOptions,
  callControl?: CallTerminalControl,
  terminals?: WorkspaceTerminalInventory,
) {
  const routes = new Hono()
  routes.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['Location', 'WWW-Authenticate'],
    }),
  )
  routes.get('/openapi.json', (c) => {
    const document = options?.agents
      ? {
          ...conversationOpenApiDocument,
          info: {
            ...conversationOpenApiDocument.info,
            title: 'Hobgoblin OpenAPI',
            description: 'Access workspaces, background AI sessions, interactive terminals, and conversation records.',
          },
          paths: { ...conversationOpenApiDocument.paths, ...workspaceOpenApiPaths },
          components: workspaceOpenApiComponents,
        }
      : conversationOpenApiDocument
    return c.json(
      options?.terminalRegistry
        ? {
            ...document,
            paths: {
              ...document.paths,
              ...terminalRegistryOpenApiPaths,
              ...(options.terminalTranscript ? terminalTranscriptOpenApiPaths : {}),
            },
          }
        : document,
    )
  })

  routes.onError((error, c) => {
    serverLogger.error({ err: error }, 'Conversation OpenAPI request failed')
    return errorResponse(c, 500, 'internal_error', 'Conversation request failed')
  })

  if (!options) {
    routes.all('/conversations/*', (c) =>
      errorResponse(c, 503, 'open_api_disabled', 'Conversation OpenAPI is disabled'),
    )
    return routes
  }
  const { store } = options
  if (options.terminalRegistry)
    routes.route('/', createTerminalRegistryRoutes(options.keys, options.terminalRegistry, options.terminalTranscript))
  if (options.agents) {
    const workspaceOptions = { keys: options.keys, agents: options.agents, store, terminals, callControl }
    routes.route('/', createWorkspaceOpenApiRoutes({ ...workspaceOptions, prefix: CONVERSATION_OPEN_API_PREFIX }))
    routes.route('/', createOpenAiChatCompatibilityRoutes({ agents: options.agents, store, keys: options.keys }))
    routes.get('/muse/openapi.json', (c) => c.json(museOpenApiDocument))
    routes.route(
      '/muse',
      createWorkspaceOpenApiRoutes({ ...workspaceOptions, prefix: `${CONVERSATION_OPEN_API_PREFIX}/muse` }),
    )
  }
  addControlRoutes(routes, options, callControl)
  routes.use('/conversations/*', requireBearer(options.keys))

  routes.get('/conversations', (c) => {
    const filters = v.safeParse(ConversationFiltersSchema, c.req.query())
    if (!filters.success) return errorResponse(c, 400, 'invalid_request', 'Invalid conversation filters')
    return c.json({ conversations: store.listConversations(filters.output) })
  })

  routes.post('/conversations', limitBody, async (c) => {
    const input = await readBody(c, CreateConversationSchema)
    if (input instanceof Response) return input
    const conversation = store.createConversation(input)
    c.header('Location', `${CONVERSATION_OPEN_API_PREFIX}/conversations/${conversation.id}`)
    return c.json(conversation, 201)
  })

  routes.get('/conversations/:conversationId', (c) => {
    const conversation = store.getConversation(c.req.param('conversationId'))
    return conversation ? c.json(conversation) : missingConversation(c)
  })

  routes.patch('/conversations/:conversationId', limitBody, async (c) => {
    const input = await readBody(c, UpdateConversationSchema)
    if (input instanceof Response) return input
    const conversation = store.updateConversation(c.req.param('conversationId'), input)
    return conversation ? c.json(conversation) : missingConversation(c)
  })

  routes.delete('/conversations/:conversationId', async (c) => {
    const id = c.req.param('conversationId')
    const mode = c.req.query('mode')
    if (mode !== undefined) {
      if (!v.is(v.picklist(CONVERSATION_DELETE_MODES), mode)) {
        return errorResponse(c, 400, 'invalid_request', 'Invalid conversation delete mode')
      }
      if (!options.agents) return errorResponse(c, 503, 'unavailable', 'Agent session management is unavailable')
      const result = options.agents.deleteAgentConversation(id, mode)
      if (result === 'deleted') return c.body(null, 204)
      if (result === 'conversation_not_found') return missingConversation(c)
      const messages = {
        desktop_terminal_active: 'The session belongs to a desktop terminal',
        session_changed: 'The session is no longer connected to a desktop terminal',
        session_working: 'An agent operation for this session is still in progress',
      }
      return errorResponse(c, 409, result, messages[result])
    }
    await options.agents?.synchronizeNativeSession(id)
    if (options.agents?.isTerminalActive(id))
      return errorResponse(c, 409, 'desktop_terminal_active', 'The session is open in a desktop terminal')
    if (options.agents?.isWorking(id))
      return errorResponse(
        c,
        409,
        'session_working',
        'Wait for the active agent turn before deleting this conversation',
      )
    return store.deleteConversation(id) ? c.body(null, 204) : missingConversation(c)
  })

  routes.get('/conversations/:conversationId/messages', (c) => {
    const messages = store.listMessages(c.req.param('conversationId'))
    return messages ? c.json({ messages }) : missingConversation(c)
  })

  routes.post('/conversations/:conversationId/messages', limitBody, async (c) => {
    const input = await readBody(c, CreateMessageSchema)
    if (input instanceof Response) return input
    const { conversationId } = c.req.param()
    const message = store.createMessage(conversationId, input)
    if (!message) return missingConversation(c)
    c.header('Location', `${CONVERSATION_OPEN_API_PREFIX}/conversations/${conversationId}/messages/${message.id}`)
    return c.json(message, 201)
  })

  routes.get('/conversations/:conversationId/messages/:messageId', (c) => {
    const { conversationId, messageId } = c.req.param()
    const message = store.getMessage(conversationId, messageId)
    return message ? c.json(message) : missingMessage(c)
  })

  routes.patch('/conversations/:conversationId/messages/:messageId', limitBody, async (c) => {
    const input = await readBody(c, UpdateMessageSchema)
    if (input instanceof Response) return input
    const { conversationId, messageId } = c.req.param()
    const message = store.updateMessage(conversationId, messageId, input)
    return message ? c.json(message) : missingMessage(c)
  })

  routes.delete('/conversations/:conversationId/messages/:messageId', (c) => {
    const { conversationId, messageId } = c.req.param()
    return store.deleteMessage(conversationId, messageId) ? c.body(null, 204) : missingMessage(c)
  })

  return routes
}

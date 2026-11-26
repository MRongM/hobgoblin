import {
  CONVERSATION_MESSAGE_ROLES,
  CONVERSATION_PROVIDERS,
  CONVERSATION_REQUEST_MAX_BYTES,
  CONVERSATION_STATUSES,
  CONVERSATION_TITLE_MAX_LENGTH,
  TERMINAL_CONTROL_INPUT_MAX_LENGTH,
} from '#/server/modules/conversation-open-api-model.ts'
import { TERMINAL_CONTROL_TTL_MS } from '#/server/terminal/terminal-open-api-control.ts'
import { TERMINAL_SESSION_ID_RE } from '#/shared/terminal.ts'

export const CONVERSATION_OPEN_API_PREFIX = '/api/open/v1'

const provider = { type: 'string', enum: CONVERSATION_PROVIDERS }
const status = {
  type: 'string',
  enum: CONVERSATION_STATUSES,
  description: 'Last state written by the client associated with the conversation.',
}
const terminalSessionId = { type: 'string', pattern: TERMINAL_SESSION_ID_RE.source }
const conversationFields = {
  title: { type: ['string', 'null'], maxLength: CONVERSATION_TITLE_MAX_LENGTH },
  terminalSessionId: { ...terminalSessionId, type: ['string', 'null'] },
  status,
}
const messageFields = {
  role: { type: 'string', enum: CONVERSATION_MESSAGE_ROLES },
  content: {
    type: 'string',
    minLength: 1,
    description: 'Complete message text with line breaks and whitespace preserved.',
  },
}
const id = { type: 'string', format: 'uuid' }
const timestamps = {
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
}

function schemaRef(name: string) {
  return { $ref: `#/components/schemas/${name}` }
}

function object(properties: Record<string, object>, required: string[] = Object.keys(properties)) {
  return { type: 'object', additionalProperties: false, properties, required }
}

function response(description: string, schema: object) {
  return { description, content: { 'application/json': { schema } } }
}

function requestBody(name: string) {
  return {
    required: true,
    description: `Maximum encoded request body size: ${CONVERSATION_REQUEST_MAX_BYTES} bytes.`,
    content: { 'application/json': { schema: schemaRef(name) } },
  }
}

function pathId(name: string) {
  return { name, in: 'path', required: true, schema: id }
}

const authResponses = {
  401: {
    ...response('Missing or invalid bearer token', schemaRef('Error')),
    headers: { 'WWW-Authenticate': { schema: { type: 'string', example: 'Bearer' } } },
  },
  503: response('Conversation OpenAPI is disabled', schemaRef('Error')),
  500: response('Internal server error', schemaRef('Error')),
}
const notFound = response('Conversation or message not found', schemaRef('Error'))
const invalidRequest = response('Invalid request fields or JSON', schemaRef('Error'))
const writeResponses = {
  400: invalidRequest,
  413: response('Request body is too large', schemaRef('Error')),
  415: response('Content-Type must be application/json', schemaRef('Error')),
  ...authResponses,
}
const terminalControlConflict = response('Terminal link or control is unavailable', schemaRef('Error'))
const terminalControlResponses = {
  ...authResponses,
  409: terminalControlConflict,
  503: response('OpenAPI terminal control is disabled', schemaRef('Error')),
}

function created(description: string, name: string) {
  return {
    ...response(description, schemaRef(name)),
    headers: { Location: { description: 'Path to the created resource', schema: { type: 'string' } } },
  }
}

const conversationSummaryFields = { id, provider, ...conversationFields, ...timestamps }
const messages = { type: 'array', items: schemaRef('Message'), description: 'Messages in insertion order.' }

export const conversationOpenApiDocument = {
  openapi: '3.1.1',
  info: {
    title: 'Hobgoblin Conversation OpenAPI',
    version: '1.0.0',
    description: 'Manage Codex and Claude conversation records and their complete messages.',
  },
  servers: [{ url: CONVERSATION_OPEN_API_PREFIX }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/conversations': {
      get: {
        operationId: 'listConversations',
        summary: 'List conversation summaries by most recent update',
        parameters: Object.entries({ provider, status, terminalSessionId }).map(([name, schema]) => ({
          name,
          in: 'query',
          schema,
        })),
        responses: {
          200: response('Conversation list', schemaRef('ConversationList')),
          400: invalidRequest,
          ...authResponses,
        },
      },
      post: {
        operationId: 'createConversation',
        requestBody: requestBody('CreateConversation'),
        responses: { 201: created('Conversation created', 'ConversationSummary'), ...writeResponses },
      },
    },
    '/conversations/{conversationId}': {
      parameters: [pathId('conversationId')],
      get: {
        operationId: 'getConversation',
        summary: 'Get a conversation with all of its messages',
        responses: {
          200: response('Complete conversation', schemaRef('Conversation')),
          404: notFound,
          ...authResponses,
        },
      },
      patch: {
        operationId: 'updateConversation',
        requestBody: requestBody('UpdateConversation'),
        responses: {
          200: response('Conversation updated', schemaRef('ConversationSummary')),
          404: notFound,
          ...writeResponses,
        },
      },
      delete: {
        operationId: 'deleteConversation',
        responses: {
          204: { description: 'Conversation and its messages deleted' },
          404: notFound,
          409: response('A managed agent turn is still working', schemaRef('Error')),
          ...authResponses,
        },
      },
    },
    '/conversations/{conversationId}/messages': {
      parameters: [pathId('conversationId')],
      get: {
        operationId: 'listMessages',
        responses: {
          200: response('All conversation messages', schemaRef('MessageList')),
          404: notFound,
          ...authResponses,
        },
      },
      post: {
        operationId: 'createMessage',
        requestBody: requestBody('CreateMessage'),
        responses: { 201: created('Message appended', 'Message'), 404: notFound, ...writeResponses },
      },
    },
    '/conversations/{conversationId}/messages/{messageId}': {
      parameters: [pathId('conversationId'), pathId('messageId')],
      get: {
        operationId: 'getMessage',
        responses: { 200: response('Message', schemaRef('Message')), 404: notFound, ...authResponses },
      },
      patch: {
        operationId: 'updateMessage',
        requestBody: requestBody('UpdateMessage'),
        responses: { 200: response('Message updated', schemaRef('Message')), 404: notFound, ...writeResponses },
      },
      delete: {
        operationId: 'deleteMessage',
        responses: { 204: { description: 'Message deleted' }, 404: notFound, ...authResponses },
      },
    },
    '/conversations/{conversationId}/control': {
      parameters: [pathId('conversationId')],
      post: {
        operationId: 'acquireTerminalControl',
        summary: 'Take input control of the linked terminal',
        description: `Control expires after ${TERMINAL_CONTROL_TTL_MS / 1000} seconds. Existing clients may take back control.`,
        requestBody: requestBody('AcquireTerminalControl'),
        responses: {
          201: created('Terminal control acquired', 'TerminalControl'),
          404: notFound,
          ...writeResponses,
          ...terminalControlResponses,
        },
      },
    },
    '/conversations/{conversationId}/control/{controlId}/input': {
      parameters: [pathId('conversationId'), pathId('controlId')],
      post: {
        operationId: 'writeTerminalInput',
        requestBody: requestBody('TerminalControlInput'),
        responses: {
          202: { description: 'Terminal input queued' },
          404: notFound,
          ...writeResponses,
          ...terminalControlResponses,
        },
      },
    },
    '/conversations/{conversationId}/control/{controlId}': {
      parameters: [pathId('conversationId'), pathId('controlId')],
      delete: {
        operationId: 'releaseTerminalControl',
        responses: {
          204: { description: 'Terminal control released' },
          400: invalidRequest,
          ...terminalControlResponses,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      ConversationSummary: object(conversationSummaryFields),
      Conversation: object({ ...conversationSummaryFields, messages }),
      ConversationList: object({ conversations: { type: 'array', items: schemaRef('ConversationSummary') } }),
      CreateConversation: object({ provider, ...conversationFields, status: { ...status, default: 'ready' } }, [
        'provider',
      ]),
      UpdateConversation: { ...object(conversationFields, []), minProperties: 1 },
      Message: object({ id, ...messageFields, ...timestamps }),
      MessageList: object({ messages }),
      CreateMessage: object(messageFields),
      UpdateMessage: { ...object(messageFields, []), minProperties: 1 },
      AcquireTerminalControl: object({ terminalSessionId }),
      TerminalControl: object({ controlId: id, terminalSessionId, expiresAt: { type: 'string', format: 'date-time' } }),
      TerminalControlInput: object({
        data: {
          type: 'string',
          minLength: 1,
          maxLength: TERMINAL_CONTROL_INPUT_MAX_LENGTH,
          description: 'Raw terminal input. Include a carriage return to send Enter. Limit is in UTF-16 code units.',
        },
      }),
      Error: object({ error: object({ code: { type: 'string' }, message: { type: 'string' } }) }),
    },
  },
}

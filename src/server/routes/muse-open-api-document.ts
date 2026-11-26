import { MAX_AGENT_PROMPT_LENGTH } from '#/server/modules/agent-open-api-model.ts'
import {
  CONVERSATION_PROVIDERS,
  TERMINAL_CONTROL_INPUT_MAX_LENGTH,
} from '#/server/modules/conversation-open-api-model.ts'
import { conversationOpenApiDocument } from '#/server/routes/conversation-open-api-document.ts'
import {
  TERMINAL_CONTROL_MAX_INPUTS,
  TERMINAL_CONTROL_TTL_MS,
  TERMINAL_INTERACTIVE_INPUT_IDLE_MS,
} from '#/server/terminal/terminal-open-api-control.ts'

const uuid = { type: 'string', format: 'uuid' }
const opaqueId = { type: 'string', pattern: '^[a-f0-9]{24}$' }
const date = { type: 'string', format: 'date-time' }
const provider = { type: 'string', enum: CONVERSATION_PROVIDERS }
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const itemList = (name: string) => ({ type: 'array', items: ref(name) })
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
})
const json = (description: string, schema: object) => ({ description, content: { 'application/json': { schema } } })
const pathParameter = (name: string, schema: object) => ({ name, in: 'path', required: true, schema })

const workspaceId = pathParameter('workspaceId', opaqueId)
const sessionId = pathParameter('sessionId', uuid)
const terminalParameters = [workspaceId, pathParameter('terminalId', { type: 'string' })]
const controlParameters = [...terminalParameters, pathParameter('controlId', uuid)]
const terminalCreateFields = {
  worktreeId: opaqueId,
  launchMode: { type: 'string', enum: ['native', 'tmux-if-available'], default: 'native' },
  windowsInternalTerminalShell: { type: 'string', enum: ['wsl', 'powershell'] },
}
const errors = {
  401: json('Missing or invalid bearer key', ref('Error')),
  404: json('Resource not found', ref('Error')),
  500: json('Hobgoblin failed to read the resource', ref('Error')),
  503: json('OpenAPI access is disabled', ref('Error')),
}
const submitErrors = {
  ...errors,
  400: json('Invalid request body', ref('Error')),
  409: json('Request ID conflict or agent session is busy or closed', ref('Error')),
  413: json('Request body is too large', ref('Error')),
  415: json('Expected JSON', ref('Error')),
}

function submit(operationId: string, summary: string, schema: string) {
  return {
    operationId,
    summary,
    requestBody: { required: true, content: { 'application/json': { schema: ref(schema) } } },
    responses: {
      202: {
        ...json('Turn accepted. Follow Location to check its status.', ref('AgentSubmission')),
        headers: { Location: { schema: { type: 'string' } } },
      },
      ...submitErrors,
    },
  }
}

function createTerminal(operationId: string, summary: string, schema: string) {
  return {
    operationId,
    summary,
    description:
      'Opens a new terminal in the selected worktree or the primary workspace directory. If the response is lost, check the terminal list before creating another terminal.',
    requestBody: { required: true, content: { 'application/json': { schema: ref(schema) } } },
    responses: {
      201: {
        ...json('Terminal opened', ref('ObservedTerminal')),
        headers: { Location: { schema: { type: 'string' } } },
      },
      ...submitErrors,
      409: json('Terminal could not be opened', ref('Error')),
    },
  }
}

function acquireTerminalControl(operationId: string) {
  return {
    operationId,
    summary: 'Acquire keyboard control of an open terminal',
    deprecated: true,
    description: `Control is scoped to this workspace and terminal, expires after ${TERMINAL_CONTROL_TTL_MS / 1000} seconds, and permits ${TERMINAL_CONTROL_MAX_INPUTS} unique input requests. A desktop client may take control back. Use Location to release control.`,
    responses: {
      201: {
        ...json('Control acquired', ref('TerminalControl')),
        headers: { Location: { schema: { type: 'string' } } },
      },
      ...errors,
      409: json('Terminal unavailable or already controlled by another API client', ref('Error')),
    },
  }
}

function writeTerminalInput(operationId: string, summary: string, explicitLease = false) {
  return {
    operationId,
    summary,
    ...(explicitLease ? { deprecated: true } : {}),
    description: explicitLease
      ? 'Use the same request ID and lease to recover a lost response without queuing the input twice.'
      : `Send a complete input sequence in one request. Hobgoblin coordinates the write with the desktop and Web clients. If a response is lost, retry the same request ID and data on this terminal within ${TERMINAL_CONTROL_TTL_MS / 1000} seconds. At most ${TERMINAL_CONTROL_MAX_INPUTS} distinct attempts per terminal are retained in that window.`,
    requestBody: { required: true, content: { 'application/json': { schema: ref('MuseTerminalInput') } } },
    responses: {
      202: json(
        'Input accepted by the PTY write API. Delivery to the terminal is unconfirmed.',
        object({ accepted: { const: true }, delivery: { const: 'unconfirmed' } }),
      ),
      ...submitErrors,
      409: json(
        explicitLease
          ? 'Lease expired or lost, lease input limit reached, or request ID used with different input'
          : `An explicit lease is active, a desktop or Web client sent input in the last ${TERMINAL_INTERACTIVE_INPUT_IDLE_MS / 1000} seconds, the request limit was reached, or the request ID was reused with different input`,
        ref('Error'),
      ),
      503: json('Terminal control disabled or input delivery could not be confirmed', ref('Error')),
    },
  }
}

const turnInput = {
  requestId: { ...uuid, description: 'Generate a new UUID for each new turn. Reuse it to retry the same request.' },
  prompt: {
    type: 'string',
    minLength: 1,
    maxLength: MAX_AGENT_PROMPT_LENGTH,
    description: 'Complete prompt for the coding agent.',
  },
}
const agentSummary = {
  id: uuid,
  workspaceId: opaqueId,
  worktreeId: opaqueId,
  provider,
  status: { type: 'string', enum: ['ready', 'working', 'failed', 'closed'] },
  createdAt: date,
  updatedAt: date,
  latestTurn: { anyOf: [ref('AgentTurn'), { type: 'null' }] },
}
const terminalSummary = {
  id: { type: 'string' },
  phase: { type: 'string', const: 'open' },
  processName: { type: 'string' },
  title: { type: ['string', 'null'] },
  provider: { anyOf: [provider, { type: 'null' }] },
  conversationId: { type: ['string', 'null'], format: 'uuid' },
}
const existing = conversationOpenApiDocument.paths

export const museOpenApiDocument = {
  ...conversationOpenApiDocument,
  info: {
    title: 'Hobgoblin for Muse',
    version: '1.0.0',
    description:
      'Use interactive terminal sessions by default for Codex and Claude. Start a background session only when the user explicitly asks for background execution.',
  },
  paths: {
    '/muse/workspaces': {
      get: {
        operationId: 'listHobgoblinWorkspaces',
        summary: 'List workspaces open in Hobgoblin',
        responses: { 200: json('Open workspaces', object({ workspaces: itemList('AgentWorkspace') })), ...errors },
      },
    },
    '/muse/workspaces/{workspaceId}/worktrees': {
      parameters: [workspaceId],
      get: {
        operationId: 'listHobgoblinWorktrees',
        summary: 'List available worktrees in an open workspace',
        responses: { 200: json('Available worktrees', object({ worktrees: itemList('AgentWorktree') })), ...errors },
      },
    },
    '/muse/workspaces/{workspaceId}/sessions': {
      parameters: [workspaceId],
      get: {
        operationId: 'listHobgoblinSessions',
        summary: 'List background AI sessions and open terminals in a workspace',
        description:
          'Use open terminals for interactive work by default. Select a background session for follow-ups only when the user explicitly chooses it or has already asked to work in that session.',
        responses: {
          200: json(
            'Agent sessions and open terminals',
            object({ sessions: itemList('AgentSession'), terminals: itemList('ObservedTerminal') }),
          ),
          ...errors,
        },
      },
      post: {
        ...submit(
          'startHobgoblinAgentSession',
          'Start a background Codex or Claude session only at the user’s explicit request',
          'StartAgentSession',
        ),
        description:
          'Call this operation only when the user explicitly asks for background execution. Set mode to background for that request. Otherwise use startHobgoblinTerminalAgentSession to open an interactive terminal and send the prompt there.',
      },
    },
    '/muse/workspaces/{workspaceId}/terminals': {
      parameters: [workspaceId],
      get: {
        operationId: 'listHobgoblinTerminals',
        summary: 'List open terminals in the workspace',
        responses: { 200: json('Open terminals', object({ terminals: itemList('ObservedTerminal') })), ...errors },
      },
      post: createTerminal('createHobgoblinTerminal', 'Open a terminal on the workspace host', 'CreateTerminal'),
    },
    '/muse/workspaces/{workspaceId}/terminal-sessions': {
      parameters: [workspaceId],
      get: {
        operationId: 'listHobgoblinTerminalAgentSessions',
        summary: 'List managed interactive AI sessions in the workspace',
        responses: {
          200: json('Interactive AI sessions', object({ sessions: itemList('ObservedTerminal') })),
          ...errors,
        },
      },
      post: {
        ...createTerminal(
          'startHobgoblinTerminalAgentSession',
          'Start Codex or Claude in an interactive terminal (default)',
          'StartTerminalAgent',
        ),
        description:
          'Use this operation by default to start a new AI session, including when the user provides a task or prompt. Read the terminal at the returned Location and send the prompt through submitHobgoblinTerminalAgentInput. If the creation response is lost, check the interactive session list before creating another terminal.',
      },
    },
    '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}': {
      parameters: terminalParameters,
      get: {
        operationId: 'readHobgoblinTerminalAgentSession',
        summary: 'Read the recent visible output of an interactive AI session',
        responses: { 200: json('Interactive AI session', ref('ObservedTerminalDetail')), ...errors },
      },
      delete: {
        operationId: 'endHobgoblinTerminalAgentSession',
        summary: 'End an interactive AI session and close its dedicated terminal',
        responses: {
          204: { description: 'Interactive AI session ended' },
          ...errors,
          409: json('Session could not be closed', ref('Error')),
        },
      },
    },
    '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control': {
      parameters: terminalParameters,
      post: acquireTerminalControl('acquireHobgoblinTerminalAgentControl'),
    },
    '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}/input': {
      parameters: terminalParameters,
      post: writeTerminalInput(
        'submitHobgoblinTerminalAgentInput',
        'Send an instruction or Ctrl+C to the interactive AI',
      ),
    },
    '/muse/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control/{controlId}/input': {
      parameters: controlParameters,
      post: writeTerminalInput(
        'sendHobgoblinTerminalAgentInput',
        'Send an instruction or Ctrl+C to the interactive AI with an explicit lease',
        true,
      ),
    },
    '/muse/workspaces/{workspaceId}/terminals/{terminalId}': {
      parameters: terminalParameters,
      get: {
        operationId: 'readHobgoblinTerminal',
        summary: 'Read a bounded excerpt from an open terminal',
        responses: { 200: json('Observed terminal', ref('ObservedTerminalDetail')), ...errors },
      },
      delete: {
        operationId: 'closeHobgoblinTerminal',
        summary: 'Close an open terminal',
        description:
          'Closes the Hobgoblin terminal. Ordinary tmux sessions are detached. Dedicated interactive AI sessions are ended.',
        responses: {
          204: { description: 'Terminal closed' },
          ...errors,
          409: json('Terminal could not be closed', ref('Error')),
        },
      },
    },
    '/muse/workspaces/{workspaceId}/terminals/{terminalId}/control': {
      parameters: terminalParameters,
      post: acquireTerminalControl('acquireHobgoblinTerminalControl'),
    },
    '/muse/workspaces/{workspaceId}/terminals/{terminalId}/input': {
      parameters: terminalParameters,
      post: writeTerminalInput('submitHobgoblinTerminalInput', 'Send keyboard input to an open terminal'),
    },
    '/muse/workspaces/{workspaceId}/terminals/{terminalId}/control/{controlId}/input': {
      parameters: controlParameters,
      post: writeTerminalInput(
        'sendHobgoblinTerminalInput',
        'Send keyboard input to a terminal with an explicit lease',
        true,
      ),
    },
    '/muse/workspaces/{workspaceId}/terminals/{terminalId}/control/{controlId}': {
      parameters: controlParameters,
      delete: {
        operationId: 'releaseHobgoblinTerminalControl',
        summary: 'Release terminal keyboard control',
        deprecated: true,
        responses: {
          204: { description: 'Control released' },
          ...errors,
          400: json('Invalid control ID', ref('Error')),
          409: json('Control expired or lost', ref('Error')),
        },
      },
    },
    '/muse/sessions/{sessionId}': {
      parameters: [sessionId],
      get: {
        operationId: 'readHobgoblinAgentSession',
        summary: 'Read an agent session with all stored messages',
        responses: { 200: json('Agent conversation', ref('AgentSessionDetail')), ...errors },
      },
      delete: {
        operationId: 'closeHobgoblinAgentSession',
        summary: 'Close a background session and cancel its running turn',
        description: 'Removes the session from workspace lists and preserves its stored conversation for reads.',
        responses: { 204: { description: 'Session closed' }, ...errors },
      },
    },
    '/muse/sessions/{sessionId}/turns': {
      parameters: [sessionId],
      post: {
        ...submit(
          'continueHobgoblinAgentSession',
          'Send a follow-up to the user’s selected background session',
          'SubmitAgentTurn',
        ),
        description:
          'Use this only for an existing background session the user selected for the task. Send follow-ups for interactive terminal sessions through the terminal input operation.',
      },
    },
    '/muse/sessions/{sessionId}/turns/{requestId}': {
      parameters: [sessionId, pathParameter('requestId', uuid)],
      get: {
        operationId: 'readHobgoblinAgentTurn',
        summary: 'Check whether an accepted prompt has completed',
        responses: { 200: json('Provider turn status', ref('AgentTurn')), ...errors },
      },
      delete: {
        operationId: 'cancelHobgoblinAgentTurn',
        summary: 'Cancel the specified running turn',
        responses: {
          200: json('Turn cancelled', ref('AgentTurn')),
          ...errors,
          409: json('Turn is no longer running', ref('Error')),
        },
      },
    },
    '/conversations': existing['/conversations'],
    '/conversations/{conversationId}': {
      parameters: existing['/conversations/{conversationId}'].parameters,
      get: existing['/conversations/{conversationId}'].get,
    },
    '/conversations/{conversationId}/control': existing['/conversations/{conversationId}/control'],
    '/conversations/{conversationId}/control/{controlId}/input':
      existing['/conversations/{conversationId}/control/{controlId}/input'],
    '/conversations/{conversationId}/control/{controlId}':
      existing['/conversations/{conversationId}/control/{controlId}'],
  },
  components: {
    ...conversationOpenApiDocument.components,
    schemas: {
      ...conversationOpenApiDocument.components.schemas,
      AgentWorkspace: object({
        id: opaqueId,
        name: { type: 'string' },
        kind: { enum: ['local', 'remote'] },
        active: { type: 'boolean' },
      }),
      AgentWorktree: object({
        id: opaqueId,
        name: { type: 'string' },
        branch: { type: ['string', 'null'] },
        primary: { type: 'boolean' },
      }),
      AgentSubmission: object({ sessionId: uuid, requestId: uuid }),
      AgentSession: object(agentSummary),
      AgentSessionDetail: object({ ...agentSummary, messages: itemList('Message') }),
      AgentTurn: object({
        ...turnInput,
        sessionId: uuid,
        state: { enum: ['working', 'completed', 'failed', 'cancelled'] },
        error: { type: ['string', 'null'] },
        createdAt: date,
        finishedAt: { ...date, type: ['string', 'null'] },
      }),
      StartAgentSession: object(
        {
          mode: {
            type: 'string',
            const: 'background',
            description: 'Set only when the user explicitly requests background execution.',
          },
          provider,
          ...turnInput,
          worktreeId: opaqueId,
        },
        ['mode', 'provider', 'requestId', 'prompt'],
      ),
      SubmitAgentTurn: object(turnInput),
      CreateTerminal: object(terminalCreateFields, []),
      StartTerminalAgent: object({ ...terminalCreateFields, provider }, ['provider']),
      MuseTerminalInput: object({
        requestId: {
          ...uuid,
          description:
            'Use a new UUID for each input. Reuse it only when retrying the same input on the same terminal. Keep the original lease when using an explicit lease.',
        },
        data: {
          type: 'string',
          minLength: 1,
          maxLength: TERMINAL_CONTROL_INPUT_MAX_LENGTH,
          description: 'Terminal text or key sequence. Use carriage return for Enter and U+0003 for Ctrl+C.',
        },
      }),
      ObservedTerminal: object(terminalSummary),
      ObservedTerminalDetail: object({ ...terminalSummary, excerpt: { type: ['string', 'null'] } }),
    },
  },
}

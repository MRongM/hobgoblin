import { MAX_AGENT_PROMPT_LENGTH } from '#/shared/agent-sessions.ts'
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
    requestBody: { required: true, content: { 'application/json': { schema: ref('WorkspaceTerminalInput') } } },
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
  revision: { type: 'integer', minimum: 1 },
  mode: { type: 'string', enum: ['background', 'terminal', 'native'] },
  terminalLink: {
    anyOf: [
      object({
        terminalId: { type: 'string' },
        executionId: uuid,
        source: { type: 'string', enum: ['explicit', 'detected', 'manual'] },
      }),
      { type: 'null' },
    ],
  },
  terminalActive: { type: 'boolean', description: 'A desktop terminal owns this session until its history is synced.' },
  structuredWritable: {
    type: 'boolean',
    description: 'The session accepts structured turns in its current execution mode.',
  },
  createdAt: date,
  updatedAt: date,
  latestTurn: { anyOf: [ref('AgentTurn'), { type: 'null' }] },
}
const historyParams = [
  sessionId,
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'beforeSeq', in: 'query', schema: { type: 'integer', minimum: 1 } },
]
const historyPageFields = {
  revision: agentSummary.revision,
  nextCursor: { type: ['integer', 'null'] },
}
const sessionControlConflict = json(
  'Session or controller changed',
  object(
    {
      error: object({ code: { type: 'string' }, message: { type: 'string' } }),
      current: { anyOf: [object(agentSummary), { type: 'null' }] },
      control: { type: ['object', 'null'] },
    },
    ['error', 'current'],
  ),
)
const nativeControl = acquireTerminalControl('acquireHobgoblinSessionTerminalControl')
const nativeInput = writeTerminalInput('submitHobgoblinSessionTerminalInput', 'Send keys to the linked terminal')
const terminalSummary = {
  id: { type: 'string' },
  phase: { type: 'string', const: 'open' },
  processName: { type: 'string' },
  title: { type: ['string', 'null'] },
  provider: { anyOf: [provider, { type: 'null' }] },
  conversationId: { type: ['string', 'null'], format: 'uuid' },
}
export const workspaceOpenApiPaths = {
  '/sessions': {
    get: {
      operationId: 'listHobgoblinSessionPage',
      summary: 'List a page of session summaries across open workspaces',
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
        { name: 'q', in: 'query', schema: { type: 'string', maxLength: 256 } },
        { name: 'native', in: 'query', schema: { type: 'string', enum: ['1'] } },
        { name: 'refresh', in: 'query', schema: { type: 'string', enum: ['1'] } },
      ],
      responses: {
        200: json(
          'Session summaries, open workspaces, and the cursor for the next page',
          object({
            sessions: itemList('AgentSessionListItem'),
            workspaces: itemList('AgentWorkspace'),
            nextCursor: { type: ['string', 'null'] },
          }),
        ),
        400: json('Invalid page parameters', ref('Error')),
        ...errors,
      },
    },
  },
  '/workspaces': {
    get: {
      operationId: 'listHobgoblinWorkspaces',
      summary: 'List workspaces open in Hobgoblin',
      responses: { 200: json('Open workspaces', object({ workspaces: itemList('AgentWorkspace') })), ...errors },
    },
  },
  '/workspaces/{workspaceId}/worktrees': {
    parameters: [workspaceId],
    get: {
      operationId: 'listHobgoblinWorktrees',
      summary: 'List available worktrees in an open workspace',
      responses: { 200: json('Available worktrees', object({ worktrees: itemList('AgentWorktree') })), ...errors },
    },
  },
  '/workspaces/{workspaceId}/targets': {
    parameters: [workspaceId],
    get: {
      operationId: 'listHobgoblinAgentTargets',
      summary: 'List worktrees and registered subworkspaces for a background session',
      responses: {
        200: json(
          'Available work locations',
          object({
            worktrees: itemList('AgentWorktree'),
            subworkspaces: {
              type: 'array',
              items: object({
                id: { type: 'string' },
                name: { type: 'string' },
                root: { anyOf: [ref('AgentWorktree'), { type: 'null' }] },
                worktrees: itemList('AgentWorktree'),
              }),
            },
          }),
        ),
        ...errors,
      },
    },
  },
  '/workspaces/{workspaceId}/sessions': {
    parameters: [workspaceId],
    get: {
      operationId: 'listHobgoblinSessions',
      summary: 'List background AI sessions and open terminals in a workspace',
      responses: {
        200: json(
          'Agent sessions and open terminals',
          object({ sessions: itemList('AgentSession'), terminals: itemList('ObservedTerminal') }),
        ),
        ...errors,
      },
    },
    post: {
      ...submit('startHobgoblinAgentSession', 'Start a background Codex or Claude session', 'StartAgentSession'),
      description: 'Set mode to background and submit the first prompt with a new request ID.',
    },
  },
  '/workspaces/{workspaceId}/terminals': {
    parameters: [workspaceId],
    get: {
      operationId: 'listHobgoblinTerminals',
      summary: 'List open terminals in the workspace',
      responses: { 200: json('Open terminals', object({ terminals: itemList('ObservedTerminal') })), ...errors },
    },
    post: createTerminal('createHobgoblinTerminal', 'Open a terminal on the workspace host', 'CreateTerminal'),
  },
  '/workspaces/{workspaceId}/terminal-sessions': {
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
        'Start Codex or Claude in an interactive terminal',
        'StartTerminalAgent',
      ),
      description:
        'Read the terminal at the returned Location and send the prompt through submitHobgoblinTerminalAgentInput. If the creation response is lost, check the interactive session list before creating another terminal.',
    },
  },
  '/workspaces/{workspaceId}/terminal-sessions/{terminalId}': {
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
  '/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control': {
    parameters: terminalParameters,
    post: acquireTerminalControl('acquireHobgoblinTerminalAgentControl'),
  },
  '/workspaces/{workspaceId}/terminal-sessions/{terminalId}/input': {
    parameters: terminalParameters,
    post: writeTerminalInput(
      'submitHobgoblinTerminalAgentInput',
      'Send an instruction or Ctrl+C to the interactive AI',
    ),
  },
  '/workspaces/{workspaceId}/terminal-sessions/{terminalId}/control/{controlId}/input': {
    parameters: controlParameters,
    post: writeTerminalInput(
      'sendHobgoblinTerminalAgentInput',
      'Send an instruction or Ctrl+C to the interactive AI with an explicit lease',
      true,
    ),
  },
  '/workspaces/{workspaceId}/terminals/{terminalId}': {
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
  '/workspaces/{workspaceId}/terminals/{terminalId}/control': {
    parameters: terminalParameters,
    post: acquireTerminalControl('acquireHobgoblinTerminalControl'),
  },
  '/workspaces/{workspaceId}/terminals/{terminalId}/input': {
    parameters: terminalParameters,
    post: writeTerminalInput('submitHobgoblinTerminalInput', 'Send keyboard input to an open terminal'),
  },
  '/workspaces/{workspaceId}/terminals/{terminalId}/control/{controlId}/input': {
    parameters: controlParameters,
    post: writeTerminalInput(
      'sendHobgoblinTerminalInput',
      'Send keyboard input to a terminal with an explicit lease',
      true,
    ),
  },
  '/workspaces/{workspaceId}/terminals/{terminalId}/control/{controlId}': {
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
  '/sessions/{sessionId}': {
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
  '/sessions/{sessionId}/status': {
    parameters: [sessionId],
    get: {
      operationId: 'readHobgoblinAgentSessionStatus',
      summary: 'Check the agent session status and latest turn without loading message history',
      responses: { 200: json('Agent session status', object(agentSummary)), ...errors },
    },
  },
  '/sessions/{sessionId}/turns': {
    get: {
      operationId: 'listHobgoblinSessionTurns',
      summary: 'Read a page of structured turns',
      parameters: historyParams,
      responses: {
        200: json('Turn page', object({ turns: itemList('SessionHistoryTurn'), ...historyPageFields })),
        ...errors,
      },
    },
    post: {
      ...submit('continueHobgoblinAgentSession', 'Send a structured follow-up to the session', 'SubmitAgentTurn'),
      parameters: [sessionId],
    },
  },
  '/sessions/{sessionId}/messages': {
    parameters: historyParams,
    get: {
      operationId: 'listHobgoblinSessionMessages',
      summary: 'Read a page of complete structured messages',
      responses: {
        200: json('Message page', object({ messages: itemList('SessionHistoryMessage'), ...historyPageFields })),
        ...errors,
      },
    },
  },
  '/terminal-records/{terminalId}/session': {
    parameters: [pathParameter('terminalId', { type: 'string' })],
    get: {
      operationId: 'readHobgoblinTerminalSessionLink',
      summary: 'Read the AI session linked to the current terminal execution',
      responses: { 200: json('Linked session', object(agentSummary)), ...errors },
    },
    post: {
      operationId: 'attachHobgoblinTerminalSession',
      summary: 'Manually associate an AI session with the current terminal execution',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: object({ provider, providerSessionId: uuid }, ['provider']),
          },
        },
      },
      responses: { 200: json('Linked session', object(agentSummary)), ...submitErrors },
    },
  },
  '/sessions/{sessionId}/control': {
    parameters: [sessionId],
    get: {
      operationId: 'readHobgoblinSessionControl',
      summary: 'Read the current linked terminal controller and presence',
      responses: {
        200: json(
          'Terminal presence',
          object({
            revision: agentSummary.revision,
            terminalId: { type: 'string' },
            executionId: uuid,
            controller: { enum: ['desktop', 'api', null] },
            connected: { type: 'boolean' },
            expiresAt: { ...date, type: ['string', 'null'] },
          }),
        ),
        ...errors,
        409: sessionControlConflict,
      },
    },
    post: {
      ...nativeControl,
      deprecated: false,
      responses: {
        ...nativeControl.responses,
        409: sessionControlConflict,
      },
    },
  },
  '/sessions/{sessionId}/input': {
    parameters: [sessionId],
    post: {
      ...nativeInput,
      requestBody: { required: true, content: { 'application/json': { schema: ref('SessionTerminalInput') } } },
      responses: {
        ...nativeInput.responses,
        409: sessionControlConflict,
      },
    },
  },
  '/sessions/{sessionId}/control/{controlId}': {
    parameters: [sessionId, pathParameter('controlId', uuid)],
    delete: {
      operationId: 'releaseHobgoblinSessionTerminalControl',
      summary: 'Release the linked terminal keyboard lease',
      responses: { 204: { description: 'Control released' }, ...errors, 409: sessionControlConflict },
    },
  },
  '/sessions/{sessionId}/turns/{requestId}': {
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
}

export const workspaceOpenApiComponents = {
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
    AgentSessionListItem: object({ ...agentSummary, worktreeName: { type: 'string' } }),
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
          description: 'Select background execution.',
        },
        provider,
        ...turnInput,
        worktreeId: opaqueId,
      },
      ['mode', 'provider', 'requestId', 'prompt'],
    ),
    SubmitAgentTurn: object({ ...turnInput, expectedRevision: agentSummary.revision }, Object.keys(turnInput)),
    SessionHistoryTurn: { allOf: [ref('AgentTurn'), object({ seq: { type: 'integer' } })] },
    SessionHistoryMessage: {
      allOf: [
        ref('Message'),
        object({
          seq: { type: 'integer' },
          turnRequestId: { ...uuid, type: ['string', 'null'] },
        }),
      ],
    },
    SessionTerminalInput: {
      allOf: [ref('WorkspaceTerminalInput'), object({ controlId: uuid }, [])],
    },
    CreateTerminal: object(terminalCreateFields, []),
    StartTerminalAgent: object({ ...terminalCreateFields, provider }, ['provider']),
    WorkspaceTerminalInput: object({
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
}

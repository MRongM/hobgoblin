import { conversationOpenApiDocument } from '#/server/routes/conversation-open-api-document.ts'
import { workspaceOpenApiComponents, workspaceOpenApiPaths } from '#/server/routes/workspace-open-api-document.ts'

const conversations = conversationOpenApiDocument.paths
const workspaceSessions = workspaceOpenApiPaths['/workspaces/{workspaceId}/sessions']
const terminalSessions = workspaceOpenApiPaths['/workspaces/{workspaceId}/terminal-sessions']
const turns = workspaceOpenApiPaths['/sessions/{sessionId}/turns']

export const museOpenApiDocument = {
  ...conversationOpenApiDocument,
  info: {
    ...conversationOpenApiDocument.info,
    title: 'Hobgoblin for Muse',
    description:
      'Use interactive terminal sessions by default for Codex and Claude. Start a background session only when the user explicitly asks for background execution.',
  },
  paths: {
    ...Object.fromEntries(
      Object.entries(workspaceOpenApiPaths).map(([path, operations]) => [`/muse${path}`, operations]),
    ),
    '/muse/workspaces/{workspaceId}/sessions': {
      ...workspaceSessions,
      get: {
        ...workspaceSessions.get,
        description:
          'Use open terminals for interactive work by default. Select a background session for follow-ups only when the user explicitly chooses it or has already asked to work in that session.',
      },
      post: {
        ...workspaceSessions.post,
        summary: 'Start a background Codex or Claude session only at the user’s explicit request',
        description:
          'Call this operation only when the user explicitly asks for background execution. Set mode to background for that request. Otherwise use startHobgoblinTerminalAgentSession to open an interactive terminal and send the prompt there.',
      },
    },
    '/muse/workspaces/{workspaceId}/terminal-sessions': {
      ...terminalSessions,
      post: {
        ...terminalSessions.post,
        summary: 'Start Codex or Claude in an interactive terminal (default)',
        description:
          'Use this operation by default to start a new AI session, including when the user provides a task or prompt. ' +
          terminalSessions.post.description,
      },
    },
    '/muse/sessions/{sessionId}/turns': {
      ...turns,
      post: {
        ...turns.post,
        description:
          'Use this for the background or connected native Codex session the user selected. For other terminal-linked sessions use the session input operation.',
      },
    },
    '/conversations': conversations['/conversations'],
    '/conversations/{conversationId}': {
      parameters: conversations['/conversations/{conversationId}'].parameters,
      get: conversations['/conversations/{conversationId}'].get,
    },
    '/conversations/{conversationId}/control': conversations['/conversations/{conversationId}/control'],
    '/conversations/{conversationId}/control/{controlId}/input':
      conversations['/conversations/{conversationId}/control/{controlId}/input'],
    '/conversations/{conversationId}/control/{controlId}':
      conversations['/conversations/{conversationId}/control/{controlId}'],
  },
  components: workspaceOpenApiComponents,
}

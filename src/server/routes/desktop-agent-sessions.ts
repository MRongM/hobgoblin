import type { Context, MiddlewareHandler } from 'hono'
import * as v from 'valibot'
import type { AgentOpenApiRuntime } from '#/server/modules/agent-open-api-runtime.ts'
import { createBackgroundAgentRoutes } from '#/server/routes/background-agent-sessions.ts'
import { errorResponse, limitBody, readBody } from '#/server/routes/open-api-http.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { AGENT_SESSIONS_PREFIX } from '#/shared/agent-sessions.ts'
import { isValidBranch, isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import { isValidTerminalAttachmentId, isValidTerminalSize } from '#/shared/terminal.ts'

const threadIdSchema = v.pipe(v.string(), v.uuid())
const resumeSchema = v.object({
  projectRoot: v.custom<string>(isValidRepoLocator),
  repoRoot: v.custom<string>(isValidRepoLocator),
  worktreePath: v.custom<string>(isValidCwd),
  branch: v.custom<string>((value) => value === '' || isValidBranch(value)),
  targetKind: v.optional(v.literal('branch-workspace')),
  branchWorkspaceId: v.optional(v.pipe(v.string(), v.maxLength(512))),
  attachmentId: v.pipe(
    v.string(),
    v.check((value: string) => isValidTerminalAttachmentId(value)),
  ),
  cols: v.number(),
  rows: v.number(),
})

function terminalLocation(c: Context) {
  const { projectRoot, worktreePath } = c.req.query()
  return isValidRepoLocator(projectRoot) && isValidCwd(worktreePath) ? { projectRoot, worktreePath } : null
}

export function createDesktopAgentRoutes(
  agents: AgentOpenApiRuntime,
  authorize: MiddlewareHandler,
  terminalHost: Pick<ServerTerminalHost, 'create' | 'listSessions' | 'openApiControl'>,
  clientId: string,
) {
  const routes = createBackgroundAgentRoutes({
    agents,
    authorize,
    prefix: AGENT_SESSIONS_PREFIX,
    callControl: terminalHost.openApiControl?.bind(terminalHost, clientId),
  })
  routes.get('/terminal-entries', authorize, async (c) => {
    const location = terminalLocation(c)
    if (!location) return errorResponse(c, 400, 'invalid_request', 'Invalid terminal location')
    return c.json({ sessions: await agents.listSessionsForTerminal(location.projectRoot, location.worktreePath) })
  })
  routes.post('/sessions/:sessionId/terminal', authorize, limitBody, async (c) => {
    const input = await readBody(c, resumeSchema)
    if (input instanceof Response) return input
    const { projectRoot, ...target } = input
    const id = c.req.param('sessionId')
    if (!v.is(threadIdSchema, id) || !isValidTerminalSize(target.cols, target.rows)) {
      return errorResponse(c, 400, 'invalid_request', 'Invalid session ID or terminal size')
    }
    const result = await agents.resumeInTerminal(
      id,
      projectRoot,
      target.worktreePath,
      async (codexResumeId) =>
        terminalHost.create(clientId, {
          ...target,
          kind: 'additional',
          launchMode: 'native',
          agentProvider: 'codex',
          codexResumeId,
        }),
      async () => terminalHost.listSessions(clientId, target.repoRoot),
    )
    if (result.ok) return c.json(result.terminal)
    if (result.error === 'session_not_found') return errorResponse(c, 404, result.error, 'Session not found')
    if (result.error === 'session_working') return errorResponse(c, 409, result.error, 'The session is working')
    return errorResponse(c, 503, result.error, 'Unable to open the Codex terminal')
  })
  routes.get('/codex-history', authorize, async (c) => {
    const location = terminalLocation(c)
    if (!location) return errorResponse(c, 400, 'invalid_request', 'Invalid terminal location')
    try {
      const sessions = await agents.listCodexImportCandidates(
        location.projectRoot,
        location.worktreePath,
        c.req.raw.signal,
      )
      return sessions ? c.json({ sessions }) : errorResponse(c, 404, 'worktree_not_found', 'Work location not found')
    } catch {
      return errorResponse(c, 503, 'history_unavailable', 'Unable to read the Codex session history')
    }
  })
  routes.post('/codex-history/:threadId', authorize, async (c) => {
    const location = terminalLocation(c)
    const threadId = c.req.param('threadId')
    if (!location || !v.is(threadIdSchema, threadId)) {
      return errorResponse(c, 400, 'invalid_request', 'Invalid terminal location or Codex session')
    }
    try {
      const session = await agents.importCodexSession(
        location.projectRoot,
        location.worktreePath,
        threadId,
        c.req.raw.signal,
      )
      return session ? c.json(session) : errorResponse(c, 404, 'session_not_found', 'Codex session is unavailable')
    } catch {
      return errorResponse(c, 503, 'history_unavailable', 'Unable to import the Codex session history')
    }
  })
  return routes
}

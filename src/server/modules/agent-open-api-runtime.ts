import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { runAgentProviderTurn } from '#/server/modules/agent-open-api-provider.ts'
import type {
  AgentSessionRecord,
  AgentTurnInput,
  AgentTurnRecord,
  CreateAgentSession,
} from '#/server/modules/agent-open-api-model.ts'
import type { ConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import { getRepositoryWorktrees, probeRepository } from '#/server/modules/repo-read-paths.ts'
import { getServerSessionState } from '#/server/modules/settings-source.ts'
import { serverLogger } from '#/server/logger.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'

function publicId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

async function readWorkspaces() {
  const session = await getServerSessionState()
  return session.openRepos.map((repo) => {
    const repoId = repo.id
    const cwd = repo.kind === 'local' ? repoId : repo.ref.remotePath
    return {
      id: publicId(repoId),
      repoId,
      cwd,
      name: repo.kind === 'local' ? path.basename(repoId) || repoId : repo.ref.displayName,
      kind: repo.kind,
      active: repoId === (session.activeProject ?? session.activeRepo),
    }
  })
}

async function readWorktrees(workspace: Awaited<ReturnType<typeof readWorkspaces>>[number], signal?: AbortSignal) {
  if (signal?.aborted) return []
  if (workspace.kind === 'local') {
    // Git returns a canonical path for its root, so probe the resolved directory.
    const directory = await realpath(workspace.cwd).catch(() => workspace.cwd)
    const probe = await probeRepository(directory)
    if (!probe.ok || probe.isGitRepo === false || !probe.root || path.relative(directory, probe.root) !== '') return []
  }
  const worktrees = await getRepositoryWorktrees(workspace.repoId, signal)
  return worktrees
    .filter((tree) => !tree.isBare && !tree.isPrunable)
    .map((tree) => ({
      id: publicId(`${workspace.repoId}\0${tree.path}`),
      cwd: tree.path,
      name: workspace.kind === 'local' ? path.basename(tree.path) : path.posix.basename(tree.path),
      branch: tree.branch ?? null,
      primary: tree.isPrimary,
    }))
}

function primaryWorktree(workspace: Awaited<ReturnType<typeof readWorkspaces>>[number]) {
  return {
    id: publicId(`${workspace.repoId}\0${workspace.cwd}`),
    cwd: workspace.cwd,
    name: workspace.name,
    branch: null,
    primary: true,
  }
}

type SubmissionError =
  | 'workspace_not_found'
  | 'worktree_not_found'
  | 'session_not_found'
  | 'session_closed'
  | 'session_working'
  | 'request_conflict'
  | 'unavailable'
type Submission = { ok: false; error: SubmissionError } | { ok: true; sessionId: string; requestId: string }

export function createAgentOpenApiRuntime(store: ConversationOpenApiStore, runProvider = runAgentProviderTurn) {
  const work = new Map<string, { requestId: string; controller: AbortController }>()
  const lifetime = new AbortController()

  function projectTurn(turn: AgentTurnRecord | null) {
    if (turn?.state === 'working' && work.get(turn.sessionId)?.requestId !== turn.requestId) {
      return { ...turn, state: 'failed' as const, error: 'interrupted' as const }
    }
    return turn
  }

  function projectSession(session: AgentSessionRecord) {
    const latestTurn = projectTurn(store.getLatestAgentTurn(session.id))
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      worktreeId: session.worktreeId,
      provider: session.provider,
      status: session.closedAt
        ? 'closed'
        : latestTurn?.state === 'working'
          ? 'working'
          : latestTurn?.state === 'failed'
            ? 'failed'
            : 'ready',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      latestTurn,
    }
  }

  function queue(session: AgentSessionRecord, input: AgentTurnInput): Submission {
    const controller = new AbortController()
    const signal = AbortSignal.any([lifetime.signal, controller.signal])
    work.set(session.id, { requestId: input.requestId, controller })
    void (async () => {
      try {
        const result = await runProvider({
          provider: session.provider,
          repoId: session.repoId,
          cwd: session.cwd,
          providerSessionId: session.providerSessionId,
          prompt: input.prompt,
          signal,
        }).catch(() => ({ ok: false, error: 'provider_failed' }) as const)
        if (!signal.aborted) store.finishAgentTurn(session.id, input.requestId, result)
      } catch {
        serverLogger.error({ sessionId: session.id }, 'Unable to save the agent turn result')
      } finally {
        work.delete(session.id)
      }
    })()
    return { ok: true, sessionId: session.id, requestId: input.requestId }
  }

  function replay(input: AgentTurnInput, sessionId: string): Submission | undefined {
    const turn = store.getAgentTurn(input.requestId)
    if (!turn) return undefined
    return turn.sessionId === sessionId && turn.prompt === input.prompt
      ? { ok: true, sessionId, requestId: input.requestId }
      : { ok: false, error: 'request_conflict' }
  }

  return {
    shutdown() {
      lifetime.abort()
    },
    isWorking(id: string) {
      return work.has(id)
    },
    async listWorkspaces() {
      return (await readWorkspaces()).map(({ id, name, kind, active }) => ({ id, name, kind, active }))
    },
    async workspace(id: string) {
      return (await readWorkspaces()).find((item) => item.id === id)
    },
    async terminalWorktree(
      workspace: Awaited<ReturnType<typeof readWorkspaces>>[number],
      worktreeId: string | undefined,
      signal: AbortSignal,
    ) {
      const trees = await readWorktrees(workspace, signal)
      const targets = trees.length ? trees : [primaryWorktree(workspace)]
      const tree = worktreeId ? targets.find((item) => item.id === worktreeId) : targets.find((item) => item.primary)
      if (!tree) return null
      return {
        worktreePath: tree.cwd,
        branch: tree.branch ?? (!trees.length && workspace.kind === 'local' ? NON_GIT_WORKSPACE_TERMINAL_BRANCH : ''),
      }
    },
    async listWorktrees(id: string, signal: AbortSignal) {
      const workspace = await this.workspace(id)
      if (!workspace) return null
      const trees = await readWorktrees(workspace, signal)
      return (trees.length ? trees : [primaryWorktree(workspace)]).map(({ id, name, branch, primary }) => ({
        id,
        name,
        branch,
        primary,
      }))
    },
    listSessions(workspaceId: string) {
      return store.agentSessions(workspaceId).map(projectSession)
    },
    getSession(id: string) {
      const session = store.getAgentSession(id)
      const conversation = session && store.getConversation(id)
      return session && conversation ? { ...projectSession(session), messages: conversation.messages } : null
    },
    getTurn(sessionId: string, requestId: string) {
      const turn = store.getAgentTurn(requestId)
      return turn?.sessionId === sessionId ? projectTurn(turn) : null
    },
    cancelTurn(sessionId: string, requestId: string) {
      const turn = store.getAgentTurn(requestId)
      if (turn?.sessionId !== sessionId) return { ok: false, error: 'turn_not_found' } as const
      if (turn.state === 'cancelled') return { ok: true, turn } as const
      const active = work.get(sessionId)
      if (active?.requestId !== requestId || !store.cancelAgentTurn(sessionId, requestId)) {
        return { ok: false, error: 'turn_not_working' } as const
      }
      active.controller.abort()
      return { ok: true, turn: store.getAgentTurn(requestId)! } as const
    },
    closeSession(sessionId: string): boolean {
      if (!store.closeAgentSession(sessionId)) return false
      work.get(sessionId)?.controller.abort()
      return true
    },
    async create(workspaceId: string, input: CreateAgentSession): Promise<Submission> {
      const id = input.requestId
      const workspace = await this.workspace(workspaceId)
      if (!workspace) return { ok: false, error: 'workspace_not_found' }
      const root = primaryWorktree(workspace)
      const tree =
        !input.worktreeId || input.worktreeId === root.id
          ? root
          : (await readWorktrees(workspace, lifetime.signal)).find((entry) => entry.id === input.worktreeId)
      if (!tree) return { ok: false, error: 'worktree_not_found' }
      if (lifetime.signal.aborted) return { ok: false, error: 'unavailable' }
      const existing = store.getAgentSession(id)
      if (
        existing &&
        (existing.workspaceId !== workspaceId ||
          existing.provider !== input.provider ||
          existing.worktreeId !== tree.id)
      ) {
        return { ok: false, error: 'request_conflict' }
      }
      if (existing?.closedAt) return { ok: false, error: 'session_closed' }
      const previous = replay(input, id)
      if (previous) return previous
      if (store.getConversationSummary(id)) return { ok: false, error: 'request_conflict' }
      return queue(
        store.beginAgentTurn(id, input, {
          workspaceId,
          worktreeId: tree.id,
          repoId: workspace.repoId,
          cwd: tree.cwd,
          provider: input.provider,
        }),
        input,
      )
    },
    async continue(sessionId: string, input: AgentTurnInput): Promise<Submission> {
      const session = store.getAgentSession(sessionId)
      if (!session) return { ok: false, error: 'session_not_found' }
      if (session.closedAt) return { ok: false, error: 'session_closed' }
      const previous = replay(input, sessionId)
      if (previous) return previous
      const workspace = await this.workspace(session.workspaceId)
      if (!workspace) return { ok: false, error: 'workspace_not_found' }
      if (session.cwd !== workspace.cwd) {
        const trees = await readWorktrees(workspace, lifetime.signal)
        if (!trees.some((tree) => tree.id === session.worktreeId)) return { ok: false, error: 'worktree_not_found' }
      }
      if (lifetime.signal.aborted) return { ok: false, error: 'unavailable' }
      const current = store.getAgentSession(sessionId)
      if (!current) return { ok: false, error: 'session_not_found' }
      if (current.closedAt) return { ok: false, error: 'session_closed' }
      const duplicate = replay(input, sessionId)
      if (duplicate) return duplicate
      if (work.has(sessionId)) return { ok: false, error: 'session_working' }
      return queue(store.beginAgentTurn(sessionId, input), input)
    },
  }
}

export type AgentOpenApiRuntime = ReturnType<typeof createAgentOpenApiRuntime>

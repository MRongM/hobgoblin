import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import pLimit from 'p-limit'
import { runAgentProviderTurn } from '#/server/modules/agent-open-api-provider.ts'
import type {
  AgentSessionCursor,
  AgentSessionRecord,
  AgentTurnInput,
  AgentTurnRecord,
  CreateAgentSession,
  TerminalAgentLinkSource,
} from '#/server/modules/agent-open-api-model.ts'
import { HISTORY_RETENTION_MS, type ConversationOpenApiStore } from '#/server/modules/conversation-open-api-source.ts'
import type { ConversationDeleteMode } from '#/server/modules/conversation-open-api-model.ts'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'
import { workspacePublicId } from '#/server/modules/workspace-public-id.ts'
import { getRepositoryWorktrees, probeRepository } from '#/server/modules/repo-read-paths.ts'
import { getServerSessionState } from '#/server/modules/settings-source.ts'
import { serverLogger } from '#/server/logger.ts'
import {
  NON_GIT_WORKSPACE_TERMINAL_BRANCH,
  type TerminalCatalogMutationResult,
  type TerminalSessionSummary,
} from '#/shared/terminal.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import type { AgentSessionSummary, AgentTargetCatalog, AgentWorktree } from '#/shared/agent-sessions.ts'
import { codexSessionHistory } from '#/server/modules/codex-session-history.ts'
import { codexLiveSessions, type CodexLiveThread } from '#/server/modules/codex-live-session.ts'
import type { TerminalLifecycleEvent } from '#/server/terminal/terminal-registry-model.ts'
import type { CallTerminalControl } from '#/server/terminal/terminal-open-api-control.ts'

async function readWorkspaces() {
  const session = await getServerSessionState()
  return session.openRepos.map((repo) => {
    const repoId = repo.id
    const cwd = repo.kind === 'local' ? repoId : repo.ref.remotePath
    return {
      id: workspacePublicId(repoId),
      repoId,
      cwd,
      name: repo.kind === 'local' ? path.basename(repoId) || repoId : repo.ref.displayName,
      kind: repo.kind,
      active: repoId === (session.activeProject ?? session.activeRepo),
    }
  })
}

type AgentWorkspace = Awaited<ReturnType<typeof readWorkspaces>>[number]
type AgentTarget = AgentWorktree & { cwd: string }

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
      id: workspacePublicId(`${workspace.repoId}\0${tree.path}`),
      cwd: tree.path,
      name: workspace.kind === 'local' ? path.basename(tree.path) : path.posix.basename(tree.path),
      branch: tree.branch ?? null,
      primary: tree.isPrimary,
    }))
}

function primaryWorktree(workspace: Awaited<ReturnType<typeof readWorkspaces>>[number]) {
  return {
    id: workspacePublicId(`${workspace.repoId}\0${workspace.cwd}`),
    cwd: workspace.cwd,
    name: workspace.name,
    branch: null,
    primary: true,
  }
}

async function readSubworkspaceTargets(workspace: AgentWorkspace, signal?: AbortSignal) {
  const catalog = await readBranchWorkspaceCatalog(workspace.repoId, signal)
  if (catalog.kind !== 'ready') return []
  return catalog.manifests.map((manifest) => {
    const present = catalog.discoveredDirectories?.some((directory) => directory.path === manifest.path)
    const root: AgentTarget | null = present
      ? {
          id: workspacePublicId(`${workspace.repoId}\0${manifest.path}`),
          cwd: manifest.path,
          name: manifest.directoryName,
          branch: manifest.repositories.find((member) => member.worktreePath === manifest.path)?.currentBranch ?? null,
          primary: false,
        }
      : null
    const worktrees: AgentTarget[] = manifest.repositories
      .filter((member) => member.worktreePath !== manifest.path)
      .map((member) => ({
        id: workspacePublicId(`${workspace.repoId}\0${member.worktreePath}`),
        cwd: member.worktreePath,
        name: member.repositoryName,
        branch: member.currentBranch ?? null,
        primary: false,
      }))
    return { id: manifest.id, name: manifest.directoryName, root, worktrees }
  })
}

function publicWorktree({ id, name, branch, primary }: AgentTarget): AgentWorktree {
  return { id, name, branch, primary }
}

async function findSessionTarget(workspace: AgentWorkspace, id: string, signal: AbortSignal) {
  const normalTarget = (await readWorktrees(workspace, signal)).find((tree) => tree.id === id)
  if (normalTarget) return normalTarget
  for (const group of await readSubworkspaceTargets(workspace, signal)) {
    if (group.root?.id === id) return group.root
    const worktree = group.worktrees.find((tree) => tree.id === id)
    if (worktree) return worktree
  }
  return null
}

async function findLocalSessionLocation(projectRoot: string, worktreePath: string, signal: AbortSignal) {
  const workspace = (await readWorkspaces()).find((item) => item.repoId === projectRoot && item.kind === 'local')
  if (!workspace) return null
  const canonicalPath = await realpath(worktreePath).catch(() => null)
  if (!canonicalPath) return null
  const matchesPath = ({ cwd }: AgentTarget) => cwd === worktreePath || cwd === canonicalPath
  const primary = primaryWorktree(workspace)
  const target = matchesPath(primary)
    ? primary
    : ((await readWorktrees(workspace, signal)).find(matchesPath) ??
      (await readSubworkspaceTargets(workspace, signal))
        .flatMap((group) => (group.root ? [group.root, ...group.worktrees] : group.worktrees))
        .find(matchesPath))
  return target && { workspace, target, canonicalPath }
}

type SubmissionError =
  | 'workspace_not_found'
  | 'worktree_not_found'
  | 'session_not_found'
  | 'session_closed'
  | 'session_working'
  | 'desktop_terminal_active'
  | 'native_terminal_unavailable'
  | 'native_delivery_unknown'
  | 'native_turn_rejected'
  | 'terminal_input_required'
  | 'revision_conflict'
  | 'control_in_use'
  | 'interactive_input_active'
  | 'request_conflict'
  | 'unavailable'
type Submission =
  | { ok: false; error: SubmissionError; controller?: 'desktop' | 'api' }
  | { ok: true; sessionId: string; requestId: string }

type TerminalResumeResult =
  | { ok: false; error: 'session_not_found' | 'session_working' | 'terminal_unavailable' }
  | { ok: true; terminal: Extract<TerminalCatalogMutationResult, { ok: true }> }

interface NativeTerminalSession {
  opening: Promise<TerminalResumeResult>
  timer?: ReturnType<typeof setInterval>
}

type CodexHistory = Pick<typeof codexSessionHistory, 'list' | 'read'> &
  Partial<Pick<typeof codexSessionHistory, 'listNative'>>

interface NativeWorkspaceSync {
  nextScan: number
  pending?: Promise<void>
  live: Map<string, string>
  historyVersions: Map<string, string>
}

type OpenAgentTerminal = TerminalLifecycleEvent & { repoId: string }

export function createAgentOpenApiRuntime(
  store: ConversationOpenApiStore,
  runProvider = runAgentProviderTurn,
  codexHistory: CodexHistory = codexSessionHistory,
  liveCodex = codexLiveSessions,
) {
  const work = new Map<string, { requestId: string; controller: AbortController }>()
  const native = new Map<string, NativeTerminalSession>()
  const terminals = new Map<string, OpenAgentTerminal>()
  const nativeWorkspaces = new Map<string, NativeWorkspaceSync>()
  const nativeHistoryReads = new Map<string, Promise<void>>()
  const synchronizeWorkspaceLimit = pLimit(4)
  const nativeSends = new Set<string>()
  const lifetime = new AbortController()
  let nativeSweep: ReturnType<typeof setInterval> | undefined
  let sweeping = false

  function liveStatus(session: AgentSessionRecord) {
    return session.providerSessionId && nativeWorkspaces.get(session.workspaceId)?.live.get(session.providerSessionId)
  }

  async function syncNativeWorkspace(workspace: AgentWorkspace, state: NativeWorkspaceSync) {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(6_000)])
    const terminals = await liveCodex.list(signal).catch(() => null)
    const [trees, groups] = await Promise.all([
      readWorktrees(workspace, signal),
      readSubworkspaceTargets(workspace, signal),
    ])
    const targets = [
      ...trees,
      ...groups.flatMap((group) => [...group.worktrees, ...(group.root ? [group.root] : [])]),
      primaryWorktree(workspace),
    ]
    const locations = new Map<string, AgentTarget>()
    for (const target of targets) {
      const canonical = await realpath(target.cwd).catch(() => null)
      if (canonical) locations.set(canonical, target)
    }
    const persisted = await codexHistory
      .listNative?.([...locations.keys()], Math.floor((Date.now() - HISTORY_RETENTION_MS) / 1_000), signal)
      .catch(() => [])
    if (signal.aborted) return
    const candidates = new Map<string, Pick<CodexLiveThread, 'id' | 'cwd' | 'path' | 'updatedAt'>>(
      (persisted ?? []).map((thread) => [thread.id, thread]),
    )
    const live = new Map<string, string>()
    for (const thread of terminals ?? []) {
      if (!locations.has(thread.cwd) && !locations.has(await realpath(thread.cwd).catch(() => ''))) continue
      candidates.set(thread.id, thread)
      live.set(thread.id, thread.status.type)
    }
    state.live = live
    if (persisted) {
      for (const id of state.historyVersions.keys()) if (!candidates.has(id)) state.historyVersions.delete(id)
    }

    const hidden = store.listHiddenCodexThreads(workspace.id)
    const histories = [...candidates.values()]
      .filter((thread) => !hidden.has(thread.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    let reads = 0
    for (const thread of histories) {
      if (signal.aborted || reads >= 6) break
      const canonical = await realpath(thread.cwd).catch(() => null)
      const target = canonical && locations.get(canonical)
      if (!canonical || !target) continue
      const file = thread.path ? await stat(thread.path).catch(() => null) : null
      const version = file ? `${file.size}:${file.mtimeMs}` : String(thread.updatedAt)
      if (state.historyVersions.get(thread.id) === version) continue
      reads++
      try {
        const history = await codexHistory.read(thread.id, canonical, signal)
        if (
          signal.aborted ||
          history.thread.id !== thread.id ||
          (await realpath(history.thread.cwd).catch(() => null)) !== canonical
        )
          continue
        const recorded = store.importCodexSession(
          { workspaceId: workspace.id, worktreeId: target.id, repoId: workspace.repoId, cwd: target.cwd },
          thread.id,
          history.turns,
          history.thread.updatedAt,
          true,
        )
        if (recorded || !live.has(thread.id)) state.historyVersions.set(thread.id, version)
      } catch {
        // The provider may be between writing a turn and publishing its history. Retry on a later poll.
      }
    }
  }

  async function synchronizeNativeWorkspace(workspace: AgentWorkspace, refresh = false) {
    if (workspace.kind !== 'local' || lifetime.signal.aborted || process.platform === 'win32') return
    nativeSweep ??= setInterval(() => void sweepNativeWorkspaces(), 5_000).unref()
    let state = nativeWorkspaces.get(workspace.id)
    if (!state) {
      state = { nextScan: 0, live: new Map(), historyVersions: new Map() }
      nativeWorkspaces.set(workspace.id, state)
    }
    if (state.pending) return await state.pending
    if (!refresh && Date.now() < state.nextScan) return
    const current = state
    current.pending = syncNativeWorkspace(workspace, current)
      .catch((error: unknown) => {
        if (!lifetime.signal.aborted) serverLogger.debug({ err: error }, 'Unable to synchronize native Codex threads')
      })
      .finally(() => {
        current.nextScan = Date.now() + 2_000
        current.pending = undefined
      })
    await current.pending
  }

  async function readNativeSessionHistory(session: AgentSessionRecord, threadId: string) {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(6_000)])
    const location = await findLocalSessionLocation(session.repoId, session.cwd, signal)
    if (!location || location.workspace.id !== session.workspaceId || location.target.id !== session.worktreeId) return
    const { canonicalPath } = location
    const { thread, turns } = await codexHistory.read(threadId, canonicalPath, signal)
    if (thread.id !== threadId || (await realpath(thread.cwd).catch(() => null)) !== canonicalPath || signal.aborted)
      return
    const current = store.getAgentSession(session.id)
    if (current?.providerSessionId === threadId && current.nativeCodex && !current.closedAt) {
      store.importCodexSession(session, threadId, turns, thread.updatedAt, true)
    }
  }

  async function sweepNativeWorkspaces() {
    if (sweeping || lifetime.signal.aborted) return
    sweeping = true
    try {
      const workspaces = await readWorkspaces()
      const open = new Set(workspaces.map((workspace) => workspace.id))
      for (const id of nativeWorkspaces.keys()) if (!open.has(id)) nativeWorkspaces.delete(id)
      for (const workspace of workspaces) {
        if (nativeWorkspaces.has(workspace.id)) await synchronizeNativeWorkspace(workspace)
      }
    } catch (error) {
      if (!lifetime.signal.aborted) serverLogger.debug({ err: error }, 'Unable to poll native Codex sessions')
    } finally {
      sweeping = false
    }
  }

  function projectTurn(turn: AgentTurnRecord | null) {
    if (turn?.state === 'working' && work.get(turn.sessionId)?.requestId !== turn.requestId) {
      return { ...turn, state: 'failed' as const, error: 'interrupted' as const }
    }
    return turn
  }

  function projectSession(session: AgentSessionRecord): AgentSessionSummary {
    const latestTurn = projectTurn(store.getLatestAgentTurn(session.id))
    const status = liveStatus(session)
    const terminalLink =
      session.terminalId && session.terminalExecutionId && session.terminalLinkSource
        ? {
            terminalId: session.terminalId,
            executionId: session.terminalExecutionId,
            source: session.terminalLinkSource,
          }
        : null
    const terminalActive = native.has(session.id) || Boolean(status) || Boolean(terminalFor(session))
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      worktreeId: session.worktreeId,
      provider: session.provider,
      revision: session.revision,
      mode: terminalLink ? 'terminal' : session.nativeCodex ? 'native' : 'background',
      terminalLink,
      status: session.closedAt
        ? 'closed'
        : status === 'active' || nativeSends.has(session.id) || latestTurn?.state === 'working'
          ? 'working'
          : latestTurn?.state === 'failed'
            ? 'failed'
            : 'ready',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      terminalActive,
      structuredWritable:
        !session.closedAt &&
        (session.nativeCodex
          ? status === 'idle' && !nativeSends.has(session.id)
          : !terminalActive && (!terminalLink || Boolean(session.providerSessionId))),
      ...(session.nativeCodex
        ? { nativeCodex: true, terminalWritable: status === 'idle' && !nativeSends.has(session.id) }
        : {}),
      latestTurn,
    }
  }

  function terminalFor(session: AgentSessionRecord) {
    if (!session.terminalId) return undefined
    const terminal = terminals.get(session.terminalId)
    return terminal?.executionId === session.terminalExecutionId ? terminal : undefined
  }

  function bindTerminal(
    terminal: OpenAgentTerminal,
    provider: CreateAgentSession['provider'],
    source: TerminalAgentLinkSource,
    sessionId?: string,
  ) {
    return store.bindTerminalAgent(
      terminal,
      { terminalId: terminal.id, executionId: terminal.executionId, source },
      provider,
      sessionId,
    )
  }

  function revisionChanged(session: AgentSessionRecord, input: AgentTurnInput) {
    return input.expectedRevision !== undefined && input.expectedRevision !== session.revision
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
    if (store.getNativeCodexDelivery(input.requestId)) return { ok: false, error: 'request_conflict' }
    const turn = store.getAgentTurn(input.requestId)
    if (!turn) return undefined
    return turn.sessionId === sessionId && turn.prompt === input.prompt
      ? { ok: true, sessionId, requestId: input.requestId }
      : { ok: false, error: 'request_conflict' }
  }

  function releaseNative(id: string, lease: NativeTerminalSession) {
    if (native.get(id) !== lease) return
    clearInterval(lease.timer)
    native.delete(id)
  }

  async function openNativeTerminal(
    session: AgentSessionRecord,
    providerSessionId: string,
    location: NonNullable<Awaited<ReturnType<typeof findLocalSessionLocation>>>,
    launch: (providerSessionId: string) => Promise<TerminalCatalogMutationResult>,
    list: () => Promise<TerminalSessionSummary[]>,
    lease: NativeTerminalSession,
  ): Promise<TerminalResumeResult> {
    const readHistory = async () => {
      const history = await codexHistory.read(providerSessionId, location.canonicalPath, lifetime.signal)
      if (
        history.thread.id !== providerSessionId ||
        (await realpath(history.thread.cwd).catch(() => null)) !== location.canonicalPath
      )
        throw new Error('Unexpected Codex session location')
      return history
    }
    try {
      const baseline = await readHistory()
      if (lifetime.signal.aborted) return { ok: false, error: 'terminal_unavailable' }
      const terminal = await launch(providerSessionId)
      if (!terminal.ok || lifetime.signal.aborted) return { ok: false, error: 'terminal_unavailable' }
      const terminalId = terminal.sessionId
      const live = terminals.get(terminalId)
      if (live) bindTerminal(live, session.provider, 'explicit', session.id)
      const seen = new Set(baseline.turns.map((turn) => turn.id))
      const historyPath = baseline.thread.path
      let lastReadVersion: string | undefined
      let refreshing = false
      async function refresh() {
        if (refreshing || lifetime.signal.aborted) return
        refreshing = true
        try {
          const phase = (await list()).find((item) => item.sessionId === terminalId)?.phase
          const exited = phase !== 'opening' && phase !== 'restarting' && phase !== 'open'
          const info = !exited && historyPath ? await stat(historyPath).catch(() => null) : null
          const version = info ? `${info.size}:${info.mtimeMs}` : undefined
          if (!exited && version !== undefined && version === lastReadVersion) return
          const { thread, turns } = await readHistory()
          if (lifetime.signal.aborted) return
          const added = turns.filter((turn) => !seen.has(turn.id))
          if (added.length) {
            store.appendCodexTerminalTurns(session.id, providerSessionId, added, thread.updatedAt)
            for (const turn of added) seen.add(turn.id)
          }
          lastReadVersion = version
          if (exited) releaseNative(session.id, lease)
        } catch {
          // Retry on the next tick, including the final sync after exit.
        } finally {
          refreshing = false
        }
      }
      lease.timer = setInterval(() => void refresh(), 2_000)
      lease.timer.unref()
      void refresh()
      return { ok: true, terminal }
    } catch {
      return { ok: false, error: 'terminal_unavailable' }
    }
  }

  return {
    shutdown() {
      lifetime.abort()
      clearInterval(nativeSweep)
      for (const [id, lease] of native) releaseNative(id, lease)
    },
    observeTerminal(event: TerminalLifecycleEvent, repoId: string) {
      if (event.phase !== 'open') {
        if (terminals.get(event.id)?.executionId === event.executionId) terminals.delete(event.id)
        return
      }
      const terminal = { ...event, repoId }
      terminals.set(event.id, terminal)
      const provider = event.agentProvider ?? event.detectedAgentProvider
      if (provider) bindTerminal(terminal, provider, event.agentProvider ? 'explicit' : 'detected')
    },
    terminalWorkerStopped() {
      terminals.clear()
    },
    terminalControlTarget(id: string) {
      const session = store.getAgentSession(id)
      return session && !session.closedAt ? terminalFor(session) : undefined
    },
    getTerminalSession(terminalId: string) {
      const terminal = terminals.get(terminalId)
      const session = terminal && store.getTerminalAgentSession(terminal.executionId)
      return session && !session.closedAt ? projectSession(session) : null
    },
    async attachTerminal(
      terminalId: string,
      provider: CreateAgentSession['provider'],
      threadId: string | undefined,
      signal: AbortSignal,
    ) {
      const terminal = terminals.get(terminalId)
      if (!terminal) return { error: 'terminal_not_found' } as const
      if (terminal.agentProvider && terminal.agentProvider !== provider)
        return { error: 'terminal_link_conflict' } as const
      let sessionId: string | undefined
      if (threadId) {
        if (provider !== 'codex' || terminal.backend.transport !== 'local')
          return { error: 'history_unavailable' } as const
        try {
          const cwd = await realpath(terminal.cwd)
          const { thread, turns } = await codexHistory.read(threadId, cwd, signal)
          if (signal.aborted || thread.id !== threadId || (await realpath(thread.cwd)) !== cwd)
            return { error: 'history_unavailable' } as const
          if (terminals.get(terminalId)?.executionId !== terminal.executionId)
            return { error: 'terminal_link_conflict' } as const
          const imported = store.importCodexSession(terminal, threadId, turns, thread.updatedAt, true)
          if (!imported) return { error: 'terminal_link_conflict' } as const
          const original = terminalFor(imported)
          if (original && original.id !== terminalId) return { error: 'terminal_link_conflict' } as const
          sessionId = imported.id
        } catch {
          return { error: 'history_unavailable' } as const
        }
      }
      const session = bindTerminal(terminal, provider, 'manual', sessionId)
      return session ? ({ session: projectSession(session) } as const) : ({ error: 'terminal_link_conflict' } as const)
    },
    isWorking(id: string) {
      return work.has(id)
    },
    isTerminalActive(id: string) {
      const session = store.getAgentSession(id)
      return native.has(id) || nativeSends.has(id) || Boolean(session && (liveStatus(session) || terminalFor(session)))
    },
    deleteAgentConversation(id: string, mode: ConversationDeleteMode) {
      const session = store.getAgentSession(id)
      if (!session) return 'conversation_not_found' as const
      const lease = native.get(id)
      const running = work.get(id)
      const desktop = Boolean(session.nativeCodex || lease || liveStatus(session) || terminalFor(session))
      const removeDesktopCopy = mode === 'remove-desktop-copy'
      if (removeDesktopCopy) {
        if (!desktop) return 'session_changed' as const
        if (running || nativeSends.has(id) || (lease && !lease.timer)) return 'session_working' as const
      } else if (desktop) {
        return 'desktop_terminal_active' as const
      }
      if (!store.deleteConversation(id, removeDesktopCopy)) return 'conversation_not_found' as const
      running?.controller.abort()
      if (lease) releaseNative(id, lease)
      return 'deleted' as const
    },
    synchronizeNativeWorkspace,
    async synchronizeNativeSession(id: string) {
      const session = store.getAgentSession(id)
      if (!session?.nativeCodex || session.closedAt) return
      const workspace = await this.workspace(session.workspaceId)
      if (workspace) await synchronizeNativeWorkspace(workspace)
    },
    async refreshNativeSessionHistory(id: string) {
      if (process.platform === 'win32' || lifetime.signal.aborted) return
      const session = store.getAgentSession(id)
      if (!session?.nativeCodex || !session.providerSessionId || session.closedAt) return
      const pending = nativeHistoryReads.get(id)
      if (pending) return await pending
      const read = readNativeSessionHistory(session, session.providerSessionId)
        .catch((error: unknown) => {
          if (!lifetime.signal.aborted) serverLogger.debug({ err: error }, 'Unable to read Codex session history')
        })
        .finally(() => nativeHistoryReads.delete(id))
      nativeHistoryReads.set(id, read)
      await read
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
      return (trees.length ? trees : [primaryWorktree(workspace)]).map(publicWorktree)
    },
    async listTargets(id: string, signal: AbortSignal): Promise<AgentTargetCatalog | null> {
      const workspace = await this.workspace(id)
      if (!workspace) return null
      const [trees, subworkspaces] = await Promise.all([
        readWorktrees(workspace, signal),
        readSubworkspaceTargets(workspace, signal),
      ])
      return {
        worktrees: (trees.length ? trees : [primaryWorktree(workspace)]).map(publicWorktree),
        subworkspaces: subworkspaces.map(({ id, name, root, worktrees }) => ({
          id,
          name,
          root: root ? publicWorktree(root) : null,
          worktrees: worktrees.map(publicWorktree),
        })),
      }
    },
    listSessions(workspaceId: string) {
      return store.agentSessions(workspaceId).map(projectSession)
    },
    async listSessionPage({
      limit,
      cursor,
      search,
      discoverNative,
      refresh,
    }: {
      limit: number
      cursor?: AgentSessionCursor
      search: string
      discoverNative: boolean
      refresh: boolean
    }) {
      const workspaces = await readWorkspaces()
      if (discoverNative && !cursor && !search) {
        const toDiscover = refresh ? workspaces : workspaces.filter(({ id }) => !nativeWorkspaces.has(id))
        await Promise.all(
          toDiscover.map((workspace) =>
            synchronizeWorkspaceLimit(() => synchronizeNativeWorkspace(workspace, refresh)),
          ),
        )
      }
      const matchingWorkspaceIds = search
        ? workspaces.filter(({ name }) => name.toLowerCase().includes(search.toLowerCase())).map(({ id }) => id)
        : []
      const records = store.agentSessionsPage(
        workspaces.map(({ id }) => id),
        limit + 1,
        cursor,
        search,
        matchingWorkspaceIds,
      )
      const last = records.length > limit ? records[limit - 1] : undefined
      return {
        sessions: records.slice(0, limit).map((record) => {
          const { latestTurn, ...summary } = projectSession(record)
          const worktreeName = (isRemoteRepoId(record.repoId) ? path.posix : path).basename(record.cwd)
          return {
            ...summary,
            worktreeName,
            latestTurn: latestTurn
              ? { ...latestTurn, prompt: latestTurn.prompt.trimStart().split('\n', 1)[0]!.trimEnd().slice(0, 80) }
              : null,
          }
        }),
        workspaces: workspaces.map(({ id, name, kind, active }) => ({ id, name, kind, active })),
        next: last ? { updatedAt: last.updatedAt, id: last.id } : null,
      }
    },
    async listSessionsForTerminal(projectRoot: string, worktreePath: string) {
      const sessions = store.agentSessions(workspacePublicId(projectRoot))
      if (sessions.length === 0) return []
      const canonicalPath = isRemoteRepoId(projectRoot)
        ? worktreePath
        : await realpath(worktreePath).catch(() => worktreePath)
      return sessions
        .filter((session) => session.cwd === worktreePath || session.cwd === canonicalPath)
        .map((session) => ({
          ...projectSession(session),
          canResumeInTerminal:
            process.platform !== 'win32' &&
            !isRemoteRepoId(projectRoot) &&
            session.provider === 'codex' &&
            !!session.providerSessionId &&
            !session.closedAt,
        }))
    },
    async resumeInTerminal(
      id: string,
      projectRoot: string,
      worktreePath: string,
      launch: (providerSessionId: string) => Promise<TerminalCatalogMutationResult>,
      list: () => Promise<TerminalSessionSummary[]>,
    ): Promise<TerminalResumeResult> {
      const session = store.getAgentSession(id)
      if (!session || session.repoId !== projectRoot || session.closedAt) {
        return { ok: false, error: 'session_not_found' }
      }
      const { providerSessionId } = session
      if (!providerSessionId || session.provider !== 'codex' || process.platform === 'win32') {
        return { ok: false, error: 'terminal_unavailable' }
      }
      const location = await findLocalSessionLocation(projectRoot, worktreePath, lifetime.signal)
      if (!location || (await realpath(session.cwd).catch(() => null)) !== location.canonicalPath) {
        return { ok: false, error: 'session_not_found' }
      }
      const existing = native.get(id)
      if (existing) {
        const opened = await existing.opening
        if (!opened.ok) return opened
        const sessions = await list().catch(() => null)
        if (!sessions) return { ok: false, error: 'terminal_unavailable' }
        const terminal = sessions.find((entry) => entry.sessionId === opened.terminal.sessionId)
        if (!terminal || terminal.phase !== 'open') return { ok: false, error: 'session_working' }
        return { ok: true, terminal: { ...opened.terminal, action: 'reused', sessions } }
      }
      if (liveStatus(session) || terminalFor(session)) return { ok: false, error: 'session_working' }
      if (work.has(id)) return { ok: false, error: 'session_working' }
      const current = store.getAgentSession(id)
      if (lifetime.signal.aborted || !current || current.closedAt) {
        return { ok: false, error: 'session_not_found' }
      }
      if (current.providerSessionId !== providerSessionId) return { ok: false, error: 'terminal_unavailable' }
      const lease: NativeTerminalSession = {
        opening: Promise.resolve().then(() =>
          openNativeTerminal(current, providerSessionId, location, launch, list, lease),
        ),
      }
      native.set(id, lease)
      const result = await lease.opening
      if (!result.ok) releaseNative(id, lease)
      return result
    },
    async listCodexImportCandidates(projectRoot: string, worktreePath: string, signal: AbortSignal) {
      const location = await findLocalSessionLocation(projectRoot, worktreePath, signal)
      if (!location) return null
      const threads = await codexHistory.list(location.canonicalPath, signal)
      return threads.map(({ id, name, preview, updatedAt }) => ({
        id,
        title: (name || preview).split('\n')[0] || 'Codex',
        updatedAt: new Date(updatedAt * 1_000).toISOString(),
      }))
    },
    async importCodexSession(projectRoot: string, worktreePath: string, threadId: string, signal: AbortSignal) {
      const location = await findLocalSessionLocation(projectRoot, worktreePath, signal)
      if (!location) return null
      const { thread, turns } = await codexHistory.read(threadId, location.canonicalPath, signal)
      if (thread.id !== threadId || (await realpath(thread.cwd).catch(() => null)) !== location.canonicalPath)
        return null
      const { workspace, target } = location
      if (signal.aborted) return null
      const tracked = store
        .agentSessions(workspace.id)
        .find((session) => session.providerSessionId === threadId && native.has(session.id))
      if (tracked) return projectSession(tracked)
      const imported = store.importCodexSession(
        { workspaceId: workspace.id, worktreeId: target.id, repoId: workspace.repoId, cwd: target.cwd },
        threadId,
        turns,
        thread.updatedAt,
      )
      return imported ? projectSession(imported) : null
    },
    getSession(id: string) {
      const session = store.getAgentSession(id)
      const conversation = session && store.getConversation(id, Boolean(session.nativeCodex))
      return session && conversation ? { ...projectSession(session), messages: conversation.messages } : null
    },
    getSessionStatus(id: string) {
      const session = store.getAgentSession(id)
      return session ? projectSession(session) : null
    },
    getSessionHistory(id: string, limit: number, before: number | undefined, kind: 'messages' | 'turns') {
      const session = store.getAgentSession(id)
      if (!session) return null
      const records =
        kind === 'messages'
          ? store.listAgentMessages(id, limit + 1, before)
          : store.listAgentTurns(id, limit + 1, before).map((turn) => ({ ...projectTurn(turn)!, seq: turn.seq }))
      const items = records.slice(0, limit)
      return {
        items: items.reverse(),
        revision: session.revision,
        nextCursor: records.length > limit ? (items[0]?.seq ?? null) : null,
      }
    },
    getTurn(sessionId: string, requestId: string) {
      const turn = store.getAgentTurn(requestId)
      if (turn?.sessionId === sessionId) return projectTurn(turn)
      const session = store.getAgentSession(sessionId)
      return session?.nativeCodex && session.providerSessionId
        ? store.readDeliveredCodexTurn(sessionId, session.providerSessionId, requestId)
        : null
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
          : await findSessionTarget(workspace, input.worktreeId, lifetime.signal)
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
      if (work.has(id)) return { ok: false, error: 'session_working' }
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
      if (revisionChanged(session, input)) return { ok: false, error: 'revision_conflict' }
      if (session.nativeCodex || native.has(sessionId) || liveStatus(session)) {
        return { ok: false, error: 'desktop_terminal_active' }
      }
      if (terminalFor(session) || (session.terminalExecutionId && !session.providerSessionId))
        return { ok: false, error: 'terminal_input_required' }
      const workspace = await this.workspace(session.workspaceId)
      if (!workspace) return { ok: false, error: 'workspace_not_found' }
      if (session.cwd !== workspace.cwd) {
        const tree = await findSessionTarget(workspace, session.worktreeId, lifetime.signal)
        if (!tree || tree.cwd !== session.cwd) return { ok: false, error: 'worktree_not_found' }
      }
      if (lifetime.signal.aborted) return { ok: false, error: 'unavailable' }
      const current = store.getAgentSession(sessionId)
      if (!current) return { ok: false, error: 'session_not_found' }
      if (current.closedAt) return { ok: false, error: 'session_closed' }
      const duplicate = replay(input, sessionId)
      if (duplicate) return duplicate
      if (revisionChanged(current, input)) return { ok: false, error: 'revision_conflict' }
      if (current.nativeCodex || native.has(sessionId) || liveStatus(current)) {
        return { ok: false, error: 'desktop_terminal_active' }
      }
      if (terminalFor(current) || (current.terminalExecutionId && !current.providerSessionId))
        return { ok: false, error: 'terminal_input_required' }
      if (work.has(sessionId)) return { ok: false, error: 'session_working' }
      return queue(store.beginAgentTurn(sessionId, input), input)
    },
    async sendToNativeTerminal(
      sessionId: string,
      input: AgentTurnInput,
      callControl?: CallTerminalControl,
    ): Promise<Submission> {
      const session = store.getAgentSession(sessionId)
      if (!session) return { ok: false, error: 'session_not_found' }
      if (session.closedAt) return { ok: false, error: 'session_closed' }
      if (!session.nativeCodex || !session.providerSessionId) return { ok: false, error: 'native_terminal_unavailable' }
      const existing = store.getNativeCodexDelivery(input.requestId)
      if (existing) {
        if (existing.sessionId !== sessionId || existing.prompt !== input.prompt) {
          return { ok: false, error: 'request_conflict' }
        }
        return existing.turnId
          ? { ok: true, sessionId, requestId: input.requestId }
          : { ok: false, error: 'native_delivery_unknown' }
      }
      if (store.getAgentTurn(input.requestId)) return { ok: false, error: 'request_conflict' }
      if (revisionChanged(session, input)) return { ok: false, error: 'revision_conflict' }
      if (work.has(sessionId) || nativeSends.has(sessionId)) return { ok: false, error: 'session_working' }
      const location = await findLocalSessionLocation(session.repoId, session.cwd, lifetime.signal)
      const current = store.getAgentSession(sessionId)
      if (
        !location ||
        location.workspace.id !== session.workspaceId ||
        location.target.id !== session.worktreeId ||
        !current ||
        current.closedAt ||
        current.cwd !== session.cwd ||
        current.providerSessionId !== session.providerSessionId
      ) {
        return { ok: false, error: 'native_terminal_unavailable' }
      }
      // Recheck after resolving the target. Only one request may reach the native thread at a time.
      if (store.getAgentTurn(input.requestId)) return { ok: false, error: 'request_conflict' }
      const duplicate = store.getNativeCodexDelivery(input.requestId)
      if (duplicate) {
        if (duplicate.sessionId !== sessionId || duplicate.prompt !== input.prompt)
          return { ok: false, error: 'request_conflict' }
        return duplicate.turnId
          ? { ok: true, sessionId, requestId: input.requestId }
          : { ok: false, error: 'native_delivery_unknown' }
      }
      if (revisionChanged(current, input)) return { ok: false, error: 'revision_conflict' }
      if (work.has(sessionId) || nativeSends.has(sessionId)) {
        return { ok: false, error: 'session_working' }
      }
      nativeSends.add(sessionId)
      const terminal = terminalFor(current)
      const target = terminal && {
        sessionId: terminal.id,
        repoId: terminal.repoId,
        expectedExecutionId: terminal.executionId,
      }
      let controlId: string | undefined
      try {
        if (target) {
          if (!callControl) return { ok: false, error: 'native_terminal_unavailable' }
          const acquired = await Promise.resolve()
            .then(() => callControl({ ...target, action: 'acquire', avoidRecentInput: true }))
            .catch(() => null)
          if (!acquired?.ok || acquired.action !== 'acquire') {
            if (acquired && !acquired.ok && acquired.reason === 'control_in_use')
              return { ok: false, error: 'control_in_use', controller: 'api' }
            if (acquired && !acquired.ok && acquired.reason === 'interactive_input_active')
              return { ok: false, error: 'interactive_input_active', controller: 'desktop' }
            return { ok: false, error: 'native_terminal_unavailable' }
          }
          controlId = acquired.controlId
          const selected = store.getAgentSession(sessionId)
          if (!selected || selected.closedAt || terminalFor(selected)?.executionId !== target.expectedExecutionId)
            return { ok: false, error: 'native_terminal_unavailable' }
          if (revisionChanged(selected, input)) return { ok: false, error: 'revision_conflict' }
          if (store.getAgentTurn(input.requestId) || store.getNativeCodexDelivery(input.requestId))
            return { ok: false, error: 'request_conflict' }
        }
        store.reserveNativeCodexDelivery(sessionId, input)
        const result = await liveCodex.send(
          session.providerSessionId,
          location.canonicalPath,
          input.prompt,
          lifetime.signal,
        )
        if (lifetime.signal.aborted || result.outcome === 'unknown')
          return { ok: false, error: 'native_delivery_unknown' }
        if (result.outcome === 'accepted') {
          store.settleNativeCodexDelivery(input.requestId, result.turnId)
          const state = nativeWorkspaces.get(session.workspaceId)
          state?.live.set(session.providerSessionId, 'active')
          if (state) state.nextScan = 0
          return { ok: true, sessionId, requestId: input.requestId }
        }
        store.settleNativeCodexDelivery(input.requestId, null)
        if (result.outcome === 'busy') return { ok: false, error: 'session_working' }
        return {
          ok: false,
          error: result.outcome === 'rejected' ? 'native_turn_rejected' : 'native_terminal_unavailable',
        }
      } finally {
        if (callControl && target && controlId) {
          const releaseId = controlId
          await Promise.resolve()
            .then(() => callControl({ ...target, action: 'release', controlId: releaseId }))
            .catch(() => undefined)
        }
        nativeSends.delete(sessionId)
      }
    },
    sendTurn(sessionId: string, input: AgentTurnInput, callControl?: CallTerminalControl) {
      return store.getAgentSession(sessionId)?.nativeCodex
        ? this.sendToNativeTerminal(sessionId, input, callControl)
        : this.continue(sessionId, input)
    },
  }
}

export type AgentOpenApiRuntime = ReturnType<typeof createAgentOpenApiRuntime>

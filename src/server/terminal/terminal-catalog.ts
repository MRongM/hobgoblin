import path from 'node:path'
import { getWorktrees } from '#/system/git/worktrees.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { resolveKnownWorktree } from '#/shared/worktree-guards.ts'
import { isValidBranch, isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import { resolveRemoteTarget } from '#/system/ssh/config.ts'
import { buildRemoteTerminalInvocation } from '#/system/ssh/commands.ts'
import { buildManagedLocalTerminalInvocation } from '#/system/local-terminal.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import type { TmuxCleanupPreviewResult, TmuxSessionRecord } from '#/shared/tmux-cleanup.ts'
import { terminalSessionScope } from '#/server/terminal/terminal-scope.ts'
import {
  formatTerminalId,
  isValidTerminalAttachmentId,
  isValidTerminalSize,
  NON_GIT_WORKSPACE_TERMINAL_BRANCH,
  parseTerminalIdIndex,
  type TerminalAttachResult,
  type TerminalCatalogAction,
  type TerminalCatalogMutationResult,
  type TerminalControllerStatus,
  type TerminalCreateInput,
  type TerminalOpenTmuxSessionsInput,
  type TerminalOpenTmuxSessionsResult,
  type TerminalSessionSummary,
  type TerminalWindowsPty,
  type TerminalWindowsPtyAppearance,
  normalizeTerminalLaunchMode,
} from '#/shared/terminal.ts'

interface EnsureTerminalCatalogInput {
  repoRoot: string
  branch: string
  worktreePath: string
  targetKind?: 'branch-workspace'
  branchWorkspaceId?: string
  terminalId?: string
  launchMode?: TerminalCreateInput['launchMode']
  cols?: number
  rows?: number
  attachmentId?: string
  windowsPtyAppearance?: TerminalWindowsPtyAppearance
  existingTmuxSession?: TmuxSessionRecord
  tmuxCloseSupported?: boolean
}

type EnsureTerminalCatalogResult =
  | {
      ok: true
      sessionId: string
      key: string
      action: TerminalCatalogAction
      replay: string
      replaySeq: number
      replayTruncated: boolean
      processName: string
      canonicalTitle: string | null
      snapshot?: string
      snapshotSeq?: number
      controller: { attachmentId: string; status: Exclude<TerminalControllerStatus, 'none'> } | null
      canonicalCols: number
      canonicalRows: number
      phase: Extract<TerminalAttachResult, { ok: true }>['phase']
      message: string | null
      windowsPty?: TerminalWindowsPty
    }
  | { ok: false; message: string }

interface TerminalCatalogEnsureSessionInput {
  ownerId: string
  scope: string
  key: string
  cwd: string
  cols: number
  rows: number
  attachmentId?: string
  attachmentConnected?: boolean
  windowsPtyAppearance?: TerminalWindowsPtyAppearance
  forceNew?: boolean
  command?: string
  args?: string[]
  tmuxSessionName?: string
  tmuxWorkingDirectory?: string
  tmuxCloseSupported?: boolean
}

interface TerminalCatalogManager {
  ensureSession(input: TerminalCatalogEnsureSessionInput): TerminalAttachResult
  listSessions(repoRoot: string): Promise<TerminalSessionSummary[]>
  closeSession(sessionId: string): void
}

interface TerminalCatalogOptions {
  isValidClientId(value: unknown): value is string
  isValidTerminalId(value: unknown): value is string
  manager: TerminalCatalogManager
  attachmentIsConnected(clientId: string, attachmentId?: string): boolean | undefined
  broadcastSessionsChanged(repoRoot: string): void
  withSessionSnapshot(
    result: Extract<TerminalAttachResult, { ok: true }>,
  ): Promise<Extract<TerminalAttachResult, { ok: true }>>
  previewAssociatedTmuxSessions(input: { projectRoot: string; itemPath: string }): Promise<TmuxCleanupPreviewResult>
}

class TerminalCatalog {
  private readonly options: TerminalCatalogOptions

  constructor(options: TerminalCatalogOptions) {
    this.options = options
  }

  async ensureOrRestore(clientId: string, input: EnsureTerminalCatalogInput): Promise<EnsureTerminalCatalogResult> {
    if (!this.options.isValidClientId(clientId)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidRepoLocator(input.repoRoot)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidBranch(input.branch)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidCwd(input.worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
    const targetAuthorization = await authorizeBranchWorkspaceTerminalTarget(input)
    if (!targetAuthorization.ok) return targetAuthorization
    const repoRoot = normalizeTerminalRepoRoot(input.repoRoot)
    const worktreePath = normalizeTerminalWorkingPath(input.repoRoot, targetAuthorization.worktreePath)
    const canonicalInput = { ...input, repoRoot, worktreePath }

    const terminalId = input.terminalId ?? formatTerminalId(1)
    const cols = input.cols ?? 80
    const rows = input.rows ?? 24
    if (!this.options.isValidTerminalId(terminalId)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidTerminalSize(cols, rows)) return { ok: false, message: 'error.invalid-arguments' }

    const scope = terminalSessionScope(repoRoot)
    const existingSessions = await this.options.manager.listSessions(scope)
    const targetSessionKey = sessionKey(repoRoot, worktreePath, terminalId)
    const existingSession = existingSessions.find((session) => session.key === targetSessionKey)
    const action: TerminalCatalogAction = existingSession
      ? existingSession.controller
        ? 'restored'
        : 'reused'
      : 'created'

    if (isRemoteRepoId(repoRoot)) {
      return await this.ensureRemote(clientId, canonicalInput, { terminalId, cols, rows, targetSessionKey, action })
    }
    return await this.ensureLocal(clientId, canonicalInput, { terminalId, cols, rows, targetSessionKey, action })
  }

  async create(clientId: string, input: TerminalCreateInput): Promise<TerminalCatalogMutationResult> {
    if (!this.options.isValidClientId(clientId)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidRepoLocator(input.repoRoot)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidTerminalAttachmentId(input?.attachmentId)) return { ok: false, message: 'error.invalid-arguments' }

    const createResult = await this.ensureOrRestore(clientId, {
      ...input,
      terminalId:
        input.kind === 'primary' ? 'terminal-1' : await this.nextTerminalId(input.repoRoot, input.worktreePath),
    })
    if (!createResult.ok) return { ok: false, message: createResult.message }
    const sessions = await this.options.manager.listSessions(terminalSessionScope(input.repoRoot))
    if (!sessions.some((session) => session.sessionId === createResult.sessionId)) {
      return { ok: false, message: 'error.terminal-create-failed' }
    }
    return toCatalogMutationResult(createResult, sessions)
  }

  async openTmuxSessions(
    clientId: string,
    input: TerminalOpenTmuxSessionsInput,
  ): Promise<TerminalOpenTmuxSessionsResult> {
    if (!this.options.isValidClientId(clientId)) return { ok: false, message: 'error.invalid-arguments' }
    if (!isValidRepoLocator(input.repoRoot) || !isValidBranch(input.branch) || !isValidCwd(input.worktreePath)) {
      return { ok: false, message: 'error.invalid-arguments' }
    }
    if (!isValidTerminalAttachmentId(input.attachmentId)) return { ok: false, message: 'error.invalid-arguments' }
    const targetAuthorization = await authorizeBranchWorkspaceTerminalTarget(input)
    if (!targetAuthorization.ok) return targetAuthorization
    const canonicalInput = {
      ...input,
      repoRoot: normalizeTerminalRepoRoot(input.repoRoot),
      worktreePath: normalizeTerminalWorkingPath(input.repoRoot, targetAuthorization.worktreePath),
    }
    const preview = await this.options.previewAssociatedTmuxSessions({
      projectRoot: canonicalInput.repoRoot,
      itemPath: canonicalInput.worktreePath,
    })
    if (!preview.ok) return preview

    const scope = terminalSessionScope(canonicalInput.repoRoot)
    const existingSessions = await this.options.manager.listSessions(scope)
    const usedKeys = new Set(existingSessions.map((session) => session.key))
    const sessions = preview.sessions
      .filter((session) => session.attachedClients === 0)
      .sort(compareRecoveredTmuxSessions)
    if (sessions.length === 0) return { ok: true, restored: 0, sessions: existingSessions }
    let selectedResult: Extract<EnsureTerminalCatalogResult, { ok: true }> | null = null
    for (const tmuxSession of sessions) {
      const existing = existingSessions.find((session) => session.tmuxSessionName === tmuxSession.sessionName)
      const existingTerminalId = existing ? parseSessionKey(existing.key)?.terminalId : undefined
      const preferredTerminalId = formatTerminalId(tmuxSession.terminalNumber)
      const preferredKey = sessionKey(canonicalInput.repoRoot, canonicalInput.worktreePath, preferredTerminalId)
      const terminalId =
        existingTerminalId ??
        (!usedKeys.has(preferredKey)
          ? preferredTerminalId
          : nextAvailableTerminalId(canonicalInput.repoRoot, canonicalInput.worktreePath, usedKeys))
      const key = sessionKey(canonicalInput.repoRoot, canonicalInput.worktreePath, terminalId)
      usedKeys.add(key)
      const result = await this.ensureOrRestore(clientId, {
        ...canonicalInput,
        terminalId,
        launchMode: 'tmux-if-available',
        existingTmuxSession: tmuxSession,
        tmuxCloseSupported: tmuxSession.terminalNumber === parseTerminalIdIndex(terminalId),
      })
      if (!result.ok) return result
      selectedResult ??= result
    }
    if (!selectedResult) return { ok: false, message: 'error.terminal-create-failed' }
    return {
      ...toCatalogMutationResult(selectedResult, await this.options.manager.listSessions(scope)),
      restored: sessions.length,
    }
  }

  async prune(clientId: string, repoRoot: string): Promise<{ pruned: number; remaining: number }> {
    if (!this.options.isValidClientId(clientId)) return { pruned: 0, remaining: 0 }
    if (!isValidRepoLocator(repoRoot)) return { pruned: 0, remaining: 0 }

    const scope = terminalSessionScope(repoRoot)
    const allSessions = await this.options.manager.listSessions(scope)
    if (isRemoteRepoId(repoRoot)) return { pruned: 0, remaining: allSessions.length }

    const worktrees = await getWorktrees(repoRoot, { includeStatus: false })
    if (worktrees.length === 0) return { pruned: 0, remaining: allSessions.length }

    const liveWorktreePaths = new Set(worktrees.map((worktree) => terminalSessionScope(worktree.path)))
    const branchWorkspaceSnapshot = await readBranchWorkspaceManifests(repoRoot).catch(() => null)
    if (branchWorkspaceSnapshot?.kind === 'ready') {
      for (const manifest of branchWorkspaceSnapshot.manifests) {
        liveWorktreePaths.add(terminalSessionScope(manifest.path))
      }
    }

    let pruned = 0
    for (const session of allSessions) {
      const parsed = parseSessionKey(session.key)
      if (!parsed) continue
      if (terminalSessionScope(parsed.repoRoot) !== scope) continue
      if (liveWorktreePaths.has(terminalSessionScope(parsed.worktreePath))) continue
      this.options.manager.closeSession(session.sessionId)
      pruned += 1
    }
    if (pruned > 0) this.options.broadcastSessionsChanged(repoRoot)
    const remaining = await this.options.manager.listSessions(scope).then((sessions) => sessions.length)
    return { pruned, remaining }
  }

  async nextTerminalId(repoRoot: string, worktreePath: string): Promise<string> {
    const normalizedRepoRoot = normalizeTerminalRepoRoot(repoRoot)
    const normalizedWorktreePath = normalizeTerminalWorkingPath(repoRoot, worktreePath)
    const sessions = await this.options.manager.listSessions(terminalSessionScope(normalizedRepoRoot))
    const usedIndexes = new Set<number>()
    for (const session of sessions) {
      const parsed = parseSessionKey(session.key)
      if (
        !parsed ||
        normalizeTerminalRepoRoot(parsed.repoRoot) !== normalizedRepoRoot ||
        normalizeTerminalWorkingPath(repoRoot, parsed.worktreePath) !== normalizedWorktreePath
      ) {
        continue
      }
      const index = parseTerminalIdIndex(parsed.terminalId)
      if (index !== null) usedIndexes.add(index)
    }
    let nextIndex = 1
    while (usedIndexes.has(nextIndex)) nextIndex += 1
    return formatTerminalId(nextIndex)
  }

  private async ensureRemote(
    clientId: string,
    input: EnsureTerminalCatalogInput,
    context: {
      terminalId: string
      cols: number
      rows: number
      targetSessionKey: string
      action: TerminalCatalogAction
    },
  ): Promise<EnsureTerminalCatalogResult> {
    const ref = parseRemoteRepoId(input.repoRoot)
    if (!ref) return { ok: false, message: 'error.ssh-config-changed' }
    let resolved
    try {
      resolved = await resolveRemoteTarget(ref)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'error.ssh-config-changed' }
    }
    const terminalNumber = parseTerminalIdIndex(context.terminalId)
    if (terminalNumber === null) return { ok: false, message: 'error.invalid-arguments' }
    const useTmux = normalizeTerminalLaunchMode(input.launchMode) === 'tmux-if-available'

    const invocation = buildRemoteTerminalInvocation(resolved.target, input.worktreePath, {
      cols: context.cols,
      rows: context.rows,
      terminalNumber,
      useTmux,
      existingTmuxSessionName: input.existingTmuxSession?.sessionName,
      existingTmuxServerName: input.existingTmuxSession?.serverName,
    })
    const result = this.options.manager.ensureSession({
      ownerId: clientId,
      scope: input.repoRoot,
      key: context.targetSessionKey,
      cwd: process.cwd(),
      cols: context.cols,
      rows: context.rows,
      attachmentId: input.attachmentId,
      attachmentConnected: this.options.attachmentIsConnected(clientId, input.attachmentId),
      windowsPtyAppearance: input.windowsPtyAppearance,
      forceNew: context.action === 'created',
      command: invocation.command,
      args: invocation.args,
      ...(invocation.tmuxSessionName
        ? {
            tmuxSessionName: invocation.tmuxSessionName,
            tmuxWorkingDirectory: input.worktreePath,
            tmuxCloseSupported: input.tmuxCloseSupported,
          }
        : {}),
    })
    if (!result.ok) return { ok: false, message: result.message }
    this.options.broadcastSessionsChanged(input.repoRoot)
    return toEnsureResult(context.targetSessionKey, context.action, await this.options.withSessionSnapshot(result))
  }

  private async ensureLocal(
    clientId: string,
    input: EnsureTerminalCatalogInput,
    context: {
      terminalId: string
      cols: number
      rows: number
      targetSessionKey: string
      action: TerminalCatalogAction
    },
  ): Promise<EnsureTerminalCatalogResult> {
    if (input.targetKind === 'branch-workspace') {
      return await this.ensureLocalSession(clientId, input, {
        ...context,
        repoRoot: terminalSessionScope(input.repoRoot),
        worktreePath: terminalSessionScope(input.worktreePath),
      })
    }
    if (isNonGitLocalWorkspaceTerminal(input)) {
      const repoRoot = terminalSessionScope(input.repoRoot)
      return await this.ensureLocalSession(clientId, input, {
        ...context,
        repoRoot,
        worktreePath: repoRoot,
      })
    }

    const worktrees = await getWorktrees(input.repoRoot, { includeStatus: false })
    const resolved = resolveKnownWorktree(worktrees, input.worktreePath, input.branch)
    if (!resolved.ok) return { ok: false, message: resolved.message }

    const repoRoot = terminalSessionScope(input.repoRoot)
    const worktreePath = terminalSessionScope(resolved.path)
    return await this.ensureLocalSession(clientId, input, {
      ...context,
      repoRoot,
      worktreePath,
    })
  }

  private async ensureLocalSession(
    clientId: string,
    input: EnsureTerminalCatalogInput,
    context: {
      terminalId: string
      cols: number
      rows: number
      targetSessionKey: string
      action: TerminalCatalogAction
      repoRoot: string
      worktreePath: string
    },
  ): Promise<EnsureTerminalCatalogResult> {
    const terminalNumber = parseTerminalIdIndex(context.terminalId)
    if (terminalNumber === null) return { ok: false, message: 'error.invalid-arguments' }
    const useTmux = normalizeTerminalLaunchMode(input.launchMode) === 'tmux-if-available'
    const invocation = buildManagedLocalTerminalInvocation(
      {
        projectRoot: context.repoRoot,
        workingDirectory: context.worktreePath,
        terminalNumber,
      },
      {
        useTmux,
        fallbackShell: process.env.SHELL,
        existingTmuxSessionName: input.existingTmuxSession?.sessionName,
        existingTmuxServerName: input.existingTmuxSession?.serverName,
      },
    )
    const result = this.options.manager.ensureSession({
      ownerId: clientId,
      scope: context.repoRoot,
      key: context.targetSessionKey,
      cwd: context.worktreePath,
      cols: context.cols,
      rows: context.rows,
      attachmentId: input.attachmentId,
      attachmentConnected: this.options.attachmentIsConnected(clientId, input.attachmentId),
      windowsPtyAppearance: input.windowsPtyAppearance,
      forceNew: context.action === 'created',
      command: invocation?.command,
      args: invocation?.args,
      ...(invocation
        ? {
            tmuxSessionName: invocation.tmuxSessionName,
            tmuxWorkingDirectory: context.worktreePath,
            tmuxCloseSupported: input.tmuxCloseSupported,
          }
        : {}),
    })
    if (!result.ok) return { ok: false, message: result.message }
    this.options.broadcastSessionsChanged(input.repoRoot)
    return toEnsureResult(context.targetSessionKey, context.action, await this.options.withSessionSnapshot(result))
  }
}

async function authorizeBranchWorkspaceTerminalTarget(
  input: Pick<EnsureTerminalCatalogInput, 'repoRoot' | 'branch' | 'worktreePath' | 'targetKind' | 'branchWorkspaceId'>,
): Promise<{ ok: true; worktreePath: string } | { ok: false; message: string }> {
  if (input.targetKind === undefined) {
    return input.branchWorkspaceId === undefined
      ? { ok: true, worktreePath: input.worktreePath }
      : { ok: false, message: 'error.invalid-arguments' }
  }
  if (
    input.targetKind !== 'branch-workspace' ||
    typeof input.branchWorkspaceId !== 'string' ||
    !input.branchWorkspaceId.trim()
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }

  const snapshot = await readBranchWorkspaceManifests(input.repoRoot).catch(() => null)
  const manifest =
    snapshot?.kind === 'ready'
      ? snapshot.manifests.find((candidate) => candidate.id === input.branchWorkspaceId)
      : undefined
  if (
    !manifest ||
    workspaceRootId(manifest.rootId) !== workspaceRootId(input.repoRoot) ||
    manifest.branch !== input.branch ||
    !sameBranchWorkspaceTerminalPath(input.repoRoot, manifest.path, input.worktreePath) ||
    manifest.operation?.kind === 'remove'
  ) {
    return { ok: false, message: 'workspace.branch-workspace.terminal-unavailable' }
  }
  return { ok: true, worktreePath: manifest.path }
}

function normalizeTerminalRepoRoot(repoRoot: string): string {
  return isRemoteRepoId(repoRoot) ? repoRoot : terminalSessionScope(repoRoot)
}

function normalizeTerminalWorkingPath(repoRoot: string, value: string): string {
  return isRemoteRepoId(repoRoot) ? path.posix.normalize(value) : terminalSessionScope(value)
}

function sameBranchWorkspaceTerminalPath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : terminalSessionScope(left) === terminalSessionScope(right)
}

function isNonGitLocalWorkspaceTerminal(
  input: Pick<EnsureTerminalCatalogInput, 'repoRoot' | 'branch' | 'worktreePath'>,
): boolean {
  return (
    !isRemoteRepoId(input.repoRoot) &&
    input.branch === NON_GIT_WORKSPACE_TERMINAL_BRANCH &&
    terminalSessionScope(input.repoRoot) === terminalSessionScope(input.worktreePath)
  )
}

function toEnsureResult(
  key: string,
  action: TerminalCatalogAction,
  snapshotResult: Extract<TerminalAttachResult, { ok: true }>,
): EnsureTerminalCatalogResult {
  return {
    ok: true,
    sessionId: snapshotResult.sessionId,
    key,
    action,
    replay: snapshotResult.replay,
    replaySeq: snapshotResult.replaySeq,
    replayTruncated: snapshotResult.replayTruncated,
    processName: snapshotResult.processName,
    canonicalTitle: snapshotResult.canonicalTitle,
    snapshot: snapshotResult.snapshot,
    snapshotSeq: snapshotResult.snapshotSeq,
    controller: snapshotResult.controller,
    canonicalCols: snapshotResult.canonicalCols,
    canonicalRows: snapshotResult.canonicalRows,
    phase: snapshotResult.phase,
    message: snapshotResult.message,
    windowsPty: snapshotResult.windowsPty,
  }
}

function toCatalogMutationResult(
  result: Extract<EnsureTerminalCatalogResult, { ok: true }>,
  sessions: TerminalSessionSummary[],
): Extract<TerminalCatalogMutationResult, { ok: true }> {
  return {
    ok: true,
    action: result.action,
    key: result.key,
    sessionId: result.sessionId,
    processName: result.processName,
    canonicalTitle: result.canonicalTitle,
    snapshot: result.snapshot ?? '',
    snapshotSeq: result.snapshotSeq ?? result.replaySeq,
    controller: result.controller,
    canonicalCols: result.canonicalCols,
    canonicalRows: result.canonicalRows,
    phase: result.phase,
    message: result.message,
    windowsPty: result.windowsPty,
    sessions,
  }
}

function compareRecoveredTmuxSessions(left: TmuxSessionRecord, right: TmuxSessionRecord): number {
  return left.terminalNumber - right.terminalNumber || left.sessionName.localeCompare(right.sessionName)
}

function nextAvailableTerminalId(repoRoot: string, worktreePath: string, usedKeys: ReadonlySet<string>): string {
  let terminalNumber = 1
  while (usedKeys.has(sessionKey(repoRoot, worktreePath, formatTerminalId(terminalNumber)))) terminalNumber += 1
  return formatTerminalId(terminalNumber)
}

function sessionKey(repoRoot: string, worktreePath: string, terminalId?: string): string {
  return `${repoRoot}\0${worktreePath}\0${terminalId ?? formatTerminalId(1)}`
}

function parseSessionKey(key: string): { repoRoot: string; worktreePath: string; terminalId: string } | null {
  const parts = key.split('\0')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null
  return { repoRoot: parts[0], worktreePath: parts[1], terminalId: parts[2] }
}

export function createTerminalCatalog(options: TerminalCatalogOptions): TerminalCatalog {
  return new TerminalCatalog(options)
}

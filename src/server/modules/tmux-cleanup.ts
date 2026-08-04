import {
  type AssociatedTmuxCleanupInput,
  type AssociatedTmuxTargetInput,
  type HostTmuxCloseInput,
  type HostTmuxCloseResult,
  type HostTmuxInventoryResult,
  type HostTmuxOpenInput,
  type HostTmuxOpenResult,
  type HostTmuxTargetInput,
  type TmuxCleanupPreviewResult,
  type TmuxCleanupResult,
  type TmuxHostSessionIdentity,
  type TmuxHostSessionRecord,
  type TmuxSessionRecord,
} from '#/shared/tmux-cleanup.ts'
import type { ExecResult } from '#/shared/git-types.ts'
import { isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import { isRemoteRepoId, type RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import { getServerSettingsPrefs } from '#/server/modules/settings-source.ts'
import { runRemoteCommand, type RemoteCommandResult } from '#/system/ssh/commands.ts'
import {
  isTmuxSessionMissingMessage,
  killLocalHostTmuxSessionByName,
  killLocalTmuxSessionByName,
  listLocalHostTmuxSessions,
  listLocalTmuxSessions,
  tmuxHostListResultFromProcessResult,
  tmuxListResultFromProcessResult,
  type TmuxCommandResult,
  type TmuxHostListResult,
  type TmuxListResult,
} from '#/system/tmux-cleanup.ts'
import {
  isHobgoblinTmuxSessionName,
  isHobgoblinTmuxServerName,
  isSafeTmuxSessionName,
  normalizeTmuxSessionPath,
  resolveTmuxSessionTerminalNumbers,
} from '#/system/tmux-session.ts'
import { openInPreferredTerminal, openRemoteInPreferredTerminal } from '#/system/terminals.ts'

const MAX_APPROVED_SESSION_NAMES = 256
const LEGACY_SERVER_IDENTITY = 'legacy-default'

export interface TmuxCleanupDependencies {
  platform?: NodeJS.Platform
  listLocal?: typeof listLocalTmuxSessions
  killLocalByName?: typeof killLocalTmuxSessionByName
  listLocalHost?: typeof listLocalHostTmuxSessions
  killLocalHostByName?: typeof killLocalHostTmuxSessionByName
  resolveRemote?: (repoId: string) => Promise<RemoteRepoTarget>
  runRemote?: typeof runRemoteCommand
  getSettingsPrefs?: typeof getServerSettingsPrefs
  openLocalTerminal?: typeof openInPreferredTerminal
  openRemoteTerminal?: typeof openRemoteInPreferredTerminal
}

interface TmuxRuntime {
  projectRoot: string
  targetPath: string
  list: () => Promise<TmuxListResult>
  kill: (session: TmuxSessionRecord) => Promise<TmuxCommandResult>
}

type RuntimeResult = { ok: true; runtime: TmuxRuntime } | { ok: false; message: string }

interface TmuxHostRuntime {
  list: () => Promise<TmuxHostListResult>
  kill: (session: TmuxHostSessionRecord) => Promise<TmuxCommandResult>
  open: (session: TmuxHostSessionRecord) => Promise<ExecResult>
}

type HostRuntimeResult = { ok: true; runtime: TmuxHostRuntime } | { ok: false; message: string }

export interface AssociatedTmuxSessionNameInput extends AssociatedTmuxTargetInput {
  sessionName: string
}

export type TerminalTmuxCloseResult = { ok: true; status: 'closed' | 'missing' } | { ok: false; message: string }

export async function closeAssociatedTmuxSessionByName(
  input: AssociatedTmuxSessionNameInput,
  dependencies: TmuxCleanupDependencies = {},
  signal?: AbortSignal,
): Promise<TerminalTmuxCloseResult> {
  if (!isHobgoblinTmuxSessionName(input?.sessionName)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const resolved = await resolveTmuxRuntime(input, dependencies, signal)
  if (!resolved.ok) return resolved
  const listed = await safelyList(resolved.runtime)
  if (!listed.ok) return listed
  const session = associatedSessions(listed.sessions, resolved.runtime.projectRoot, resolved.runtime.targetPath).find(
    (candidate) => candidate.sessionName === input.sessionName,
  )
  if (!session) return { ok: true, status: 'missing' }
  try {
    const killed = await resolved.runtime.kill(session)
    if (killed.ok) return { ok: true, status: 'closed' }
    return isTmuxSessionMissingMessage(killed.message)
      ? { ok: true, status: 'missing' }
      : { ok: false, message: killed.message }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

export async function previewAssociatedTmuxSessions(
  input: AssociatedTmuxTargetInput,
  dependencies: TmuxCleanupDependencies = {},
  signal?: AbortSignal,
): Promise<TmuxCleanupPreviewResult> {
  const resolved = await resolveTmuxRuntime(input, dependencies, signal)
  if (!resolved.ok) return resolved
  const listed = await safelyList(resolved.runtime)
  if (!listed.ok) return listed
  return {
    ok: true,
    targetPath: resolved.runtime.targetPath,
    sessions: associatedSessions(listed.sessions, resolved.runtime.projectRoot, resolved.runtime.targetPath),
  }
}

export async function cleanupAssociatedTmuxSessions(
  input: AssociatedTmuxCleanupInput,
  dependencies: TmuxCleanupDependencies = {},
  signal?: AbortSignal,
): Promise<TmuxCleanupResult> {
  const approvedSessionNames = normalizeApprovedSessionNames(input.approvedSessionNames)
  if (!approvedSessionNames) return { ok: false, message: 'error.invalid-arguments' }
  const resolved = await resolveTmuxRuntime(input, dependencies, signal)
  if (!resolved.ok) return resolved
  const listed = await safelyList(resolved.runtime)
  if (!listed.ok) return listed

  const sessionsByName = new Map(
    associatedSessions(listed.sessions, resolved.runtime.projectRoot, resolved.runtime.targetPath).map((session) => [
      session.sessionName,
      session,
    ]),
  )
  const missingSessionNames = approvedSessionNames.filter((sessionName) => !sessionsByName.has(sessionName))
  const deleted: TmuxSessionRecord[] = []
  const failed: Extract<TmuxCleanupResult, { ok: true }>['failed'] = []
  for (const sessionName of approvedSessionNames) {
    const session = sessionsByName.get(sessionName)
    if (!session) continue
    try {
      const result = await resolved.runtime.kill(session)
      if (result.ok) deleted.push(session)
      else failed.push({ sessionName, message: result.message })
    } catch (error) {
      failed.push({ sessionName, message: errorMessage(error) })
    }
  }
  return { ok: true, targetPath: resolved.runtime.targetPath, deleted, missingSessionNames, failed }
}

export async function previewHostTmuxSessions(
  input: HostTmuxTargetInput,
  dependencies: TmuxCleanupDependencies = {},
  signal?: AbortSignal,
): Promise<HostTmuxInventoryResult> {
  const resolved = await resolveTmuxHostRuntime(input, dependencies, signal)
  if (!resolved.ok) return resolved
  const listed = await safelyListHost(resolved.runtime)
  return listed.ok ? { ok: true, sessions: manageableHostTmuxSessions(listed.sessions) } : listed
}

export async function openHostTmuxSession(
  input: HostTmuxOpenInput,
  dependencies: TmuxCleanupDependencies = {},
  signal?: AbortSignal,
): Promise<HostTmuxOpenResult> {
  const approvedSessions = normalizeApprovedHostSessions(input?.session ? [input.session] : null)
  if (!approvedSessions || approvedSessions.length !== 1) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const resolved = await resolveTmuxHostRuntime(input, dependencies, signal)
  if (!resolved.ok) return resolved
  const listed = await safelyListHost(resolved.runtime)
  if (!listed.ok) return listed
  const approved = approvedSessions[0]!
  const live = manageableHostTmuxSessions(listed.sessions).find(
    (session) => tmuxSessionIdentityKey(session) === tmuxSessionIdentityKey(approved),
  )
  if (!live) return { ok: true, status: 'missing' }
  try {
    const opened = await resolved.runtime.open(live)
    return opened.ok ? { ok: true, status: 'opened' } : { ok: false, message: opened.message }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

export async function closeHostTmuxSessions(
  input: HostTmuxCloseInput,
  dependencies: TmuxCleanupDependencies = {},
  signal?: AbortSignal,
): Promise<HostTmuxCloseResult> {
  const approvedSessions = normalizeApprovedHostSessions(input?.approvedSessions)
  if (!approvedSessions) return { ok: false, message: 'error.invalid-arguments' }
  const resolved = await resolveTmuxHostRuntime(input, dependencies, signal)
  if (!resolved.ok) return resolved
  const listed = await safelyListHost(resolved.runtime)
  if (!listed.ok) return listed

  const liveByIdentity = new Map(
    manageableHostTmuxSessions(listed.sessions).map((session) => [tmuxSessionIdentityKey(session), session]),
  )
  const closed: TmuxHostSessionRecord[] = []
  const missing: TmuxHostSessionIdentity[] = []
  const failed: Extract<HostTmuxCloseResult, { ok: true }>['failed'] = []
  for (const approved of approvedSessions) {
    const session = liveByIdentity.get(tmuxSessionIdentityKey(approved))
    if (!session) {
      missing.push(approved)
      continue
    }
    try {
      const result = await resolved.runtime.kill(session)
      if (result.ok) closed.push(session)
      else if (isTmuxSessionMissingMessage(result.message)) missing.push(approved)
      else failed.push({ session, message: result.message })
    } catch (error) {
      failed.push({ session, message: errorMessage(error) })
    }
  }
  return { ok: true, closed, missing, failed }
}

async function resolveTmuxRuntime(
  input: AssociatedTmuxTargetInput,
  dependencies: TmuxCleanupDependencies,
  signal?: AbortSignal,
): Promise<RuntimeResult> {
  if (!input || typeof input.projectRoot !== 'string' || typeof input.itemPath !== 'string') {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const remote = isRemoteRepoId(input.projectRoot)
  if (!remote && (dependencies.platform ?? process.platform) === 'win32') {
    return { ok: false, message: 'error.tmux-unsupported' }
  }
  if (!isValidRepoLocator(input.projectRoot) || (!remote && !isValidCwd(input.projectRoot))) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const targetPath = normalizeTmuxSessionPath(input.itemPath)
  if (!targetPath) return { ok: false, message: 'error.invalid-arguments' }

  if (!remote) {
    const listLocal = dependencies.listLocal ?? listLocalTmuxSessions
    const killLocalByName = dependencies.killLocalByName ?? killLocalTmuxSessionByName
    return {
      ok: true,
      runtime: {
        projectRoot: normalizeTmuxSessionPath(input.projectRoot) ?? input.projectRoot,
        targetPath,
        list: async () => await listLocal({ projectRoot: input.projectRoot, signal }),
        kill: async (session) =>
          await killLocalByName(session.sessionName, {
            projectRoot: input.projectRoot,
            serverName: session.serverName,
            signal,
          }),
      },
    }
  }

  try {
    const target = await (dependencies.resolveRemote ?? resolveRemoteRepoTarget)(input.projectRoot)
    const runRemote = dependencies.runRemote ?? runRemoteCommand
    return {
      ok: true,
      runtime: {
        projectRoot: target.remotePath,
        targetPath,
        list: async () =>
          remoteListResult(
            await runRemote(target, { type: 'tmuxListSessions', projectRoot: target.remotePath }, { signal }),
            target.remotePath,
          ),
        kill: async (session) => {
          const result = await runRemote(
            target,
            {
              type: 'tmuxKillSessionByName',
              projectRoot: target.remotePath,
              sessionName: session.sessionName,
              serverName: session.serverName,
            },
            { signal },
          )
          return { ok: result.ok, message: result.ok ? result.stderr : result.message || result.stderr || 'unknown' }
        },
      },
    }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

async function safelyList(runtime: TmuxRuntime): Promise<TmuxListResult> {
  try {
    return await runtime.list()
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

async function resolveTmuxHostRuntime(
  input: HostTmuxTargetInput,
  dependencies: TmuxCleanupDependencies,
  signal?: AbortSignal,
): Promise<HostRuntimeResult> {
  if (!input || typeof input.projectRoot !== 'string') {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const remote = isRemoteRepoId(input.projectRoot)
  if (!remote && (dependencies.platform ?? process.platform) === 'win32') {
    return { ok: false, message: 'error.tmux-unsupported' }
  }
  if (!isValidRepoLocator(input.projectRoot)) return { ok: false, message: 'error.invalid-arguments' }
  if (!remote && !isValidCwd(input.projectRoot)) return { ok: false, message: 'error.invalid-arguments' }

  if (!remote) {
    const listLocalHost = dependencies.listLocalHost ?? listLocalHostTmuxSessions
    const killLocalHostByName = dependencies.killLocalHostByName ?? killLocalHostTmuxSessionByName
    const getSettingsPrefs = dependencies.getSettingsPrefs ?? getServerSettingsPrefs
    const openLocalTerminal = dependencies.openLocalTerminal ?? openInPreferredTerminal
    return {
      ok: true,
      runtime: {
        list: async () => await listLocalHost({ signal }),
        kill: async (session) =>
          await killLocalHostByName(session.sessionName, { serverName: session.serverName, signal }),
        open: async (session) => {
          const prefs = await getSettingsPrefs()
          return await openLocalTerminal(
            hostTerminalTarget(input.projectRoot, session),
            prefs.terminalApp,
            hostTerminalOpenOptions(session),
          )
        },
      },
    }
  }

  try {
    const target = await (dependencies.resolveRemote ?? resolveRemoteRepoTarget)(input.projectRoot)
    const runRemote = dependencies.runRemote ?? runRemoteCommand
    const getSettingsPrefs = dependencies.getSettingsPrefs ?? getServerSettingsPrefs
    const openRemoteTerminal = dependencies.openRemoteTerminal ?? openRemoteInPreferredTerminal
    return {
      ok: true,
      runtime: {
        list: async () => remoteHostListResult(await runRemote(target, { type: 'tmuxListHostSessions' }, { signal })),
        kill: async (session) => {
          const result = await runRemote(
            target,
            {
              type: 'tmuxKillHostSessionByName',
              sessionName: session.sessionName,
              serverName: session.serverName,
            },
            { signal },
          )
          return { ok: result.ok, message: result.ok ? result.stderr : result.message || result.stderr || 'unknown' }
        },
        open: async (session) => {
          const prefs = await getSettingsPrefs()
          return await openRemoteTerminal(
            {
              alias: target.alias,
              ...hostTerminalTarget(target.remotePath, session),
            },
            prefs.terminalApp,
            hostTerminalOpenOptions(session),
          )
        },
      },
    }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

function hostTerminalTarget(projectRoot: string, session: TmuxHostSessionRecord) {
  return {
    projectRoot,
    workingDirectory: session.initialPath,
    terminalNumber: session.kind === 'hobgoblin' ? session.terminalNumber : 1,
  }
}

function hostTerminalOpenOptions(session: TmuxHostSessionRecord) {
  return {
    useTmux: true as const,
    existingTmuxSessionKind: session.kind,
    existingTmuxSessionName: session.sessionName,
    ...(session.serverName === undefined ? {} : { existingTmuxServerName: session.serverName }),
  }
}

async function safelyListHost(runtime: TmuxHostRuntime): Promise<TmuxHostListResult> {
  try {
    return await runtime.list()
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

function remoteListResult(result: RemoteCommandResult, projectRoot: string): TmuxListResult {
  return tmuxListResultFromProcessResult(
    result.ok
      ? { ok: true, stdout: result.stdout, stderr: result.stderr }
      : {
          ok: false,
          stdout: result.stdout,
          stderr: result.stderr,
          message: result.message || result.stderr || 'unknown',
        },
    undefined,
    projectRoot,
  )
}

function remoteHostListResult(result: RemoteCommandResult): TmuxHostListResult {
  return tmuxHostListResultFromProcessResult(
    result.ok
      ? { ok: true, stdout: result.stdout, stderr: result.stderr }
      : {
          ok: false,
          stdout: result.stdout,
          stderr: result.stderr,
          message: result.message || result.stderr || 'unknown',
        },
  )
}

function associatedSessions(
  sessions: readonly TmuxSessionRecord[],
  projectRoot: string,
  targetPath: string,
): TmuxSessionRecord[] {
  const pathMatches = sessions.flatMap((session) => {
    const initialPath = normalizeTmuxSessionPath(session.initialPath)
    return initialPath === targetPath ? [{ ...session, initialPath }] : []
  })
  const terminalNumbers = resolveTmuxSessionTerminalNumbers(projectRoot, pathMatches)
  const preferredByName = new Map<string, TmuxSessionRecord>()
  for (const session of pathMatches) {
    if (terminalNumbers.get(session.sessionName) !== session.terminalNumber) continue
    const existing = preferredByName.get(session.sessionName)
    if (!existing || (!existing.serverName && session.serverName)) preferredByName.set(session.sessionName, session)
  }
  return [...preferredByName.values()]
}

function manageableHostTmuxSessions(sessions: readonly TmuxHostSessionRecord[]): TmuxHostSessionRecord[] {
  const sessionsByIdentity = new Map<string, TmuxHostSessionRecord>()
  for (const session of sessions) {
    const initialPath = normalizeTmuxSessionPath(session.initialPath)
    if (
      !initialPath ||
      initialPath !== session.initialPath ||
      !Number.isSafeInteger(session.attachedClients) ||
      session.attachedClients < 0
    )
      continue

    let normalized: TmuxHostSessionRecord
    if (session.kind === 'default') {
      if (session.serverName !== undefined || !isSafeTmuxSessionName(session.sessionName)) continue
      normalized = {
        kind: 'default',
        sessionName: session.sessionName,
        initialPath,
        attachedClients: session.attachedClients,
      }
    } else if (session.kind === 'hobgoblin') {
      if (
        !isHobgoblinTmuxSessionName(session.sessionName) ||
        (session.serverName !== undefined && !isHobgoblinTmuxServerName(session.serverName)) ||
        !Number.isSafeInteger(session.terminalNumber) ||
        session.terminalNumber < 1
      )
        continue
      normalized = { ...session, initialPath }
    } else {
      continue
    }
    const identity = tmuxSessionIdentityKey(normalized)
    if (!sessionsByIdentity.has(identity)) sessionsByIdentity.set(identity, normalized)
  }
  return [...sessionsByIdentity.values()].sort(compareHostTmuxSessions)
}

function compareHostTmuxSessions(a: TmuxHostSessionRecord, b: TmuxHostSessionRecord): number {
  const byPath = compareText(a.initialPath, b.initialPath)
  if (byPath !== 0) return byPath
  const aTerminalNumber = a.kind === 'hobgoblin' ? a.terminalNumber : Number.MAX_SAFE_INTEGER
  const bTerminalNumber = b.kind === 'hobgoblin' ? b.terminalNumber : Number.MAX_SAFE_INTEGER
  if (aTerminalNumber !== bTerminalNumber) return aTerminalNumber - bTerminalNumber
  const byServer = compareText(a.serverName ?? '', b.serverName ?? '')
  if (byServer !== 0) return byServer
  return compareText(a.sessionName, b.sessionName)
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function normalizeApprovedSessionNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_APPROVED_SESSION_NAMES) return null
  const unique = [...new Set(value)]
  return unique.every(isHobgoblinTmuxSessionName) ? unique : null
}

function normalizeApprovedHostSessions(value: unknown): TmuxHostSessionIdentity[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_APPROVED_SESSION_NAMES) return null
  const unique = new Map<string, TmuxHostSessionIdentity>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null
    const { kind, sessionName, serverName } = candidate as {
      kind?: unknown
      sessionName?: unknown
      serverName?: unknown
    }
    let identity: TmuxHostSessionIdentity
    if (kind === 'default') {
      if (!isSafeTmuxSessionName(sessionName) || serverName !== undefined) return null
      identity = { kind, sessionName }
    } else if (kind === 'hobgoblin') {
      if (
        !isHobgoblinTmuxSessionName(sessionName) ||
        (serverName !== undefined && !isHobgoblinTmuxServerName(serverName))
      )
        return null
      identity = { kind, sessionName, ...(serverName === undefined ? {} : { serverName }) }
    } else {
      return null
    }
    unique.set(tmuxSessionIdentityKey(identity), identity)
  }
  return [...unique.values()]
}

function tmuxSessionIdentityKey(identity: TmuxHostSessionIdentity | TmuxHostSessionRecord): string {
  return `${identity.kind}\0${identity.serverName ?? LEGACY_SERVER_IDENTITY}\0${identity.sessionName}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown'
}

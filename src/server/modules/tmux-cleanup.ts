import {
  type AssociatedTmuxCleanupInput,
  type AssociatedTmuxTargetInput,
  type TmuxCleanupPreviewResult,
  type TmuxCleanupResult,
  type TmuxSessionRecord,
} from '#/shared/tmux-cleanup.ts'
import { isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import { isRemoteRepoId, type RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { resolveRemoteRepoTarget } from '#/server/modules/repo-backend.ts'
import { runRemoteCommand, type RemoteCommandResult } from '#/system/ssh/commands.ts'
import {
  isTmuxSessionMissingMessage,
  killLocalTmuxSessionByName,
  listLocalTmuxSessions,
  tmuxListResultFromProcessResult,
  type TmuxCommandResult,
  type TmuxListResult,
} from '#/system/tmux-cleanup.ts'
import {
  isHobgoblinTmuxSessionName,
  normalizeTmuxSessionPath,
  resolveTmuxSessionTerminalNumbers,
} from '#/system/tmux-session.ts'

const MAX_APPROVED_SESSION_NAMES = 256

export interface TmuxCleanupDependencies {
  platform?: NodeJS.Platform
  listLocal?: typeof listLocalTmuxSessions
  killLocalByName?: typeof killLocalTmuxSessionByName
  resolveRemote?: (repoId: string) => Promise<RemoteRepoTarget>
  runRemote?: typeof runRemoteCommand
}

interface TmuxRuntime {
  projectRoot: string
  targetPath: string
  list: () => Promise<TmuxListResult>
  killName: (sessionName: string) => Promise<TmuxCommandResult>
}

type RuntimeResult = { ok: true; runtime: TmuxRuntime } | { ok: false; message: string }

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
  const session = associatedSessions(
    listed.sessions,
    resolved.runtime.projectRoot,
    resolved.runtime.targetPath,
  ).find(
    (candidate) => candidate.sessionName === input.sessionName,
  )
  if (!session) return { ok: true, status: 'missing' }
  try {
    const killed = await resolved.runtime.killName(input.sessionName)
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
      const result = await resolved.runtime.killName(sessionName)
      if (result.ok) deleted.push(session)
      else failed.push({ sessionName, message: result.message })
    } catch (error) {
      failed.push({ sessionName, message: errorMessage(error) })
    }
  }
  return { ok: true, targetPath: resolved.runtime.targetPath, deleted, missingSessionNames, failed }
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
        list: async () => await listLocal({ signal }),
        killName: async (sessionName) => await killLocalByName(sessionName, { signal }),
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
        list: async () => remoteListResult(await runRemote(target, { type: 'tmuxListSessions' }, { signal })),
        killName: async (sessionName) => {
          const result = await runRemote(target, { type: 'tmuxKillSessionByName', sessionName }, { signal })
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

function remoteListResult(result: RemoteCommandResult): TmuxListResult {
  return tmuxListResultFromProcessResult(
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
  return pathMatches.filter((session) => terminalNumbers.get(session.sessionName) === session.terminalNumber)
}

function normalizeApprovedSessionNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_APPROVED_SESSION_NAMES) return null
  const unique = [...new Set(value)]
  return unique.every(isHobgoblinTmuxSessionName) ? unique : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown'
}

import { execa } from 'execa'
import { isValidTmuxSessionId, type TmuxSessionRecord } from '#/shared/tmux-cleanup.ts'
import { isHobgoblinTmuxSessionName, normalizeTmuxSessionPath } from '#/system/tmux-session.ts'

const TMUX_COMMAND_TIMEOUT_MS = 15_000
const NO_TMUX_SERVER_RE = /(?:no server running|failed to connect to server|no sessions)/iu
const MISSING_TMUX_SESSION_RE =
  /(?:no server running|failed to connect to server|no sessions|can't find session|session not found)/iu

export const TMUX_SESSION_LIST_FORMAT = '#{session_name}\t#{session_id}\t#{session_path}'

export type TmuxProcessResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; stdout: string; stderr: string; message: string }

export type TmuxProcessRunner = (args: string[], signal?: AbortSignal) => Promise<TmuxProcessResult>

export type TmuxListResult = { ok: true; sessions: TmuxSessionRecord[] } | { ok: false; message: string }

export interface TmuxCommandResult {
  ok: boolean
  message: string
}

interface LocalTmuxCommandOptions {
  run?: TmuxProcessRunner
  signal?: AbortSignal
}

export function parseTmuxSessionList(output: string): TmuxSessionRecord[] | null {
  if (output.length === 0) return []
  const sessions: TmuxSessionRecord[] = []
  for (const rawLine of output.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (!line) continue
    const fields = line.split('\t')
    if (fields.length !== 3) return null
    const [sessionName, sessionId, sessionPath] = fields
    if (!sessionName || !isValidTmuxSessionId(sessionId) || !sessionPath || !normalizeTmuxSessionPath(sessionPath)) {
      return null
    }
    sessions.push({ sessionName, sessionId, sessionPath })
  }
  return sessions
}

export async function listLocalTmuxSessions(options: LocalTmuxCommandOptions = {}): Promise<TmuxListResult> {
  const result = await (options.run ?? runLocalTmuxCommand)(
    ['list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
    options.signal,
  )
  return tmuxListResultFromProcessResult(result)
}

export function tmuxListResultFromProcessResult(result: TmuxProcessResult): TmuxListResult {
  if (!result.ok) {
    return NO_TMUX_SERVER_RE.test(`${result.stderr}\n${result.message}`)
      ? { ok: true, sessions: [] }
      : { ok: false, message: result.message }
  }
  const sessions = parseTmuxSessionList(result.stdout)
  return sessions ? { ok: true, sessions } : { ok: false, message: 'error.tmux-invalid-output' }
}

export async function killLocalTmuxSession(
  sessionId: string,
  options: LocalTmuxCommandOptions = {},
): Promise<TmuxCommandResult> {
  if (!isValidTmuxSessionId(sessionId)) return { ok: false, message: 'error.invalid-arguments' }
  const result = await (options.run ?? runLocalTmuxCommand)(['kill-session', '-t', sessionId], options.signal)
  return result.ok ? { ok: true, message: result.stderr } : { ok: false, message: result.message }
}

export async function killLocalTmuxSessionByName(
  sessionName: string,
  options: LocalTmuxCommandOptions = {},
): Promise<TmuxCommandResult> {
  if (!isHobgoblinTmuxSessionName(sessionName)) return { ok: false, message: 'error.invalid-arguments' }
  const result = await (options.run ?? runLocalTmuxCommand)(['kill-session', '-t', sessionName], options.signal)
  return result.ok ? { ok: true, message: result.stderr } : { ok: false, message: result.message }
}

export function isTmuxSessionMissingMessage(message: string): boolean {
  return MISSING_TMUX_SESSION_RE.test(message)
}

async function runLocalTmuxCommand(args: string[], signal?: AbortSignal): Promise<TmuxProcessResult> {
  if (signal?.aborted) return { ok: false, stdout: '', stderr: '', message: 'cancelled' }
  try {
    const result = await execa('tmux', args, {
      cancelSignal: signal,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
      forceKillAfterDelay: 500,
      reject: false,
    })
    const stdout = result.stdout.trimEnd()
    const stderr = result.stderr.trimEnd()
    return result.exitCode === 0
      ? { ok: true, stdout, stderr }
      : { ok: false, stdout, stderr, message: stderr || 'error.tmux-command-failed' }
  } catch (error) {
    const failure = error as { code?: unknown; isCanceled?: boolean; timedOut?: boolean; message?: string }
    if (signal?.aborted || failure.isCanceled) return { ok: false, stdout: '', stderr: '', message: 'cancelled' }
    if (failure.code === 'ENOENT') return { ok: false, stdout: '', stderr: '', message: 'error.tmux-unavailable' }
    if (failure.timedOut) return { ok: false, stdout: '', stderr: '', message: 'timeout' }
    return { ok: false, stdout: '', stderr: '', message: failure.message || 'error.tmux-command-failed' }
  }
}

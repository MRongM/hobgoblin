import path from 'node:path'
import { execa } from 'execa'
import type { TmuxSessionRecord } from '#/shared/tmux-cleanup.ts'
import {
  isHobgoblinTmuxSessionName,
  normalizeTmuxSessionPath,
  TMUX_INIT_PATH_OPTION,
  TMUX_TERMINAL_NUMBER_OPTION,
} from '#/system/tmux-session.ts'

const TMUX_COMMAND_TIMEOUT_MS = 15_000
const TMUX_COMMAND = 'tmux'
const NO_TMUX_SERVER_RE = /(?:no server running|failed to connect to server|no sessions)/iu
const MISSING_TMUX_SESSION_RE =
  /(?:no server running|failed to connect to server|no sessions|can't find session|session not found)/iu
let localTmuxExecutable = TMUX_COMMAND

export const TMUX_SESSION_LIST_FORMAT = `#{${TMUX_INIT_PATH_OPTION}}\t#{${TMUX_TERMINAL_NUMBER_OPTION}}\t#{session_name}`

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
    const [rawInitialPath, rawTerminalNumber, sessionName] = fields
    const initialPath = normalizeTmuxSessionPath(rawInitialPath ?? '')
    const terminalNumber = parseRecordedTerminalNumber(rawTerminalNumber)
    if (!sessionName || !initialPath || terminalNumber === null) continue
    sessions.push({ sessionName, initialPath, terminalNumber })
  }
  return sessions
}

function parseRecordedTerminalNumber(value: string | undefined): number | null {
  if (!value || !/^\d+$/u.test(value)) return null
  const terminalNumber = Number.parseInt(value, 10)
  return Number.isSafeInteger(terminalNumber) && terminalNumber > 0 ? terminalNumber : null
}

export async function listLocalTmuxSessions(options: LocalTmuxCommandOptions = {}): Promise<TmuxListResult> {
  const args = ['-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT]
  const run = options.run ?? runLocalTmuxCommand
  const result = tmuxListResultFromProcessResult(await run(args, options.signal))
  if (options.run || result.ok || result.message !== 'error.tmux-invalid-output') return result

  const refreshed = await refreshLocalTmuxExecutable(options.signal)
  if (!refreshed.ok) return refreshed
  return tmuxListResultFromProcessResult(await runLocalTmuxCommand(args, options.signal))
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

export async function killLocalTmuxSessionByName(
  sessionName: string,
  options: LocalTmuxCommandOptions = {},
): Promise<TmuxCommandResult> {
  if (!isHobgoblinTmuxSessionName(sessionName)) return { ok: false, message: 'error.invalid-arguments' }
  const result = await (options.run ?? runLocalTmuxCommand)(['kill-session', '-t', `=${sessionName}`], options.signal)
  return result.ok ? { ok: true, message: result.stderr } : { ok: false, message: result.message }
}

export function isTmuxSessionMissingMessage(message: string): boolean {
  return MISSING_TMUX_SESSION_RE.test(message)
}

async function runLocalTmuxCommand(args: string[], signal?: AbortSignal): Promise<TmuxProcessResult> {
  if (signal?.aborted) return { ok: false, stdout: '', stderr: '', message: 'cancelled' }
  try {
    let result = await runLocalTmuxExecutable(localTmuxExecutable, args, signal)
    if (isExecutableMissing(result)) {
      const refreshed = await refreshLocalTmuxExecutable(signal)
      if (!refreshed.ok) return { ...refreshed, stdout: '', stderr: '' }
      result = await runLocalTmuxExecutable(localTmuxExecutable, args, signal)
    }
    const stdout = result.stdout.trimEnd()
    const stderr = result.stderr.trimEnd()
    if (isExecutableMissing(result)) {
      return { ok: false, stdout, stderr, message: 'error.tmux-unavailable' }
    }
    return result.exitCode === 0
      ? { ok: true, stdout, stderr }
      : { ok: false, stdout, stderr, message: stderr || 'error.tmux-command-failed' }
  } catch (error) {
    const failure = error as {
      cause?: { code?: unknown }
      code?: unknown
      isCanceled?: boolean
      timedOut?: boolean
      message?: string
    }
    if (signal?.aborted || failure.isCanceled) return { ok: false, stdout: '', stderr: '', message: 'cancelled' }
    if (isExecutableMissing(failure)) {
      localTmuxExecutable = TMUX_COMMAND
      return { ok: false, stdout: '', stderr: '', message: 'error.tmux-unavailable' }
    }
    if (failure.timedOut) return { ok: false, stdout: '', stderr: '', message: 'timeout' }
    return { ok: false, stdout: '', stderr: '', message: failure.message || 'error.tmux-command-failed' }
  }
}

async function runLocalTmuxExecutable(executable: string, args: string[], signal?: AbortSignal) {
  return await execa(executable, args, {
    cancelSignal: signal,
    timeout: TMUX_COMMAND_TIMEOUT_MS,
    forceKillAfterDelay: 500,
    reject: false,
  })
}

async function refreshLocalTmuxExecutable(
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const resolved = await resolveTmuxFromLoginShell(signal)
  if (!resolved.ok) return resolved
  localTmuxExecutable = resolved.executable
  return { ok: true }
}

async function resolveTmuxFromLoginShell(
  signal?: AbortSignal,
): Promise<{ ok: true; executable: string } | { ok: false; message: string }> {
  const configuredShell = process.env.SHELL
  const shell =
    configuredShell && path.isAbsolute(configuredShell) && !/[\0-\x1f\x7f]/u.test(configuredShell)
      ? configuredShell
      : process.platform === 'darwin'
        ? '/bin/zsh'
        : '/bin/sh'
  try {
    const result = await execa(shell, ['-lc', `command -v ${TMUX_COMMAND}`], {
      cancelSignal: signal,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
      forceKillAfterDelay: 500,
      reject: false,
    })
    if (signal?.aborted || result.isCanceled) return { ok: false, message: 'cancelled' }
    if (result.exitCode !== 0) return { ok: false, message: 'error.tmux-unavailable' }
    const executable = result.stdout.trim().split(/\r?\n/u).at(-1)?.trim()
    return executable && path.isAbsolute(executable) && !/[\0-\x1f\x7f]/u.test(executable)
      ? { ok: true, executable }
      : { ok: false, message: 'error.tmux-unavailable' }
  } catch (error) {
    const failure = error as { isCanceled?: boolean; timedOut?: boolean }
    if (signal?.aborted || failure.isCanceled) return { ok: false, message: 'cancelled' }
    return { ok: false, message: failure.timedOut ? 'timeout' : 'error.tmux-unavailable' }
  }
}

function isExecutableMissing(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const failure = value as { cause?: { code?: unknown }; code?: unknown }
  return failure.code === 'ENOENT' || failure.cause?.code === 'ENOENT'
}

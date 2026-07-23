import { createHash } from 'node:crypto'
import path from 'node:path'

const TMUX_SESSION_PROTOCOL = 'hobgoblin-terminal-session-v1'
const TMUX_SESSION_PREFIX = 'hobgoblin-v1-'
const HOBGOBLIN_TMUX_SESSION_NAME_RE = /^hobgoblin-v1-[a-f0-9]{24}$/u
const MAX_TMUX_SESSION_PATH_CHARS = 4096
const UNSAFE_PATH_CHARS_RE = /[\0-\x1f\x7f]/

export const TMUX_TERMINAL_NUMBER_OPTION = '@hobgoblin_terminal_number'
export const TMUX_INIT_PATH_OPTION = '@hobgoblin_init_path'

export interface TmuxSessionDescriptor {
  projectRoot: string
  workingDirectory: string
  terminalNumber: number
}

export function normalizeTmuxSessionDescriptor(input: TmuxSessionDescriptor): TmuxSessionDescriptor | null {
  const projectRoot = normalizeTmuxSessionPath(input.projectRoot)
  const workingDirectory = normalizeTmuxSessionPath(input.workingDirectory)
  if (!projectRoot || !workingDirectory || !isSafeTerminalNumber(input.terminalNumber)) return null
  return { projectRoot, workingDirectory, terminalNumber: input.terminalNumber }
}

export function buildTmuxSessionName(input: TmuxSessionDescriptor): string | null {
  const descriptor = normalizeTmuxSessionDescriptor(input)
  if (!descriptor) return null
  const serialized = [
    TMUX_SESSION_PROTOCOL,
    descriptor.projectRoot,
    descriptor.workingDirectory,
    String(descriptor.terminalNumber),
  ].join('\0')
  const digest = createHash('sha256').update(serialized, 'utf8').digest('hex').slice(0, 24)
  return `${TMUX_SESSION_PREFIX}${digest}`
}

export function normalizeTmuxSessionPath(value: string): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TMUX_SESSION_PATH_CHARS ||
    !value.startsWith('/') ||
    UNSAFE_PATH_CHARS_RE.test(value)
  ) {
    return null
  }
  const normalized = path.posix.normalize(value)
  return normalized === '/' ? normalized : normalized.replace(/\/$/u, '')
}

export function isHobgoblinTmuxSessionName(value: unknown): value is string {
  return typeof value === 'string' && HOBGOBLIN_TMUX_SESSION_NAME_RE.test(value)
}

export function resolveTmuxSessionTerminalNumbers(
  projectRootInput: string,
  sessions: ReadonlyArray<{ sessionName: string; initialPath: string; terminalNumber: number }>,
): Map<string, number> {
  const projectRoot = normalizeTmuxSessionPath(projectRootInput)
  if (!projectRoot) return new Map()

  const resolved = new Map<string, number>()
  for (const session of sessions) {
    const workingDirectory = normalizeTmuxSessionPath(session.initialPath)
    const terminalNumber = session.terminalNumber
    if (
      workingDirectory &&
      isHobgoblinTmuxSessionName(session.sessionName) &&
      isSafeTerminalNumber(terminalNumber) &&
      buildTmuxSessionName({ projectRoot, workingDirectory, terminalNumber }) === session.sessionName
    ) {
      resolved.set(session.sessionName, terminalNumber)
    }
  }
  return resolved
}

function isSafeTerminalNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1
}

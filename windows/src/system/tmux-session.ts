import { createHash } from 'node:crypto'
import path from 'node:path'

const TMUX_SESSION_PROTOCOL = 'hobgoblin-terminal-session-v1'
const TMUX_SESSION_PREFIX = 'hobgoblin-v1-'
const TMUX_SERVER_PROTOCOL = 'hobgoblin-tmux-server-v1'
const TMUX_SERVER_PREFIX = 'hobgoblin-project-v1-'
const HOBGOBLIN_TMUX_SESSION_NAME_RE = /^hobgoblin-v1-[a-f0-9]{24}$/u
const HOBGOBLIN_TMUX_SERVER_NAME_RE = /^hobgoblin-project-v1-[a-f0-9]{24}$/u
const MAX_TMUX_SESSION_NAME_CHARS = 256
const MAX_TMUX_SESSION_PATH_CHARS = 4096
const UNSAFE_PATH_CHARS_RE = /[\0-\x1f\x7f]/

export const TMUX_TERMINAL_NUMBER_OPTION = '@hobgoblin_terminal_number'
export const TMUX_INIT_PATH_OPTION = '@hobgoblin_init_path'
export const TMUX_PROJECT_ROOT_OPTION = '@hobgoblin_project_root'

const TMUX_UNAVAILABLE_MESSAGE = 'Tmux is unavailable. Use New terminal (Native).'
const TMUX_START_FAILED_MESSAGE = 'Tmux failed to start. Use New terminal (Native).'

export interface TmuxSessionDescriptor {
  projectRoot: string
  workingDirectory: string
  terminalNumber: number
}

export type ExistingTmuxSessionKind = 'hobgoblin' | 'default'

export interface ExistingTmuxSessionTarget {
  kind: ExistingTmuxSessionKind
  sessionName: string
  serverName?: string
}

export function buildTmuxServerName(projectRootInput: string): string | null {
  const projectRoot = normalizeTmuxSessionPath(projectRootInput)
  if (!projectRoot) return null
  const digest = createHash('sha256')
    .update(`${TMUX_SERVER_PROTOCOL}\0${projectRoot}`, 'utf8')
    .digest('hex')
    .slice(0, 24)
  return `${TMUX_SERVER_PREFIX}${digest}`
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

export function buildTmuxAttachShellCommand(
  input: TmuxSessionDescriptor,
): { sessionName: string; command: string } | null {
  const descriptor = normalizeTmuxSessionDescriptor(input)
  const sessionName = descriptor ? buildTmuxSessionName(descriptor) : null
  const serverName = descriptor ? buildTmuxServerName(descriptor.projectRoot) : null
  if (!descriptor || !sessionName || !serverName) return null
  const paneTarget = `=${sessionName}:`
  const sessionTarget = `=${sessionName}`
  const projectTmux = `tmux -L ${shellQuote(serverName)}`
  const projectCreateCommand = buildCreateAndAttachCommand(
    projectTmux,
    descriptor,
    sessionName,
    sessionTarget,
    paneTarget,
  )
  const projectAttachCommand = buildConfigureAndAttachCommand(projectTmux, descriptor, sessionTarget, paneTarget)
  const legacyAttachCommand = buildConfigureAndAttachCommand('tmux', descriptor, sessionTarget, paneTarget)
  return {
    sessionName,
    command: [
      `if ${projectTmux} has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then`,
      indentShellCommand(projectAttachCommand),
      `elif tmux has-session -t ${shellQuote(sessionTarget)} 2>/dev/null; then`,
      indentShellCommand(legacyAttachCommand),
      'else',
      indentShellCommand(projectCreateCommand),
      'fi',
    ].join('\n'),
  }
}

export function buildExistingTmuxAttachShellCommand(
  target: ExistingTmuxSessionTarget,
): { sessionName: string; command: string } | null {
  if (target.kind === 'default') {
    if (target.serverName !== undefined || !isSafeTmuxSessionName(target.sessionName)) return null
  } else if (target.kind === 'hobgoblin') {
    if (
      !isHobgoblinTmuxSessionName(target.sessionName) ||
      (target.serverName !== undefined && !isHobgoblinTmuxServerName(target.serverName))
    ) {
      return null
    }
  } else {
    return null
  }
  const serverName = target.serverName ?? 'default'
  return {
    sessionName: target.sessionName,
    command: `tmux -L ${shellQuote(serverName)} attach-session -t ${shellQuote(`=${target.sessionName}`)}`,
  }
}

export function buildRequiredTmuxShellScript(workingDirectoryInput: string, tmuxCommand: string): string | null {
  const workingDirectory = normalizeTmuxSessionPath(workingDirectoryInput)
  if (!workingDirectory || tmuxCommand.length === 0) return null
  return buildRequiredTmuxCommandShellScript(tmuxCommand, [`cd ${shellQuote(workingDirectory)} || exit`])
}

export function buildRequiredTmuxAttachShellScript(tmuxCommand: string): string | null {
  return tmuxCommand.length > 0 ? buildRequiredTmuxCommandShellScript(tmuxCommand) : null
}

function buildRequiredTmuxCommandShellScript(tmuxCommand: string, prefix: readonly string[] = []): string {
  return [
    ...prefix,
    'if ! command -v tmux >/dev/null 2>&1; then',
    `  printf '%s\\n' ${shellQuote(TMUX_UNAVAILABLE_MESSAGE)} >&2`,
    '  exit 127',
    'fi',
    tmuxCommand,
    'tmux_status=$?',
    'if [ "$tmux_status" -ne 0 ]; then',
    `  printf '%s\\n' ${shellQuote(TMUX_START_FAILED_MESSAGE)} >&2`,
    'fi',
    'exit "$tmux_status"',
  ].join('\n')
}

function buildCreateAndAttachCommand(
  tmuxCommand: string,
  descriptor: TmuxSessionDescriptor,
  sessionName: string,
  sessionTarget: string,
  paneTarget: string,
): string {
  return [
    `${tmuxCommand} new-session -d -s ${shellQuote(sessionName)} -c ${shellQuote(descriptor.workingDirectory)}`,
    buildConfigureAndAttachCommand(tmuxCommand, descriptor, sessionTarget, paneTarget),
  ].join(' &&\n')
}

function buildConfigureAndAttachCommand(
  tmuxCommand: string,
  descriptor: TmuxSessionDescriptor,
  sessionTarget: string,
  paneTarget: string,
): string {
  return [
    `${tmuxCommand} set-option -t ${shellQuote(paneTarget)} mouse on`,
    `${tmuxCommand} set-option -t ${shellQuote(paneTarget)} ${TMUX_PROJECT_ROOT_OPTION} ${shellQuote(descriptor.projectRoot)}`,
    `${tmuxCommand} set-option -t ${shellQuote(paneTarget)} ${TMUX_INIT_PATH_OPTION} ${shellQuote(descriptor.workingDirectory)}`,
    `${tmuxCommand} set-option -t ${shellQuote(paneTarget)} ${TMUX_TERMINAL_NUMBER_OPTION} ${shellQuote(String(descriptor.terminalNumber))}`,
    `${tmuxCommand} attach-session -t ${shellQuote(sessionTarget)}`,
  ].join(' &&\n')
}

function indentShellCommand(command: string): string {
  return command
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
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

export function isSafeTmuxSessionName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_TMUX_SESSION_NAME_CHARS &&
    !UNSAFE_PATH_CHARS_RE.test(value)
  )
}

export function isHobgoblinTmuxServerName(value: unknown): value is string {
  return typeof value === 'string' && HOBGOBLIN_TMUX_SERVER_NAME_RE.test(value)
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

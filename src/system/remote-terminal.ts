import {
  buildTmuxSessionName,
  isHobgoblinTmuxSessionName,
  normalizeTmuxSessionDescriptor,
  TMUX_INIT_PATH_OPTION,
  TMUX_TERMINAL_NUMBER_OPTION,
  type TmuxSessionDescriptor,
} from '#/system/tmux-session.ts'

export interface ManagedRemoteTerminalTarget extends TmuxSessionDescriptor {
  alias: string
}

export type ExternalRemoteTerminalTarget = ManagedRemoteTerminalTarget

export interface RemoteTerminalInvocation {
  command: 'ssh'
  args: string[]
  script: string
  shellCommand: string
  tmuxSessionName: string | null
}

export interface RemoteTerminalInvocationOptions {
  sshOptions?: readonly string[]
  useTmux?: boolean
  existingTmuxSessionName?: string
}

export function buildManagedRemoteTerminalInvocation(
  target: ManagedRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): RemoteTerminalInvocation | null {
  const descriptor = normalizeTmuxSessionDescriptor(target)
  if (!isSafeRemoteAlias(target.alias) || !descriptor) return null

  const existingSessionName = options.existingTmuxSessionName
  if (existingSessionName !== undefined && !isHobgoblinTmuxSessionName(existingSessionName)) return null
  const tmuxSessionName =
    options.useTmux === true ? (existingSessionName ?? buildTmuxSessionName(descriptor)) : null
  if (options.useTmux === true && !tmuxSessionName) return null
  const script = tmuxSessionName
    ? buildTmuxRemoteLoginShellScript(descriptor, tmuxSessionName, existingSessionName !== undefined)
    : buildPlainRemoteLoginShellScript(descriptor.workingDirectory)
  return buildSshInvocation(target.alias, script, tmuxSessionName, options)
}

export function buildExternalRemoteTerminalInvocation(
  target: ExternalRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): RemoteTerminalInvocation | null {
  return buildManagedRemoteTerminalInvocation(target, options)
}

function buildPlainRemoteLoginShellScript(worktreePath: string): string {
  return [`cd ${shellQuote(worktreePath)} || exit`, 'exec "${SHELL:-/bin/sh}" -l'].join('\n')
}

function buildTmuxRemoteLoginShellScript(
  target: TmuxSessionDescriptor,
  sessionName: string,
  attachExisting: boolean,
): string {
  const tmuxCommand = attachExisting
    ? `  exec tmux attach-session -t ${shellQuote(`=${sessionName}`)}`
    : `  exec tmux new-session -A -s ${shellQuote(sessionName)} -c ${shellQuote(target.workingDirectory)} \\; set-option -t ${shellQuote(`=${sessionName}`)} ${TMUX_INIT_PATH_OPTION} ${shellQuote(target.workingDirectory)} \\; set-option -t ${shellQuote(`=${sessionName}`)} ${TMUX_TERMINAL_NUMBER_OPTION} ${shellQuote(String(target.terminalNumber))} \\; set-option -t ${shellQuote(`=${sessionName}:`)} mouse on`
  return [
    `cd ${shellQuote(target.workingDirectory)} || exit`,
    'if command -v tmux >/dev/null 2>&1; then',
    tmuxCommand,
    'fi',
    'exec "${SHELL:-/bin/sh}" -l',
  ].join('\n')
}

function buildSshInvocation(
  alias: string,
  script: string,
  tmuxSessionName: string | null,
  options: RemoteTerminalInvocationOptions,
): RemoteTerminalInvocation {
  const remoteCommand = `sh -lc ${shellQuote(script)}`
  const args = ['-tt', ...(options.sshOptions ?? []), '--', alias, remoteCommand]
  return {
    command: 'ssh',
    args,
    script,
    shellCommand: ['ssh', ...args].map(shellQuote).join(' '),
    tmuxSessionName,
  }
}

function isSafeRemoteAlias(alias: string): boolean {
  return alias.length > 0 && alias.length <= 255 && !/[\s\0/?#\\]/.test(alias)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

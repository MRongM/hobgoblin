import {
  buildExistingTmuxAttachShellCommand,
  buildRequiredTmuxAttachShellScript,
  buildTmuxAttachShellCommand,
  buildRequiredTmuxShellScript,
  buildTmuxServerName,
  isHobgoblinTmuxSessionName,
  normalizeTmuxSessionDescriptor,
  type ExistingTmuxSessionKind,
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
  existingTmuxSessionKind?: ExistingTmuxSessionKind
  existingTmuxSessionName?: string
  existingTmuxServerName?: string
}

export function buildManagedRemoteTerminalInvocation(
  target: ManagedRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): RemoteTerminalInvocation | null {
  const descriptor = normalizeTmuxSessionDescriptor(target)
  if (!isSafeRemoteAlias(target.alias) || !descriptor) return null

  const existingSessionName = options.existingTmuxSessionName
  const existingServerName = options.existingTmuxServerName
  const existingSessionKind = options.existingTmuxSessionKind
  let existingTmuxInvocation: { sessionName: string; command: string } | null = null
  if (existingSessionKind !== undefined) {
    if (!existingSessionName) return null
    existingTmuxInvocation = buildExistingTmuxAttachShellCommand({
      kind: existingSessionKind,
      sessionName: existingSessionName,
      ...(existingServerName === undefined ? {} : { serverName: existingServerName }),
    })
    if (!existingTmuxInvocation) return null
  } else {
    if (existingSessionName !== undefined && !isHobgoblinTmuxSessionName(existingSessionName)) return null
    if (
      existingServerName !== undefined &&
      (!existingSessionName || existingServerName !== buildTmuxServerName(descriptor.projectRoot))
    ) {
      return null
    }
    existingTmuxInvocation = existingSessionName
      ? {
          sessionName: existingSessionName,
          command: `tmux${existingServerName ? ` -L ${shellQuote(existingServerName)}` : ''} attach-session -t ${shellQuote(`=${existingSessionName}`)}`,
        }
      : null
  }
  const tmuxInvocation =
    options.useTmux === true
      ? existingSessionName
        ? existingTmuxInvocation
        : buildTmuxAttachShellCommand(descriptor)
      : null
  if (options.useTmux === true && !tmuxInvocation) return null
  const script = tmuxInvocation
    ? existingSessionKind
      ? requireTmuxAttachShellScript(tmuxInvocation.command)
      : buildTmuxRemoteLoginShellScript(descriptor, tmuxInvocation.command)
    : buildPlainRemoteLoginShellScript(descriptor.workingDirectory)
  return buildSshInvocation(target.alias, script, tmuxInvocation?.sessionName ?? null, options)
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

function buildTmuxRemoteLoginShellScript(target: TmuxSessionDescriptor, tmuxCommand: string): string {
  return requireTmuxShellScript(target.workingDirectory, tmuxCommand)
}

function requireTmuxShellScript(workingDirectory: string, tmuxCommand: string): string {
  const script = buildRequiredTmuxShellScript(workingDirectory, tmuxCommand)
  if (!script) throw new Error('Invalid tmux terminal invocation')
  return script
}

function requireTmuxAttachShellScript(tmuxCommand: string): string {
  const script = buildRequiredTmuxAttachShellScript(tmuxCommand)
  if (!script) throw new Error('Invalid tmux attach invocation')
  return script
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

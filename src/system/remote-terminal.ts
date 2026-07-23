import {
  buildTmuxSessionName,
  normalizeTmuxSessionDescriptor,
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
}

export interface RemoteTerminalInvocationOptions {
  sshOptions?: readonly string[]
  useTmux?: boolean
}

export function buildManagedRemoteTerminalInvocation(
  target: ManagedRemoteTerminalTarget,
  options: RemoteTerminalInvocationOptions = {},
): RemoteTerminalInvocation | null {
  const descriptor = normalizeTmuxSessionDescriptor(target)
  if (!isSafeRemoteAlias(target.alias) || !descriptor) return null

  const script =
    options.useTmux === true
      ? buildTmuxRemoteLoginShellScript(descriptor)
      : buildPlainRemoteLoginShellScript(descriptor.workingDirectory)
  return buildSshInvocation(target.alias, script, options)
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

function buildTmuxRemoteLoginShellScript(target: TmuxSessionDescriptor): string {
  const sessionName = buildTmuxSessionName(target)
  if (!sessionName) throw new Error('Invalid tmux session descriptor')
  return [
    `cd ${shellQuote(target.workingDirectory)} || exit`,
    'if command -v tmux >/dev/null 2>&1; then',
    `  exec tmux new-session -A -s ${shellQuote(sessionName)} -c ${shellQuote(target.workingDirectory)}`,
    'fi',
    'exec "${SHELL:-/bin/sh}" -l',
  ].join('\n')
}

function buildSshInvocation(
  alias: string,
  script: string,
  options: RemoteTerminalInvocationOptions,
): RemoteTerminalInvocation {
  const remoteCommand = `sh -lc ${shellQuote(script)}`
  const args = ['-tt', ...(options.sshOptions ?? []), '--', alias, remoteCommand]
  return {
    command: 'ssh',
    args,
    script,
    shellCommand: ['ssh', ...args].map(shellQuote).join(' '),
  }
}

function isSafeRemoteAlias(alias: string): boolean {
  return alias.length > 0 && alias.length <= 255 && !/[\s\0/?#\\]/.test(alias)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

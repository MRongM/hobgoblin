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

export interface LocalTerminalInvocation {
  command: string
  args: string[]
  script: string
  shellCommand: string
  tmuxSessionName: string
}

export interface LocalTerminalInvocationOptions {
  useTmux?: boolean
  existingTmuxSessionKind?: ExistingTmuxSessionKind
  existingTmuxSessionName?: string
  existingTmuxServerName?: string
  platform?: NodeJS.Platform
  fallbackShell?: string
}

export function buildManagedLocalTerminalInvocation(
  target: TmuxSessionDescriptor,
  options: LocalTerminalInvocationOptions = {},
): LocalTerminalInvocation | null {
  const platform = options.platform ?? process.platform
  if (options.useTmux !== true || platform === 'win32') return null
  const descriptor = normalizeTmuxSessionDescriptor(target)
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
      (!existingSessionName || existingServerName !== buildTmuxServerName(descriptor?.projectRoot ?? ''))
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
  const tmuxInvocation = existingSessionName
    ? existingTmuxInvocation
    : descriptor
      ? buildTmuxAttachShellCommand(descriptor)
      : null
  if (!descriptor || !tmuxInvocation) return null
  const fallbackShell =
    safeAbsoluteCommand(options.fallbackShell) ??
    safeAbsoluteCommand(process.env.SHELL) ??
    (platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
  const script = existingSessionKind
    ? buildRequiredTmuxAttachShellScript(tmuxInvocation.command)
    : buildRequiredTmuxShellScript(descriptor.workingDirectory, tmuxInvocation.command)
  if (!script) return null
  return {
    command: fallbackShell,
    args: ['-lc', script],
    script,
    shellCommand: [fallbackShell, '-lc', script].map(shellQuote).join(' '),
    tmuxSessionName: tmuxInvocation.sessionName,
  }
}

function safeAbsoluteCommand(value: string | undefined): string | null {
  return typeof value === 'string' && value.startsWith('/') && !/[\0-\x1f\x7f]/u.test(value) ? value : null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

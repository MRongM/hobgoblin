import {
  buildTmuxAttachShellCommand,
  isHobgoblinTmuxSessionName,
  normalizeTmuxSessionDescriptor,
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
  existingTmuxSessionName?: string
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
  if (existingSessionName !== undefined && !isHobgoblinTmuxSessionName(existingSessionName)) return null
  const tmuxInvocation = existingSessionName
    ? {
        sessionName: existingSessionName,
        command: `exec tmux attach-session -t ${shellQuote(`=${existingSessionName}`)}`,
      }
    : descriptor
      ? buildTmuxAttachShellCommand(descriptor)
      : null
  if (!descriptor || !tmuxInvocation) return null
  const fallbackShell =
    safeAbsoluteCommand(options.fallbackShell) ??
    safeAbsoluteCommand(process.env.SHELL) ??
    (platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
  const script = [
    `cd ${shellQuote(descriptor.workingDirectory)} || exit`,
    'if command -v tmux >/dev/null 2>&1; then',
    `  ${tmuxInvocation.command}`,
    'fi',
    `exec ${shellQuote(fallbackShell)} -l`,
  ].join('\n')
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

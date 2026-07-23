import {
  buildTmuxSessionName,
  normalizeTmuxSessionDescriptor,
  type TmuxSessionDescriptor,
} from '#/system/tmux-session.ts'

export interface LocalTerminalInvocation {
  command: '/bin/sh'
  args: string[]
  script: string
  shellCommand: string
}

export interface LocalTerminalInvocationOptions {
  useTmux?: boolean
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
  const sessionName = descriptor ? buildTmuxSessionName(descriptor) : null
  if (!descriptor || !sessionName) return null
  const fallbackShell = safeAbsoluteCommand(options.fallbackShell) ?? '/bin/sh'
  const script = [
    `cd ${shellQuote(descriptor.workingDirectory)} || exit`,
    'if command -v tmux >/dev/null 2>&1; then',
    `  exec tmux new-session -A -s ${shellQuote(sessionName)} -c ${shellQuote(descriptor.workingDirectory)}`,
    'fi',
    `exec ${shellQuote(fallbackShell)} -l`,
  ].join('\n')
  return {
    command: '/bin/sh',
    args: ['-lc', script],
    script,
    shellCommand: ['/bin/sh', '-lc', script].map(shellQuote).join(' '),
  }
}

function safeAbsoluteCommand(value: string | undefined): string | null {
  return typeof value === 'string' && value.startsWith('/') && !/[\0-\x1f\x7f]/u.test(value) ? value : null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

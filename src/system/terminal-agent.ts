import type { TerminalAgentProvider } from '#/shared/terminal.ts'

export function buildTerminalAgentLoginCommand(provider: TerminalAgentProvider): string {
  return [
    'unset GOBLIN_SERVER_INTERNAL_SECRET GOBLIN_OPEN_API_TOKEN GOBLIN_OPEN_API_CONTROL_TOKEN',
    `exec "\${SHELL:-/bin/sh}" -lic 'exec ${provider}'`,
  ].join('\n')
}

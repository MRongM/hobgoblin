import type { CommitMessageProvider, CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { readTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'

export interface AiTerminalHandoffInput {
  repoId: string
  branch: string
  worktreePath: string
  command: string
  navigation: { showRepoBranchDetailTab: (repoId: string, branch: string, tab: 'terminal') => void }
  setDetailCollapsed: (collapsed: boolean) => void
}

export function preferredAiHandoffProvider(availability: CommitMessageProviderAvailability): CommitMessageProvider {
  if (availability.codex) return 'codex'
  if (availability.claude) return 'claude'
  return 'codex'
}

export function buildAiHandoffCommand(provider: CommitMessageProvider, prompt: string): string {
  const encodedPrompt = JSON.stringify(prompt)
  return provider === 'codex' ? `codex exec --skip-git-repo-check ${encodedPrompt}` : `claude --print ${encodedPrompt}`
}

export async function prefillAiTerminalCommand(input: AiTerminalHandoffInput): Promise<boolean> {
  const bridge = readTerminalSessionCommandBridge()
  if (!bridge) return false

  const scope = worktreeTerminalKey(input.repoId, input.worktreePath)
  input.navigation.showRepoBranchDetailTab(input.repoId, input.branch, 'terminal')
  input.setDetailCollapsed(false)

  const snapshot = bridge.worktreeSnapshot(scope)
  let key = snapshot.selectedDescriptor?.key ?? snapshot.sessions[0]?.key ?? null
  if (key) {
    bridge.selectTerminal(scope, key)
  } else {
    key = await bridge.createTerminal({
      repoRoot: input.repoId,
      branch: input.branch,
      worktreePath: input.worktreePath,
    })
  }

  await Promise.resolve()
  if (!key) return false
  bridge.writeInput(key, input.command)
  return true
}

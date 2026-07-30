import type { CommitMessageProvider, CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import type { GitConflictWorktree } from '#/shared/git-types.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { readTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'
import type { TerminalSessionBase } from '#/web/components/terminal/types.ts'

export interface AiTerminalHandoffInput {
  repoId: string
  branch: string
  worktreePath: string
  command: string
  navigation: { showRepoBranchDetailTab: (repoId: string, branch: string, tab: 'terminal') => void }
  setDetailCollapsed: (collapsed: boolean) => void
}

export interface AiTerminalTargetHandoffInput {
  terminalBase: TerminalSessionBase
  command: string
  activate: () => void
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

export function buildMergeConflictAiCommand(provider: CommitMessageProvider): string {
  const prompt =
    'Resolve the current Git merge conflicts in this working tree. Inspect conflicted files, make minimal edits, and do not run git add, git commit, or git merge --continue.'
  return buildAiHandoffCommand(provider, prompt)
}

export function buildBranchWorkspaceMergeConflictAiCommand(
  provider: CommitMessageProvider,
  repositoryName: string,
  conflictWorktree: GitConflictWorktree,
): string {
  const prompt = `Resolve the current Git merge conflicts for repository "${repositoryName}" at "${conflictWorktree.path}". The terminal working directory is the branch workspace root. Inspect conflicted files, make minimal edits, and do not run git add, git commit, or git merge --continue.`
  return buildAiHandoffCommand(provider, prompt)
}

export async function prefillAiTerminalCommand(input: AiTerminalHandoffInput): Promise<boolean> {
  return await prefillAiTerminalTargetCommand({
    terminalBase: {
      repoRoot: input.repoId,
      branch: input.branch,
      worktreePath: input.worktreePath,
    },
    command: input.command,
    activate: () => {
      input.navigation.showRepoBranchDetailTab(input.repoId, input.branch, 'terminal')
      input.setDetailCollapsed(false)
    },
  })
}

export async function prefillAiTerminalTargetCommand(input: AiTerminalTargetHandoffInput): Promise<boolean> {
  const bridge = readTerminalSessionCommandBridge()
  if (!bridge) return false

  const scope = worktreeTerminalKey(input.terminalBase.repoRoot, input.terminalBase.worktreePath)
  input.activate()

  const snapshot = bridge.worktreeSnapshot(scope)
  const openSessions = snapshot.sessions.filter((session) => session.phase === 'open')
  let key = openSessions.find((session) => session.selected)?.key ?? openSessions[0]?.key ?? null
  if (key) {
    bridge.selectTerminal(scope, key)
  } else {
    key = await bridge.createTerminal(input.terminalBase)
  }

  if (!key) return false
  if (!(await bridge.waitForInputReady(key))) return false
  bridge.writeInput(key, input.command)
  return true
}

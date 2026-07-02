import { useEffect, useMemo, useState } from 'react'
import {
  COMMIT_MESSAGE_PROVIDERS,
  type CommitMessageProvider,
  type CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { readTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'
import { getCommitMessageProviders } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'

interface MergeConflictAiActionsInput {
  repoId: string
  branch: string
  worktreePath: string
  navigation: { showRepoBranchDetailTab: (repoId: string, branch: string, tab: 'terminal') => void }
  setDetailCollapsed: (collapsed: boolean) => void
}

interface MergeConflictAiAction {
  provider: CommitMessageProvider
  label: string
  title: string
  disabled: boolean
  pending: boolean
  onSelect: () => Promise<boolean>
}

const EMPTY_PROVIDERS: CommitMessageProviderAvailability = { codex: false, claude: false }

export function useMergeConflictAiActions(input: MergeConflictAiActionsInput): {
  actions: MergeConflictAiAction[]
  error: string | null
} {
  const t = useT()
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>(EMPTY_PROVIDERS)
  const [pending, setPending] = useState<CommitMessageProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getCommitMessageProviders(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setProviders(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders(EMPTY_PROVIDERS)
      })
    return () => controller.abort()
  }, [])

  const actions = useMemo<MergeConflictAiAction[]>(() => {
    return COMMIT_MESSAGE_PROVIDERS.filter((provider) => providers[provider]).map((provider) => ({
      provider,
      label: t(`action.merge-conflict-ai-${provider}`),
      title: t('action.merge-conflict-ai-title'),
      disabled: pending !== null,
      pending: pending === provider,
      onSelect: async () => {
        if (pending !== null) return false
        setPending(provider)
        setError(null)
        try {
          const ok = await prefillMergeConflictCommand(input, provider)
          if (!ok) {
            setError(t('action.merge-conflict-ai-prefill-failed'))
            return false
          }
          return true
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
          return false
        } finally {
          setPending(null)
        }
      },
    }))
  }, [input, pending, providers, t])

  return { actions, error }
}

async function prefillMergeConflictCommand(
  input: MergeConflictAiActionsInput,
  provider: CommitMessageProvider,
): Promise<boolean> {
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
  bridge.writeInput(key, buildMergeConflictAiCommand(provider))
  return true
}

export function buildMergeConflictAiCommand(provider: CommitMessageProvider): string {
  const prompt =
    'Resolve the current Git merge conflicts in this working tree. Inspect conflicted files, make minimal edits, and do not run git add, git commit, or git merge --continue.'
  if (provider === 'codex') return `codex exec --skip-git-repo-check ${JSON.stringify(prompt)}`
  return `claude --print ${JSON.stringify(prompt)}`
}

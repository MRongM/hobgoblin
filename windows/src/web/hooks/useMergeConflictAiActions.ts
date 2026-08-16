import { useEffect, useMemo, useState } from 'react'
import {
  COMMIT_MESSAGE_PROVIDERS,
  type CommitMessageProvider,
  type CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
import { getCommitMessageProviders } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'

interface MergeConflictAiActionsInput {
  onHandoff: (provider: CommitMessageProvider) => Promise<boolean>
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
          const ok = await input.onHandoff(provider)
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

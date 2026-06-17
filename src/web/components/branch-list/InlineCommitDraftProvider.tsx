import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  COMMIT_MESSAGE_PROVIDERS,
  type CommitMessageProvider,
  type CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
import { generateRepositoryCommitMessage, getCommitMessageProviders } from '#/web/repo-client.ts'
import { useT } from '#/web/stores/i18n.ts'

const EMPTY_COMMIT_MESSAGE_PROVIDERS: CommitMessageProviderAvailability = { codex: false, claude: false }

export interface InlineCommitDraft {
  repoId: string
  worktreePath: string
  open: boolean
  message: string
  error: string | null
  generating: CommitMessageProvider | null
  pendingGeneratedMessage: string | null
}

export interface GenerateInlineCommitMessageInput {
  repoId: string
  worktreePath: string
  provider: CommitMessageProvider
}

export interface InlineCommitDraftActions {
  openDraft: (repoId: string, worktreePath: string) => void
  clearDraft: (repoId: string, worktreePath: string) => void
  setMessage: (repoId: string, worktreePath: string, message: string) => void
  setError: (repoId: string, worktreePath: string, error: string | null) => void
  generateMessage: (input: GenerateInlineCommitMessageInput) => Promise<void>
  applyPendingGeneratedMessage: (repoId: string, worktreePath: string) => void
  clearPendingGeneratedMessage: (repoId: string, worktreePath: string) => void
}

interface InlineCommitDraftContextValue extends InlineCommitDraftActions {
  availableProviders: CommitMessageProvider[]
  draftFor: (repoId: string, worktreePath: string | null | undefined) => InlineCommitDraft | null
}

type DraftsByKey = Record<string, InlineCommitDraft | undefined>

const InlineCommitDraftContext = createContext<InlineCommitDraftContextValue | null>(null)

export function InlineCommitDraftProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>(EMPTY_COMMIT_MESSAGE_PROVIDERS)
  const [drafts, setDrafts] = useState<DraftsByKey>({})
  const draftsRef = useRef<DraftsByKey>({})
  const generationControllersRef = useRef<Map<string, AbortController>>(new Map())

  const updateDrafts = useCallback((updater: (current: DraftsByKey) => DraftsByKey) => {
    setDrafts((current) => {
      const next = updater(current)
      draftsRef.current = next
      return next
    })
  }, [])

  const updateDraft = useCallback(
    (repoId: string, worktreePath: string, updater: (draft: InlineCommitDraft) => InlineCommitDraft) => {
      const key = inlineCommitDraftKey(repoId, worktreePath)
      updateDrafts((current) => {
        const draft = current[key]
        if (!draft) return current
        const nextDraft = updater(draft)
        if (nextDraft === draft) return current
        return { ...current, [key]: nextDraft }
      })
    },
    [updateDrafts],
  )

  const abortDraftGeneration = useCallback((repoId: string, worktreePath: string) => {
    const key = inlineCommitDraftKey(repoId, worktreePath)
    generationControllersRef.current.get(key)?.abort()
    generationControllersRef.current.delete(key)
  }, [])

  const openDraft = useCallback(
    (repoId: string, worktreePath: string) => {
      if (!repoId || !worktreePath) return
      const key = inlineCommitDraftKey(repoId, worktreePath)
      updateDrafts((current) => {
        const existing = current[key]
        const nextDraft: InlineCommitDraft = existing
          ? { ...existing, open: true }
          : {
              repoId,
              worktreePath,
              open: true,
              message: '',
              error: null,
              generating: null,
              pendingGeneratedMessage: null,
            }
        return { ...current, [key]: nextDraft }
      })
    },
    [updateDrafts],
  )

  const clearDraft = useCallback(
    (repoId: string, worktreePath: string) => {
      abortDraftGeneration(repoId, worktreePath)
      const key = inlineCommitDraftKey(repoId, worktreePath)
      updateDrafts((current) => {
        if (!current[key]) return current
        const next = { ...current }
        delete next[key]
        return next
      })
    },
    [abortDraftGeneration, updateDrafts],
  )

  const setMessage = useCallback(
    (repoId: string, worktreePath: string, message: string) => {
      updateDraft(repoId, worktreePath, (draft) => ({ ...draft, message }))
    },
    [updateDraft],
  )

  const setError = useCallback(
    (repoId: string, worktreePath: string, error: string | null) => {
      updateDraft(repoId, worktreePath, (draft) => ({ ...draft, error }))
    },
    [updateDraft],
  )

  const applyPendingGeneratedMessage = useCallback(
    (repoId: string, worktreePath: string) => {
      updateDraft(repoId, worktreePath, (draft) => {
        if (!draft.pendingGeneratedMessage) return draft
        return {
          ...draft,
          message: draft.pendingGeneratedMessage,
          pendingGeneratedMessage: null,
          error: null,
        }
      })
    },
    [updateDraft],
  )

  const clearPendingGeneratedMessage = useCallback(
    (repoId: string, worktreePath: string) => {
      updateDraft(repoId, worktreePath, (draft) => ({ ...draft, pendingGeneratedMessage: null }))
    },
    [updateDraft],
  )

  const generateMessage = useCallback(
    async ({ repoId, worktreePath, provider }: GenerateInlineCommitMessageInput) => {
      if (!repoId || !worktreePath) return
      const key = inlineCommitDraftKey(repoId, worktreePath)
      const draft = draftsRef.current[key]
      if (!draft || draft.generating) return

      const controller = new AbortController()
      generationControllersRef.current.set(key, controller)
      updateDraft(repoId, worktreePath, (current) => ({
        ...current,
        generating: provider,
        error: null,
        pendingGeneratedMessage: null,
      }))

      try {
        const result = await generateRepositoryCommitMessage(repoId, worktreePath, provider, controller.signal)
        if (controller.signal.aborted) return
        if (!result.ok) {
          const nextError = formatCommitMessageGenerationError(t, result.message)
          if (nextError) setError(repoId, worktreePath, nextError)
          return
        }
        const latestDraft = draftsRef.current[key]
        if (!latestDraft) return
        updateDraft(repoId, worktreePath, (current) =>
          current.message.trim()
            ? { ...current, pendingGeneratedMessage: result.message }
            : { ...current, message: result.message },
        )
      } catch (err) {
        if (!controller.signal.aborted) {
          const nextError = formatCommitMessageGenerationError(t, err instanceof Error ? err.message : String(err))
          if (nextError) setError(repoId, worktreePath, nextError)
        }
      } finally {
        if (generationControllersRef.current.get(key) === controller) {
          generationControllersRef.current.delete(key)
          updateDraft(repoId, worktreePath, (current) => ({ ...current, generating: null }))
        }
      }
    },
    [setError, t, updateDraft],
  )

  const draftFor = useCallback(
    (repoId: string, worktreePath: string | null | undefined): InlineCommitDraft | null => {
      if (!repoId || !worktreePath) return null
      return drafts[inlineCommitDraftKey(repoId, worktreePath)] ?? null
    },
    [drafts],
  )

  useEffect(() => {
    const controller = new AbortController()
    void getCommitMessageProviders(controller.signal)
      .then((nextProviders) => {
        if (!controller.signal.aborted) setProviders(nextProviders)
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders(EMPTY_COMMIT_MESSAGE_PROVIDERS)
      })
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(
    () => () => {
      for (const controller of generationControllersRef.current.values()) {
        controller.abort()
      }
      generationControllersRef.current.clear()
    },
    [],
  )

  const availableProviders = useMemo(
    () => COMMIT_MESSAGE_PROVIDERS.filter((provider) => providers[provider]),
    [providers],
  )

  const value = useMemo<InlineCommitDraftContextValue>(
    () => ({
      availableProviders,
      draftFor,
      openDraft,
      clearDraft,
      setMessage,
      setError,
      generateMessage,
      applyPendingGeneratedMessage,
      clearPendingGeneratedMessage,
    }),
    [
      applyPendingGeneratedMessage,
      availableProviders,
      clearDraft,
      clearPendingGeneratedMessage,
      draftFor,
      generateMessage,
      openDraft,
      setError,
      setMessage,
    ],
  )

  return <InlineCommitDraftContext.Provider value={value}>{children}</InlineCommitDraftContext.Provider>
}

export function useInlineCommitDraft(
  repoId: string,
  worktreePath: string | null | undefined,
): InlineCommitDraft | null {
  return useInlineCommitDraftContext().draftFor(repoId, worktreePath)
}

export function useInlineCommitDraftActions(): InlineCommitDraftActions {
  const {
    openDraft,
    clearDraft,
    setMessage,
    setError,
    generateMessage,
    applyPendingGeneratedMessage,
    clearPendingGeneratedMessage,
  } = useInlineCommitDraftContext()
  return {
    openDraft,
    clearDraft,
    setMessage,
    setError,
    generateMessage,
    applyPendingGeneratedMessage,
    clearPendingGeneratedMessage,
  }
}

export function useInlineCommitMessageProviders(): CommitMessageProvider[] {
  return useInlineCommitDraftContext().availableProviders
}

function useInlineCommitDraftContext(): InlineCommitDraftContextValue {
  const context = useContext(InlineCommitDraftContext)
  if (!context) throw new Error('InlineCommitDraftProvider is missing')
  return context
}

function inlineCommitDraftKey(repoId: string, worktreePath: string): string {
  return `${repoId}\0${worktreePath}`
}

function formatCommitMessageGenerationError(t: (key: string) => string, message: string): string {
  if (message === 'cancelled') return ''
  return message.startsWith('error.') ? t(message) : message
}

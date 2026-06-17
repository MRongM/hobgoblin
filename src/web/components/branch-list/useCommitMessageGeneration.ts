import { useEffect, useRef, useState } from 'react'
import {
  COMMIT_MESSAGE_PROVIDERS,
  type CommitMessageProvider,
  type CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
import { generateRepositoryCommitMessage, getCommitMessageProviders } from '#/web/repo-client.ts'

const EMPTY_COMMIT_MESSAGE_PROVIDERS: CommitMessageProviderAvailability = { codex: false, claude: false }

export function useCommitMessageGeneration(input: {
  repoId: string
  worktreePath: string
  message: string
  setMessage: (message: string) => void
  setError: (message: string | null) => void
  formatError: (message: string) => string
}) {
  const [providers, setProviders] = useState<CommitMessageProviderAvailability>(EMPTY_COMMIT_MESSAGE_PROVIDERS)
  const [generating, setGenerating] = useState<CommitMessageProvider | null>(null)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = useState<string | null>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
  const messageRef = useRef(input.message)

  useEffect(() => {
    messageRef.current = input.message
  }, [input.message])

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
      generationAbortRef.current?.abort()
    }
  }, [])

  async function generate(provider: CommitMessageProvider) {
    if (!input.repoId || !input.worktreePath || generating) return
    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setGenerating(provider)
    input.setError(null)
    setPendingGeneratedMessage(null)
    try {
      const result = await generateRepositoryCommitMessage(input.repoId, input.worktreePath, provider, controller.signal)
      if (controller.signal.aborted) return
      if (!result.ok) {
        const nextError = input.formatError(result.message)
        if (nextError) input.setError(nextError)
        return
      }
      if (messageRef.current.trim()) setPendingGeneratedMessage(result.message)
      else input.setMessage(result.message)
    } catch (err) {
      if (!controller.signal.aborted) {
        const nextError = input.formatError(err instanceof Error ? err.message : String(err))
        if (nextError) input.setError(nextError)
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null
        setGenerating(null)
      }
    }
  }

  function applyPendingGeneratedMessage() {
    if (!pendingGeneratedMessage) return
    input.setMessage(pendingGeneratedMessage)
    setPendingGeneratedMessage(null)
    input.setError(null)
  }

  return {
    availableProviders: COMMIT_MESSAGE_PROVIDERS.filter((provider) => providers[provider]),
    generating,
    pendingGeneratedMessage,
    setPendingGeneratedMessage,
    generate,
    applyPendingGeneratedMessage,
  }
}

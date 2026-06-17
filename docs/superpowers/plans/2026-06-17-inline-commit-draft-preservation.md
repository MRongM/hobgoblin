# Inline Commit Draft Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository instructions override the generic plan template: do not create git commits unless the user explicitly asks.

**Goal:** Preserve inline commit drafts and in-flight AI commit-message generation when the user switches active projects.

**Architecture:** Add a renderer-local provider above `RepoView` that owns inline commit draft lifecycle by `repoId + worktreePath`. Convert `InlineCommitForm` into a controlled view, then wire branch actions to open, render, update, and clear drafts through the provider.

**Tech Stack:** React context/hooks, Zustand-backed repo projection, Vitest/jsdom, Bun, existing repo client commit-message APIs.

---

## File Map

- Create `src/web/components/branch-list/InlineCommitDraftProvider.tsx`: renderer-local draft provider, provider availability loading, generation lifecycle, draft actions.
- Create `src/web/components/branch-list/InlineCommitDraftProvider.test.tsx`: provider tests for hidden generation, cancel abort, and worktree isolation.
- Modify `src/web/components/branch-list/InlineCommitForm.tsx`: make the form controlled and remove local generation hook usage.
- Modify `src/web/components/branch-list/BranchWriteDialogs.test.tsx`: update inline commit form tests for controlled props.
- Modify `src/web/hooks/useBranchWriteActions.tsx`: open and render provider-backed drafts.
- Modify `src/web/hooks/useBranchActionItems.test.tsx`: wrap hook harness with the provider and cover commit action opening an inline draft.
- Modify `src/web/App.tsx`: mount `InlineCommitDraftProvider` outside `RepoView`.
- Delete `src/web/components/branch-list/useCommitMessageGeneration.ts`: remove obsolete form-scoped generation lifecycle after the provider is wired. This deletion is part of implementation, but the executor must honor the repository's dangerous-operation confirmation rule before deleting the file.

## Task 1: Add Provider Tests

**Files:**
- Create: `src/web/components/branch-list/InlineCommitDraftProvider.test.tsx`

- [ ] **Step 1: Write failing provider tests**

Create `src/web/components/branch-list/InlineCommitDraftProvider.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { CommitMessageGenerationResult } from '#/shared/commit-message-ai.ts'
import {
  InlineCommitDraftProvider,
  useInlineCommitDraft,
  useInlineCommitDraftActions,
  useInlineCommitMessageProviders,
} from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: true, claude: true })
  mocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('InlineCommitDraftProvider', () => {
  test('keeps generation alive while the draft reader is unmounted', async () => {
    const pending = deferred<CommitMessageGenerationResult>()
    let signal: AbortSignal | null = null
    mocks.generateRepositoryCommitMessage.mockImplementationOnce((_repoId, _worktreePath, _provider, nextSignal) => {
      signal = nextSignal
      return pending.promise
    })

    renderProvider(<DraftHarness readerVisible />)
    await flush()
    click('[data-action="open"]')
    click('[data-action="generate"]')
    await flush()

    renderProvider(<DraftHarness readerVisible={false} />)
    await flush()
    expect(signal?.aborted).toBe(false)

    await act(async () => {
      pending.resolve({ ok: true, message: 'feat: hidden generation' })
      await pending.promise
    })

    renderProvider(<DraftHarness readerVisible />)
    await flush()

    expect(text('[data-slot="draft-message"]')).toBe('feat: hidden generation')
    expect(text('[data-slot="draft-generating"]')).toBe('')
  })

  test('stores generated output as pending replacement when the draft has manual text', async () => {
    mocks.generateRepositoryCommitMessage.mockResolvedValueOnce({ ok: true, message: 'fix: generated replacement' })

    renderProvider(<DraftHarness readerVisible />)
    await flush()
    click('[data-action="open"]')
    click('[data-action="manual"]')
    click('[data-action="generate"]')
    await flush()

    expect(text('[data-slot="draft-message"]')).toBe('manual message')
    expect(text('[data-slot="draft-pending"]')).toBe('fix: generated replacement')

    click('[data-action="apply-pending"]')

    expect(text('[data-slot="draft-message"]')).toBe('fix: generated replacement')
    expect(text('[data-slot="draft-pending"]')).toBe('')
  })

  test('cancel aborts generation and clears the draft', async () => {
    const pending = deferred<CommitMessageGenerationResult>()
    let signal: AbortSignal | null = null
    mocks.generateRepositoryCommitMessage.mockImplementationOnce((_repoId, _worktreePath, _provider, nextSignal) => {
      signal = nextSignal
      return pending.promise
    })

    renderProvider(<DraftHarness readerVisible />)
    await flush()
    click('[data-action="open"]')
    click('[data-action="generate"]')
    await flush()
    click('[data-action="clear"]')

    expect(signal?.aborted).toBe(true)
    expect(document.body.querySelector('[data-slot="draft-message"]')).toBeNull()
  })

  test('isolates drafts by repo id and worktree path', async () => {
    renderProvider(
      <>
        <DraftHarness repoId="/repo-a" worktreePath="/repo-a" readerVisible />
        <DraftHarness repoId="/repo-a" worktreePath="/repo-a-feature" readerVisible />
      </>,
    )
    await flush()

    click('[data-action="open:/repo-a:/repo-a"]')
    click('[data-action="manual:/repo-a:/repo-a"]')
    click('[data-action="open:/repo-a:/repo-a-feature"]')

    expect(text('[data-slot="draft-message:/repo-a:/repo-a"]')).toBe('manual message')
    expect(text('[data-slot="draft-message:/repo-a:/repo-a-feature"]')).toBe('')
  })

  test('loads available providers once for consumers', async () => {
    renderProvider(<DraftHarness readerVisible />)
    await flush()

    expect(text('[data-slot="providers"]')).toBe('codex,claude')
    expect(mocks.getCommitMessageProviders).toHaveBeenCalledTimes(1)
  })
})

function DraftHarness({
  repoId = '/repo',
  worktreePath = '/repo',
  readerVisible,
}: {
  repoId?: string
  worktreePath?: string
  readerVisible: boolean
}) {
  return (
    <>
      <DraftControls repoId={repoId} worktreePath={worktreePath} />
      {readerVisible ? <DraftReader repoId={repoId} worktreePath={worktreePath} /> : null}
    </>
  )
}

function DraftControls({ repoId, worktreePath }: { repoId: string; worktreePath: string }) {
  const actions = useInlineCommitDraftActions()
  const suffix = `${repoId}:${worktreePath}`
  return (
    <div>
      <button type="button" data-action="open" onClick={() => actions.openDraft(repoId, worktreePath)} />
      <button
        type="button"
        data-action={`open:${suffix}`}
        onClick={() => actions.openDraft(repoId, worktreePath)}
      />
      <button
        type="button"
        data-action="manual"
        onClick={() => actions.setMessage(repoId, worktreePath, 'manual message')}
      />
      <button
        type="button"
        data-action={`manual:${suffix}`}
        onClick={() => actions.setMessage(repoId, worktreePath, 'manual message')}
      />
      <button
        type="button"
        data-action="generate"
        onClick={() => void actions.generateMessage({ repoId, worktreePath, provider: 'codex' })}
      />
      <button type="button" data-action="clear" onClick={() => actions.clearDraft(repoId, worktreePath)} />
      <button
        type="button"
        data-action="apply-pending"
        onClick={() => actions.applyPendingGeneratedMessage(repoId, worktreePath)}
      />
    </div>
  )
}

function DraftReader({ repoId, worktreePath }: { repoId: string; worktreePath: string }) {
  const draft = useInlineCommitDraft(repoId, worktreePath)
  const providers = useInlineCommitMessageProviders()
  const suffix = `${repoId}:${worktreePath}`
  if (!draft?.open) return <div data-slot={`draft-closed:${suffix}`} />
  return (
    <div>
      <div data-slot="providers">{providers.join(',')}</div>
      <div data-slot="draft-message">{draft.message}</div>
      <div data-slot={`draft-message:${suffix}`}>{draft.message}</div>
      <div data-slot="draft-pending">{draft.pendingGeneratedMessage ?? ''}</div>
      <div data-slot="draft-generating">{draft.generating ?? ''}</div>
    </div>
  )
}

function renderProvider(children: ReactNode) {
  act(() => {
    root!.render(<InlineCommitDraftProvider>{children}</InlineCommitDraftProvider>)
  })
}

function click(selector: string) {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${selector}`)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function text(selector: string): string {
  const element = document.body.querySelector(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element.textContent ?? ''
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}
```

- [ ] **Step 2: Run provider tests and verify they fail**

Run:

```sh
bun run test src/web/components/branch-list/InlineCommitDraftProvider.test.tsx
```

Expected: fail because `src/web/components/branch-list/InlineCommitDraftProvider.tsx` does not exist.

## Task 2: Implement Draft Provider

**Files:**
- Create: `src/web/components/branch-list/InlineCommitDraftProvider.tsx`

- [ ] **Step 1: Create provider implementation**

Create `src/web/components/branch-list/InlineCommitDraftProvider.tsx`:

```tsx
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
```

- [ ] **Step 2: Run provider tests**

Run:

```sh
bun run test src/web/components/branch-list/InlineCommitDraftProvider.test.tsx
```

Expected: pass.

## Task 3: Convert InlineCommitForm To Controlled Props

**Files:**
- Modify: `src/web/components/branch-list/InlineCommitForm.tsx`
- Modify: `src/web/components/branch-list/BranchWriteDialogs.test.tsx`

- [ ] **Step 1: Update form tests to use controlled props**

Modify the `InlineCommitForm AI generation` describe block in `src/web/components/branch-list/BranchWriteDialogs.test.tsx`.

Replace the first five inline commit tests with controlled-form tests:

```tsx
describe('InlineCommitForm', () => {
  test('shows only available commit message providers', async () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        onCommit={vi.fn(async () => {})}
      />,
    )

    expect(buttonByProvider('codex')).not.toBeNull()
    expect(queryButtonByProvider('claude')).toBeNull()
  })

  test('requests generation from the selected provider', async () => {
    const onGenerate = vi.fn(async () => {})

    render(
      <InlineCommitFormHarness
        availableProviders={['codex', 'claude']}
        onGenerate={onGenerate}
        onCommit={vi.fn(async () => {})}
      />,
    )

    clickButtonByProvider('codex')
    await flush()

    expect(onGenerate).toHaveBeenCalledWith('codex')
  })

  test('shows raw controlled provider errors', async () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        initialError="Codex auth token expired"
        onCommit={vi.fn(async () => {})}
      />,
    )

    expect(document.body.textContent).toContain('Codex auth token expired')
  })

  test('asks before applying a pending generated replacement', async () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex', 'claude']}
        initialMessage="manual message"
        initialPendingGeneratedMessage="fix: generated replacement"
        onCommit={vi.fn(async () => {})}
      />,
    )

    expect(textarea('#inline-commit-message').value).toBe('manual message')
    expect(document.body.textContent).toContain('action.commit-replace-message-title')

    clickButtonByText('action.commit-replace-message-confirm')

    expect(textarea('#inline-commit-message').value).toBe('fix: generated replacement')
  })

  test('submits trimmed commit message and closes after success', async () => {
    const onCommit = vi.fn(async () => {})
    const onClose = vi.fn()

    render(<InlineCommitFormHarness initialMessage="  feat: inline commit  " onClose={onClose} onCommit={onCommit} />)
    clickButtonByText('action.commit-confirm')
    await flush()

    expect(onCommit).toHaveBeenCalledWith('feat: inline commit')
    expect(onClose).toHaveBeenCalled()
  })

  test('keeps message visible when commit fails', async () => {
    const onCommit = vi.fn(async () => {
      throw new Error('nothing to commit')
    })
    const onClose = vi.fn()

    render(<InlineCommitFormHarness initialMessage="feat: inline commit" onClose={onClose} onCommit={onCommit} />)
    clickButtonByText('action.commit-confirm')
    await flush()

    expect(textarea('#inline-commit-message').value).toBe('feat: inline commit')
    expect(document.body.textContent).toContain('nothing to commit')
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

Add this harness near the existing test helpers:

```tsx
function InlineCommitFormHarness({
  availableProviders = [],
  initialMessage = '',
  initialError = null,
  initialPendingGeneratedMessage = null,
  onClose = vi.fn(),
  onCommit,
  onGenerate = vi.fn(async () => {}),
}: {
  availableProviders?: Array<'codex' | 'claude'>
  initialMessage?: string
  initialError?: string | null
  initialPendingGeneratedMessage?: string | null
  onClose?: () => void
  onCommit: (message: string) => Promise<void>
  onGenerate?: (provider: 'codex' | 'claude') => Promise<void>
}) {
  const [message, setMessage] = React.useState(initialMessage)
  const [error, setError] = React.useState<string | null>(initialError)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = React.useState<string | null>(
    initialPendingGeneratedMessage,
  )
  return (
    <InlineCommitForm
      message={message}
      error={error}
      availableProviders={availableProviders}
      generating={null}
      pendingGeneratedMessage={pendingGeneratedMessage}
      onMessageChange={setMessage}
      onErrorChange={setError}
      onGenerate={onGenerate}
      onApplyPendingGeneratedMessage={() => {
        if (!pendingGeneratedMessage) return
        setMessage(pendingGeneratedMessage)
        setPendingGeneratedMessage(null)
        setError(null)
      }}
      onClearPendingGeneratedMessage={() => setPendingGeneratedMessage(null)}
      onClose={onClose}
      onCommit={onCommit}
    />
  )
}
```

Remove `getCommitMessageProviders` and `generateRepositoryCommitMessage` from this test file's `repo-client` mock if no remaining test uses them. Keep `getRepositoryRemoteBranches`.

- [ ] **Step 2: Run form tests and verify they fail**

Run:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx -- -t "InlineCommitForm"
```

Expected: fail because `InlineCommitForm` still requires `repoId/worktreePath` and owns message/generation state internally.

- [ ] **Step 3: Convert `InlineCommitForm` implementation**

Modify `src/web/components/branch-list/InlineCommitForm.tsx` to this controlled implementation:

```tsx
import { Loader2, Sparkles } from 'lucide-react'
import type { CommitMessageProvider } from '#/shared/commit-message-ai.ts'
import { Button } from '#/web/components/ui/button.tsx'
import { ConfirmDialog } from '#/web/components/ConfirmDialog.tsx'
import { DialogError } from '#/web/components/ui/dialog-error.tsx'
import { Field, FieldLabel } from '#/web/components/ui/field.tsx'
import { useAsyncPending } from '#/web/hooks/useAsyncPending.ts'
import { useT } from '#/web/stores/i18n.ts'

interface InlineCommitFormProps {
  message: string
  error: string | null
  availableProviders: CommitMessageProvider[]
  generating: CommitMessageProvider | null
  pendingGeneratedMessage: string | null
  onMessageChange: (message: string) => void
  onErrorChange: (message: string | null) => void
  onGenerate: (provider: CommitMessageProvider) => Promise<void>
  onApplyPendingGeneratedMessage: () => void
  onClearPendingGeneratedMessage: () => void
  onClose: () => void
  onCommit: (message: string) => Promise<void>
}

export function InlineCommitForm({
  message,
  error,
  availableProviders,
  generating,
  pendingGeneratedMessage,
  onMessageChange,
  onErrorChange,
  onGenerate,
  onApplyPendingGeneratedMessage,
  onClearPendingGeneratedMessage,
  onClose,
  onCommit,
}: InlineCommitFormProps) {
  const t = useT()
  const { isPending, run } = useAsyncPending<'commit'>()

  async function handleConfirm() {
    const trimmed = message.trim()
    if (!trimmed) return
    onErrorChange(null)
    await run('commit', async () => {
      try {
        await onCommit(trimmed)
        onClose()
      } catch (err) {
        onErrorChange(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="col-span-full border-t border-border/70 bg-muted/35 px-4 py-3" onClick={(e) => e.stopPropagation()}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void handleConfirm()
        }}
      >
        <Field>
          <div className="flex min-h-7 items-center justify-between gap-3">
            <FieldLabel htmlFor="inline-commit-message">{t('action.commit-message-label')}</FieldLabel>
            {availableProviders.length > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                {availableProviders.map((provider) => (
                  <CommitGenerateButton
                    key={provider}
                    provider={provider}
                    generating={generating}
                    disabled={isPending}
                    onGenerate={onGenerate}
                  />
                ))}
              </div>
            )}
          </div>
          <textarea
            id="inline-commit-message"
            className="w-full min-h-[64px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={t('action.commit-message-placeholder')}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            disabled={isPending}
          />
        </Field>
        {error && <DialogError>{error}</DialogError>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!message.trim() || isPending || generating !== null}>
            {isPending && <Loader2 className="animate-spin" />}
            {t('action.commit-confirm')}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={pendingGeneratedMessage !== null}
        title={t('action.commit-replace-message-title')}
        message={t('action.commit-replace-message-body')}
        confirmLabel={t('action.commit-replace-message-confirm')}
        onCancel={onClearPendingGeneratedMessage}
        onConfirm={onApplyPendingGeneratedMessage}
      />
    </div>
  )
}

function CommitGenerateButton({
  provider,
  generating,
  disabled,
  onGenerate,
}: {
  provider: CommitMessageProvider
  generating: CommitMessageProvider | null
  disabled: boolean
  onGenerate: (provider: CommitMessageProvider) => Promise<void>
}) {
  const t = useT()
  const isGeneratingProvider = generating === provider
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      data-provider={provider}
      disabled={disabled || generating !== null}
      aria-busy={isGeneratingProvider ? true : undefined}
      title={t(`action.commit-generate-${provider}`)}
      onClick={() => void onGenerate(provider)}
    >
      {isGeneratingProvider ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {isGeneratingProvider ? t('action.commit-generate-loading') : t(`action.commit-generate-${provider}`)}
    </Button>
  )
}
```

- [ ] **Step 4: Run form tests**

Run:

```sh
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx -- -t "InlineCommitForm"
```

Expected: pass.

## Task 4: Wire Provider Into App And Branch Actions

**Files:**
- Modify: `src/web/App.tsx`
- Modify: `src/web/hooks/useBranchWriteActions.tsx`
- Modify: `src/web/hooks/useBranchActionItems.test.tsx`

- [ ] **Step 1: Add branch action integration test**

Modify `src/web/hooks/useBranchActionItems.test.tsx`.

Add provider-related repo-client mocks near the existing hoisted mocks:

```ts
const repoClientMocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/repo-client.ts')>('#/web/repo-client.ts')
  return {
    ...actual,
    getCommitMessageProviders: repoClientMocks.getCommitMessageProviders,
    generateRepositoryCommitMessage: repoClientMocks.generateRepositoryCommitMessage,
  }
})
```

Reset provider mocks in `beforeEach`:

```ts
repoClientMocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
repoClientMocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
```

Import the provider:

```ts
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
```

Modify `ItemsHarness` return JSX so it renders `inlinePanel`:

```tsx
return (
  <>
    {items.inlinePanel}
    {items.dialogs}
  </>
)
```

Wrap `ItemsHarness` in `InlineCommitDraftProvider` inside `renderItemGroups`:

```tsx
root!.render(
  <InlineCommitDraftProvider>
    <ItemsHarness useItems={useItems} repo={repo} branch={branch} onReady={(items) => (groups = items)} />
  </InlineCommitDraftProvider>,
)
```

Add this test:

```tsx
test('commit action opens provider-backed inline commit panel for the worktree', async () => {
  const branch = createRepoBranch('feature/commit', { worktree: { path: '/tmp/repo-feature' } })
  const repo = seedRepoState({
    id: '/tmp/repo',
    branches: [branch],
  })

  const { useBranchActionItems: useItems } = await import('#/web/hooks/useBranchActionItems.ts')
  const groups = await renderItemGroups(useItems, repo, branch)
  const commit = groups.mainItems.find((item) => item.id === 'commit')
  if (!commit) throw new Error('missing commit action')

  await act(async () => {
    await commit.onSelect()
  })

  expect(document.body.querySelector('#inline-commit-message')).not.toBeNull()
})
```

- [ ] **Step 2: Run hook test and verify it fails**

Run:

```sh
bun run test src/web/hooks/useBranchActionItems.test.tsx -- -t "commit action opens provider-backed inline commit panel"
```

Expected: fail because `useBranchWriteActions` still uses row-local inline commit state and renders the old uncontrolled form.

- [ ] **Step 3: Mount provider in `App`**

Modify `src/web/App.tsx`.

Add import:

```ts
import { InlineCommitDraftProvider } from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
```

Wrap the navigation provider with the draft provider inside `App`:

```tsx
return (
  <ErrorBoundary>
    <TerminalSessionProvider currentRepoId={visibleRepoId}>
      <InlineCommitDraftProvider>
        <MainWindowNavigationProvider value={navigation}>
          <MainWindowViewport
            routeSettingsPage={routeSettingsPage}
            onRouteSettingsPageChange={onRouteSettingsPageChange}
            openSettings={openSettings}
            visibleRepoId={visibleRepoId}
            sessionReady={sessionReady}
            workspaceLayout={workspaceLayout}
            detailCollapsed={workspaceBehavior.detailCollapsed}
            detailFocusMode={workspaceBehavior.detailFocusMode}
            overlays={overlays}
            repoDrop={repoDrop}
          />
        </MainWindowNavigationProvider>
      </InlineCommitDraftProvider>
    </TerminalSessionProvider>
  </ErrorBoundary>
)
```

- [ ] **Step 4: Wire `useBranchWriteActions` to draft provider**

Modify `src/web/hooks/useBranchWriteActions.tsx`.

Add imports:

```ts
import {
  useInlineCommitDraft,
  useInlineCommitDraftActions,
  useInlineCommitMessageProviders,
} from '#/web/components/branch-list/InlineCommitDraftProvider.tsx'
```

Remove this local state:

```ts
const inlineCommit = useRetainedDialogState<string>()
```

Add provider reads after `worktreePath` is computed:

```ts
const inlineCommitDraft = useInlineCommitDraft(repo.id, worktreePath)
const inlineCommitDraftActions = useInlineCommitDraftActions()
const availableCommitMessageProviders = useInlineCommitMessageProviders()
```

Update the commit action:

```ts
{
  id: 'commit',
  label: t('action.commit'),
  title: t('action.commit-title'),
  disabled: branchActionBusy,
  visible: hasWorktree,
  icon: createElement(SendHorizontal),
  onSelect: () => {
    if (worktreePath) inlineCommitDraftActions.openDraft(repo.id, worktreePath)
  },
}
```

Keep `handleCommit` focused on the commit API and last-result projection. The form will call `onClose` after a successful commit, and the connected `onClose` clears the draft.

```ts
async function handleCommit(message: string) {
  if (!worktreePath) return
  const result = await commitRepositoryChanges(repo.id, worktreePath, message)
  setLastResult(repo.id, result, repo.instanceToken)
  if (!result.ok) throw new Error(result.message)
}
```

Replace `inlinePanel` with provider-backed controlled form props:

```tsx
const inlinePanel =
  inlineCommitDraft?.open && worktreePath ? (
    <InlineCommitForm
      message={inlineCommitDraft.message}
      error={inlineCommitDraft.error}
      availableProviders={availableCommitMessageProviders}
      generating={inlineCommitDraft.generating}
      pendingGeneratedMessage={inlineCommitDraft.pendingGeneratedMessage}
      onMessageChange={(message) => inlineCommitDraftActions.setMessage(repo.id, worktreePath, message)}
      onErrorChange={(error) => inlineCommitDraftActions.setError(repo.id, worktreePath, error)}
      onGenerate={(provider) =>
        inlineCommitDraftActions.generateMessage({
          repoId: repo.id,
          worktreePath,
          provider,
        })
      }
      onApplyPendingGeneratedMessage={() => inlineCommitDraftActions.applyPendingGeneratedMessage(repo.id, worktreePath)}
      onClearPendingGeneratedMessage={() => inlineCommitDraftActions.clearPendingGeneratedMessage(repo.id, worktreePath)}
      onClose={() => inlineCommitDraftActions.clearDraft(repo.id, worktreePath)}
      onCommit={handleCommit}
    />
  ) : null
```

- [ ] **Step 5: Run hook and provider tests**

Run:

```sh
bun run test src/web/hooks/useBranchActionItems.test.tsx -- -t "commit action opens provider-backed inline commit panel"
bun run test src/web/components/branch-list/InlineCommitDraftProvider.test.tsx
```

Expected: both pass.

## Task 5: Remove Obsolete Hook And Run Final Verification

**Files:**
- Delete: `src/web/components/branch-list/useCommitMessageGeneration.ts`
- Modify: no additional source files unless typecheck reveals an import missed in earlier tasks.

- [ ] **Step 1: Confirm obsolete hook has no imports**

Run:

```sh
rg -n "useCommitMessageGeneration" "src/web"
```

Expected output contains no source imports after Task 4.

- [ ] **Step 2: Delete obsolete hook after explicit confirmation**

Before deleting `src/web/components/branch-list/useCommitMessageGeneration.ts`, show the repository-required confirmation prompt:

```text
⚠️ 危险操作检测！
操作类型：删除文件
影响范围：删除已被 InlineCommitDraftProvider 替代的 src/web/components/branch-list/useCommitMessageGeneration.ts
风险评估：若仍有遗漏引用会导致 typecheck 或测试失败；删除后可通过 git 恢复

请确认是否继续？[需要明确的"是"、"确认"、"继续"]
```

After confirmation, delete `src/web/components/branch-list/useCommitMessageGeneration.ts`.

- [ ] **Step 3: Run targeted test suite**

Run:

```sh
bun run test src/web/components/branch-list/InlineCommitDraftProvider.test.tsx
bun run test src/web/components/branch-list/BranchWriteDialogs.test.tsx
bun run test src/web/hooks/useBranchActionItems.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Run project verification**

Run:

```sh
bun run typecheck
bun run test
```

Expected: both pass.

- [ ] **Step 5: Check worktree status without committing**

Run:

```sh
git status --short
```

Expected: modified implementation/test files and the new plan/spec docs are visible. Do not run `git add`, `git commit`, or branch commands unless the user explicitly asks.

## Self-Review Checklist

- Spec coverage: provider state survives active repo switch because it mounts above `RepoView`; generation no longer aborts on form unmount; drafts are keyed by `repoId + worktreePath`; cancel and successful commit clear drafts.
- State ownership: draft state remains renderer-local and does not enter `useReposStore`, session persistence, or server runtime state.
- Type consistency: `InlineCommitDraft`, `InlineCommitDraftActions`, `GenerateInlineCommitMessageInput`, and controlled `InlineCommitForm` props are defined before use.
- Test coverage: provider lifecycle, controlled form behavior, branch action opening, and final repo verification are covered.

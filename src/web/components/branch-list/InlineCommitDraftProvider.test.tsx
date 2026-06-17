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
    const signals: AbortSignal[] = []
    mocks.generateRepositoryCommitMessage.mockImplementationOnce((_repoId, _worktreePath, _provider, nextSignal) => {
      signals.push(nextSignal)
      return pending.promise
    })

    renderProvider(<DraftHarness readerVisible />)
    await flush()
    click('[data-action="open"]')
    click('[data-action="generate"]')
    await flush()

    renderProvider(<DraftHarness readerVisible={false} />)
    await flush()
    expect(signals.at(-1)?.aborted).toBe(false)

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
    const signals: AbortSignal[] = []
    mocks.generateRepositoryCommitMessage.mockImplementationOnce((_repoId, _worktreePath, _provider, nextSignal) => {
      signals.push(nextSignal)
      return pending.promise
    })

    renderProvider(<DraftHarness readerVisible />)
    await flush()
    click('[data-action="open"]')
    click('[data-action="generate"]')
    await flush()
    click('[data-action="clear"]')

    expect(signals.at(-1)?.aborted).toBe(true)
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
    click('[data-action="open"]')
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

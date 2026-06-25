// @vitest-environment jsdom

import { act, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  CreateBranchDialog,
  MergeDialog,
  PullRemoteBranchDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
import { InlineCommitForm } from '#/web/components/branch-list/InlineCommitForm.tsx'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
}))

const mergeAiMocks = vi.hoisted(() => ({
  actions: [
    {
      provider: 'codex',
      label: 'Codex',
      title: 'AI handoff',
      disabled: false,
      pending: false,
      onSelect: vi.fn(async () => true),
    },
    {
      provider: 'claude',
      label: 'Claude',
      title: 'AI handoff',
      disabled: false,
      pending: false,
      onSelect: vi.fn(async () => true),
    },
  ],
  error: null as string | null,
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
}))

vi.mock('#/web/hooks/useMergeConflictAiActions.ts', () => ({
  useMergeConflictAiActions: () => mergeAiMocks,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  mocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
  mocks.getRepositoryRemoteBranches.mockResolvedValue([])
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

describe('InlineCommitForm', () => {
  test('shows only available commit message providers', () => {
    render(<InlineCommitFormHarness availableProviders={['codex']} onCommit={vi.fn(async () => {})} />)

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

  test('shows raw controlled provider errors', () => {
    render(
      <InlineCommitFormHarness
        availableProviders={['codex']}
        initialError="Codex auth token expired"
        onCommit={vi.fn(async () => {})}
      />,
    )

    expect(document.body.textContent).toContain('Codex auth token expired')
  })

  test('asks before applying a pending generated replacement', () => {
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

  test('submits trimmed commit message through commit and push action', async () => {
    const onCommit = vi.fn(async () => {})
    const onCommitAndPush = vi.fn(async () => {})
    const onClose = vi.fn()

    render(
      <InlineCommitFormHarness
        initialMessage="  feat: inline commit  "
        onClose={onClose}
        onCommit={onCommit}
        onCommitAndPush={onCommitAndPush}
      />,
    )
    clickButtonByText('action.commit-and-push-confirm')
    await flush()

    expect(onCommit).not.toHaveBeenCalled()
    expect(onCommitAndPush).toHaveBeenCalledWith('feat: inline commit')
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

describe('MergeDialog AI handoff', () => {
  test('does not show AI buttons for ordinary merge errors', async () => {
    render(
      <MergeDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: 'fatal: bad revision' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-confirm')
    await flush()

    expect(document.body.textContent).toContain('fatal: bad revision')
    expect(queryButtonByText('Codex')).toBeNull()
  })

  test('shows AI buttons for merge conflict errors', async () => {
    render(
      <MergeDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-confirm')
    await flush()

    expect(document.body.textContent).toContain('CONFLICT (content)')
    expect(buttonByText('Codex')).not.toBeNull()
    expect(buttonByText('Claude')).not.toBeNull()
  })

  test('keeps long merge errors inside a bounded scroll area', async () => {
    const longError = Array.from({ length: 30 }, (_, index) => `CONFLICT (content): file-${index}.ts`).join('\n')

    render(
      <MergeDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={vi.fn()}
        onMerge={async () => ({ ok: false, message: longError, reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-confirm')
    await flush()

    const scrollArea = document.body.querySelector('[data-slot="merge-dialog-error-scroll"]')
    const form = document.body.querySelector('[data-slot="merge-dialog-form"]')
    const field = document.body.querySelector('[data-slot="merge-dialog-branch-field"]')
    const error = document.body.querySelector('[data-slot="merge-dialog-error"]')
    const aiPanel = document.body.querySelector('[data-slot="merge-conflict-ai-actions"]')

    expect(scrollArea).not.toBeNull()
    expect(scrollArea?.className).toContain('max-h-')
    expect(form?.className).toContain('min-w-0')
    expect(field?.className).toContain('min-w-0')
    expect(error?.className).toContain('min-w-0')
    expect(aiPanel?.className).toContain('min-w-0')
    expect(document.body.textContent).toContain('CONFLICT (content): file-0.ts')
    expect(document.body.textContent).toContain('CONFLICT (content): file-29.ts')
  })

  test('closes after a successful AI handoff', async () => {
    const onClose = vi.fn()

    render(
      <MergeDialog
        open
        repoId="/repo"
        worktreePath="/repo"
        branch={repoBranch('feature/current')}
        allBranches={[repoBranch('feature/current'), repoBranch('main')]}
        onClose={onClose}
        onMerge={async () => ({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })}
      />,
    )

    selectFirstMergeCandidate()
    clickButtonByText('action.merge-confirm')
    await flush()
    clickButtonByText('Codex')
    await flush()

    expect(mergeAiMocks.actions[0]!.onSelect).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CreateBranchDialog', () => {
  test('submits a typed branch name from the selected base branch', async () => {
    const onCreate = vi.fn(async () => {})

    render(
      <CreateBranchDialog
        open
        branch={repoBranch('feature/base')}
        allBranches={[repoBranch('feature/base')]}
        busy={false}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    )

    setInputValue('#create-branch-name', 'feature/new')
    clickButtonByText('action.create-branch-confirm')
    await flush()

    expect(onCreate).toHaveBeenCalledWith('feature/new')
  })

  test('rejects duplicate branch names before submit', async () => {
    const onCreate = vi.fn(async () => {})

    render(
      <CreateBranchDialog
        open
        branch={repoBranch('feature/base')}
        allBranches={[repoBranch('feature/base'), repoBranch('feature/existing')]}
        busy={false}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    )

    setInputValue('#create-branch-name', 'feature/existing')

    expect(document.body.textContent).toContain('action.create-worktree-branch-exists')
    expect(buttonByText('action.create-branch-confirm').disabled).toBe(true)
    expect(onCreate).not.toHaveBeenCalled()
  })
})

describe('PullRemoteBranchDialog', () => {
  test('loads remote refs filters duplicates and submits tracking branch input', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/existing', 'origin/feature/new'])
    const onTrack = vi.fn(async () => {})

    render(
      <PullRemoteBranchDialog
        open
        repoId="/repo"
        allBranches={[repoBranch('feature/existing')]}
        busy={false}
        onClose={vi.fn()}
        onTrack={onTrack}
      />,
    )
    await flush()
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('feature/new')

    clickButtonByText('action.pull-remote-branch-confirm')
    await flush()

    expect(onTrack).toHaveBeenCalledWith({
      localBranch: 'feature/new',
      remoteRef: 'origin/feature/new',
    })
  })

  test('filters remote refs locally with fuzzy search before submit', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/api-client', 'origin/bugfix/login-flow'])
    const onTrack = vi.fn(async () => {})

    render(
      <PullRemoteBranchDialog open repoId="/repo" allBranches={[]} busy={false} onClose={vi.fn()} onTrack={onTrack} />,
    )
    await flush()
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('feature/api-client')

    openSelect('#pull-remote-ref')
    expect(input('#pull-remote-ref-filter').closest('[data-slot="select-content"]')).not.toBeNull()

    setInputValue('#pull-remote-ref-filter', 'fix login')
    await flush()

    expect(input('#pull-remote-local-branch').value).toBe('bugfix/login-flow')

    clickButtonByText('action.pull-remote-branch-confirm')
    await flush()

    expect(onTrack).toHaveBeenCalledWith({
      localBranch: 'bugfix/login-flow',
      remoteRef: 'origin/bugfix/login-flow',
    })
  })
})

function InlineCommitFormHarness({
  availableProviders = [],
  initialMessage = '',
  initialError = null,
  initialPendingGeneratedMessage = null,
  onClose = vi.fn(),
  onCommit,
  onCommitAndPush,
  onGenerate = vi.fn(async () => {}),
}: {
  availableProviders?: Array<'codex' | 'claude'>
  initialMessage?: string
  initialError?: string | null
  initialPendingGeneratedMessage?: string | null
  onClose?: () => void
  onCommit: (message: string) => Promise<void>
  onCommitAndPush?: (message: string) => Promise<void>
  onGenerate?: (provider: 'codex' | 'claude') => Promise<void>
}) {
  const [message, setMessage] = useState(initialMessage)
  const [error, setError] = useState<string | null>(initialError)
  const [pendingGeneratedMessage, setPendingGeneratedMessage] = useState<string | null>(initialPendingGeneratedMessage)
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
      onCommitAndPush={onCommitAndPush}
    />
  )
}

function render(element: ReactNode) {
  if (!container) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => {
    root!.render(element)
  })
}

function textarea(selector: string): HTMLTextAreaElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`Missing textarea: ${selector}`)
  return element
}

function input(selector: string): HTMLInputElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input: ${selector}`)
  return element
}

function button(selector: string): HTMLButtonElement {
  const element = document.body.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing button: ${selector}`)
  return element
}

function repoBranch(name: string): RepoBranchState {
  return {
    name,
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: 'abc1234',
    lastCommitMessage: 'message',
    lastCommitDate: '2024-01-01T00:00:00.000Z',
    lastCommitAuthor: 'dev',
  }
}

function queryButtonByText(text: string): HTMLButtonElement | null {
  const element = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  return element instanceof HTMLButtonElement ? element : null
}

function buttonByText(text: string): HTMLButtonElement {
  const element = queryButtonByText(text)
  if (!element) throw new Error(`Missing button text: ${text}`)
  return element
}

function queryButtonByProvider(provider: 'codex' | 'claude'): HTMLButtonElement | null {
  const element = document.body.querySelector(`[data-provider="${provider}"]`)
  return element instanceof HTMLButtonElement ? element : null
}

function buttonByProvider(provider: 'codex' | 'claude'): HTMLButtonElement {
  const element = queryButtonByProvider(provider)
  if (!element) throw new Error(`Missing provider button: ${provider}`)
  return element
}

function setTextareaValue(selector: string, value: string) {
  const element = textarea(selector)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function setInputValue(selector: string, value: string) {
  const element = input(selector)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function clickButtonByText(text: string) {
  const element = buttonByText(text)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function openSelect(selector: string) {
  const element = button(selector)
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  })
}

function selectFirstMergeCandidate() {
  openSelect('#merge-select')
  const item = document.body.querySelector<HTMLElement>('[role="option"]')
  if (!item) throw new Error('Missing merge candidate option')
  act(() => {
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function clickButtonByProvider(provider: 'codex' | 'claude') {
  const element = buttonByProvider(provider)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

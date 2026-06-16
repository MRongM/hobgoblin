// @vitest-environment jsdom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  CommitDialog,
  CreateBranchDialog,
  PullRemoteBranchDialog,
} from '#/web/components/branch-list/BranchWriteDialogs.tsx'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
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

describe('CommitDialog AI generation', () => {
  test('shows only available commit message providers', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })

    render(<CommitDialog open repoId="/repo" worktreePath="/repo" onClose={vi.fn()} onCommit={vi.fn()} />)
    await flush()

    expect(buttonByProvider('codex')).not.toBeNull()
    expect(queryButtonByProvider('claude')).toBeNull()
  })

  test('fills an empty commit message from the selected provider', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: true })
    mocks.generateRepositoryCommitMessage.mockResolvedValueOnce({ ok: true, message: 'feat: generated message' })

    render(<CommitDialog open repoId="/repo" worktreePath="/repo" onClose={vi.fn()} onCommit={vi.fn()} />)
    await flush()

    clickButtonByProvider('codex')
    await flush()

    expect(textarea('#commit-message').value).toBe('feat: generated message')
    expect(mocks.generateRepositoryCommitMessage).toHaveBeenCalledWith('/repo', '/repo', 'codex', expect.any(AbortSignal))
  })

  test('shows raw provider errors without translating them as generic failures', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: false })
    mocks.generateRepositoryCommitMessage.mockResolvedValueOnce({ ok: false, message: 'Codex auth token expired' })

    render(<CommitDialog open repoId="/repo" worktreePath="/repo" onClose={vi.fn()} onCommit={vi.fn()} />)
    await flush()

    clickButtonByProvider('codex')
    await flush()

    expect(document.body.textContent).toContain('Codex auth token expired')
    expect(document.body.textContent).not.toContain('error.commit-message-failed')
  })

  test('asks before replacing an existing commit message', async () => {
    mocks.getCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: true })
    mocks.generateRepositoryCommitMessage.mockResolvedValueOnce({ ok: true, message: 'fix: generated replacement' })

    render(<CommitDialog open repoId="/repo" worktreePath="/repo" onClose={vi.fn()} onCommit={vi.fn()} />)
    await flush()
    setTextareaValue('#commit-message', 'manual message')

    clickButtonByProvider('claude')
    await flush()

    expect(textarea('#commit-message').value).toBe('manual message')
    expect(document.body.textContent).toContain('action.commit-replace-message-title')

    clickButtonByText('action.commit-replace-message-confirm')

    expect(textarea('#commit-message').value).toBe('fix: generated replacement')
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
      <PullRemoteBranchDialog
        open
        repoId="/repo"
        allBranches={[]}
        busy={false}
        onClose={vi.fn()}
        onTrack={onTrack}
      />,
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

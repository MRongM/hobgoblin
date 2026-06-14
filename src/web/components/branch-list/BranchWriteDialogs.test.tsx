// @vitest-environment jsdom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CommitDialog } from '#/web/components/branch-list/BranchWriteDialogs.tsx'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  generateRepositoryCommitMessage: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
  generateRepositoryCommitMessage: mocks.generateRepositoryCommitMessage,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: false, claude: false })
  mocks.generateRepositoryCommitMessage.mockResolvedValue({ ok: true, message: 'feat: generated message' })
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

function clickButtonByText(text: string) {
  const element = buttonByText(text)
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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

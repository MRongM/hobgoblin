// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchUpstreamDialog } from '#/web/components/branch-list/BranchUpstreamDialog.tsx'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'

const mocks = vi.hoisted(() => ({
  getRepositoryRemoteBranches: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalResizeObserver = globalThis.ResizeObserver
let container: HTMLDivElement
let root: Root

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MockResizeObserver,
  })
  mocks.getRepositoryRemoteBranches.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchUpstreamDialog', () => {
  test('loads remote branches and changes the selected upstream', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/main', 'origin/release'])
    const onSubmit = vi.fn(async () => {})

    act(() => {
      root.render(
        <BranchUpstreamDialog
          open
          repoId="/repo"
          branch={branch({ tracking: 'origin/main' })}
          busy={false}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />,
      )
    })
    await flush()

    openSelect('#branch-upstream-ref')
    const release = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (option) => option.textContent?.trim() === 'origin/release',
    )
    expect(release).not.toBeUndefined()
    act(() => release!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    clickButton('action.branch-upstream-confirm')
    await flush()

    expect(onSubmit).toHaveBeenCalledWith('origin/release')
  })

  test('removes the current upstream without requiring remote choices', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce([])
    const onSubmit = vi.fn(async () => {})

    act(() => {
      root.render(
        <BranchUpstreamDialog
          open
          repoId="/repo"
          branch={branch({ tracking: 'origin/release' })}
          busy={false}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />,
      )
    })
    await flush()
    clickButton('action.branch-upstream-remove')
    await flush()

    expect(onSubmit).toHaveBeenCalledWith(null)
  })
})

function branch(overrides: Partial<RepoBranchState> = {}): RepoBranchState {
  return {
    name: 'feature/local',
    isCurrent: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: 'abc1234',
    lastCommitMessage: 'message',
    lastCommitDate: '2024-01-01T00:00:00.000Z',
    lastCommitAuthor: 'dev',
    ...overrides,
  }
}

function openSelect(selector: string) {
  const trigger = document.body.querySelector<HTMLButtonElement>(selector)
  if (!trigger) throw new Error(`Missing select: ${selector}`)
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
  act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
}

function clickButton(text: string) {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!button) throw new Error(`Missing button: ${text}`)
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

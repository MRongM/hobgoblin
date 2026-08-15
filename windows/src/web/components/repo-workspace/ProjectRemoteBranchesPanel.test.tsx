// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectRemoteBranchesPanel } from '#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const mocks = vi.hoisted(() => ({
  getRepositoryRemoteBranches: vi.fn(),
  getRepositoryRemoteTags: vi.fn(),
  fetchRepository: vi.fn(),
  deleteRepositoryRemoteBranch: vi.fn(),
  deleteRepositoryRemoteTag: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
  getRepositoryRemoteTags: mocks.getRepositoryRemoteTags,
  fetchRepository: mocks.fetchRepository,
  deleteRepositoryRemoteBranch: mocks.deleteRepositoryRemoteBranch,
  deleteRepositoryRemoteTag: mocks.deleteRepositoryRemoteTag,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  mocks.getRepositoryRemoteBranches.mockReset()
  mocks.getRepositoryRemoteTags.mockReset()
  mocks.fetchRepository.mockReset()
  mocks.deleteRepositoryRemoteBranch.mockReset()
  mocks.deleteRepositoryRemoteTag.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
  mocks.getRepositoryRemoteBranches.mockResolvedValue(['origin/main', 'origin/feature/a', 'upstream/bugfix/login'])
  mocks.getRepositoryRemoteTags.mockResolvedValue(['origin/v1.0.0', 'upstream/release/1.0'])
  mocks.fetchRepository.mockResolvedValue({ ok: true, message: 'fetched' })
  mocks.deleteRepositoryRemoteBranch.mockResolvedValue({ ok: true, message: 'deleted' })
  mocks.deleteRepositoryRemoteTag.mockResolvedValue({ ok: true, message: 'deleted' })
  document.body.innerHTML = ''
})

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function renderPanel(repoId = '/repo') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ProjectRemoteBranchesPanel repoId={repoId} />)
  })
  await act(async () => {})
  return { container, root }
}

describe('ProjectRemoteBranchesPanel', () => {
  test('loads and filters remote branches', async () => {
    const { container, root } = await renderPanel()

    expect(container.textContent).toContain('origin/main')
    expect(container.textContent).toContain('origin/feature/a')
    expect(container.textContent).toContain('upstream/bugfix/login')

    const input = container.querySelector<HTMLInputElement>('input[aria-label="remote-branches.search-label"]')!
    await act(async () => {
      changeInput(input, 'bugfix')
    })

    expect(container.textContent).not.toContain('origin/feature/a')
    expect(container.textContent).toContain('upstream/bugfix/login')
    await act(async () => root.unmount())
  })

  test('refreshes through fetch then reloads refs', async () => {
    mocks.getRepositoryRemoteBranches
      .mockResolvedValueOnce(['origin/feature/a'])
      .mockResolvedValueOnce(['origin/feature/a', 'origin/feature/b'])
    const { container, root } = await renderPanel()

    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="remote-branches-refresh"]')!
    await act(async () => {
      refresh.click()
    })

    expect(mocks.fetchRepository).toHaveBeenCalledWith('/repo', 'user')
    expect(container.textContent).toContain('origin/feature/b')
    await act(async () => root.unmount())
  })

  test('disables protected branch deletion', async () => {
    const { container, root } = await renderPanel()

    const protectedButton = container.querySelector<HTMLButtonElement>('[data-testid="remote-branch-delete-origin-main"]')!
    expect(protectedButton.disabled).toBe(true)
    await act(async () => root.unmount())
  })

  test('confirms delete, calls API with parsed remote and branch, then reloads', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/feature/a']).mockResolvedValueOnce([])
    const { container, root } = await renderPanel()

    const deleteButton = container.querySelector<HTMLButtonElement>('[data-testid="remote-branch-delete-origin-feature-a"]')!
    await act(async () => {
      deleteButton.click()
    })
    expect(document.body.textContent).toContain('remote-branches.confirm-title')
    expect(document.body.textContent).toContain('origin/feature/a')

    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'remote-branches.confirm-delete',
    )!
    await act(async () => {
      confirm.click()
    })

    expect(mocks.deleteRepositoryRemoteBranch).toHaveBeenCalledWith('/repo', 'origin', 'feature/a')
    expect(mocks.getRepositoryRemoteBranches).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })

  test('switches the toolbar to remote tags and filters tag refs', async () => {
    const { container, root } = await renderPanel()

    const tags = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'remote-tags.tab',
    )!
    await act(async () => {
      tags.click()
    })

    expect(mocks.getRepositoryRemoteTags).toHaveBeenCalledWith('/repo', expect.any(AbortSignal))
    expect(container.textContent).toContain('origin/v1.0.0')
    expect(container.textContent).toContain('upstream/release/1.0')

    const input = container.querySelector<HTMLInputElement>('input[aria-label="remote-tags.search-label"]')!
    await act(async () => {
      changeInput(input, 'release')
    })

    expect(container.textContent).not.toContain('origin/v1.0.0')
    expect(container.textContent).toContain('upstream/release/1.0')
    await act(async () => root.unmount())
  })

  test('confirms tag delete, calls API with parsed remote and tag, then reloads', async () => {
    mocks.getRepositoryRemoteTags.mockResolvedValueOnce(['origin/release/v1.0.0']).mockResolvedValueOnce([])
    const { container, root } = await renderPanel()

    const tags = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'remote-tags.tab',
    )!
    await act(async () => {
      tags.click()
    })

    const deleteButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="remote-tag-delete-origin-release-v1-0-0"]',
    )!
    await act(async () => {
      deleteButton.click()
    })
    expect(document.body.textContent).toContain('remote-tags.confirm-title')
    expect(document.body.textContent).toContain('origin/release/v1.0.0')

    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'remote-tags.confirm-delete',
    )!
    await act(async () => {
      confirm.click()
    })

    expect(mocks.deleteRepositoryRemoteTag).toHaveBeenCalledWith('/repo', 'origin', 'release/v1.0.0')
    expect(mocks.getRepositoryRemoteTags).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })
})

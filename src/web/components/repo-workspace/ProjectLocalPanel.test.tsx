// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectLocalPanel } from '#/web/components/repo-workspace/ProjectLocalPanel.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

const mocks = vi.hoisted(() => ({
  deleteRepositoryBranch: vi.fn(),
  deleteRepositoryLocalTag: vi.fn(),
  getRepositoryLocalTags: vi.fn(),
  pushRepositoryLocalTag: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  deleteRepositoryBranch: mocks.deleteRepositoryBranch,
  deleteRepositoryLocalTag: mocks.deleteRepositoryLocalTag,
  getRepositoryLocalTags: mocks.getRepositoryLocalTags,
  pushRepositoryLocalTag: mocks.pushRepositoryLocalTag,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

const REPO_ID = '/tmp/gbl-repo-local-panel'

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  mocks.deleteRepositoryBranch.mockReset()
  mocks.deleteRepositoryLocalTag.mockReset()
  mocks.getRepositoryLocalTags.mockReset()
  mocks.pushRepositoryLocalTag.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
  mocks.getRepositoryLocalTags.mockResolvedValue([])
  document.body.innerHTML = ''
})

afterEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

async function renderPanel() {
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
    currentBranch: 'main',
    selectedBranch: 'feature/a',
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<ProjectLocalPanel repoId={REPO_ID} />)
  })
  await act(async () => {})
  return { container, root }
}

function findButtonByLabel(root: ParentNode, label: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
}

function findButtonByText(root: ParentNode, text: string): HTMLButtonElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === text,
    ) ?? null
  )
}

describe('ProjectLocalPanel branch deletion', () => {
  test('successfully deletes a merged branch without force flag', async () => {
    mocks.deleteRepositoryBranch.mockResolvedValueOnce({ ok: true, message: 'deleted' })
    const { container, root } = await renderPanel()

    const deleteButton = findButtonByLabel(container, 'local.branch-delete')
    expect(deleteButton).not.toBeNull()

    await act(async () => {
      deleteButton!.click()
    })

    expect(document.body.textContent).toContain('local.branch-confirm-title')

    const confirmButton = findButtonByText(document.body, 'local.branch-confirm-delete')
    expect(confirmButton).not.toBeNull()

    await act(async () => {
      confirmButton!.click()
    })
    await act(async () => {})

    expect(mocks.deleteRepositoryBranch).toHaveBeenCalledTimes(1)
    expect(mocks.deleteRepositoryBranch).toHaveBeenCalledWith(REPO_ID, 'feature/a')
    expect(mocks.toastSuccess).toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  test('shows force-delete confirmation when branch is not fully merged', async () => {
    mocks.deleteRepositoryBranch
      .mockResolvedValueOnce({ ok: false, message: 'error.branch-not-fully-merged' })
      .mockResolvedValueOnce({ ok: true, message: 'deleted' })
    const { container, root } = await renderPanel()

    const deleteButton = findButtonByLabel(container, 'local.branch-delete')!
    await act(async () => {
      deleteButton.click()
    })

    const confirmButton = findButtonByText(document.body, 'local.branch-confirm-delete')!
    await act(async () => {
      confirmButton.click()
    })
    await act(async () => {})

    expect(document.body.textContent).toContain('local.branch-unmerged-confirm-title')
    expect(mocks.toastError).not.toHaveBeenCalled()

    const forceDeleteButton = findButtonByText(document.body, 'local.branch-force-delete')
    expect(forceDeleteButton).not.toBeNull()

    await act(async () => {
      forceDeleteButton!.click()
    })
    await act(async () => {})

    expect(mocks.deleteRepositoryBranch).toHaveBeenCalledTimes(2)
    expect(mocks.deleteRepositoryBranch).toHaveBeenLastCalledWith(REPO_ID, 'feature/a', { force: true })
    expect(mocks.toastSuccess).toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  test('cancels force-delete without calling API again', async () => {
    mocks.deleteRepositoryBranch.mockResolvedValueOnce({
      ok: false,
      message: 'error.branch-not-fully-merged',
    })
    const { container, root } = await renderPanel()

    const deleteButton = findButtonByLabel(container, 'local.branch-delete')!
    await act(async () => {
      deleteButton.click()
    })

    const confirmButton = findButtonByText(document.body, 'local.branch-confirm-delete')!
    await act(async () => {
      confirmButton.click()
    })
    await act(async () => {})

    expect(document.body.textContent).toContain('local.branch-unmerged-confirm-title')

    const cancelButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.textContent?.trim() === 'dialog.cancel',
    )
    expect(cancelButtons.length).toBeGreaterThan(0)

    await act(async () => {
      cancelButtons[cancelButtons.length - 1]!.click()
    })
    await act(async () => {})

    expect(mocks.deleteRepositoryBranch).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})

describe('ProjectLocalPanel branch push', () => {
  test('confirms the protected upstream and pushes the local branch', async () => {
    const submitBranchAction = vi.fn()
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/local', { tracking: 'origin/main' })],
      currentBranch: 'main',
      selectedBranch: 'feature/local',
    })
    useReposStore.setState({ submitBranchAction })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<ProjectLocalPanel repoId={REPO_ID} />)
    })

    const branchRow = Array.from(container.querySelectorAll<HTMLDivElement>('div.group')).find((row) =>
      row.textContent?.includes('feature/local'),
    )
    const pushButton = branchRow?.querySelector<HTMLButtonElement>('button[aria-label="local.branch-push"]')
    expect(pushButton).not.toBeNull()
    expect(pushButton?.title).toContain('origin/main')

    await act(async () => {
      pushButton!.click()
    })

    expect(submitBranchAction).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('origin/main')
    expect(document.querySelector('[data-push-upstream]')?.textContent).toContain('action.branch-upstream-current')

    const confirmButton = findButtonByText(document.body, 'action.confirm-push-confirm')
    expect(confirmButton).not.toBeNull()
    await act(async () => {
      confirmButton!.click()
    })

    expect(submitBranchAction).toHaveBeenCalledWith(REPO_ID, {
      kind: 'push',
      branch: 'feature/local',
    })
    await act(async () => root.unmount())
  })
})

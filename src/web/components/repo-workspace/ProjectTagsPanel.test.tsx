// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectTagsPanel } from '#/web/components/repo-workspace/ProjectTagsPanel.tsx'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const mocks = vi.hoisted(() => ({
  getRepositoryLocalTags: vi.fn(),
  createRepositoryLocalTag: vi.fn(),
  deleteRepositoryLocalTag: vi.fn(),
  fetchRepository: vi.fn(),
  pushRepositoryLocalTag: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryLocalTags: mocks.getRepositoryLocalTags,
  createRepositoryLocalTag: mocks.createRepositoryLocalTag,
  deleteRepositoryLocalTag: mocks.deleteRepositoryLocalTag,
  fetchRepository: mocks.fetchRepository,
  pushRepositoryLocalTag: mocks.pushRepositoryLocalTag,
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

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
    root.render(<ProjectTagsPanel repoId={repoId} />)
  })
  await act(async () => {})
  return { container, root }
}

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  mocks.getRepositoryLocalTags.mockReset()
  mocks.createRepositoryLocalTag.mockReset()
  mocks.deleteRepositoryLocalTag.mockReset()
  mocks.fetchRepository.mockReset()
  mocks.pushRepositoryLocalTag.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.toastError.mockReset()
  mocks.getRepositoryLocalTags.mockResolvedValue(['v1.0.0', 'release/v2.0.0'])
  mocks.createRepositoryLocalTag.mockResolvedValue({ ok: true, message: 'created' })
  mocks.deleteRepositoryLocalTag.mockResolvedValue({ ok: true, message: 'deleted' })
  mocks.fetchRepository.mockResolvedValue({ ok: true, message: '' })
  mocks.pushRepositoryLocalTag.mockResolvedValue({ ok: true, message: '' })
  document.body.innerHTML = ''
})

describe('ProjectTagsPanel', () => {
  test('loads, searches, and refreshes local tags', async () => {
    const { container, root } = await renderPanel()

    expect(container.textContent).toContain('v1.0.0')
    expect(container.textContent).toContain('release/v2.0.0')
    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledWith('/repo', expect.any(AbortSignal))

    const input = container.querySelector<HTMLInputElement>('input[aria-label="tags.search-label"]')!
    await act(async () => {
      changeInput(input, 'release')
    })

    expect(container.textContent).not.toContain('v1.0.0')
    expect(container.textContent).toContain('release/v2.0.0')

    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="tags-refresh"]')!
    await act(async () => {
      refresh.click()
    })

    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })

  test('refresh button calls fetchRepository then loadTags', async () => {
    const { container, root } = await renderPanel()

    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="tags-refresh"]')!
    await act(async () => {
      refresh.click()
    })

    expect(mocks.fetchRepository).toHaveBeenCalledWith('/repo', 'user')
    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })

  test('refresh shows error toast when fetchRepository fails', async () => {
    mocks.fetchRepository.mockResolvedValue({ ok: false, message: 'error.network' })
    const { container, root } = await renderPanel()

    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="tags-refresh"]')!
    await act(async () => {
      refresh.click()
    })

    expect(mocks.toastError).toHaveBeenCalledWith('error.network')
    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('push button calls pushRepositoryLocalTag and shows success toast', async () => {
    const { container, root } = await renderPanel()

    const pushBtn = container.querySelector<HTMLButtonElement>('[data-testid="tag-push-v1-0-0"]')!
    await act(async () => {
      pushBtn.click()
    })

    expect(mocks.pushRepositoryLocalTag).toHaveBeenCalledWith('/repo', 'v1.0.0', expect.any(AbortSignal), expect.any(String))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('tags.push-success')
    await act(async () => root.unmount())
  })

  test('push button shows error toast when push fails', async () => {
    mocks.pushRepositoryLocalTag.mockResolvedValue({ ok: false, message: 'error.push-no-remote' })
    const { container, root } = await renderPanel()

    const pushBtn = container.querySelector<HTMLButtonElement>('[data-testid="tag-push-v1-0-0"]')!
    await act(async () => {
      pushBtn.click()
    })

    expect(mocks.toastError).toHaveBeenCalledWith('error.push-no-remote')
    await act(async () => root.unmount())
  })

  test('creates a local tag and reloads the list', async () => {
    mocks.getRepositoryLocalTags.mockResolvedValueOnce(['v1.0.0']).mockResolvedValueOnce(['v1.0.0', 'v2.0.0'])
    const { container, root } = await renderPanel()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="tags-new"]')?.click()
    })

    const nameInput = document.body.querySelector<HTMLInputElement>('#create-tag-name')!
    const refInput = document.body.querySelector<HTMLInputElement>('#create-tag-ref')!
    await act(async () => {
      changeInput(nameInput, 'v2.0.0')
      changeInput(refInput, 'HEAD')
    })

    const submit = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'tags.create',
    )!
    await act(async () => {
      submit.click()
    })

    expect(mocks.createRepositoryLocalTag).toHaveBeenCalledWith('/repo', 'v2.0.0', 'HEAD')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('tags.create-success')
    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('v2.0.0')
    await act(async () => root.unmount())
  })

  test('confirms delete, calls API, and reloads the list', async () => {
    mocks.getRepositoryLocalTags.mockResolvedValueOnce(['v1.0.0']).mockResolvedValueOnce([])
    const { container, root } = await renderPanel()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="tag-delete-v1-0-0"]')?.click()
    })

    expect(document.body.textContent).toContain("tags.confirm-title")
    expect(document.body.textContent).toContain('v1.0.0')

    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'tags.confirm-delete',
    )!
    await act(async () => {
      confirm.click()
    })

    expect(mocks.deleteRepositoryLocalTag).toHaveBeenCalledWith('/repo', 'v1.0.0')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('tags.delete-success')
    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })
})

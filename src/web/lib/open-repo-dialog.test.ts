import { beforeEach, describe, expect, test, vi } from 'vitest'
import { openRepoFromDialog, projectOpenRepositoryPathInput } from '#/web/lib/open-repo-dialog.ts'
import { installGoblinTestBridge } from '#/web/stores/repos/test-utils.ts'
import type { OpenRepoResult } from '#/web/stores/repos/types.ts'
const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

describe('openRepoFromDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('opens the selected path', async () => {
    installGoblinTestBridge({
      'repo.openDialog': () => '/tmp/repo',
    })
    const ensureWorkspaceOpen = vi.fn(async (): Promise<OpenRepoResult> => ({ ok: true, id: '/tmp/repo' }))
    const activateRepo = vi.fn()

    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo,
      t: (key) => key,
    })

    expect(ensureWorkspaceOpen).toHaveBeenCalledWith('/tmp/repo')
    expect(activateRepo).toHaveBeenCalledWith('/tmp/repo')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  test('shows an error toast when opening fails', async () => {
    installGoblinTestBridge({
      'repo.openDialog': () => '/tmp/repo',
    })
    const ensureWorkspaceOpen = vi.fn(
      async (): Promise<OpenRepoResult> => ({ ok: false, message: 'error.not-git-repo' }),
    )
    const activateRepo = vi.fn()

    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo,
      t: (key) => key,
    })

    expect(ensureWorkspaceOpen).toHaveBeenCalledWith('/tmp/repo')
    expect(activateRepo).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('drop.open-failed', {
      description: 'error.not-git-repo',
    })
  })

  test('does nothing when the dialog is cancelled', async () => {
    installGoblinTestBridge({
      'repo.openDialog': () => null,
    })
    const ensureWorkspaceOpen = vi.fn()
    const activateRepo = vi.fn()

    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo,
      t: (key) => key,
    })

    expect(ensureWorkspaceOpen).not.toHaveBeenCalled()
    expect(activateRepo).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  test('falls back to the path dialog when no native directory picker exists', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    })
    const ensureWorkspaceOpen = vi.fn()
    const activateRepo = vi.fn()
    const openRepoPathDialog = vi.fn()

    await openRepoFromDialog({
      ensureWorkspaceOpen,
      activateRepo,
      openRepoPathDialog,
      t: (key) => key,
    })

    expect(openRepoPathDialog).toHaveBeenCalledTimes(1)
    expect(ensureWorkspaceOpen).not.toHaveBeenCalled()
    expect(activateRepo).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})

describe('projectOpenRepositoryPathInput', () => {
  test('projects WSL locators and UNC paths into WSL fields', () => {
    expect(
      projectOpenRepositoryPathInput('\\\\wsl.localhost\\ubuntu\\home\\dev\\repo', {
        source: 'local',
        distribution: '',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'wsl', distribution: 'Ubuntu', path: '/home/dev/repo' })
    expect(
      projectOpenRepositoryPathInput('wsl://Ubuntu/home/dev/repo', {
        source: 'local',
        distribution: '',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'wsl', distribution: 'Ubuntu', path: '/home/dev/repo' })
  })

  test('projects a standard WSL drive mount back to Local', () => {
    expect(
      projectOpenRepositoryPathInput('/mnt/c/Users/dev/repo', {
        source: 'wsl',
        distribution: 'Ubuntu',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'local', distribution: 'Ubuntu', path: 'C:\\Users\\dev\\repo' })
  })

  test('does not guess a distribution for a bare Linux path', () => {
    expect(
      projectOpenRepositoryPathInput('/home/dev/repo', {
        source: 'local',
        distribution: '',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'local', distribution: '', path: '/home/dev/repo' })
    expect(
      projectOpenRepositoryPathInput('/home/dev/repo', {
        source: 'wsl',
        distribution: 'Ubuntu',
        distributions: ['Ubuntu'],
      }),
    ).toEqual({ source: 'wsl', distribution: 'Ubuntu', path: '/home/dev/repo' })
  })
})

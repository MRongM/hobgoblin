// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { useOpenDirectoryAction } from '#/web/hooks/useOpenDirectoryAction.tsx'

const mocks = vi.hoisted(() => ({
  platform: 'darwin' as string,
  available: true,
  open: vi.fn(async (_path: string) => ({ ok: true, message: '' })),
}))
vi.mock('#/web/bootstrap.ts', () => ({ getInitialBootstrap: () => ({ hostPlatform: mocks.platform }) }))
vi.mock('#/web/app-shell-client.ts', () => ({
  canOpenDirectoryInFileManager: () => mocks.available,
  openDirectoryInFileManager: mocks.open,
  homeDirectory: () => '',
}))
vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

afterEach(() => {
  mocks.platform = 'darwin'
  mocks.available = true
  mocks.open.mockClear()
})

test.each([
  { repoId: '/projects/app', path: '/projects/app', parent: '/projects' },
  { repoId: '/app', path: '/app/', parent: '/' },
  { repoId: '/projects/foo\\bar', path: '/projects/foo\\bar', parent: '/projects' },
  { repoId: 'C:\\projects\\app', path: 'C:\\projects\\app', parent: 'C:\\projects', platform: 'win32' },
  {
    repoId: normalizeRemoteRepoId({ alias: 'Ubuntu', remotePath: '/projects/app', transport: 'wsl' }),
    path: '/projects/app',
    parent: '\\\\wsl.localhost\\Ubuntu\\projects',
    platform: 'win32',
  },
])('opens the parent of $path', async ({ repoId, path, parent, platform }) => {
  mocks.platform = platform ?? 'darwin'
  const container = document.createElement('div')
  const root = createRoot(container)
  let action: WorkspaceListItemAction | undefined
  function Fixture() {
    action = useOpenDirectoryAction({ repoId, path })
    return null
  }
  try {
    await act(async () => root.render(<Fixture />))
    expect(action?.parentDirectoryAction?.disabled).toBe(false)
    await act(async () => {
      await action?.parentDirectoryAction?.onSelect()
    })
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith(parent)
  } finally {
    await act(async () => root.unmount())
  }
})

test.each([
  { repoId: '/', path: '/' },
  { repoId: '/', path: '//' },
  { repoId: 'C:\\', path: 'C:\\', platform: 'win32' },
  { repoId: '\\\\server\\share', path: '\\\\server\\share', platform: 'win32' },
  { repoId: normalizeRemoteRepoId({ alias: 'host', remotePath: '/repo' }), path: '/repo' },
  { repoId: '/repo', path: '/repo', available: false },
])('disables parent opening for $path when unavailable', async ({ repoId, path, platform, available }) => {
  mocks.platform = platform ?? 'darwin'
  mocks.available = available ?? true
  const container = document.createElement('div')
  const root = createRoot(container)
  let action: WorkspaceListItemAction | undefined
  function Fixture() {
    action = useOpenDirectoryAction({ repoId, path })
    return null
  }
  try {
    await act(async () => root.render(<Fixture />))
    expect(action?.parentDirectoryAction?.disabled).toBe(true)
    await act(async () => {
      await action?.parentDirectoryAction?.onSelect()
    })
    expect(mocks.open).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
  }
})

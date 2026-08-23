import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openServerRemoteEditor: vi.fn(),
  openServerRemoteTerminal: vi.fn(),
  resolveRepositoryRemoteTarget: vi.fn(),
  listWindowsWslDistributions: vi.fn(),
}))

vi.mock('#/server/modules/remote.ts', () => ({
  getServerSshHosts: vi.fn(async () => ({ hosts: [], hasInclude: false })),
  resolveServerRemoteTarget: vi.fn(),
  getServerRemotePathSuggestions: vi.fn(),
  testServerRemoteRepository: vi.fn(),
  openServerRemoteEditor: mocks.openServerRemoteEditor,
  openServerRemoteTerminal: mocks.openServerRemoteTerminal,
}))
vi.mock('#/system/remote/target.ts', () => ({
  resolveRepositoryRemoteTarget: mocks.resolveRepositoryRemoteTarget,
}))
vi.mock('#/system/wsl/distributions.ts', () => ({
  listWindowsWslDistributions: mocks.listWindowsWslDistributions,
}))

describe('remote routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openServerRemoteEditor.mockResolvedValue({ ok: true, message: '/srv/repo-feature' })
    mocks.openServerRemoteTerminal.mockResolvedValue({ ok: true, message: '/srv/repo-feature' })
    mocks.listWindowsWslDistributions.mockResolvedValue(['Ubuntu-24.04'])
    mocks.resolveRepositoryRemoteTarget.mockResolvedValue({
      target: {
        id: 'wsl://Ubuntu-24.04/root/src/repo',
        alias: 'Ubuntu-24.04',
        remotePath: '/root/src/repo',
        transport: 'wsl',
      },
    })
  })

  test('lists registered WSL distributions', async () => {
    const { createRemoteRoutes } = await import('#/server/routes/remote.ts')
    const response = await createRemoteRoutes().request('http://localhost/wsl-distributions')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(['Ubuntu-24.04'])
    expect(mocks.listWindowsWslDistributions).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  test('resolves a WSL distribution and Linux project path', async () => {
    const { createRemoteRoutes } = await import('#/server/routes/remote.ts')
    const response = await createRemoteRoutes().request('http://localhost/resolve-target', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transport: 'wsl', alias: 'Ubuntu-24.04', remotePath: '/root/src/repo' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      target: { id: 'wsl://Ubuntu-24.04/root/src/repo', transport: 'wsl' },
    })
    expect(mocks.resolveRepositoryRemoteTarget).toHaveBeenCalledWith(
      { transport: 'wsl', alias: 'Ubuntu-24.04', remotePath: '/root/src/repo' },
      expect.any(AbortSignal),
    )
  })

  test('opens a remote editor from repo id and worktree path', async () => {
    const { createRemoteRoutes } = await import('#/server/routes/remote.ts')
    const app = createRemoteRoutes()

    const response = await app.request('http://localhost/open-editor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })
    expect(mocks.openServerRemoteEditor).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' },
      expect.any(AbortSignal),
    )
  })

  test('opens a remote editor from repo id and structured target', async () => {
    const { createRemoteRoutes } = await import('#/server/routes/remote.ts')
    const app = createRemoteRoutes()

    const response = await app.request('http://localhost/open-editor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoId: 'ssh-config://prod/srv/repo',
        target: { path: '/srv/repo/src/app.ts', line: 12 },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })
    expect(mocks.openServerRemoteEditor).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', target: { path: '/srv/repo/src/app.ts', line: 12 } },
      expect.any(AbortSignal),
    )
  })

  test('opens a remote terminal from repo id and worktree path', async () => {
    const { createRemoteRoutes } = await import('#/server/routes/remote.ts')
    const app = createRemoteRoutes()

    const response = await app.request('http://localhost/open-terminal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/srv/repo-feature' })
    expect(mocks.openServerRemoteTerminal).toHaveBeenCalledWith(
      { repoId: 'ssh-config://prod/srv/repo', worktreePath: '/srv/repo-feature' },
      expect.any(AbortSignal),
    )
  })
})

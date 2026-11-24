import { expect, test, vi } from 'vitest'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import { getRepositorySnapshot, getRepositoryStatus, getRepositoryWorktrees } from '#/server/modules/repo-read-paths.ts'
import { getRefreshRepositorySnapshot, probeRefreshRepository } from '#/server/modules/repo-refresh-read.ts'

const mocks = vi.hoisted(() => ({ backend: vi.fn(), connection: vi.fn(), rpc: vi.fn() }))

vi.mock('#/server/modules/repo-backend.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/server/modules/repo-backend.ts')>()),
  runWithRepoBackend: mocks.backend,
}))
vi.mock('#/server/modules/remote-repo-rpc-settings-source.ts', () => ({ getRepoRpcConnection: mocks.connection }))
vi.mock('#/system/remote/repo-rpc-client.ts', () => ({ readRepoRpcSnapshot: mocks.rpc }))

const cwd = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/workspace/repo' })

test('uses configured RPC for UI refresh while shared write preflight reads keep the repository backend', async () => {
  const sshSnapshot = { branches: [], current: 'ssh' }
  const rpcSnapshot = { branches: [], current: 'rpc' }
  const connection = { alias: 'dev' }
  const worktrees = [{ path: '/workspace/repo', isPrimary: true, isBare: false }]
  mocks.connection.mockResolvedValue(connection)
  mocks.rpc.mockResolvedValue({ snapshot: rpcSnapshot, status: [], worktrees: [] })
  mocks.backend.mockImplementation((_cwd, read) =>
    read({
      getSnapshot: async () => sshSnapshot,
      getWorktrees: async () => worktrees,
      getStatus: async () => [],
    }),
  )

  expect(await getRepositorySnapshot(cwd)).toEqual(sshSnapshot)
  expect(await getRepositoryWorktrees(cwd)).toEqual(worktrees)
  expect(await getRepositoryStatus(cwd)).toEqual([])
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.connection).not.toHaveBeenCalled()

  const { signal } = new AbortController()
  expect(await getRefreshRepositorySnapshot(cwd, true, signal)).toEqual({ ...rpcSnapshot, status: [] })
  expect(mocks.rpc).toHaveBeenCalledWith(connection, '/workspace/repo', 'combined', signal)
  expect(mocks.backend).toHaveBeenCalledTimes(3)
})

test('uses only a metadata RPC for the manual refresh probe', async () => {
  const connection = { alias: 'dev' }
  mocks.connection.mockResolvedValue(connection)
  mocks.rpc.mockResolvedValue({ worktrees: [] })
  const { signal } = new AbortController()

  expect(await probeRefreshRepository(cwd, signal)).toMatchObject({ ok: true, root: cwd, isGitRepo: true })
  expect(mocks.rpc).toHaveBeenCalledWith(connection, '/workspace/repo', 'worktrees', signal)
  expect(mocks.backend).not.toHaveBeenCalled()
})

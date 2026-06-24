import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  discardRepositoryChanges: vi.fn(),
  getRepositoryCommitDetail: vi.fn(),
  getRepositoryHistory: vi.fn(),
  searchRepositoryFileTree: vi.fn(),
  exportRepositoryFilesToLocalDirectory: vi.fn(),
}))

vi.mock('#/server/modules/repo-read-paths.ts', () => ({
  generateRepositoryCommitMessage: vi.fn(),
  getCommitMessageProviders: vi.fn(async () => ({ codex: false, claude: false })),
  getRepositoryCommitDetail: mocks.getRepositoryCommitDetail,
  getRepositoryFileTree: vi.fn(),
  getRepositoryHistory: mocks.getRepositoryHistory,
  getRepositoryPatch: vi.fn(),
  getRepositoryPullRequests: vi.fn(),
  getRepositorySnapshot: vi.fn(),
  getRepositoryStatus: vi.fn(),
  probeRepository: vi.fn(),
  searchRepositoryFileTree: mocks.searchRepositoryFileTree,
}))

vi.mock('#/server/modules/repo-write-paths.ts', () => ({
  abortCloneOperation: vi.fn(),
  abortRepositoryOperation: vi.fn(),
  checkoutRepositoryBranch: vi.fn(),
  checkoutWorktreeBranch: vi.fn(),
  cloneRepository: vi.fn(),
  commitRepositoryChanges: vi.fn(),
  createRepositoryBranch: vi.fn(),
  createRepositoryWorktree: vi.fn(),
  deleteRepositoryBranch: vi.fn(),
  deleteRepositoryFileTreeEntries: vi.fn(),
  discardRepositoryChanges: mocks.discardRepositoryChanges,
  fetchRepository: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
  mergeRepositoryBranch: vi.fn(),
  moveRepositoryFileTreeEntries: vi.fn(),
  openRepositoryEditor: vi.fn(),
  openRepositoryRemote: vi.fn(),
  openRepositoryTerminal: vi.fn(),
  pullRepositoryBranch: vi.fn(),
  pushRepositoryBranch: vi.fn(),
  renameRepositoryFileTreeEntry: vi.fn(),
  removeRepositoryWorktree: vi.fn(),
  resetRepositoryHard: vi.fn(),
  trackRepositoryRemoteBranch: vi.fn(),
}))

vi.mock('#/server/modules/repo-file-transfer.ts', () => ({
  transferRepositoryFiles: vi.fn(),
}))

vi.mock('#/server/modules/repo-file-export.ts', () => ({
  exportRepositoryFilesToLocalDirectory: mocks.exportRepositoryFilesToLocalDirectory,
}))

vi.mock('#/server/modules/background-sync.ts', () => ({
  getBackgroundSyncRepos: vi.fn(() => []),
  setBackgroundSyncRepos: vi.fn(),
}))

vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerFetchIntervalSec: vi.fn(async () => 0),
}))

describe('repo routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRepositoryHistory.mockResolvedValue([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: route',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: [],
      },
    ])
    mocks.getRepositoryCommitDetail.mockResolvedValue({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: route',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
      files: [],
    })
    mocks.discardRepositoryChanges.mockResolvedValue({ ok: true, message: '' })
    mocks.searchRepositoryFileTree.mockResolvedValue({
      ok: true,
      matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
      truncated: false,
      limit: 20,
    })
  })

  test('serves repository history with normalized body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', branch: 'feature/history', limit: 500, skip: -2 }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: route',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: [],
      },
    ])
    expect(mocks.getRepositoryHistory).toHaveBeenCalledWith(
      '/repo',
      'feature/history',
      { limit: 200, skip: 0 },
      expect.any(AbortSignal),
    )
  })

  test('serves repository commit detail', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/commit-detail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', commit: 'abc1234' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: route',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: [],
      files: [],
    })
    expect(mocks.getRepositoryCommitDetail).toHaveBeenCalledWith('/repo', 'abc1234', expect.any(AbortSignal))
  })

  test('serves repository file export', async () => {
    mocks.exportRepositoryFilesToLocalDirectory.mockResolvedValue({
      ok: true,
      copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
      renamed: [],
      failed: [],
    })
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoId: '/repo',
        worktreePath: '/repo',
        targetDirPath: '/Downloads',
        paths: ['/repo/a.txt'],
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      copied: [{ sourcePath: '/repo/a.txt', destinationPath: '/Downloads/a.txt', kind: 'file' }],
      renamed: [],
      failed: [],
    })
    expect(mocks.exportRepositoryFilesToLocalDirectory).toHaveBeenCalledWith({
      repoId: '/repo',
      worktreePath: '/repo',
      targetDirPath: '/Downloads',
      paths: ['/repo/a.txt'],
    })
  })

  test('routes discard selected changes with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/discard-changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoId: '/repo',
        worktreePath: '/repo',
        paths: ['src/app.ts', 'docs'],
        sourceToken: 'client_123',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '' })
    expect(mocks.discardRepositoryChanges).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      ['src/app.ts', 'docs'],
      expect.any(AbortSignal),
      'client_123',
    )
  })

  test('routes repository file search with normalized body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', query: 'button', limit: 500 }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
      truncated: false,
      limit: 20,
    })
    expect(mocks.searchRepositoryFileTree).toHaveBeenCalledWith('/repo', '/repo', 'button', 200, expect.any(AbortSignal))
  })
})

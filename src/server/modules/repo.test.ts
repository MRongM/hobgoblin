import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { PullRequestInfo } from '#/shared/git-types.ts'
import type { PullRequestEntry, RepoSnapshot } from '#/shared/rpc.ts'

const mocks = vi.hoisted(() => ({
  checkGitAvailable: vi.fn(),
  checkoutBranch: vi.fn(),
  checkoutRemoteBranch: vi.fn(),
  commitAllChanges: vi.fn(),
  commitRemoteChanges: vi.fn(),
  createBranch: vi.fn(),
  createRemoteBranch: vi.fn(),
  createRemoteTrackingBranch: vi.fn(),
  createTrackingBranch: vi.fn(),
  createWorktree: vi.fn(),
  deleteBranch: vi.fn(),
  deleteLocalFileTreeEntries: vi.fn(),
  deleteRemoteBranch: vi.fn(),
  deleteRemoteFileTreeEntries: vi.fn(),
  deleteUpstreamBranch: vi.fn(),
  fsAccess: vi.fn(),
  fsMkdir: vi.fn(),
  fsStat: vi.fn(),
  isGitRepo: vi.fn(),
  getBranches: vi.fn(),
  getBranchPullRequests: vi.fn(),
  getCurrentBranch: vi.fn(),
  getDefaultBranch: vi.fn(),
  getRepoName: vi.fn(),
  getRepoRoot: vi.fn(),
  getRemoteInfo: vi.fn(),
  getRemoteTrackingBranches: vi.fn(),
  getUpstream: vi.fn(),
  getWorktreePatch: vi.fn(),
  getWorktrees: vi.fn(),
  isAncestor: vi.fn(),
  fetchAll: vi.fn(),
  fetchRemoteRepository: vi.fn(),
  getBackgroundSyncRepos: vi.fn(),
  getRemoteBrowserUrl: vi.fn(),
  mergeBranch: vi.fn(),
  mergeRemoteBranch: vi.fn(),
  moveLocalFileTreeEntries: vi.fn(),
  moveRemoteFileTreeEntries: vi.fn(),
  pullBranch: vi.fn(),
  pullRemoteBranch: vi.fn(),
  pushBranch: vi.fn(),
  pushRemoteBranch: vi.fn(),
  renameLocalFileTreeEntry: vi.fn(),
  renameRemoteFileTreeEntry: vi.fn(),
  removeWorktree: vi.fn(),
  removeRemoteWorktree: vi.fn(),
  resolveRemoteTarget: vi.fn(),
  runServerCancellable: vi.fn(),
  setBackgroundSyncRepos: vi.fn(),
  publishRepoQueryInvalidation: vi.fn(),
  probeCommitMessageProviders: vi.fn(),
  generateCommitMessageFromPatch: vi.fn(),
}))

vi.mock('#/system/git/branches.ts', () => ({
  checkoutBranch: mocks.checkoutBranch,
  createBranch: mocks.createBranch,
  createTrackingBranch: mocks.createTrackingBranch,
  deleteBranch: mocks.deleteBranch,
  deleteUpstreamBranch: mocks.deleteUpstreamBranch,
  getBranches: mocks.getBranches,
  getCurrentBranch: mocks.getCurrentBranch,
  getDefaultBranch: mocks.getDefaultBranch,
  getRepoName: mocks.getRepoName,
  getRepoRoot: mocks.getRepoRoot,
  getUpstream: mocks.getUpstream,
  isAncestor: mocks.isAncestor,
  isGitRepo: mocks.isGitRepo,
}))

vi.mock('#/system/git/helper.ts', () => ({
  checkGitAvailable: mocks.checkGitAvailable,
}))

vi.mock('#/system/git/commit.ts', () => ({
  commitAllChanges: mocks.commitAllChanges,
}))

vi.mock('#/system/git/patch.ts', () => ({
  getWorktreePatch: mocks.getWorktreePatch,
}))

vi.mock('#/system/commit-message-ai.ts', () => ({
  probeCommitMessageProviders: mocks.probeCommitMessageProviders,
  generateCommitMessageFromPatch: mocks.generateCommitMessageFromPatch,
}))

vi.mock('#/system/git/merge.ts', () => ({
  mergeBranch: mocks.mergeBranch,
}))

vi.mock('node:fs', () => ({
  promises: {
    access: mocks.fsAccess,
    mkdir: mocks.fsMkdir,
    stat: mocks.fsStat,
  },
  constants: {
    R_OK: 4,
    W_OK: 2,
  },
}))

vi.mock('#/system/git/remote.ts', () => ({
  fetchAll: mocks.fetchAll,
  getRemoteInfo: mocks.getRemoteInfo,
  pullBranch: mocks.pullBranch,
  pushBranch: mocks.pushBranch,
}))

vi.mock('#/system/git/remote-refs.ts', () => ({
  getRemoteTrackingBranches: mocks.getRemoteTrackingBranches,
}))

vi.mock('#/system/git/status.ts', () => ({
  getWorkingStatus: vi.fn(),
}))

vi.mock('#/system/git/worktrees.ts', () => ({
  createWorktree: mocks.createWorktree,
  getWorktrees: mocks.getWorktrees,
  removeWorktree: mocks.removeWorktree,
}))

vi.mock('#/system/file-tree/local.ts', () => ({
  deleteLocalFileTreeEntries: mocks.deleteLocalFileTreeEntries,
  moveLocalFileTreeEntries: mocks.moveLocalFileTreeEntries,
  renameLocalFileTreeEntry: mocks.renameLocalFileTreeEntry,
}))

vi.mock('#/shared/input-validation.ts', () => ({
  isValidCwd: () => true,
  isValidRepoLocator: () => true,
}))

vi.mock('#/system/ssh/config.ts', () => ({
  resolveRemoteTarget: mocks.resolveRemoteTarget,
}))

vi.mock('#/system/ssh/diagnostics.ts', () => ({
  testRemoteRepository: vi.fn(),
}))

vi.mock('#/system/ssh/git.ts', () => ({
  checkoutRemoteBranch: mocks.checkoutRemoteBranch,
  commitRemoteChanges: mocks.commitRemoteChanges,
  createRemoteBranch: mocks.createRemoteBranch,
  createRemoteTrackingBranch: mocks.createRemoteTrackingBranch,
  createRemoteWorktree: vi.fn(),
  deleteRemoteBranch: mocks.deleteRemoteBranch,
  deleteRemoteFileTreeEntries: mocks.deleteRemoteFileTreeEntries,
  fetchRemoteRepository: mocks.fetchRemoteRepository,
  getRemoteBrowserUrl: mocks.getRemoteBrowserUrl,
  getRemotePatch: vi.fn(),
  getRemoteTrackingBranches: mocks.getRemoteTrackingBranches,
  getRemoteLog: vi.fn(),
  getRemoteSnapshot: vi.fn(),
  getRemoteStatus: vi.fn(),
  pullRemoteBranch: mocks.pullRemoteBranch,
  pushRemoteBranch: mocks.pushRemoteBranch,
  mergeRemoteBranch: mocks.mergeRemoteBranch,
  moveRemoteFileTreeEntries: mocks.moveRemoteFileTreeEntries,
  renameRemoteFileTreeEntry: mocks.renameRemoteFileTreeEntry,
  removeRemoteWorktree: mocks.removeRemoteWorktree,
}))

vi.mock('#/system/git/pull-requests.ts', () => ({
  getBranchPullRequests: mocks.getBranchPullRequests,
}))

vi.mock('#/server/common/network-ops.ts', () => ({
  runServerCancellable: mocks.runServerCancellable,
  abortServerNetworkOp: vi.fn(),
}))

vi.mock('#/server/modules/invalidation-broker.ts', () => ({
  publishRepoQueryInvalidation: mocks.publishRepoQueryInvalidation,
}))

vi.mock('#/server/modules/background-sync.ts', () => ({
  getBackgroundSyncRepos: mocks.getBackgroundSyncRepos,
  setBackgroundSyncRepos: mocks.setBackgroundSyncRepos,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runServerCancellable.mockImplementation(async (_cwd, _kind, task) => await task(new AbortController().signal))
  mocks.checkGitAvailable.mockResolvedValue({ ok: true, message: '' })
  mocks.fsStat.mockResolvedValue({ isDirectory: () => true })
  mocks.fsAccess.mockResolvedValue(undefined)
  mocks.fsMkdir.mockResolvedValue(undefined)
  mocks.isGitRepo.mockResolvedValue(true)
  mocks.checkoutBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.checkoutRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.commitAllChanges.mockResolvedValue({ ok: true, message: 'committed local' })
  mocks.commitRemoteChanges.mockResolvedValue({ ok: true, message: 'committed remote' })
  mocks.createBranch.mockResolvedValue({ ok: true, message: 'created local' })
  mocks.createRemoteBranch.mockResolvedValue({ ok: true, message: 'created remote' })
  mocks.createRemoteTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked remote' })
  mocks.createTrackingBranch.mockResolvedValue({ ok: true, message: 'tracked local' })
  mocks.mergeBranch.mockResolvedValue({ ok: true, message: 'merged local' })
  mocks.mergeRemoteBranch.mockResolvedValue({ ok: true, message: 'merged remote' })
  mocks.moveLocalFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.moveRemoteFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.pullBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pullRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pushBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.pushRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.fetchRemoteRepository.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.createWorktree.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.deleteRemoteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.deleteBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.deleteLocalFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.deleteRemoteFileTreeEntries.mockResolvedValue({ ok: true, message: '' })
  mocks.deleteUpstreamBranch.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.renameLocalFileTreeEntry.mockResolvedValue({ ok: true, message: '' })
  mocks.renameRemoteFileTreeEntry.mockResolvedValue({ ok: true, message: '' })
  mocks.removeWorktree.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.removeRemoteWorktree.mockResolvedValue({ ok: true, message: 'ok' })
  mocks.getRemoteBrowserUrl.mockResolvedValue(null)
  mocks.resolveRemoteTarget.mockResolvedValue({
    target: {
      id: 'ssh-config://prod/srv/repo',
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
      displayName: 'prod:repo',
    },
  })
  mocks.getCurrentBranch.mockResolvedValue('main')
  mocks.getRepoName.mockResolvedValue('repo')
  mocks.getRepoRoot.mockResolvedValue('/tmp/repo')
  mocks.getWorktrees.mockResolvedValue([])
  mocks.getWorktreePatch.mockResolvedValue('diff --git a/a b/a\n+hello\n')
  mocks.getRemoteTrackingBranches.mockResolvedValue([])
  mocks.getDefaultBranch.mockResolvedValue('main')
  mocks.getUpstream.mockResolvedValue(null)
  mocks.isAncestor.mockResolvedValue(true)
  mocks.probeCommitMessageProviders.mockResolvedValue({ codex: true, claude: false })
  mocks.generateCommitMessageFromPatch.mockResolvedValue({ ok: true, message: 'feat: generated message' })
})

afterEach(() => {
  vi.resetModules()
})

function repoSnapshot(branch = 'main'): RepoSnapshot {
  return {
    branches: [
      {
        name: branch,
        isCurrent: true,
        ahead: 0,
        behind: 0,
        lastCommitHash: 'hash-0',
        lastCommitMessage: 'commit 0',
        lastCommitDate: '2024-01-01T00:00:00.000Z',
        lastCommitAuthor: 'dev',
      },
    ],
    current: branch,
  }
}

function pullRequest(number: number): PullRequestInfo {
  return {
    number,
    title: `PR ${number}`,
    url: `https://example.com/pr/${number}`,
    state: 'open',
  }
}

describe('getRepositorySnapshot', () => {
  test('reads git state directly without publishing invalidation', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([])
    const snapshot = repoSnapshot('fresh')
    mocks.getBranches.mockResolvedValueOnce(snapshot.branches)
    mocks.getCurrentBranch.mockResolvedValueOnce(snapshot.current)
    mocks.getRemoteInfo.mockResolvedValueOnce(snapshot.remote)

    const { getRepositorySnapshot } = await import('#/server/modules/repo-read-paths.ts')
    const result = await getRepositorySnapshot('/tmp/repo')

    expect(result).toEqual(snapshot)
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })
})

describe('getRepositoryPullRequests', () => {
  test('reads pull requests directly from the backend', async () => {
    const fresh: PullRequestEntry[] = [{ branch: 'feature/a', pullRequest: pullRequest(1) }]
    mocks.getBranchPullRequests.mockResolvedValueOnce(new Map([['feature/a', pullRequest(1)]]))
    const { getRepositoryPullRequests } = await import('#/server/modules/repo-read-paths.ts')
    const result = await getRepositoryPullRequests('/tmp/repo', ['feature/a'], { mode: 'full' })

    expect(result).toEqual(fresh)
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('returns single-branch pull requests without publishing invalidation', async () => {
    mocks.getBranchPullRequests.mockResolvedValueOnce(new Map([['feature/a', pullRequest(2)]]))

    const { getRepositoryPullRequests } = await import('#/server/modules/repo-read-paths.ts')
    const result = await getRepositoryPullRequests('/tmp/repo', ['feature/a'], { mode: 'summary' })

    expect(result).toEqual([{ branch: 'feature/a', pullRequest: pullRequest(2) }])
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('returns multi-branch pull requests without publishing invalidation', async () => {
    mocks.getBranchPullRequests.mockResolvedValueOnce(
      new Map([
        ['feature/a', pullRequest(3)],
        ['feature/b', pullRequest(4)],
      ]),
    )

    const { getRepositoryPullRequests } = await import('#/server/modules/repo-read-paths.ts')
    const result = await getRepositoryPullRequests('/tmp/repo', ['feature/a', 'feature/b'], { mode: 'full' })

    expect(result).toEqual([
      { branch: 'feature/a', pullRequest: pullRequest(3) },
      { branch: 'feature/b', pullRequest: pullRequest(4) },
    ])
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })
})

describe('commit message AI read paths', () => {
  test('probes commit message provider availability without publishing invalidation', async () => {
    mocks.probeCommitMessageProviders.mockResolvedValueOnce({ codex: true, claude: true })
    const { getCommitMessageProviders } = await import('#/server/modules/repo-read-paths.ts')

    await expect(getCommitMessageProviders()).resolves.toEqual({ codex: true, claude: true })
    expect(mocks.probeCommitMessageProviders).toHaveBeenCalledWith(undefined)
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('generates commit messages from the current local worktree patch', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo', branch: 'main', isBare: false, isPrimary: true, isDirty: true, changeCount: 1 },
    ])
    mocks.getWorktreePatch.mockResolvedValueOnce('diff --git a/a b/a\n+hello\n')

    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')
    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo', 'codex')).resolves.toEqual({
      ok: true,
      message: 'feat: generated message',
    })

    expect(mocks.getWorktreePatch).toHaveBeenCalledWith('/tmp/repo', { signal: undefined })
    expect(mocks.generateCommitMessageFromPatch).toHaveBeenCalledWith(
      'codex',
      'diff --git a/a b/a\n+hello\n',
      { cwd: '/tmp/repo', signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('rejects unknown commit message providers before reading the patch', async () => {
    const { generateRepositoryCommitMessage } = await import('#/server/modules/repo-read-paths.ts')

    await expect(generateRepositoryCommitMessage('/tmp/repo', '/tmp/repo', 'unknown')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-provider-unavailable',
    })

    expect(mocks.getWorktreePatch).not.toHaveBeenCalled()
    expect(mocks.generateCommitMessageFromPatch).not.toHaveBeenCalled()
  })
})

describe('fetchRepository invalidation publishing', () => {
  test.each([
    ['user', 'user'],
    ['background', 'background'],
  ])('%s sync fetches prune stale remote-tracking refs', async (_name, kind) => {
    mocks.runServerCancellable.mockImplementationOnce(async (_cwd, _kind, task) => await task(new AbortController().signal))
    mocks.fetchAll.mockResolvedValueOnce({ ok: true, message: 'fetched' })

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const result = await fetchRepository('/tmp/repo', kind as 'user' | 'background')

    expect(result).toEqual({ ok: true, message: 'fetched' })
    expect(mocks.fetchAll).toHaveBeenCalledWith('/tmp/repo', expect.any(AbortSignal))
  })

  test('publishes snapshot invalidation after a successful sync', async () => {
    mocks.runServerCancellable.mockResolvedValueOnce({ ok: true, message: 'fetched' })

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const result = await fetchRepository('/tmp/repo', 'user')

    expect(result).toEqual({ ok: true, message: 'fetched' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenNthCalledWith(1, {
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledTimes(1)
  })

  test('user sync waits for and reuses an active background sync result without duplicating invalidation', async () => {
    let resolveFetch!: (value: { ok: true; message: string }) => void
    mocks.runServerCancellable.mockImplementation(async (_cwd, _kind, task) => await task(new AbortController().signal))
    mocks.fetchAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const background = fetchRepository('/tmp/repo', 'background')
    await vi.waitFor(() => {
      expect(mocks.fetchAll).toHaveBeenCalledTimes(1)
    })
    const user = fetchRepository('/tmp/repo', 'user')

    resolveFetch({ ok: true, message: 'fetched in background' })
    const [backgroundResult, userResult] = await Promise.all([background, user])

    expect(backgroundResult).toEqual({ ok: true, message: 'fetched in background' })
    expect(userResult).toEqual({ ok: true, message: 'fetched in background' })
    expect(mocks.runServerCancellable).toHaveBeenCalledTimes(1)
    expect(mocks.fetchAll).toHaveBeenCalledTimes(1)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledTimes(1)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('does not publish invalidations after a failed sync', async () => {
    mocks.runServerCancellable.mockResolvedValueOnce({ ok: false, message: 'fatal: offline' })

    const { fetchRepository } = await import('#/server/modules/repo-write-paths.ts')
    const result = await fetchRepository('/tmp/repo', 'background')

    expect(result).toEqual({ ok: false, message: 'fatal: offline' })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })
})

describe('probeRepository path errors', () => {
  test('reports missing paths specifically', async () => {
    mocks.fsStat.mockRejectedValueOnce({ code: 'ENOENT' })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/missing')).resolves.toEqual({ ok: false, message: 'error.path-not-found' })
  })

  test('reports non-directory paths specifically', async () => {
    mocks.fsStat.mockResolvedValueOnce({ isDirectory: () => false })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/file')).resolves.toEqual({ ok: false, message: 'error.path-not-directory' })
  })

  test('reports permission-denied paths specifically', async () => {
    mocks.fsAccess.mockRejectedValueOnce({ code: 'EACCES' })

    const { probeRepository } = await import('#/server/modules/repo-read-paths.ts')
    await expect(probeRepository('/tmp/private')).resolves.toEqual({ ok: false, message: 'error.path-permission-denied' })
  })
})

describe('repo mutation invalidation publishing', () => {
  test('createRepositoryWorktree passes object-shaped input to the backend and publishes source-token invalidation', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree(
      '/tmp/repo',
      { worktreePath: '/tmp/repo-feature', mode: { kind: 'existingBranch', branch: 'feature/a' } },
      undefined,
      'repo_branch_test',
    )

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.createWorktree).toHaveBeenCalledWith(
      '/tmp/repo',
      { worktreePath: '/tmp/repo-feature', mode: { kind: 'existingBranch', branch: 'feature/a' } },
      undefined,
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('createRepositoryBranch creates a local branch and publishes source-token invalidation', async () => {
    const { createRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryBranch('/tmp/repo', 'feature/new', 'main', undefined, 'repo_branch_test')

    expect(result).toEqual({ ok: true, message: 'created local' })
    expect(mocks.createBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/new', 'main', undefined)
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('trackRepositoryRemoteBranch creates a local tracking branch and publishes source-token invalidation', async () => {
    const { trackRepositoryRemoteBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await trackRepositoryRemoteBranch(
      '/tmp/repo',
      'feature/new',
      'origin/feature/new',
      undefined,
      'repo_branch_test',
    )

    expect(result).toEqual({ ok: true, message: 'tracked local' })
    expect(mocks.createTrackingBranch).toHaveBeenCalledWith(
      '/tmp/repo',
      'feature/new',
      'origin/feature/new',
      undefined,
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
      sourceToken: 'repo_branch_test',
    })
  })

  test('getRepositoryRemoteBranches returns local remote-tracking refs', async () => {
    mocks.getRemoteTrackingBranches.mockResolvedValueOnce(['origin/main', 'origin/feature/a'])
    const { getRepositoryRemoteBranches } = await import('#/server/modules/repo-write-paths.ts')

    await expect(getRepositoryRemoteBranches('/tmp/repo')).resolves.toEqual(['origin/main', 'origin/feature/a'])
    expect(mocks.getRemoteTrackingBranches).toHaveBeenCalledWith('/tmp/repo', undefined)
  })

  test('renameRepositoryFileTreeEntry publishes snapshot invalidation after local success', async () => {
    const { renameRepositoryFileTreeEntry } = await import('#/server/modules/repo-write-paths.ts')

    const result = await renameRepositoryFileTreeEntry('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md', 'README2.md')

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.renameLocalFileTreeEntry).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/README.md', 'README2.md')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryFileTreeEntries publishes snapshot invalidation after local success', async () => {
    const { deleteRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryFileTreeEntries('/tmp/repo', '/tmp/repo', ['/tmp/repo/README.md'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.deleteLocalFileTreeEntries).toHaveBeenCalledWith('/tmp/repo', ['/tmp/repo/README.md'])
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('renameRepositoryFileTreeEntry dispatches remote repos to the SSH helper', async () => {
    const { renameRepositoryFileTreeEntry } = await import('#/server/modules/repo-write-paths.ts')

    const result = await renameRepositoryFileTreeEntry(
      'ssh-config://prod/srv/repo',
      '/srv/repo',
      '/srv/repo/README.md',
      'README2.md',
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.renameRemoteFileTreeEntry).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      '/srv/repo/README.md',
      'README2.md',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryFileTreeEntries dispatches remote repos to the SSH helper', async () => {
    const { deleteRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryFileTreeEntries('ssh-config://prod/srv/repo', '/srv/repo', ['/srv/repo/src'])

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.deleteRemoteFileTreeEntries).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      ['/srv/repo/src'],
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('moveRepositoryFileTreeEntries publishes snapshot invalidation after local success', async () => {
    const { moveRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await moveRepositoryFileTreeEntries('/tmp/repo', '/tmp/repo', ['/tmp/repo/README.md'], '/tmp/repo/docs')

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.moveLocalFileTreeEntries).toHaveBeenCalledWith('/tmp/repo', ['/tmp/repo/README.md'], '/tmp/repo/docs')
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('moveRepositoryFileTreeEntries dispatches remote repos to the SSH helper', async () => {
    const { moveRepositoryFileTreeEntries } = await import('#/server/modules/repo-write-paths.ts')

    const result = await moveRepositoryFileTreeEntries(
      'ssh-config://prod/srv/repo',
      '/srv/repo',
      ['/srv/repo/README.md'],
      '/srv/repo/docs',
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(mocks.moveRemoteFileTreeEntries).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/srv/repo',
      ['/srv/repo/README.md'],
      '/srv/repo/docs',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('file tree write failures do not publish snapshot invalidation', async () => {
    mocks.renameLocalFileTreeEntry.mockResolvedValueOnce({ ok: false, message: 'error.file-exists' })
    const { renameRepositoryFileTreeEntry } = await import('#/server/modules/repo-write-paths.ts')

    const result = await renameRepositoryFileTreeEntry('/tmp/repo', '/tmp/repo', '/tmp/repo/README.md', 'README2.md')

    expect(result).toEqual({ ok: false, message: 'error.file-exists' })
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test.each([
    ['checkoutRepositoryBranch', async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.checkoutRepositoryBranch('/tmp/repo', 'feature/a')],
    ['pullRepositoryBranch', async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.pullRepositoryBranch('/tmp/repo', 'feature/a')],
    ['pushRepositoryBranch', async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.pushRepositoryBranch('/tmp/repo', 'feature/a')],
    [
      'createRepositoryWorktree',
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.createRepositoryWorktree('/tmp/repo', {
          worktreePath: '/tmp/repo-worktree',
          mode: { kind: 'newBranch', newBranch: 'feature/a', baseRef: 'main' },
        }),
    ],
  ])('%s publishes snapshot invalidation after success', async (_name, run) => {
    const repo = await import('#/server/modules/repo-write-paths.ts')

    const result = await run(repo)

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test.each([
    ['pullRepositoryBranch', async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.pullRepositoryBranch('/tmp/repo', 'feature/a')],
    ['pushRepositoryBranch', async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.pushRepositoryBranch('/tmp/repo', 'feature/a')],
  ])('%s runs inside the repo network-op gate', async (_name, run) => {
    const repo = await import('#/server/modules/repo-write-paths.ts')

    const result = await run(repo)

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.runServerCancellable).toHaveBeenCalledWith(
      '/tmp/repo',
      'user',
      expect.any(Function),
    )
  })

  test.each([
    [
      'checkoutRepositoryBranch',
      () => mocks.checkoutBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: checkout failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.checkoutRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pullRepositoryBranch',
      () => mocks.pullBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: pull failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.pullRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'pushRepositoryBranch',
      () => mocks.pushBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: push failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) => repo.pushRepositoryBranch('/tmp/repo', 'feature/a'),
    ],
    [
      'createRepositoryWorktree',
      () => mocks.createWorktree.mockResolvedValueOnce({ ok: false, message: 'fatal: worktree failed' }),
      async (repo: typeof import('#/server/modules/repo-write-paths.ts')) =>
        repo.createRepositoryWorktree('/tmp/repo', {
          worktreePath: '/tmp/repo-worktree',
          mode: { kind: 'newBranch', newBranch: 'feature/a', baseRef: 'main' },
        }),
    ],
  ])('%s does not publish snapshot invalidation after failure', async (_name, setup, run) => {
    setup()
    const repo = await import('#/server/modules/repo-write-paths.ts')

    await run(repo)

    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('createRepositoryWorktree rejects non-absolute paths before calling git', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await createRepositoryWorktree('/tmp/repo', { worktreePath: 'relative/path', mode: { kind: 'newBranch', newBranch: 'feature/a', baseRef: 'main' } })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(mocks.createWorktree).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch publishes snapshot invalidation after success', async () => {
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/a')

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('deleteRepositoryBranch refuses protected branches before touching git', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('feature/current')
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'main')

    expect(result).toEqual({ ok: false, message: 'error.cannot-delete-protected-branch' })
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('deleteRepositoryBranch uses current HEAD semantics for safe deletes', async () => {
    mocks.getCurrentBranch.mockResolvedValueOnce('release/1.0')
    mocks.getWorktrees.mockResolvedValueOnce([])
    mocks.isAncestor.mockImplementationOnce(async (_cwd, _branch, descendant) => descendant === 'release/1.0')
    mocks.getUpstream.mockResolvedValueOnce(null)
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await deleteRepositoryBranch('/tmp/repo', 'feature/a')

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.isAncestor).toHaveBeenCalledWith('/tmp/repo', 'feature/a', 'release/1.0', undefined)
    expect(mocks.deleteBranch).toHaveBeenCalledWith('/tmp/repo', 'feature/a', { force: undefined, signal: undefined })
  })

  test('deleteRepositoryBranch does not publish snapshot invalidation after failure', async () => {
    mocks.deleteBranch.mockResolvedValueOnce({ ok: false, message: 'fatal: delete failed' })
    const { deleteRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    await deleteRepositoryBranch('/tmp/repo', 'feature/a')

    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree publishes snapshot invalidation after worktree removal success', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-worktree', branch: 'feature/a', isBare: false, isPrimary: false, isDirty: false, changeCount: 0 },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('removeRepositoryWorktree publishes snapshot invalidation once after worktree and branch deletion success', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-worktree', branch: 'feature/a', isBare: false, isPrimary: false, isDirty: false, changeCount: 0 },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: true,
    })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledTimes(1)
  })

  test('removeRepositoryWorktree refuses before removing when branch deletion would fail', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-worktree', branch: 'feature/a', isBare: false, isPrimary: false, isDirty: false, changeCount: 0 },
    ])
    mocks.isAncestor.mockResolvedValueOnce(false)
    mocks.getUpstream.mockResolvedValueOnce(null)
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: true,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-unpushed-worktree' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
    expect(mocks.deleteBranch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree refuses locked worktrees before calling git remove', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-worktree', branch: 'feature/a', isBare: false, isPrimary: false, isDirty: false, isLocked: true },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-locked-worktree' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
  })

  test('removeRepositoryWorktree refuses when worktree status could not be read', async () => {
    mocks.getWorktrees.mockResolvedValueOnce([
      { path: '/tmp/repo-worktree', branch: 'feature/a', isBare: false, isPrimary: false },
    ])
    const { removeRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')

    const result = await removeRepositoryWorktree('/tmp/repo', {
      branch: 'feature/a',
      worktreePath: '/tmp/repo-worktree',
      alsoDeleteBranch: false,
    })

    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-dirty-worktree' })
    expect(mocks.removeWorktree).not.toHaveBeenCalled()
  })

  test('commitRepositoryChanges commits local worktrees through the local backend and publishes invalidation', async () => {
    const { commitRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await commitRepositoryChanges('/tmp/repo', '/tmp/repo-worktree', 'feat: local commit')

    expect(result).toEqual({ ok: true, message: 'committed local' })
    expect(mocks.commitAllChanges).toHaveBeenCalledWith('/tmp/repo-worktree', 'feat: local commit', undefined)
    expect(mocks.commitRemoteChanges).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('commitRepositoryChanges commits remote worktrees through the remote backend and publishes invalidation', async () => {
    const { commitRepositoryChanges } = await import('#/server/modules/repo-write-paths.ts')

    const result = await commitRepositoryChanges(
      'ssh-config://prod/srv/repo',
      '/data/deer-flow-runtime1',
      'feat: remote commit',
    )

    expect(result).toEqual({ ok: true, message: 'committed remote' })
    expect(mocks.commitAllChanges).not.toHaveBeenCalled()
    expect(mocks.commitRemoteChanges).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/data/deer-flow-runtime1',
      'feat: remote commit',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('mergeRepositoryBranch merges local worktrees through the local backend and publishes invalidation', async () => {
    const { mergeRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await mergeRepositoryBranch('/tmp/repo', '/tmp/repo-worktree', 'feature/a')

    expect(result).toEqual({ ok: true, message: 'merged local' })
    expect(mocks.mergeBranch).toHaveBeenCalledWith('/tmp/repo-worktree', 'feature/a', undefined)
    expect(mocks.mergeRemoteBranch).not.toHaveBeenCalled()
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: '/tmp/repo',
      query: 'repo-snapshot',
    })
  })

  test('mergeRepositoryBranch merges remote worktrees through the SSH backend and publishes invalidation', async () => {
    const { mergeRepositoryBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await mergeRepositoryBranch(
      'ssh-config://prod/srv/repo',
      '/data/deer-flow-release-release_20260609',
      'feature/coop_agentrun',
    )

    expect(result).toEqual({ ok: true, message: 'merged remote' })
    expect(mocks.mergeBranch).not.toHaveBeenCalled()
    expect(mocks.mergeRemoteBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      '/data/deer-flow-release-release_20260609',
      'feature/coop_agentrun',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })

  test('checkoutWorktreeBranch switches remote worktrees through the SSH backend and publishes invalidation', async () => {
    const { checkoutWorktreeBranch } = await import('#/server/modules/repo-write-paths.ts')

    const result = await checkoutWorktreeBranch(
      'ssh-config://prod/srv/repo',
      '/data/deer-flow-bugfix_409',
      'feat/agent-task',
    )

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(mocks.checkoutBranch).not.toHaveBeenCalled()
    expect(mocks.checkoutRemoteBranch).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'prod', remotePath: '/srv/repo' }),
      'feat/agent-task',
      '/data/deer-flow-bugfix_409',
      { signal: undefined },
    )
    expect(mocks.publishRepoQueryInvalidation).toHaveBeenCalledWith({
      repoId: 'ssh-config://prod/srv/repo',
      query: 'repo-snapshot',
    })
  })
})

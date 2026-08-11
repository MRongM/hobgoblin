import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanupRepositoryWorktree: vi.fn(),
  createRepositoryWorktree: vi.fn(),
  createRepositoryFileTreeFile: vi.fn(),
  discardRepositoryChanges: vi.fn(),
  getRepositoryCommitDetail: vi.fn(),
  getRepositoryHistory: vi.fn(),
  openRepositoryTerminal: vi.fn(),
  openRepositoryEditor: vi.fn(),
  readRepositoryFileTreeBinaryFile: vi.fn(),
  readRepositoryFileTreeTextFile: vi.fn(),
  replaceRepositoryFileTreeBinaryFile: vi.fn(),
  replaceRepositoryFileTreeTextFile: vi.fn(),
  removeRepositoryWorktree: vi.fn(),
  searchRepositoryFileTree: vi.fn(),
  exportRepositoryFilesToLocalDirectory: vi.fn(),
  getRepositoryLocalTags: vi.fn(),
  createRepositoryLocalTag: vi.fn(),
  deleteRepositoryLocalTag: vi.fn(),
  getRepositoryRemoteTags: vi.fn(),
  deleteRepositoryRemoteTag: vi.fn(),
  buildRepositoryBranchMergeOutPlan: vi.fn(),
  executeRepositoryBranchMergeOut: vi.fn(),
  setRepositoryBranchUpstream: vi.fn(),
}))

vi.mock('#/server/modules/repo-read-paths.ts', () => ({
  generateRepositoryCommitMessage: vi.fn(),
  getCommitMessageProviders: vi.fn(async () => ({ codex: false, claude: false })),
  getRepositoryCommitDetail: mocks.getRepositoryCommitDetail,
  getRepositoryFileTree: vi.fn(),
  getRepositoryHistory: mocks.getRepositoryHistory,
  getRepositoryLocalTags: mocks.getRepositoryLocalTags,
  getRepositoryPatch: vi.fn(),
  getRepositorySnapshot: vi.fn(),
  getRepositoryStatus: vi.fn(),
  probeRepository: vi.fn(),
  readRepositoryFileTreeBinaryFile: mocks.readRepositoryFileTreeBinaryFile,
  readRepositoryFileTreeTextFile: mocks.readRepositoryFileTreeTextFile,
  searchRepositoryFileTree: mocks.searchRepositoryFileTree,
}))

vi.mock('#/server/modules/repo-write-paths.ts', () => ({
  abortCloneOperation: vi.fn(),
  abortRepositoryOperation: vi.fn(),
  checkoutRepositoryBranch: vi.fn(),
  checkoutWorktreeBranch: vi.fn(),
  cleanupRepositoryWorktree: mocks.cleanupRepositoryWorktree,
  cloneRepository: vi.fn(),
  commitRepositoryChanges: vi.fn(),
  createRepositoryBranch: vi.fn(),
  createRepositoryFileTreeFile: mocks.createRepositoryFileTreeFile,
  createRepositoryWorktree: mocks.createRepositoryWorktree,
  deleteRepositoryBranch: vi.fn(),
  deleteRepositoryRemoteTag: mocks.deleteRepositoryRemoteTag,
  deleteRepositoryFileTreeEntries: vi.fn(),
  discardRepositoryChanges: mocks.discardRepositoryChanges,
  fetchRepository: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
  getRepositoryRemoteTags: mocks.getRepositoryRemoteTags,
  getRepositoryLocalTags: mocks.getRepositoryLocalTags,
  createRepositoryLocalTag: mocks.createRepositoryLocalTag,
  deleteRepositoryLocalTag: mocks.deleteRepositoryLocalTag,
  mergeRepositoryBranch: vi.fn(),
  moveRepositoryFileTreeEntries: vi.fn(),
  openRepositoryEditor: mocks.openRepositoryEditor,
  openRepositoryRemote: vi.fn(),
  openRepositoryTerminal: mocks.openRepositoryTerminal,
  pullRepositoryBranch: vi.fn(),
  pushRepositoryBranch: vi.fn(),
  renameRepositoryFileTreeEntry: vi.fn(),
  replaceRepositoryFileTreeBinaryFile: mocks.replaceRepositoryFileTreeBinaryFile,
  replaceRepositoryFileTreeTextFile: mocks.replaceRepositoryFileTreeTextFile,
  removeRepositoryWorktree: mocks.removeRepositoryWorktree,
  resetRepositoryHard: vi.fn(),
  setRepositoryBranchUpstream: mocks.setRepositoryBranchUpstream,
  trackRepositoryRemoteBranch: vi.fn(),
}))

vi.mock('#/server/modules/repo-file-transfer.ts', () => ({
  transferRepositoryFiles: vi.fn(),
}))

vi.mock('#/server/modules/repo-file-export.ts', () => ({
  exportRepositoryFilesToLocalDirectory: mocks.exportRepositoryFilesToLocalDirectory,
}))

vi.mock('#/server/modules/repository-branch-merge-plan.ts', () => ({
  buildRepositoryBranchMergeOutPlan: mocks.buildRepositoryBranchMergeOutPlan,
}))

vi.mock('#/server/modules/repository-branch-merge-write-paths.ts', () => ({
  executeRepositoryBranchMergeOut: mocks.executeRepositoryBranchMergeOut,
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
    mocks.openRepositoryTerminal.mockResolvedValue({ ok: true, message: '/tmp/repo/worktree' })
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
    mocks.createRepositoryFileTreeFile.mockResolvedValue({ ok: true, message: '' })
    mocks.openRepositoryEditor.mockResolvedValue({ ok: true, message: '/repo/src/app.ts' })
    mocks.readRepositoryFileTreeBinaryFile.mockResolvedValue({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: 'AQID',
    })
    mocks.readRepositoryFileTreeTextFile.mockResolvedValue({ ok: true, content: 'hello\n', byteLength: 6 })
    mocks.replaceRepositoryFileTreeBinaryFile.mockResolvedValue({
      ok: true,
      previousBytesBase64: 'CQg=',
      previousByteLength: 2,
    })
    mocks.replaceRepositoryFileTreeTextFile.mockResolvedValue({
      ok: true,
      previousContent: 'old\n',
      previousByteLength: 4,
    })
    mocks.searchRepositoryFileTree.mockResolvedValue({
      ok: true,
      matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
      truncated: false,
      limit: 20,
    })
    mocks.getRepositoryLocalTags.mockResolvedValue(['v1.0.0'])
    mocks.createRepositoryLocalTag.mockResolvedValue({ ok: true, message: 'created' })
    mocks.deleteRepositoryLocalTag.mockResolvedValue({ ok: true, message: 'deleted' })
    mocks.getRepositoryRemoteTags.mockResolvedValue(['origin/v1.0.0'])
    mocks.deleteRepositoryRemoteTag.mockResolvedValue({ ok: true, message: 'deleted' })
    mocks.removeRepositoryWorktree.mockResolvedValue({ ok: true, message: 'removed' })
    mocks.cleanupRepositoryWorktree.mockResolvedValue({ ok: true, message: 'pruned' })
    mocks.buildRepositoryBranchMergeOutPlan.mockResolvedValue({
      ok: true,
      plan: {
        token: 'sha256:plan',
        repoId: '/repo',
        sourceBranch: 'feature/source',
        sourceWorktreePath: '/repo-feature',
        sourceHead: 'source-head',
        ready: true,
        destinations: [],
      },
    })
    mocks.executeRepositoryBranchMergeOut.mockResolvedValue({ ok: true, message: 'merged' })
    mocks.setRepositoryBranchUpstream.mockResolvedValue({ ok: true, message: 'updated' })
  })

  test('routes setting and removing a branch upstream', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const setResponse = await app.request('http://localhost/set-branch-upstream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/repo',
        branch: 'feature/local',
        remoteRef: 'origin/release',
        sourceToken: 'client_123',
      }),
    })
    const unsetResponse = await app.request('http://localhost/set-branch-upstream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/repo',
        branch: 'feature/local',
        remoteRef: null,
        sourceToken: 'client_456',
      }),
    })

    expect(setResponse.status).toBe(200)
    expect(unsetResponse.status).toBe(200)
    await expect(setResponse.json()).resolves.toEqual({ ok: true, message: 'updated' })
    await expect(unsetResponse.json()).resolves.toEqual({ ok: true, message: 'updated' })
    expect(mocks.setRepositoryBranchUpstream).toHaveBeenNthCalledWith(
      1,
      '/repo',
      'feature/local',
      'origin/release',
      expect.any(AbortSignal),
      'client_123',
    )
    expect(mocks.setRepositoryBranchUpstream).toHaveBeenNthCalledWith(
      2,
      '/repo',
      'feature/local',
      null,
      expect.any(AbortSignal),
      'client_456',
    )
  })

  test('passes the raw merge-out plan request and abort signal to the authoritative planner', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()
    const body = {
      repoId: '/repo',
      sourceBranch: 'feature/source',
      sourceWorktreePath: '/repo-feature',
    }

    const response = await app.request('http://localhost/merge-out-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
    expect(mocks.buildRepositoryBranchMergeOutPlan).toHaveBeenCalledWith(body, {}, expect.any(AbortSignal))
  })

  test('passes merge-out execution and source token to the authoritative write path', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()
    const body = {
      repoId: '/repo',
      planToken: 'sha256:plan',
      sourceBranch: 'feature/source',
      sourceWorktreePath: '/repo-feature',
      destinationBranch: 'main',
      mode: 'merge',
      sourceToken: 'client_123',
    }

    const response = await app.request('http://localhost/merge-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'merged' })
    expect(mocks.executeRepositoryBranchMergeOut).toHaveBeenCalledWith(body, {}, expect.any(AbortSignal), 'client_123')
  })

  test('passes local project identity separately from the requested terminal directory', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/open-terminal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectRoot: '/tmp/repo', workingDirectory: '/tmp/repo/worktree' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/tmp/repo/worktree' })
    expect(mocks.openRepositoryTerminal).toHaveBeenCalledWith({
      projectRoot: '/tmp/repo',
      workingDirectory: '/tmp/repo/worktree',
    })
  })

  test('routes invalid worktree cleanup with the exact selected path', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/cleanup-worktree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/repo',
        worktreePath: '/repo-stale',
        sourceToken: 'client_123',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'pruned' })
    expect(mocks.cleanupRepositoryWorktree).toHaveBeenCalledWith(
      '/repo',
      '/repo-stale',
      expect.any(AbortSignal),
      'client_123',
    )
  })

  test('routes worktree force separately from branch force', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/remove-worktree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/repo',
        branch: 'feature/test',
        worktreePath: '/repo-feature',
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
        forceDeleteBranch: false,
        sourceToken: 'client_123',
      }),
    })

    await expect(response.json()).resolves.toEqual({ ok: true, message: 'removed' })
    expect(mocks.removeRepositoryWorktree).toHaveBeenCalledWith(
      '/repo',
      {
        branch: 'feature/test',
        worktreePath: '/repo-feature',
        alsoDeleteBranch: false,
        forceRemoveWorktree: true,
        forceDeleteBranch: false,
        alsoDeleteUpstream: false,
      },
      expect.any(AbortSignal),
      'client_123',
    )
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

  test('serves repository remote tags', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/remote-tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/tmp/repo' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(['origin/v1.0.0'])
    expect(mocks.getRepositoryRemoteTags).toHaveBeenCalledWith('/tmp/repo', expect.any(AbortSignal))
  })

  test('serves repository local tags', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/local-tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/tmp/repo' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(['v1.0.0'])
    expect(mocks.getRepositoryLocalTags).toHaveBeenCalledWith('/tmp/repo', expect.any(AbortSignal))
  })

  test('routes local tag creation', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/create-local-tag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/tmp/repo', name: 'v1.0.0', ref: 'HEAD', sourceToken: 'repo_test' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'created' })
    expect(mocks.createRepositoryLocalTag).toHaveBeenCalledWith(
      '/tmp/repo',
      'v1.0.0',
      'HEAD',
      expect.any(AbortSignal),
      'repo_test',
    )
  })

  test('routes local tag deletion', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/delete-local-tag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/tmp/repo', name: 'v1.0.0', sourceToken: 'repo_test' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'deleted' })
    expect(mocks.deleteRepositoryLocalTag).toHaveBeenCalledWith(
      '/tmp/repo',
      'v1.0.0',
      expect.any(AbortSignal),
      'repo_test',
    )
  })

  test('routes remote tag deletion', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/delete-remote-tag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/tmp/repo', remote: 'origin', tag: 'release/v1.0.0', sourceToken: 'repo_test' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'deleted' })
    expect(mocks.deleteRepositoryRemoteTag).toHaveBeenCalledWith(
      '/tmp/repo',
      'origin',
      'release/v1.0.0',
      expect.any(AbortSignal),
      'repo_test',
    )
  })

  test('does not expose worktree bootstrap config preview or initialization', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const responses = await Promise.all(
      [
        ['worktree-bootstrap-preview', { cwd: '/tmp/repo', worktreePath: '/tmp/repo-feature' }],
        ['worktree-bootstrap-config/init', { repoId: '/tmp/repo', worktreePath: '/tmp/repo-feature' }],
      ].map(([route, body]) =>
        app.request(`http://localhost/${String(route)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    )

    expect(responses.map((response) => response.status)).toEqual([404, 404])
  })

  test('downgrades a removed config-based worktree bootstrap decision to skip', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    vi.mocked(createRepositoryWorktree).mockResolvedValueOnce({ ok: true, message: 'ok' })
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()
    const worktreeBootstrap = {
      kind: 'run',
      configHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      configTrusted: true,
      sourceWorktreePath: '/tmp/repo-source',
    }

    const response = await app.request('http://localhost/create-worktree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/tmp/repo',
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        worktreeBootstrap,
        sourceToken: 'repo_branch_test',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'ok' })
    expect(createRepositoryWorktree).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      expect.any(AbortSignal),
      'repo_branch_test',
    )
  })

  test('removes source authority from a skip bootstrap decision', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    vi.mocked(createRepositoryWorktree).mockResolvedValueOnce({ ok: true, message: 'ok' })
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    await app.request('http://localhost/create-worktree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/tmp/repo',
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        worktreeBootstrap: { kind: 'skip', sourceWorktreePath: '/tmp/not-used' },
      }),
    })

    expect(createRepositoryWorktree).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      expect.any(AbortSignal),
      undefined,
    )
  })

  test('routes create worktree with normalized one-time selections', async () => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    vi.mocked(createRepositoryWorktree).mockResolvedValueOnce({ ok: true, message: 'ok' })
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()
    const worktreeBootstrap = {
      kind: 'materialize',
      sourceWorktreePath: '/tmp/repo-source',
      selections: [
        { path: '.env', mode: 'copy' },
        { path: '../invalid', mode: 'copy' },
        { path: 'backend/.venv', mode: 'symlink' },
      ],
    }
    const normalizedBootstrap = {
      kind: 'materialize',
      sourceWorktreePath: '/tmp/repo-source',
      selections: [
        { path: '.env', mode: 'copy' },
        { path: 'backend/.venv', mode: 'symlink' },
      ],
    }

    const response = await app.request('http://localhost/create-worktree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/tmp/repo',
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: true,
        worktreeBootstrap,
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: 'ok' })
    expect(createRepositoryWorktree).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: true,
      },
      normalizedBootstrap,
      expect.any(AbortSignal),
      undefined,
    )
  })

  test.each<unknown>([
    { kind: 'materialize', sourceWorktreePath: '/tmp/repo-source', selections: [] },
    {
      kind: 'materialize',
      sourceWorktreePath: '/tmp/repo-source',
      selections: [{ path: '.env', mode: 'hardlink' }],
    },
    {
      kind: 'materialize',
      sourceWorktreePath: 'relative/source',
      selections: [{ path: 'backend/.venv', mode: 'copy' }],
    },
    {
      kind: 'materialize',
      selections: [{ path: 'backend/.venv', mode: 'copy' }],
    },
  ])('downgrades malformed one-time worktree bootstrap decisions to skip: %j', async (worktreeBootstrap) => {
    const { createRepositoryWorktree } = await import('#/server/modules/repo-write-paths.ts')
    vi.mocked(createRepositoryWorktree).mockResolvedValueOnce({ ok: true, message: 'ok' })
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/create-worktree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cwd: '/tmp/repo',
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        worktreeBootstrap,
      }),
    })

    await expect(response.json()).resolves.toEqual({ ok: true, message: 'ok' })
    expect(createRepositoryWorktree).toHaveBeenCalledWith(
      '/tmp/repo',
      {
        worktreePath: '/tmp/repo-feature',
        mode: { kind: 'existingBranch', branch: 'feature/a' },
        syncBeforeCreate: false,
      },
      { kind: 'skip' },
      expect.any(AbortSignal),
      undefined,
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
    expect(mocks.searchRepositoryFileTree).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      'button',
      200,
      expect.any(AbortSignal),
    )
  })

  test('routes file tree create file with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/create-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', parentDirPath: '/repo/src', name: 'index.ts' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '' })
    expect(mocks.createRepositoryFileTreeFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/src',
      'index.ts',
      expect.any(AbortSignal),
      undefined,
    )
  })

  test('routes structured repository editor targets', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/open-editor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: { path: '/repo/src/app.ts', line: 12, column: 3 } }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, message: '/repo/src/app.ts' })
    expect(mocks.openRepositoryEditor).toHaveBeenCalledWith({ path: '/repo/src/app.ts', line: 12, column: 3 })
  })

  test('routes file tree text file read with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/read-text-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', filePath: '/repo/README.md' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, content: 'hello\n', byteLength: 6 })
    expect(mocks.readRepositoryFileTreeTextFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/README.md',
      expect.any(AbortSignal),
    )
  })

  test('routes file tree text file replace with parsed body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/replace-text-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', filePath: '/repo/README.md', content: 'new\n' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, previousContent: 'old\n', previousByteLength: 4 })
    expect(mocks.replaceRepositoryFileTreeTextFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/README.md',
      'new\n',
      expect.any(AbortSignal),
      undefined,
    )
  })

  test('routes file tree binary file read with validated body values', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/read-binary-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', filePath: '/repo/image.bin', maxBytes: 30 }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: 'AQID',
    })
    expect(mocks.readRepositoryFileTreeBinaryFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/image.bin',
      30,
      expect.any(AbortSignal),
    )
  })

  test('routes file tree binary file replace with source token', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/replace-binary-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repoId: '/repo',
        worktreePath: '/repo',
        filePath: '/repo/image.bin',
        bytesBase64: 'AQI=',
        maxBytes: 30,
        sourceToken: 'client_123',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, previousBytesBase64: 'CQg=', previousByteLength: 2 })
    expect(mocks.replaceRepositoryFileTreeBinaryFile).toHaveBeenCalledWith(
      '/repo',
      '/repo',
      '/repo/image.bin',
      'AQI=',
      30,
      expect.any(AbortSignal),
      'client_123',
    )
  })

  test('rejects invalid file tree binary file read bodies', async () => {
    const { createRepoRoutes } = await import('#/server/routes/repo.ts')
    const app = createRepoRoutes()

    const response = await app.request('http://localhost/file-tree/read-binary-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoId: '/repo', worktreePath: '/repo', filePath: '/repo/image.bin', maxBytes: 0 }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(mocks.readRepositoryFileTreeBinaryFile).not.toHaveBeenCalled()
  })
})

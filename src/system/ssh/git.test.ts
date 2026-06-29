import { describe, expect, test, vi } from 'vitest'
import {
  checkoutRemoteBranch,
  commitRemoteChanges,
  createRemoteBranch,
  createRemoteFileTreeDirectory,
  createRemoteFileTreeFile,
  createRemoteTrackingBranch,
  createRemoteWorktree,
  deleteRemoteBranch,
  deleteRemoteFileTreeEntries,
  discardRemoteChangesForPaths,
  getRemoteBrowserUrl,
  getRemoteCommitDetail,
  getRemoteHistory,
  getRemoteSnapshot,
  inventoryRemoteFileTransfer,
  listRemoteFileTreeDirectory,
  mergeRemoteBranch,
  moveRemoteFileTreeEntries,
  pullRemoteBranch,
  fetchRemoteRepository,
  pushRemoteBranch,
  readRemoteFileBase64,
  readRemoteFileTreeBinaryFile,
  readRemoteFileTreeTextFile,
  resetRemoteHard,
  remoteExecResult,
  renameRemoteFileTreeEntry,
  replaceRemoteFileTreeBinaryFile,
  replaceRemoteFileTreeTextFile,
  removeRemoteWorktree,
  searchRemoteFileTree,
  writeRemoteFileBase64,
} from '#/system/ssh/git.ts'
import type { RemoteCommandResult } from '#/system/ssh/commands.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const TARGET = normalizeRemoteTarget({
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/repo',
})!

describe('remote git helpers', () => {
  test('builds browser and pull request URLs from remote verbose output', async () => {
    const run = async (command: { type: string }) => {
      switch (command.type) {
        case 'gitRemoteVerbose':
          return okRemoteResult(
            'origin\tgit@github.com:acme/project.git (fetch)\norigin\tgit@github.com:acme/project.git (push)',
          )
        case 'gitUpstream':
          return okRemoteResult('origin/feature/test')
        default:
          return okRemoteResult('')
      }
    }

    await expect(getRemoteBrowserUrl(TARGET, undefined, { run: run as any })).resolves.toBe('https://github.com/acme/project')
    await expect(getRemoteBrowserUrl(TARGET, 'feature/test', { run: run as any })).resolves.toBe(
      'https://github.com/acme/project/pull/new/feature/test',
    )
  })

  test('includes remote metadata in remote snapshots', async () => {
    const run = async (command: { type: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult([
            '__GOBLIN_REMOTE_CURRENT__',
            'main',
            '__GOBLIN_REMOTE_DEFAULT__',
            'main',
            '__GOBLIN_REMOTE_BRANCHES__',
            'main\x1ff00ba4\x1fInitial commit\x1f2024-01-01T00:00:00Z\x1fAlice\x1forigin/main\x1f',
          ].join('\n'))
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitStatus':
          return okRemoteResult('')
        case 'gitRemoteVerbose':
          return okRemoteResult(
            'origin\tgit@gitlab.com:acme/project.git (fetch)\norigin\tgit@gitlab.com:acme/project.git (push)',
          )
        default:
          return okRemoteResult('')
      }
    }

    const snapshot = await getRemoteSnapshot(TARGET, { run: run as any })

    expect(snapshot?.remote).toMatchObject({
      hasRemotes: true,
      hasBrowserRemote: true,
      browserRemoteProvider: 'gitlab',
      hasGitHubRemote: false,
    })
  })

  test('reads structured remote history', async () => {
    const run = vi.fn(async () =>
      okRemoteResult('abc123456789\x1fabc1234\x1ffeat: remote history\x1fAlice\x1f2026-06-15T09:00:00+08:00\x1fdef456'),
    )

    await expect(getRemoteHistory(TARGET, 'feature/history', { limit: 100, skip: 20 }, { run: run as any })).resolves.toEqual([
      {
        hash: 'abc123456789',
        shortHash: 'abc1234',
        subject: 'feat: remote history',
        author: 'Alice',
        date: '2026-06-15T09:00:00+08:00',
        parents: ['def456'],
      },
    ])
    expect(run).toHaveBeenCalledWith(
      { type: 'gitHistory', path: '/srv/repo', branch: 'feature/history', limit: 100, skip: 20 },
      TARGET,
      { signal: undefined },
    )
  })

  test('reads structured remote commit detail', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(okRemoteResult('abc123456789\x1fabc1234\x1ffeat: detail\x1fAlice\x1f2026-06-15T09:00:00+08:00\x1fdef456'))
      .mockResolvedValueOnce(okRemoteResult('M\0src/app.ts\0'))
      .mockResolvedValueOnce(okRemoteResult('4\t2\tsrc/app.ts\0'))

    await expect(getRemoteCommitDetail(TARGET, 'abc1234', { run: run as any })).resolves.toEqual({
      hash: 'abc123456789',
      shortHash: 'abc1234',
      subject: 'feat: detail',
      author: 'Alice',
      date: '2026-06-15T09:00:00+08:00',
      parents: ['def456'],
      files: [{ path: 'src/app.ts', status: 'modified', additions: 4, deletions: 2 }],
    })
  })

  test('prefers stderr when converting remote exec failures', () => {
    expect(
      remoteExecResult({ ok: false, stdout: '', stderr: 'permission denied', message: 'unknown' } as RemoteCommandResult),
    ).toEqual({ ok: false, message: 'unknown' })
  })

  test('maps remote directory JSON to file tree entries', async () => {
    const run = vi.fn(async () =>
      okRemoteResult(
        JSON.stringify({
          ok: true,
          entries: [
            { name: 'src', kind: 'directory' },
            { name: 'README.md', kind: 'file' },
            { name: 'link', kind: 'symlink', targetKind: 'directory' },
          ],
        }),
      ),
    )

    const result = await listRemoteFileTreeDirectory(TARGET, '/srv/repo', '/srv/repo', { run: run as any })

    expect(result).toEqual({
      ok: true,
      worktreePath: '/srv/repo',
      dirPath: '/srv/repo',
      entries: [
        { name: 'src', absolutePath: '/srv/repo/src', relativePath: 'src', kind: 'directory' },
        { name: 'link', absolutePath: '/srv/repo/link', relativePath: 'link', kind: 'symlink', targetKind: 'directory' },
        { name: 'README.md', absolutePath: '/srv/repo/README.md', relativePath: 'README.md', kind: 'file' },
      ],
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'listDirectoryEntries', worktreePath: '/srv/repo', dirPath: '/srv/repo' },
      TARGET,
      { signal: undefined },
    )
  })

  test('parses remote file search JSON and passes fixed command input', async () => {
    const run = vi.fn(async () =>
      okRemoteResult(
        JSON.stringify({
          ok: true,
          matches: [
            { relativePath: 'src/Button.tsx', kind: 'file' },
            { relativePath: 'src/components', kind: 'directory' },
          ],
          truncated: true,
          limit: 2,
        }),
      ),
    )

    const result = await searchRemoteFileTree(TARGET, '/srv/repo', 'button', { limit: 2, run: run as any })

    expect(result).toEqual({
      ok: true,
      matches: [
        { relativePath: 'src/Button.tsx', kind: 'file' },
        { relativePath: 'src/components', kind: 'directory' },
      ],
      truncated: true,
      limit: 2,
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'searchFileTree', worktreePath: '/srv/repo', query: 'button', limit: 2 },
      TARGET,
      { signal: undefined, timeoutMs: 90_000, maxBuffer: 10 * 1024 * 1024 },
    )
  })

  test('inventories remote transfer paths', async () => {
    const run = vi.fn(async () =>
      okRemoteResult(JSON.stringify({
        ok: true,
        totalBytes: 5,
        entries: [{ path: '/srv/repo/a.txt', relativePath: 'a.txt', kind: 'file', size: 5 }],
      })),
    )

    const result = await inventoryRemoteFileTransfer(TARGET, '/srv/repo', ['/srv/repo/a.txt'], { run: run as any })

    expect(result).toEqual({
      ok: true,
      totalBytes: 5,
      entries: [{ path: '/srv/repo/a.txt', relativePath: 'a.txt', kind: 'file', size: 5 }],
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'fileTransferInventory', rootPath: '/srv/repo', paths: ['/srv/repo/a.txt'] },
      TARGET,
      { signal: undefined, timeoutMs: 90_000 },
    )
  })

  test('reads and writes remote base64 files', async () => {
    const run = vi.fn(async () => okRemoteResult(Buffer.from('hello').toString('base64')))

    await expect(readRemoteFileBase64(TARGET, '/srv/repo/a.txt', { run: run as any })).resolves.toEqual({
      ok: true,
      bytesBase64: Buffer.from('hello').toString('base64'),
    })
    await expect(
      writeRemoteFileBase64(TARGET, '/srv/repo/b.txt', Buffer.from('hello').toString('base64'), { run: run as any }),
    ).resolves.toEqual({
      ok: true,
      message: Buffer.from('hello').toString('base64'),
    })
  })

  test('renameRemoteFileTreeEntry returns parsed success and passes fixed command input', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"ok":true,"message":""}', stderr: '' }))

    const result = await renameRemoteFileTreeEntry(
      TARGET,
      '/srv/repo',
      '/srv/repo/README.md',
      'README-renamed.md',
      { run: run as any },
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'renameFileTreeEntry',
        worktreePath: '/srv/repo',
        oldPath: '/srv/repo/README.md',
        newName: 'README-renamed.md',
      },
      TARGET,
      { signal: undefined },
    )
  })

  test('deleteRemoteFileTreeEntries returns parsed validation failure', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: '{"ok":false,"message":"error.delete-root-forbidden"}',
      stderr: '',
    }))

    const result = await deleteRemoteFileTreeEntries(TARGET, '/srv/repo', ['/srv/repo'], { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.delete-root-forbidden' })
  })

  test('moveRemoteFileTreeEntries returns parsed success and passes fixed command input', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"ok":true,"message":""}', stderr: '' }))

    const result = await moveRemoteFileTreeEntries(
      TARGET,
      '/srv/repo',
      ['/srv/repo/README.md'],
      '/srv/repo/docs',
      { run: run as any },
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'moveFileTreeEntries',
        worktreePath: '/srv/repo',
        paths: ['/srv/repo/README.md'],
        targetDirPath: '/srv/repo/docs',
      },
      TARGET,
      { signal: undefined },
    )
  })

  test('createRemoteFileTreeDirectory returns parsed success and passes fixed command input', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"ok":true,"message":""}', stderr: '' }))

    const result = await createRemoteFileTreeDirectory(
      TARGET,
      '/srv/repo',
      '/srv/repo/src',
      'components',
      { run: run as any },
    )

    expect(result).toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'createFileTreeDirectory',
        worktreePath: '/srv/repo',
        parentDirPath: '/srv/repo/src',
        name: 'components',
      },
      TARGET,
      { signal: undefined },
    )
  })

  test('createRemoteFileTreeFile returns parsed success and passes fixed command input', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"ok":true,"message":""}', stderr: '' }))

    const result = await createRemoteFileTreeFile(TARGET, '/srv/repo', '/srv/repo/src', 'index.ts', {
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'createFileTreeFile',
        worktreePath: '/srv/repo',
        parentDirPath: '/srv/repo/src',
        name: 'index.ts',
      },
      TARGET,
      { signal: undefined },
    )
  })

  test('readRemoteFileTreeTextFile parses remote JSON text content', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({ ok: true, content: 'hello\n', byteLength: 6 }),
      stderr: '',
    }))

    await expect(readRemoteFileTreeTextFile(TARGET, '/srv/repo', '/srv/repo/README.md', { run: run as any })).resolves.toEqual({
      ok: true,
      content: 'hello\n',
      byteLength: 6,
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'readFileTreeTextFile', worktreePath: '/srv/repo', filePath: '/srv/repo/README.md' },
      TARGET,
      { signal: undefined, timeoutMs: 90_000, maxBuffer: expect.any(Number) },
    )
  })

  test('replaceRemoteFileTreeTextFile sends replacement content through stdin and returns previous content', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({ ok: true, previousContent: 'old\n', previousByteLength: 4 }),
      stderr: '',
    }))

    await expect(
      replaceRemoteFileTreeTextFile(TARGET, '/srv/repo', '/srv/repo/README.md', 'new\n', { run: run as any }),
    ).resolves.toEqual({
      ok: true,
      previousContent: 'old\n',
      previousByteLength: 4,
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'replaceFileTreeTextFile', worktreePath: '/srv/repo', filePath: '/srv/repo/README.md' },
      TARGET,
      {
        signal: undefined,
        timeoutMs: 90_000,
        stdin: Buffer.from('new\n', 'utf8').toString('base64'),
        maxBuffer: expect.any(Number),
      },
    )
  })

  test('readRemoteFileTreeBinaryFile parses remote JSON binary content', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({
        ok: true,
        name: 'image.bin',
        byteLength: 3,
        bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
      }),
      stderr: '',
    }))

    await expect(
      readRemoteFileTreeBinaryFile(TARGET, '/srv/repo', '/srv/repo/image.bin', 30, { run: run as any }),
    ).resolves.toEqual({
      ok: true,
      name: 'image.bin',
      byteLength: 3,
      bytesBase64: Buffer.from([1, 2, 3]).toString('base64'),
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'readFileTreeBinaryFile', worktreePath: '/srv/repo', filePath: '/srv/repo/image.bin', maxBytes: 30 },
      TARGET,
      { signal: undefined, timeoutMs: 90_000, maxBuffer: expect.any(Number) },
    )
  })

  test('replaceRemoteFileTreeBinaryFile sends base64 bytes and returns previous bytes', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({
        ok: true,
        previousBytesBase64: Buffer.from([9, 8]).toString('base64'),
        previousByteLength: 2,
      }),
      stderr: '',
    }))
    const nextBytesBase64 = Buffer.from([1, 2]).toString('base64')

    await expect(
      replaceRemoteFileTreeBinaryFile(TARGET, '/srv/repo', '/srv/repo/image.bin', nextBytesBase64, 30, {
        run: run as any,
      }),
    ).resolves.toEqual({
      ok: true,
      previousBytesBase64: Buffer.from([9, 8]).toString('base64'),
      previousByteLength: 2,
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'replaceFileTreeBinaryFile', worktreePath: '/srv/repo', filePath: '/srv/repo/image.bin', maxBytes: 30 },
      TARGET,
      { signal: undefined, timeoutMs: 90_000, stdin: nextBytesBase64, maxBuffer: expect.any(Number) },
    )
  })

  test('deleteRemoteBranch allows safe delete when branch is merged into current HEAD without upstream', async () => {
    const run = vi.fn(async (command: { type: string; ancestor?: string; descendant?: string; branch?: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult([
            '__GOBLIN_REMOTE_CURRENT__',
            'release/1.0',
            '__GOBLIN_REMOTE_DEFAULT__',
            'main',
            '__GOBLIN_REMOTE_BRANCHES__',
            'release/1.0\x1ff00ba4\x1fRelease\x1f2024-01-01T00:00:00Z\x1fAlice\x1forigin/release/1.0\x1f',
            'feature/test\x1fba5eba1\x1fFeature\x1f2024-01-02T00:00:00Z\x1fAlice\x1f\x1f',
          ].join('\n'))
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/release/1.0\n')
        case 'gitStatus':
          return okRemoteResult('')
        case 'gitRemoteVerbose':
          return okRemoteResult('')
        case 'gitIsAncestor':
          return command.descendant === 'release/1.0' ? okRemoteResult('') : failRemoteResult('not merged')
        case 'gitUpstream':
          return failRemoteResult('no upstream')
        case 'gitBranchDelete':
          return okRemoteResult('Deleted branch feature/test')
        default:
          return okRemoteResult('')
      }
    })

    const result = await deleteRemoteBranch(TARGET, { branch: 'feature/test', run: run as any })

    expect(result).toEqual({ ok: true, message: 'Deleted branch feature/test' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitIsAncestor', path: '/srv/repo', ancestor: 'feature/test', descendant: 'release/1.0' },
      TARGET,
      { signal: undefined },
    )
  })

  test('removeRemoteWorktree allows deleting branch when merged into current HEAD without upstream', async () => {
    const run = vi.fn(async (command: { type: string; descendant?: string; worktreePath?: string; branch?: string; force?: boolean }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult([
            'worktree /srv/repo',
            'HEAD f00ba4',
            'branch refs/heads/release/1.0',
            '',
            'worktree /srv/repo-feature',
            'HEAD ba5eba1',
            'branch refs/heads/feature/test',
          ].join('\n'))
        case 'gitStatus':
          return okRemoteResult('')
        case 'gitSnapshot':
          return okRemoteResult([
            '__GOBLIN_REMOTE_CURRENT__',
            'release/1.0',
            '__GOBLIN_REMOTE_DEFAULT__',
            'main',
            '__GOBLIN_REMOTE_BRANCHES__',
            '',
          ].join('\n'))
        case 'gitIsAncestor':
          return command.descendant === 'release/1.0' ? okRemoteResult('') : failRemoteResult('not merged')
        case 'gitUpstream':
          return failRemoteResult('no upstream')
        case 'gitWorktreeRemove':
          return okRemoteResult('Removed worktree')
        case 'gitBranchDelete':
          return okRemoteResult('Deleted branch feature/test')
        default:
          return okRemoteResult('')
      }
    })

    const result = await removeRemoteWorktree(TARGET, {
      branch: 'feature/test',
      worktreePath: '/srv/repo-feature',
      alsoDeleteBranch: true,
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'Deleted branch feature/test' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitWorktreeRemove', path: '/srv/repo', worktreePath: '/srv/repo-feature' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
    expect(run).toHaveBeenCalledWith(
      { type: 'gitBranchDelete', path: '/srv/repo', branch: 'feature/test', force: false },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('checkoutRemoteBranch rejects invalid branch names before running remote commands', async () => {
    const run = vi.fn()

    const result = await checkoutRemoteBranch(TARGET, '-bad', undefined, { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(run).not.toHaveBeenCalled()
  })

  test('createRemoteWorktree rejects relative paths before running remote commands', async () => {
    const run = vi.fn()

    const result = await createRemoteWorktree(TARGET, {
      worktreePath: 'relative/path',
      mode: { kind: 'newBranch', newBranch: 'feature/test', baseRef: 'main' },
      run: run as any,
    })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(run).not.toHaveBeenCalled()
  })

  test('createRemoteBranch runs branch creation in the remote repo', async () => {
    const run = vi.fn(async () => okRemoteResult('created'))

    const result = await createRemoteBranch(TARGET, {
      branch: 'feature/new',
      baseBranch: 'main',
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'created' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitBranchCreate', path: '/srv/repo', branch: 'feature/new', baseBranch: 'main' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('createRemoteTrackingBranch runs tracking branch creation in the remote repo', async () => {
    const run = vi.fn(async () => okRemoteResult('tracked'))

    const result = await createRemoteTrackingBranch(TARGET, {
      localBranch: 'feature/new',
      remoteRef: 'origin/feature/new',
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'tracked' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitBranchTrackRemote', path: '/srv/repo', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('remote branch creation rejects invalid branch refs before running remote commands', async () => {
    const run = vi.fn()

    await expect(createRemoteBranch(TARGET, { branch: '-bad', baseBranch: 'main', run: run as any })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(
      createRemoteTrackingBranch(TARGET, { localBranch: 'feature/new', remoteRef: 'origin/HEAD', run: run as any }),
    ).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(run).not.toHaveBeenCalled()
  })

  test('commitRemoteChanges stages and commits inside a known remote worktree', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitCommitAll':
          return okRemoteResult('[main abc1234] feat: add remote commit')
        default:
          return okRemoteResult('')
      }
    })

    const result = await commitRemoteChanges(TARGET, '/srv/repo', 'feat: add remote commit', { run: run as any })

    expect(result).toEqual({ ok: true, message: '[main abc1234] feat: add remote commit' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitCommitAll', path: '/srv/repo', message: 'feat: add remote commit' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('commitRemoteChanges rejects relative worktree paths before running remote commands', async () => {
    const run = vi.fn()

    const result = await commitRemoteChanges(TARGET, 'relative/repo', 'feat: add remote commit', { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(run).not.toHaveBeenCalled()
  })

  test('mergeRemoteBranch merges inside a known remote worktree', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitMerge':
          return okRemoteResult('Merge made by the ort strategy.')
        default:
          return okRemoteResult('')
      }
    })

    const result = await mergeRemoteBranch(TARGET, '/srv/repo', 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: true, message: 'Merge made by the ort strategy.' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitMerge', path: '/srv/repo', branch: 'feature/test' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('mergeRemoteBranch rejects relative worktree paths before running remote commands', async () => {
    const run = vi.fn()

    const result = await mergeRemoteBranch(TARGET, 'relative/repo', 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(run).not.toHaveBeenCalled()
  })

  test('mergeRemoteBranch marks failed merge as merge-conflict when remote status has unmerged entries', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitMerge':
          return { ok: false, stdout: '', stderr: 'CONFLICT (content)', message: 'CONFLICT (content)' }
        case 'gitStatus':
          return okRemoteResult('UU src/app.ts\0')
        default:
          return okRemoteResult('')
      }
    })

    const result = await mergeRemoteBranch(TARGET, '/srv/repo', 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: false, message: 'CONFLICT (content)', reason: 'merge-conflict' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitStatus', path: '/srv/repo' },
      TARGET,
      { signal: undefined },
    )
  })

  test('mergeRemoteBranch keeps non-conflict merge failures unclassified', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitMerge':
          return { ok: false, stdout: '', stderr: 'fatal: bad revision', message: 'fatal: bad revision' }
        case 'gitStatus':
          return okRemoteResult(' M src/app.ts\0')
        default:
          return okRemoteResult('')
      }
    })

    const result = await mergeRemoteBranch(TARGET, '/srv/repo', 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: false, message: 'fatal: bad revision' })
  })

  test('resetRemoteHard resets inside a known remote worktree', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitResetHard':
          return okRemoteResult('HEAD is now at f00ba4 main')
        default:
          return okRemoteResult('')
      }
    })

    const result = await resetRemoteHard(TARGET, '/srv/repo', { run: run as any })

    expect(result).toEqual({ ok: true, message: 'HEAD is now at f00ba4 main' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitResetHard', path: '/srv/repo' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('resetRemoteHard rejects relative worktree paths before running remote commands', async () => {
    const run = vi.fn()

    const result = await resetRemoteHard(TARGET, 'relative/repo', { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(run).not.toHaveBeenCalled()
  })

  test('discardRemoteChangesForPaths discards paths inside a known remote worktree', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        case 'gitDiscardChanges':
          return okRemoteResult('')
        default:
          return okRemoteResult('')
      }
    })

    const result = await discardRemoteChangesForPaths(TARGET, '/srv/repo', ['src/app.ts', 'docs'], { run: run as any })

    expect(result).toEqual({ ok: true, message: 'ok' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitDiscardChanges', path: '/srv/repo', paths: ['src/app.ts', 'docs'] },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('discardRemoteChangesForPaths rejects relative worktree paths before running remote commands', async () => {
    const run = vi.fn()

    const result = await discardRemoteChangesForPaths(TARGET, 'relative/repo', ['src/app.ts'], { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(run).not.toHaveBeenCalled()
  })

  test('pullRemoteBranch reports missing upstream remote explicitly', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult([
            '__GOBLIN_REMOTE_CURRENT__',
            'main',
            '__GOBLIN_REMOTE_DEFAULT__',
            'main',
            '__GOBLIN_REMOTE_BRANCHES__',
            '',
          ].join('\n'))
        case 'gitUpstream':
          return okRemoteResult('fork/feature/test')
        case 'gitRemoteVerbose':
          return okRemoteResult('origin\tgit@github.com:acme/project.git (fetch)\norigin\tgit@github.com:acme/project.git (push)')
        default:
          return okRemoteResult('')
      }
    })

    const result = await pullRemoteBranch(TARGET, 'feature/test', undefined, { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.pull-no-remote' })
  })

  test('pushRemoteBranch prefers the configured upstream remote and branch', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitRemoteVerbose':
          return okRemoteResult([
            'origin\tgit@github.com:acme/project.git (fetch)',
            'origin\tgit@github.com:acme/project.git (push)',
            'fork\tgit@github.com:alice/project.git (fetch)',
            'fork\tgit@github.com:alice/project.git (push)',
          ].join('\n'))
        case 'gitUpstream':
          return okRemoteResult('fork/topic/feature-test')
        case 'gitPush':
          return okRemoteResult('pushed')
        default:
          return okRemoteResult('')
      }
    })

    const result = await pushRemoteBranch(TARGET, 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: true, message: 'pushed' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'gitPush',
        path: '/srv/repo',
        remote: 'fork',
        branch: 'feature/test',
        targetBranch: 'topic/feature-test',
        setUpstream: false,
      },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('pushRemoteBranch falls back to origin and sets upstream when no upstream is configured', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitRemoteVerbose':
          return okRemoteResult('origin\tgit@github.com:acme/project.git (fetch)\norigin\tgit@github.com:acme/project.git (push)')
        case 'gitUpstream':
          return failRemoteResult('no upstream')
        case 'gitPush':
          return okRemoteResult('pushed')
        default:
          return okRemoteResult('')
      }
    })

    const result = await pushRemoteBranch(TARGET, 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: true, message: 'pushed' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'gitPush',
        path: '/srv/repo',
        remote: 'origin',
        branch: 'feature/test',
        targetBranch: 'feature/test',
        setUpstream: true,
      },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('fetchRemoteRepository prefers the current branch upstream remote over fetch --all', async () => {
    const run = vi.fn(async (command: { type: string; remote?: string; branch?: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult([
            '__GOBLIN_REMOTE_CURRENT__',
            'feature/test',
            '__GOBLIN_REMOTE_DEFAULT__',
            'main',
            '__GOBLIN_REMOTE_BRANCHES__',
            '',
          ].join('\n'))
        case 'gitRemoteVerbose':
          return okRemoteResult([
            'origin\tgit@github.com:acme/project.git (fetch)',
            'origin\tgit@github.com:acme/project.git (push)',
            'fork\tgit@github.com:alice/project.git (fetch)',
            'fork\tgit@github.com:alice/project.git (push)',
          ].join('\n'))
        case 'gitUpstream':
          return okRemoteResult('fork/feature/test')
        case 'gitFetchRemote':
          return okRemoteResult(`fetched ${command.remote}`)
        default:
          return okRemoteResult('')
      }
    })

    const result = await fetchRemoteRepository(TARGET, { run: run as any })

    expect(result).toEqual({ ok: true, message: 'fetched fork' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitFetchRemote', path: '/srv/repo', remote: 'fork' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
    expect(run).not.toHaveBeenCalledWith(
      { type: 'gitFetchAll', path: '/srv/repo' },
      TARGET,
      expect.anything(),
    )
  })
})

function okRemoteResult(stdout: string): RemoteCommandResult {
  return { ok: true, stdout, stderr: '' }
}

function failRemoteResult(message: string): RemoteCommandResult {
  return { ok: false, stdout: '', stderr: message, message }
}

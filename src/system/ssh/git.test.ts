import { describe, expect, test, vi } from 'vitest'
import * as remoteGitOperations from '#/system/ssh/git.ts'
import {
  bootstrapRemoteWorktreeSelectionsAfterCreate,
  checkoutRemoteBranch,
  commitRemoteChanges,
  createRemoteBranch,
  createRemoteFileTreeDirectory,
  createRemoteFileTreeFile,
  createRemoteFileTreeTextFile,
  createRemoteTrackingBranch,
  createRemoteWorktree,
  deleteRemoteBranch,
  deleteRemoteFileTreeEntries,
  deleteRemoteServerBranch,
  deleteRemoteServerTag,
  discardRemoteChangesForPaths,
  getRemoteBrowserUrl,
  getRemoteCommitDetail,
  getRemoteHistory,
  getRemoteSnapshot,
  getRemoteTrackingBranchInfo,
  getRemoteTags,
  inventoryRemoteFileTransfer,
  listRemoteFileTreeDirectory,
  mergeRemoteBranch,
  moveRemoteFileTreeEntries,
  pullRemoteBranch,
  fetchRemoteRepository,
  fetchRemoteRepositoryByName,
  pushRemoteBranch,
  pushRemoteWorktreeHeadToRemoteBranch,
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

const WSL_TARGET = normalizeRemoteTarget({
  transport: 'wsl',
  alias: 'Ubuntu-24.04',
  host: 'Ubuntu-24.04',
  user: 'wsl',
  port: 22,
  remotePath: '/srv/repo',
  wslExecutable: 'C:\\Windows\\System32\\wsl.exe',
})!

async function pruneRemoteWorktrees(input: { worktreePath: string; signal?: AbortSignal; run?: unknown }) {
  const prune = (remoteGitOperations as Record<string, unknown>).pruneRemoteWorktrees
  expect(prune).toBeTypeOf('function')
  return await (
    prune as (
      target: typeof TARGET,
      options: { worktreePath: string; signal?: AbortSignal; run?: unknown },
    ) => Promise<unknown>
  )(TARGET, input)
}

async function setRemoteBranchUpstream(input: {
  branch: string
  remoteRef: string | null
  signal?: AbortSignal
  run?: unknown
}) {
  const setUpstream = (remoteGitOperations as Record<string, unknown>).setRemoteBranchUpstream
  expect(setUpstream).toBeTypeOf('function')
  return await (
    setUpstream as (
      target: typeof TARGET,
      input: { branch: string; remoteRef: string | null; signal?: AbortSignal; run?: unknown },
    ) => Promise<unknown>
  )(TARGET, input)
}

async function checkoutRemoteTrackingBranch(input: {
  worktreePath: string
  localBranch: string
  remoteRef: string
  signal?: AbortSignal
  run?: unknown
}) {
  const checkout = (remoteGitOperations as Record<string, unknown>).checkoutRemoteTrackingBranch
  expect(checkout).toBeTypeOf('function')
  return await (
    checkout as (
      target: typeof TARGET,
      input: {
        worktreePath: string
        localBranch: string
        remoteRef: string
        signal?: AbortSignal
        run?: unknown
      },
    ) => Promise<unknown>
  )(TARGET, input)
}

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

    await expect(getRemoteBrowserUrl(TARGET, undefined, { run: run as any })).resolves.toBe(
      'https://github.com/acme/project',
    )
    await expect(getRemoteBrowserUrl(TARGET, 'feature/test', { run: run as any })).resolves.toBe(
      'https://github.com/acme/project/pull/new/feature/test',
    )
  })

  test('includes remote metadata in remote snapshots', async () => {
    const run = async (command: { type: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult(
            [
              '__GOBLIN_REMOTE_CURRENT__',
              'main',
              '__GOBLIN_REMOTE_DEFAULT__',
              'main',
              '__GOBLIN_REMOTE_BRANCHES__',
              'main\x1ff00ba4\x1fInitial commit\x1f2024-01-01T00:00:00Z\x1fAlice\x1forigin/main\x1f',
            ].join('\n'),
          )
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

  test('skips worktree status and remote metadata for a lightweight snapshot', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult(
            [
              '__GOBLIN_REMOTE_CURRENT__',
              'main',
              '__GOBLIN_REMOTE_DEFAULT__',
              'main',
              '__GOBLIN_REMOTE_BRANCHES__',
              'main\x1ff00ba4\x1fInitial commit\x1f2024-01-01T00:00:00Z\x1fAlice\x1forigin/main\x1f',
            ].join('\n'),
          )
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD f00ba4\nbranch refs/heads/main\n')
        default:
          return okRemoteResult('')
      }
    })

    const snapshot = await getRemoteSnapshot(TARGET, {
      run: run as any,
      includeWorktreeStatus: false,
      includeRemote: false,
    })

    expect(snapshot?.branches.map((branch) => branch.name)).toEqual(['main'])
    expect(run.mock.calls.map(([command]) => command.type).sort()).toEqual(['gitSnapshot', 'gitWorktreeList'])
  })

  test('projects recorded creation sources from remote snapshots', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult(
            [
              '__GOBLIN_REMOTE_CURRENT__',
              'feature/a',
              '__GOBLIN_REMOTE_DEFAULT__',
              'main',
              '__GOBLIN_REMOTE_BRANCHES__',
              'main\x1ff00ba4\x1fInitial commit\x1f2024-01-01T00:00:00Z\x1fAlice\x1forigin/main\x1f',
              'feature/a\x1fabc1234\x1fFeature\x1f2024-01-02T00:00:00Z\x1fAlice\x1f\x1f',
              '__HOBGOBLIN_REMOTE_BRANCH_CREATED_FROM__',
              'branch.feature/a.hobgoblin-created-from main',
              'branch.-bad.hobgoblin-created-from main',
            ].join('\n'),
          )
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo\nHEAD abc1234\nbranch refs/heads/feature/a\n')
        default:
          return okRemoteResult('')
      }
    })

    const snapshot = await getRemoteSnapshot(TARGET, {
      run: run as any,
      includeWorktreeStatus: false,
      includeRemote: false,
    })

    expect(snapshot?.branches).toMatchObject([{ name: 'main' }, { name: 'feature/a', createdFrom: 'main' }])
  })

  test('reads structured remote history', async () => {
    const run = vi.fn(async () =>
      okRemoteResult('abc123456789\x1fabc1234\x1ffeat: remote history\x1fAlice\x1f2026-06-15T09:00:00+08:00\x1fdef456'),
    )

    await expect(
      getRemoteHistory(TARGET, 'feature/history', { limit: 100, skip: 20 }, { run: run as any }),
    ).resolves.toEqual([
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
      .mockResolvedValueOnce(
        okRemoteResult('abc123456789\x1fabc1234\x1ffeat: detail\x1fAlice\x1f2026-06-15T09:00:00+08:00\x1fdef456'),
      )
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
      remoteExecResult({
        ok: false,
        stdout: '',
        stderr: 'permission denied',
        message: 'unknown',
      } as RemoteCommandResult),
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
        {
          name: 'link',
          absolutePath: '/srv/repo/link',
          relativePath: 'link',
          kind: 'symlink',
          targetKind: 'directory',
        },
        { name: 'src', absolutePath: '/srv/repo/src', relativePath: 'src', kind: 'directory' },
        { name: 'README.md', absolutePath: '/srv/repo/README.md', relativePath: 'README.md', kind: 'file' },
      ],
    })
    expect(run).toHaveBeenCalledWith(
      { type: 'listDirectoryEntries', worktreePath: '/srv/repo', dirPath: '/srv/repo' },
      TARGET,
      { signal: undefined },
    )
  })

  test('sorts remote file tree symlinks by their target kind', async () => {
    const run = vi.fn(async () =>
      okRemoteResult(
        JSON.stringify({
          ok: true,
          entries: [
            { name: 'z-dir', kind: 'directory' },
            { name: 'b-file.txt', kind: 'file' },
            { name: 'a-link-dir', kind: 'symlink', targetKind: 'directory' },
            { name: 'a-link-file', kind: 'symlink', targetKind: 'file' },
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
        {
          name: 'a-link-dir',
          absolutePath: '/srv/repo/a-link-dir',
          relativePath: 'a-link-dir',
          kind: 'symlink',
          targetKind: 'directory',
        },
        { name: 'z-dir', absolutePath: '/srv/repo/z-dir', relativePath: 'z-dir', kind: 'directory' },
        {
          name: 'a-link-file',
          absolutePath: '/srv/repo/a-link-file',
          relativePath: 'a-link-file',
          kind: 'symlink',
          targetKind: 'file',
        },
        { name: 'b-file.txt', absolutePath: '/srv/repo/b-file.txt', relativePath: 'b-file.txt', kind: 'file' },
      ],
    })
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
      okRemoteResult(
        JSON.stringify({
          ok: true,
          totalBytes: 5,
          entries: [{ path: '/srv/repo/a.txt', relativePath: 'a.txt', kind: 'file', size: 5 }],
        }),
      ),
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

    const result = await renameRemoteFileTreeEntry(TARGET, '/srv/repo', '/srv/repo/README.md', 'README-renamed.md', {
      run: run as any,
    })

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

    const result = await moveRemoteFileTreeEntries(TARGET, '/srv/repo', ['/srv/repo/README.md'], '/srv/repo/docs', {
      run: run as any,
    })

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

    const result = await createRemoteFileTreeDirectory(TARGET, '/srv/repo', '/srv/repo/src', 'components', {
      run: run as any,
    })

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

  test('createRemoteFileTreeTextFile sends content through stdin and passes fixed command input', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"ok":true,"message":""}', stderr: '' }))

    const result = await createRemoteFileTreeTextFile(TARGET, '/srv/repo', '/srv/repo', 'notes.md', '# Notes\n', {
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'createFileTreeTextFile',
        worktreePath: '/srv/repo',
        parentDirPath: '/srv/repo',
        name: 'notes.md',
      },
      TARGET,
      {
        signal: undefined,
        timeoutMs: 90_000,
        stdin: Buffer.from('# Notes\n', 'utf8').toString('base64'),
        maxBuffer: expect.any(Number),
      },
    )
  })

  test('readRemoteFileTreeTextFile parses remote JSON text content', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stdout: JSON.stringify({ ok: true, content: 'hello\n', byteLength: 6 }),
      stderr: '',
    }))

    await expect(
      readRemoteFileTreeTextFile(TARGET, '/srv/repo', '/srv/repo/README.md', { run: run as any }),
    ).resolves.toEqual({
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
          return okRemoteResult(
            [
              '__GOBLIN_REMOTE_CURRENT__',
              'release/1.0',
              '__GOBLIN_REMOTE_DEFAULT__',
              'main',
              '__GOBLIN_REMOTE_BRANCHES__',
              'release/1.0\x1ff00ba4\x1fRelease\x1f2024-01-01T00:00:00Z\x1fAlice\x1forigin/release/1.0\x1f',
              'feature/test\x1fba5eba1\x1fFeature\x1f2024-01-02T00:00:00Z\x1fAlice\x1f\x1f',
            ].join('\n'),
          )
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

  test('deleteRemoteServerBranch runs remote push delete for valid non-protected refs', async () => {
    const run = vi.fn(async () => okRemoteResult('deleted'))

    await expect(
      deleteRemoteServerBranch(TARGET, { remote: 'origin', branch: 'feature/remove-me', run: run as any }),
    ).resolves.toEqual({ ok: true, message: 'deleted' })

    expect(run).toHaveBeenCalledWith(
      { type: 'gitRemoteBranchDelete', path: '/srv/repo', remote: 'origin', branch: 'feature/remove-me' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('deleteRemoteServerBranch rejects invalid and protected refs before SSH execution', async () => {
    const run = vi.fn(async () => okRemoteResult('deleted'))

    await expect(
      deleteRemoteServerBranch(TARGET, { remote: 'origin', branch: 'main', run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      deleteRemoteServerBranch(TARGET, { remote: 'bad/remote', branch: 'feature/a', run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(run).not.toHaveBeenCalled()
  })

  test('getRemoteTags reads tags from each configured remote', async () => {
    const run = vi.fn(async (command: { type: string; remote?: string }) => {
      switch (command.type) {
        case 'gitRemoteVerbose':
          return okRemoteResult(
            [
              'origin\tgit@example.com:acme/repo.git (fetch)',
              'origin\tgit@example.com:acme/repo.git (push)',
              'upstream\tgit@example.com:acme/upstream.git (fetch)',
              'upstream\tgit@example.com:acme/upstream.git (push)',
            ].join('\n'),
          )
        case 'gitRemoteTags':
          return command.remote === 'origin'
            ? okRemoteResult('abc123\trefs/tags/v1.0.0\ndef456\trefs/tags/release/1.0\n')
            : okRemoteResult('abc123\trefs/tags/v1.0.0\nbad\trefs/heads/main\n')
        default:
          return okRemoteResult('')
      }
    })

    await expect(getRemoteTags(TARGET, { run: run as any })).resolves.toEqual([
      'origin/release/1.0',
      'origin/v1.0.0',
      'upstream/v1.0.0',
    ])
    expect(run).toHaveBeenCalledWith({ type: 'gitRemoteTags', path: '/srv/repo', remote: 'origin' }, TARGET, {
      signal: undefined,
    })
    expect(run).toHaveBeenCalledWith({ type: 'gitRemoteTags', path: '/srv/repo', remote: 'upstream' }, TARGET, {
      signal: undefined,
    })
  })

  test('deleteRemoteServerTag runs explicit remote tag delete for valid refs', async () => {
    const run = vi.fn(async () => okRemoteResult('deleted'))

    await expect(
      deleteRemoteServerTag(TARGET, { remote: 'origin', tag: 'release/v1.0.0', run: run as any }),
    ).resolves.toEqual({ ok: true, message: 'deleted' })

    expect(run).toHaveBeenCalledWith(
      { type: 'gitRemoteTagDelete', path: '/srv/repo', remote: 'origin', tag: 'release/v1.0.0' },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('deleteRemoteServerTag rejects invalid refs before SSH execution', async () => {
    const run = vi.fn(async () => okRemoteResult('deleted'))

    await expect(deleteRemoteServerTag(TARGET, { remote: 'origin', tag: '-bad', run: run as any })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(
      deleteRemoteServerTag(TARGET, { remote: 'bad/remote', tag: 'release/v1.0.0', run: run as any }),
    ).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })

    expect(run).not.toHaveBeenCalled()
  })

  test('removeRemoteWorktree allows deleting branch when merged into current HEAD without upstream', async () => {
    const run = vi.fn(
      async (command: {
        type: string
        descendant?: string
        worktreePath?: string
        branch?: string
        force?: boolean
      }) => {
        switch (command.type) {
          case 'gitWorktreeList':
            return okRemoteResult(
              [
                'worktree /srv/repo',
                'HEAD f00ba4',
                'branch refs/heads/release/1.0',
                '',
                'worktree /srv/repo-feature',
                'HEAD ba5eba1',
                'branch refs/heads/feature/test',
              ].join('\n'),
            )
          case 'gitStatus':
            return okRemoteResult('')
          case 'gitSnapshot':
            return okRemoteResult(
              [
                '__GOBLIN_REMOTE_CURRENT__',
                'release/1.0',
                '__GOBLIN_REMOTE_DEFAULT__',
                'main',
                '__GOBLIN_REMOTE_BRANCHES__',
                '',
              ].join('\n'),
            )
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
      },
    )

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

  test('removeRemoteWorktree can force-remove without reading status or forcing branch deletion', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult(
            [
              'worktree /srv/repo',
              'HEAD f00ba4',
              'branch refs/heads/main',
              '',
              'worktree /srv/repo-feature',
              'HEAD ba5eba1',
              'branch refs/heads/feature/test',
            ].join('\n'),
          )
        case 'gitStatus':
          return okRemoteResult(' M changed.ts\0')
        case 'gitWorktreeRemove':
          return okRemoteResult('Removed worktree')
        default:
          return okRemoteResult('')
      }
    })

    const result = await removeRemoteWorktree(TARGET, {
      branch: 'feature/test',
      worktreePath: '/srv/repo-feature',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      skipWorktreeStatus: true,
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'Removed worktree' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitWorktreeRemove', path: '/srv/repo', worktreePath: '/srv/repo-feature', force: true },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
    expect(run).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gitBranchDelete' }),
      TARGET,
      expect.anything(),
    )
    expect(run).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'gitStatus' }), TARGET, expect.anything())
  })

  test('removeRemoteWorktree removes a detached worktree by exact path when retaining branches', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      if (command.type === 'gitWorktreeList') {
        return okRemoteResult(
          [
            'worktree /srv/repo',
            'HEAD f00ba4',
            'branch refs/heads/main',
            '',
            'worktree /srv/repo-feature',
            'HEAD ba5eba1',
            'detached',
          ].join('\n'),
        )
      }
      if (command.type === 'gitWorktreeRemove') return okRemoteResult('Removed worktree')
      return okRemoteResult('')
    })

    const result = await removeRemoteWorktree(TARGET, {
      branch: 'feature/test',
      worktreePath: '/srv/repo-feature',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      skipWorktreeStatus: true,
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'Removed worktree' })
    expect(run).toHaveBeenCalledWith(
      { type: 'gitWorktreeRemove', path: '/srv/repo', worktreePath: '/srv/repo-feature', force: true },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('pruneRemoteWorktrees revalidates the selected prunable path before pruning', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      if (command.type === 'gitWorktreeList') {
        return okRemoteResult(
          [
            'worktree /srv/repo',
            'HEAD f00ba4',
            'branch refs/heads/main',
            '',
            'worktree /srv/repo-stale',
            'HEAD ba5eba1',
            'branch refs/heads/feature/stale',
            'prunable gitdir file points to non-existent location',
          ].join('\n'),
        )
      }
      if (command.type === 'gitWorktreePrune') return okRemoteResult('Pruned worktrees')
      return okRemoteResult('')
    })

    const result = await pruneRemoteWorktrees({ worktreePath: '/srv/repo-stale', run })

    expect(result).toEqual({ ok: true, message: 'Pruned worktrees' })
    expect(run).toHaveBeenCalledWith({ type: 'gitWorktreePrune', path: '/srv/repo' }, TARGET, {
      signal: undefined,
      timeoutMs: 180_000,
    })
  })

  test.each([
    {
      name: 'locked worktree',
      lockedLine: 'locked',
      statusResult: okRemoteResult(''),
      expectedMessage: 'error.cannot-remove-locked-worktree',
    },
    {
      name: 'unavailable status',
      lockedLine: null,
      statusResult: failRemoteResult('status failed'),
      expectedMessage: 'error.cannot-remove-dirty-worktree',
    },
  ])('removeRemoteWorktree keeps the $name safety boundary when force is enabled', async (testCase) => {
    const run = vi.fn(async (command: { type: string }) => {
      if (command.type === 'gitWorktreeList') {
        return okRemoteResult(
          [
            'worktree /srv/repo',
            'HEAD f00ba4',
            'branch refs/heads/main',
            '',
            'worktree /srv/repo-feature',
            'HEAD ba5eba1',
            'branch refs/heads/feature/test',
            testCase.lockedLine,
          ]
            .filter((line): line is string => line !== null)
            .join('\n'),
        )
      }
      if (command.type === 'gitStatus') return testCase.statusResult
      return okRemoteResult('')
    })

    const result = await removeRemoteWorktree(TARGET, {
      branch: 'feature/test',
      worktreePath: '/srv/repo-feature',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      run: run as any,
    })

    expect(result).toEqual({ ok: false, message: testCase.expectedMessage })
    expect(run).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gitWorktreeRemove' }),
      TARGET,
      expect.anything(),
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
      mode: {
        kind: 'newBranch',
        newBranch: 'feature/test',
        creationBase: { kind: 'localBranch', branch: 'main' },
      },
      syncBeforeCreate: false,
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

  test('checkoutRemoteTrackingBranch creates and switches in the selected remote worktree', async () => {
    const run = vi.fn(async () => okRemoteResult('switched'))

    const result = await checkoutRemoteTrackingBranch({
      worktreePath: '/srv/repo-feature',
      localBranch: 'feature/new',
      remoteRef: 'origin/feature/new',
      run,
    })

    expect(result).toEqual({ ok: true, message: 'switched' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'gitCheckoutTracking',
        path: '/srv/repo-feature',
        localBranch: 'feature/new',
        remoteRef: 'origin/feature/new',
      },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('checkoutRemoteTrackingBranch rejects invalid inputs before SSH execution', async () => {
    const run = vi.fn(async () => okRemoteResult('switched'))

    await expect(
      checkoutRemoteTrackingBranch({
        worktreePath: 'relative/path',
        localBranch: 'feature/new',
        remoteRef: 'origin/feature/new',
        run,
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-path' })
    await expect(
      checkoutRemoteTrackingBranch({
        worktreePath: '/srv/repo-feature',
        localBranch: 'feature/new',
        remoteRef: 'origin/HEAD',
        run,
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(run).not.toHaveBeenCalled()
  })

  test('setRemoteBranchUpstream sets and removes tracking for an existing branch', async () => {
    const run = vi.fn(async () => okRemoteResult('updated'))

    await expect(
      setRemoteBranchUpstream({ branch: 'feature/local', remoteRef: 'origin/release', run: run as any }),
    ).resolves.toEqual({ ok: true, message: 'updated' })
    await expect(
      setRemoteBranchUpstream({ branch: 'feature/local', remoteRef: null, run: run as any }),
    ).resolves.toEqual({ ok: true, message: 'updated' })

    expect(run).toHaveBeenNthCalledWith(
      1,
      {
        type: 'gitBranchSetUpstream',
        path: '/srv/repo',
        branch: 'feature/local',
        remoteRef: 'origin/release',
      },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
    expect(run).toHaveBeenNthCalledWith(
      2,
      { type: 'gitBranchSetUpstream', path: '/srv/repo', branch: 'feature/local', remoteRef: null },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('setRemoteBranchUpstream rejects invalid refs before running remote commands', async () => {
    const run = vi.fn()

    await expect(
      setRemoteBranchUpstream({ branch: '-bad', remoteRef: 'origin/release', run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      setRemoteBranchUpstream({ branch: 'feature/local', remoteRef: 'origin/HEAD', run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    expect(run).not.toHaveBeenCalled()
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
    expect(run).toHaveBeenCalledWith({ type: 'gitMerge', path: '/srv/repo', branch: 'feature/test' }, TARGET, {
      signal: undefined,
      timeoutMs: 180_000,
    })
  })

  test('mergeRemoteBranch rejects relative worktree paths before running remote commands', async () => {
    const run = vi.fn()

    const result = await mergeRemoteBranch(TARGET, 'relative/repo', 'feature/test', { run: run as any })

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(run).not.toHaveBeenCalled()
  })

  test('pushRemoteWorktreeHeadToRemoteBranch pushes a known worktree HEAD to the exact remote branch', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitWorktreeList':
          return okRemoteResult('worktree /srv/repo-worktree\nHEAD f00ba4\ndetached\n')
        case 'gitPushWorktreeHead':
          return okRemoteResult('pushed')
        default:
          return okRemoteResult('')
      }
    })

    const result = await pushRemoteWorktreeHeadToRemoteBranch(TARGET, '/srv/repo-worktree', 'origin', 'release/v2', {
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'pushed' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'gitPushWorktreeHead',
        path: '/srv/repo-worktree',
        remote: 'origin',
        targetBranch: 'release/v2',
      },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test.each([
    ['relative/repo', 'origin', 'release/v2', 'error.invalid-path'],
    ['/srv/repo', 'bad remote', 'release/v2', 'error.invalid-arguments'],
    ['/srv/repo', 'origin', 'HEAD', 'error.invalid-arguments'],
  ])(
    'pushRemoteWorktreeHeadToRemoteBranch rejects invalid path or target',
    async (worktreePath, remote, branch, message) => {
      const run = vi.fn()

      await expect(
        pushRemoteWorktreeHeadToRemoteBranch(TARGET, worktreePath, remote, branch, { run: run as any }),
      ).resolves.toEqual({ ok: false, message })
      expect(run).not.toHaveBeenCalled()
    },
  )

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
    expect(run).toHaveBeenCalledWith({ type: 'gitStatus', path: '/srv/repo' }, TARGET, { signal: undefined })
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
    expect(run).toHaveBeenCalledWith({ type: 'gitResetHard', path: '/srv/repo' }, TARGET, {
      signal: undefined,
      timeoutMs: 180_000,
    })
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
          return okRemoteResult(
            [
              '__GOBLIN_REMOTE_CURRENT__',
              'main',
              '__GOBLIN_REMOTE_DEFAULT__',
              'main',
              '__GOBLIN_REMOTE_BRANCHES__',
              '',
            ].join('\n'),
          )
        case 'gitUpstream':
          return okRemoteResult('fork/feature/test')
        case 'gitRemoteVerbose':
          return okRemoteResult(
            'origin\tgit@github.com:acme/project.git (fetch)\norigin\tgit@github.com:acme/project.git (push)',
          )
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
          return okRemoteResult(
            [
              'origin\tgit@github.com:acme/project.git (fetch)',
              'origin\tgit@github.com:acme/project.git (push)',
              'fork\tgit@github.com:alice/project.git (fetch)',
              'fork\tgit@github.com:alice/project.git (push)',
            ].join('\n'),
          )
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

  test('getRemoteTrackingBranchInfo returns filtered remote refs with object ids', async () => {
    const mainHead = 'a'.repeat(40)
    const releaseHead = 'b'.repeat(64)
    const run = vi.fn(async (command: { type: string }) => {
      expect(command).toEqual({ type: 'gitRemoteBranchInfo', path: '/srv/repo' })
      return okRemoteResult(
        [`upstream/release/v2\0${releaseHead}`, `origin/main\0${mainHead}`, `origin/HEAD\0${mainHead}`].join('\n'),
      )
    })

    await expect(getRemoteTrackingBranchInfo(TARGET, { run: run as any })).resolves.toEqual([
      { remoteRef: 'origin/main', head: mainHead },
      { remoteRef: 'upstream/release/v2', head: releaseHead },
    ])
    expect(run).toHaveBeenCalledWith({ type: 'gitRemoteBranchInfo', path: '/srv/repo' }, TARGET, {
      signal: undefined,
    })
  })

  test('pushRemoteBranch falls back to origin and sets upstream when no upstream is configured', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitRemoteVerbose':
          return okRemoteResult(
            'origin\tgit@github.com:acme/project.git (fetch)\norigin\tgit@github.com:acme/project.git (push)',
          )
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

  test('pushRemoteBranch creates an upstream on an explicit remote when fallback resolution is ambiguous', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      switch (command.type) {
        case 'gitRemoteVerbose':
          return okRemoteResult(
            [
              'fork\tgit@github.com:alice/project.git (fetch)',
              'fork\tgit@github.com:alice/project.git (push)',
              'backup\tgit@github.com:acme/project.git (fetch)',
              'backup\tgit@github.com:acme/project.git (push)',
            ].join('\n'),
          )
        case 'gitUpstream':
          return failRemoteResult('no upstream')
        case 'gitPush':
          return okRemoteResult('pushed')
        default:
          return okRemoteResult('')
      }
    })

    const result = await pushRemoteBranch(TARGET, 'feature/test', {
      createUpstreamRemote: 'fork',
      run: run as any,
    })

    expect(result).toEqual({ ok: true, message: 'pushed' })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'gitPush',
        path: '/srv/repo',
        remote: 'fork',
        branch: 'feature/test',
        targetBranch: 'feature/test',
        setUpstream: true,
      },
      TARGET,
      { signal: undefined, timeoutMs: 180_000 },
    )
  })

  test('materializes deep remote selections in best-effort literal mode', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      if (command.type === 'bootstrapRemoteWorktree') {
        return okRemoteResult('GOBLIN_BOOTSTRAP_COPY\0backend/.venv\0GOBLIN_BOOTSTRAP_SYMLINK\0frontend/node_modules\0')
      }
      return okRemoteResult('')
    })

    const result = await bootstrapRemoteWorktreeSelectionsAfterCreate(
      TARGET,
      '/srv/repo-worktree',
      [
        { path: 'backend/.venv', mode: 'copy' },
        { path: 'frontend/node_modules', mode: 'symlink' },
      ],
      { run: run as any },
    )

    expect(result).toMatchObject({
      ok: true,
      worktreeBootstrap: {
        copy: { count: 1, paths: ['backend/.venv'] },
        symlink: { count: 1, paths: ['frontend/node_modules'] },
      },
    })
    expect(run).toHaveBeenCalledWith(
      {
        type: 'bootstrapRemoteWorktree',
        sourceRoot: '/srv/repo',
        targetRoot: '/srv/repo-worktree',
        copy: ['backend/.venv'],
        symlink: ['frontend/node_modules'],
      },
      TARGET,
      { signal: undefined, timeoutMs: 600_000 },
    )
  })

  test('bootstrapRemoteWorktreeSelectionsAfterCreate ignores malformed and unselected success records', async () => {
    const run = vi.fn(async () =>
      okRemoteResult(
        [
          'GOBLIN_BOOTSTRAP_COPY',
          'backend/.venv',
          'GOBLIN_BOOTSTRAP_COPY',
          '../outside',
          'GOBLIN_BOOTSTRAP_SYMLINK',
          'not-selected',
          'UNKNOWN',
          'backend/.venv',
          'GOBLIN_BOOTSTRAP_COPY',
          'backend/.venv',
          '',
        ].join('\0'),
      ),
    )

    const result = await bootstrapRemoteWorktreeSelectionsAfterCreate(
      TARGET,
      '/srv/repo-worktree',
      [{ path: 'backend/.venv', mode: 'copy' }],
      { run: run as any },
    )

    expect(result).toMatchObject({
      ok: true,
      worktreeBootstrap: {
        copy: { count: 1, paths: ['backend/.venv'] },
        symlink: { count: 0, paths: [] },
      },
    })
  })

  test('bootstrapRemoteWorktreeSelectionsAfterCreate treats remote command failure as an empty success', async () => {
    const run = vi.fn(async (command: { type: string }) => {
      if (command.type === 'bootstrapRemoteWorktree') return failRemoteResult('bun: command not found')
      return okRemoteResult('')
    })

    const result = await bootstrapRemoteWorktreeSelectionsAfterCreate(
      TARGET,
      '/srv/repo-worktree',
      [{ path: '.env', mode: 'copy' }],
      { run: run as any },
    )

    expect(result).toEqual({ ok: true, message: '' })
  })

  test('fetchRemoteRepository prefers the current branch upstream remote over fetch --all', async () => {
    const run = vi.fn(async (command: { type: string; remote?: string; branch?: string }) => {
      switch (command.type) {
        case 'gitSnapshot':
          return okRemoteResult(
            [
              '__GOBLIN_REMOTE_CURRENT__',
              'feature/test',
              '__GOBLIN_REMOTE_DEFAULT__',
              'main',
              '__GOBLIN_REMOTE_BRANCHES__',
              '',
            ].join('\n'),
          )
        case 'gitRemoteVerbose':
          return okRemoteResult(
            [
              'origin\tgit@github.com:acme/project.git (fetch)',
              'origin\tgit@github.com:acme/project.git (push)',
              'fork\tgit@github.com:alice/project.git (fetch)',
              'fork\tgit@github.com:alice/project.git (push)',
            ].join('\n'),
          )
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
    expect(run).toHaveBeenCalledWith({ type: 'gitFetchRemote', path: '/srv/repo', remote: 'fork' }, TARGET, {
      signal: undefined,
      timeoutMs: 180_000,
    })
    expect(run).not.toHaveBeenCalledWith({ type: 'gitFetchAll', path: '/srv/repo' }, TARGET, expect.anything())
  })

  test('fetchRemoteRepositoryByName fetches the exact requested remote', async () => {
    const run = vi.fn(async (command: { type: string; remote?: string }) =>
      command.type === 'gitFetchRemote' ? okRemoteResult(`fetched ${command.remote}`) : okRemoteResult(''),
    )
    const signal = new AbortController().signal

    await expect(fetchRemoteRepositoryByName(TARGET, 'upstream', { signal, run: run as any })).resolves.toEqual({
      ok: true,
      message: 'fetched upstream',
    })
    expect(run).toHaveBeenCalledWith({ type: 'gitFetchRemote', path: '/srv/repo', remote: 'upstream' }, TARGET, {
      signal,
      timeoutMs: 180_000,
    })
  })

  test('fetchRemoteRepositoryByName applies configured proxy and timeout only to WSL Git', async () => {
    const wslRun = vi.fn(async () => okRemoteResult(''))
    const networkOptions = {
      timeoutMs: 240_000,
      proxyUrl: 'socks5://127.0.0.1:7890',
    }

    await expect(
      fetchRemoteRepositoryByName(WSL_TARGET, 'origin', { networkOptions, run: wslRun as any }),
    ).resolves.toEqual({ ok: true, message: 'ok' })

    expect(wslRun).toHaveBeenCalledWith({ type: 'gitFetchRemote', path: '/srv/repo', remote: 'origin' }, WSL_TARGET, {
      signal: undefined,
      timeoutMs: 240_000,
      wslEnvironment: {
        ALL_PROXY: 'socks5://127.0.0.1:7890',
        HTTPS_PROXY: 'socks5://127.0.0.1:7890',
        all_proxy: 'socks5://127.0.0.1:7890',
        https_proxy: 'socks5://127.0.0.1:7890',
      },
    })

    const sshRun = vi.fn(async () => okRemoteResult(''))
    await fetchRemoteRepositoryByName(TARGET, 'origin', { networkOptions, run: sshRun as any })
    expect(sshRun).toHaveBeenCalledWith({ type: 'gitFetchRemote', path: '/srv/repo', remote: 'origin' }, TARGET, {
      signal: undefined,
      timeoutMs: 180_000,
    })
  })

  test.each(['bad remote', '-upstream', 'upstream/main'])(
    'fetchRemoteRepositoryByName rejects invalid remote %s',
    async (remote) => {
      const run = vi.fn()

      await expect(fetchRemoteRepositoryByName(TARGET, remote, { run: run as any })).resolves.toEqual({
        ok: false,
        message: 'error.invalid-arguments',
      })
      expect(run).not.toHaveBeenCalled()
    },
  )

  test('fetchRemoteRepositoryByName preserves pre-aborted cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const run = vi.fn()

    await expect(
      fetchRemoteRepositoryByName(TARGET, 'upstream', { signal: controller.signal, run: run as any }),
    ).resolves.toEqual({ ok: false, message: 'cancelled' })
    expect(run).not.toHaveBeenCalled()
  })
})

function okRemoteResult(stdout: string): RemoteCommandResult {
  return { ok: true, stdout, stderr: '' }
}

function failRemoteResult(message: string): RemoteCommandResult {
  return { ok: false, stdout: '', stderr: message, message }
}

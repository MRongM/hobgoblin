import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveRemoteRepoTarget: vi.fn(),
  inventoryRemoteFileTransfer: vi.fn(),
  readRemoteFileBase64: vi.fn(),
}))

vi.mock('#/server/modules/repo-backend.ts', () => ({
  resolveRemoteRepoTarget: mocks.resolveRemoteRepoTarget,
}))

vi.mock('#/system/ssh/git.ts', () => ({
  inventoryRemoteFileTransfer: mocks.inventoryRemoteFileTransfer,
  readRemoteFileBase64: mocks.readRemoteFileBase64,
}))

const REMOTE_TARGET = {
  id: 'ssh-config://prod/srv/repo',
  alias: 'prod',
  host: 'example.test',
  user: 'deploy',
  port: 22,
  remotePath: '/srv/repo',
  displayName: 'prod:repo',
}

describe('repo file export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveRemoteRepoTarget.mockResolvedValue(REMOTE_TARGET)
    mocks.inventoryRemoteFileTransfer.mockResolvedValue({
      ok: true,
      entries: [{ path: '/srv/repo/a.txt', kind: 'file', size: 5 }],
      totalBytes: 5,
    })
    mocks.readRemoteFileBase64.mockResolvedValue({
      ok: true,
      bytesBase64: Buffer.from('hello').toString('base64'),
    })
  })

  test('copies local ordinary files to the selected directory without overwriting', async () => {
    const { exportRepositoryFilesToLocalDirectory } = await import('#/server/modules/repo-file-export.ts')
    const root = await mkdtemp(path.join(tmpdir(), 'gbl-export-root-'))
    const target = await mkdtemp(path.join(tmpdir(), 'gbl-export-target-'))
    await writeFile(path.join(root, 'a.txt'), 'new')
    await writeFile(path.join(target, 'a.txt'), 'existing')

    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: root,
      worktreePath: root,
      targetDirPath: target,
      paths: [path.join(root, 'a.txt')],
    })

    expect(result).toEqual({
      ok: true,
      copied: [{ sourcePath: path.join(root, 'a.txt'), destinationPath: path.join(target, 'a copy.txt'), kind: 'file' }],
      renamed: [{ requestedName: 'a.txt', destinationName: 'a copy.txt', destinationPath: path.join(target, 'a copy.txt') }],
      failed: [],
    })
    await expect(readFile(path.join(target, 'a copy.txt'), 'utf8')).resolves.toBe('new')
  })

  test('rejects local sources outside the worktree', async () => {
    const { exportRepositoryFilesToLocalDirectory } = await import('#/server/modules/repo-file-export.ts')
    const root = await mkdtemp(path.join(tmpdir(), 'gbl-export-root-'))
    const outside = await mkdtemp(path.join(tmpdir(), 'gbl-export-outside-'))
    const target = await mkdtemp(path.join(tmpdir(), 'gbl-export-target-'))
    const outsideFile = path.join(outside, 'a.txt')
    await writeFile(outsideFile, 'no')

    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: root,
      worktreePath: root,
      targetDirPath: target,
      paths: [outsideFile],
    })

    expect(result).toEqual({ ok: false, message: 'error.file-transfer-source-outside-worktree' })
  })

  test('downloads remote ordinary files to the selected directory', async () => {
    const { exportRepositoryFilesToLocalDirectory } = await import('#/server/modules/repo-file-export.ts')
    const target = await mkdtemp(path.join(tmpdir(), 'gbl-export-target-'))

    const result = await exportRepositoryFilesToLocalDirectory({
      repoId: 'ssh-config://prod/srv/repo',
      worktreePath: '/srv/repo',
      targetDirPath: target,
      paths: ['/srv/repo/a.txt'],
    })

    expect(result).toEqual({
      ok: true,
      copied: [{ sourcePath: '/srv/repo/a.txt', destinationPath: path.join(target, 'a.txt'), kind: 'file' }],
      renamed: [],
      failed: [],
    })
    expect(mocks.readRemoteFileBase64).toHaveBeenCalledWith(REMOTE_TARGET, '/srv/repo/a.txt')
    await expect(readFile(path.join(target, 'a.txt'), 'utf8')).resolves.toBe('hello')
  })
})

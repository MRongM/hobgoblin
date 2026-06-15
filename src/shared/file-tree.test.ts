import { describe, expect, test } from 'vitest'
import {
  isRepoFileMoveRequest,
  isRepoFileTransferRequest,
  isValidFileTransferDestinationName,
} from '#/shared/file-tree.ts'

describe('file transfer request validation', () => {
  test('accepts local path items with optional destination names', () => {
    expect(
      isRepoFileTransferRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        targetDirPath: '/repo/src',
        source: {
          kind: 'localPaths',
          items: [
            { path: '/tmp/report.pdf', destinationName: 'pasted-a8f31c9d.pdf' },
            { path: '/tmp/LICENSE' },
          ],
        },
      }),
    ).toBe(true)
  })

  test('rejects local path items with path separators in destination names', () => {
    expect(
      isRepoFileTransferRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        targetDirPath: '/repo/src',
        source: {
          kind: 'localPaths',
          items: [{ path: '/tmp/report.pdf', destinationName: '../report.pdf' }],
        },
      }),
    ).toBe(false)
  })

  test('validates transfer destination basenames', () => {
    expect(isValidFileTransferDestinationName('pasted-a8f31c9d.pdf')).toBe(true)
    expect(isValidFileTransferDestinationName('pasted-a8f31c9d')).toBe(true)
    expect(isValidFileTransferDestinationName('')).toBe(false)
    expect(isValidFileTransferDestinationName('nested/report.pdf')).toBe(false)
    expect(isValidFileTransferDestinationName('nested\\report.pdf')).toBe(false)
    expect(isValidFileTransferDestinationName('bad\0name')).toBe(false)
  })
})

describe('file move request validation', () => {
  test('accepts move requests with source paths and a target directory', () => {
    expect(
      isRepoFileMoveRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        paths: ['/repo/README.md', '/repo/src'],
        targetDirPath: '/repo/docs',
      }),
    ).toBe(true)
  })

  test('rejects empty move source lists', () => {
    expect(
      isRepoFileMoveRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        paths: [],
        targetDirPath: '/repo/docs',
      }),
    ).toBe(false)
  })
})

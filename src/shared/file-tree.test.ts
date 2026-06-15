import { describe, expect, test } from 'vitest'
import {
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

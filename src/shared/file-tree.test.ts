import { describe, expect, test } from 'vitest'
import {
  FILE_TREE_SEARCH_LIMIT_DEFAULT,
  FILE_TREE_SEARCH_LIMIT_MAX,
  fileTreeSearchRank,
  isRepoFileTreeBinaryFileReadRequest,
  isRepoFileTreeBinaryFileReplaceRequest,
  isRepoFileSearchRequest,
  isRepoFileMoveRequest,
  isRepoFileTransferRequest,
  isValidFileTransferDestinationName,
  normalizeFileTreeSearchLimit,
  sortRepoFileSearchMatches,
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

describe('binary file tree request validation', () => {
  test('validates binary file read requests', () => {
    expect(
      isRepoFileTreeBinaryFileReadRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        filePath: '/repo/image.png',
        maxBytes: 30 * 1024 * 1024,
      }),
    ).toBe(true)
    expect(
      isRepoFileTreeBinaryFileReadRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        filePath: '/repo/image.png',
        maxBytes: 0,
      }),
    ).toBe(false)
  })

  test('validates binary file replace requests', () => {
    expect(
      isRepoFileTreeBinaryFileReplaceRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        filePath: '/repo/image.png',
        maxBytes: 30 * 1024 * 1024,
        bytesBase64: Buffer.from([0, 1, 2]).toString('base64'),
      }),
    ).toBe(true)
    expect(
      isRepoFileTreeBinaryFileReplaceRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        filePath: '/repo/image.png',
        maxBytes: 30,
        bytesBase64: 'not base64!',
      }),
    ).toBe(false)
  })
})

describe('file tree search contract', () => {
  test('normalizes search limits into the supported range', () => {
    expect(normalizeFileTreeSearchLimit(undefined)).toBe(FILE_TREE_SEARCH_LIMIT_DEFAULT)
    expect(normalizeFileTreeSearchLimit(0)).toBe(1)
    expect(normalizeFileTreeSearchLimit(9999)).toBe(FILE_TREE_SEARCH_LIMIT_MAX)
    expect(normalizeFileTreeSearchLimit(25.8)).toBe(25)
  })

  test('validates file search requests', () => {
    expect(
      isRepoFileSearchRequest({
        repoId: '/repo',
        worktreePath: '/repo',
        query: 'button',
        limit: 50,
      }),
    ).toBe(true)
    expect(isRepoFileSearchRequest({ repoId: '/repo', worktreePath: '/repo', query: '' })).toBe(false)
    expect(isRepoFileSearchRequest({ repoId: '/repo', worktreePath: '/repo', query: '   ' })).toBe(false)
    expect(isRepoFileSearchRequest({ repoId: '/repo', worktreePath: '/repo', query: 'a', limit: '10' })).toBe(false)
  })

  test('ranks filename matches before path-only matches', () => {
    expect(fileTreeSearchRank('button', 'src/components/Button.tsx')).toBe(0)
    expect(fileTreeSearchRank('utton', 'src/components/Button.tsx')).toBe(1)
    expect(fileTreeSearchRank('src', 'src/components/Button.tsx')).toBe(2)
    expect(fileTreeSearchRank('components', 'src/components/Button.tsx')).toBe(3)
    expect(fileTreeSearchRank('missing', 'src/components/Button.tsx')).toBeNull()
  })

  test('sorts search matches by rank then relative path', () => {
    expect(
      sortRepoFileSearchMatches('button', [
        { relativePath: 'src/components/IconButton.tsx', kind: 'file' },
        { relativePath: 'docs/button-guide.md', kind: 'file' },
        { relativePath: 'src/Button.tsx', kind: 'file' },
      ]).map((match) => match.relativePath),
    ).toEqual(['docs/button-guide.md', 'src/Button.tsx', 'src/components/IconButton.tsx'])
  })
})

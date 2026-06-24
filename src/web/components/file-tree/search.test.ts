import { describe, expect, test } from 'vitest'
import {
  mergeFileTreeSearchMatches,
  searchLoadedFileTreeNodes,
  type FileTreeSearchNode,
} from '#/web/components/file-tree/search.ts'

const nodes: FileTreeSearchNode[] = [
  { id: 'src', name: 'src', relativePath: 'src', kind: 'directory' },
  { id: 'src/Button.tsx', name: 'Button.tsx', relativePath: 'src/Button.tsx', kind: 'file' },
  { id: 'docs/button-guide.md', name: 'button-guide.md', relativePath: 'docs/button-guide.md', kind: 'file' },
]

describe('file tree search helpers', () => {
  test('finds loaded nodes by file name and path rank', () => {
    expect(searchLoadedFileTreeNodes('button', nodes).map((match) => match.relativePath)).toEqual([
      'docs/button-guide.md',
      'src/Button.tsx',
    ])
  })

  test('merges fallback results without duplicating loaded nodes', () => {
    expect(
      mergeFileTreeSearchMatches(
        'button',
        [{ source: 'loaded', id: 'src/Button.tsx', relativePath: 'src/Button.tsx', kind: 'file' }],
        [
          { relativePath: 'src/Button.tsx', kind: 'file' },
          { relativePath: 'src/components/IconButton.tsx', kind: 'file' },
        ],
      ),
    ).toEqual([
      { source: 'loaded', id: 'src/Button.tsx', relativePath: 'src/Button.tsx', kind: 'file' },
      { source: 'fallback', relativePath: 'src/components/IconButton.tsx', kind: 'file' },
    ])
  })
})

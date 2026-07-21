import { describe, expect, test } from 'vitest'
import {
  compactWorktreeBootstrapPaths,
  formatWorktreeBootstrapSummary,
  hasWorktreeBootstrapSummaryDetails,
  normalizeWorktreeBootstrapSelections,
  worktreeBootstrapPreviewFromConfig,
} from '#/shared/worktree-bootstrap-summary.ts'

describe('worktree bootstrap summary', () => {
  test('builds an empty preview when no config exists', () => {
    expect(worktreeBootstrapPreviewFromConfig(undefined)).toEqual({
      hasConfig: false,
      hasOperations: false,
      configHash: null,
      copyCount: 0,
      symlinkCount: 0,
      hardlinkCount: 0,
      excludeCount: 0,
    })
  })

  test('builds a counted preview from config', () => {
    expect(
      worktreeBootstrapPreviewFromConfig(
        {
          copy: ['.env'],
          symlink: ['config/*.json'],
          hardlink: ['cache.db'],
          exclude: ['*.log'],
          setup: 'bun install',
        },
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toEqual({
      hasConfig: true,
      hasOperations: true,
      configHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      copyCount: 1,
      symlinkCount: 1,
      hardlinkCount: 1,
      excludeCount: 1,
      setup: { command: 'bun install' },
    })
  })

  test('compacts path lists and formats fallback summary text', () => {
    const paths = Array.from({ length: 10 }, (_, index) => `file-${index}.txt`)
    const summary = {
      copy: compactWorktreeBootstrapPaths(paths),
      symlink: compactWorktreeBootstrapPaths([]),
      hardlink: compactWorktreeBootstrapPaths([]),
      skippedMissing: compactWorktreeBootstrapPaths(['missing.env']),
      setup: { command: 'bun install' },
    }

    expect(summary.copy).toEqual({ count: 10, paths: paths.slice(0, 8) })
    expect(hasWorktreeBootstrapSummaryDetails(summary)).toBe(true)
    expect(formatWorktreeBootstrapSummary(summary)).toContain('Copied 10 paths: file-0.txt')
    expect(formatWorktreeBootstrapSummary(summary)).toContain('and 2 more')
    expect(formatWorktreeBootstrapSummary(summary)).toContain('Skipped missing 1 path: missing.env')
    expect(formatWorktreeBootstrapSummary(summary)).toContain('Ran setup: bun install')
  })
})

describe('worktree bootstrap candidates', () => {
  test('normalizes unique root-level selections', () => {
    expect(
      normalizeWorktreeBootstrapSelections([
        { path: '.env', mode: 'copy' },
        { path: 'node_modules', mode: 'symlink' },
      ]),
    ).toEqual([
      { path: '.env', mode: 'copy' },
      { path: 'node_modules', mode: 'symlink' },
    ])
  })

  test.each([
    null,
    [],
    [{ path: '.env', mode: 'hardlink' }],
    [{ path: 'config/local.json', mode: 'copy' }],
    [{ path: '..', mode: 'copy' }],
    [{ path: '.git', mode: 'copy' }],
    [{ path: 'bad\\name', mode: 'copy' }],
    [
      { path: '.env', mode: 'copy' },
      { path: '.env', mode: 'symlink' },
    ],
  ])('rejects malformed or unsafe selections: %j', (value) => {
    expect(normalizeWorktreeBootstrapSelections(value)).toBeNull()
  })
})

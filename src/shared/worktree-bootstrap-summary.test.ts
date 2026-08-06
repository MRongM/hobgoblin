import { describe, expect, test } from 'vitest'
import {
  compactWorktreeBootstrapPaths,
  formatWorktreeBootstrapSummary,
  hasWorktreeBootstrapSummaryDetails,
  normalizeWorktreeDependencyPath,
  normalizeWorktreeBootstrapSelections,
} from '#/shared/worktree-bootstrap-summary.ts'

describe('worktree bootstrap summary', () => {
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

describe('worktree bootstrap selections', () => {
  test('normalizes safe nested dependency paths', () => {
    expect(normalizeWorktreeDependencyPath('./backend/.venv')).toBe('backend/.venv')
    expect(normalizeWorktreeDependencyPath('frontend/node_modules/')).toBe('frontend/node_modules')
    expect(normalizeWorktreeDependencyPath('packages//web/./cache')).toBe('packages/web/cache')
  })

  test.each([
    '',
    '.',
    '..',
    '../secret',
    'backend/../secret',
    '.git',
    'src/.git/config',
    '/absolute/path',
    'C:\\absolute\\path',
    'bad\\name',
    'bad\0name',
  ])('rejects unsafe dependency path: %j', (value) => {
    expect(normalizeWorktreeDependencyPath(value)).toBeNull()
  })

  test('normalizes valid selections and independently drops malformed items', () => {
    expect(
      normalizeWorktreeBootstrapSelections([
        { path: '.env', mode: 'copy' },
        { path: '../secret', mode: 'copy' },
        { path: 'backend/.venv', mode: 'symlink' },
        { path: 'frontend/node_modules', mode: 'hardlink' },
      ]),
    ).toEqual([
      { path: '.env', mode: 'copy' },
      { path: 'backend/.venv', mode: 'symlink' },
    ])
  })

  test('returns an empty selection list for malformed containers', () => {
    expect(normalizeWorktreeBootstrapSelections(null)).toEqual([])
    expect(normalizeWorktreeBootstrapSelections({})).toEqual([])
    expect(normalizeWorktreeBootstrapSelections([])).toEqual([])
  })

  test('deduplicates selections and lets a later ancestor replace descendants', () => {
    expect(
      normalizeWorktreeBootstrapSelections([
        { path: '.env', mode: 'copy' },
        { path: '.env', mode: 'symlink' },
        { path: 'backend/.venv/bin', mode: 'copy' },
        { path: 'backend/.venv', mode: 'symlink' },
        { path: 'backend/.venv/cache', mode: 'copy' },
      ]),
    ).toEqual([
      { path: '.env', mode: 'copy' },
      { path: 'backend/.venv', mode: 'symlink' },
    ])
  })
})

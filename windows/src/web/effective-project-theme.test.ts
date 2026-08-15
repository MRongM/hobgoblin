import { describe, expect, test } from 'vitest'
import { effectiveProjectColorTheme } from '#/web/effective-project-theme.ts'

describe('effective project theme', () => {
  test('uses project color theme when the active project has an override', () => {
    expect(
      effectiveProjectColorTheme({
        activeRepoId: '/repo-a',
        globalColorTheme: 'macos',
        repoSettings: [{ repoId: '/repo-a', colorTheme: 'cursor' }],
      }),
    ).toBe('cursor')
  })

  test('falls back to global color theme without an active project override', () => {
    expect(
      effectiveProjectColorTheme({
        activeRepoId: '/repo-b',
        globalColorTheme: 'github',
        repoSettings: [{ repoId: '/repo-a', colorTheme: 'cursor' }],
      }),
    ).toBe('github')
    expect(
      effectiveProjectColorTheme({
        activeRepoId: null,
        globalColorTheme: 'github',
        repoSettings: [{ repoId: '/repo-a', colorTheme: 'cursor' }],
      }),
    ).toBe('github')
  })
})

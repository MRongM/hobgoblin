import { describe, expect, test } from 'vitest'
import {
  clearRepoSettingsEntryColorTheme,
  repoSettingsEntryColorTheme,
  repoSettingsEntryForRepo,
  repoSettingsEntryHasPersistedFields,
  setRepoSettingsEntryColorTheme,
} from '#/shared/repo-settings.ts'

describe('repo settings helpers', () => {
  test('finds repo entries', () => {
    const settings = [{ repoId: '/repo-a', colorTheme: 'cursor' as const }]

    expect(repoSettingsEntryForRepo(settings, '/repo-a')).toEqual(settings[0])
    expect(repoSettingsEntryForRepo(settings, '/repo-b')).toBeUndefined()
  })

  test('reads project color themes from repo settings entries', () => {
    const settings = [
      { repoId: '/repo-a', colorTheme: 'cursor' },
      { repoId: '/repo-b', colorTheme: 'github' },
    ] as const

    expect(repoSettingsEntryColorTheme(settings, '/repo-a')).toBe('cursor')
    expect(repoSettingsEntryColorTheme(settings, '/repo-b')).toBe('github')
    expect(repoSettingsEntryColorTheme(settings, '/repo-c')).toBeUndefined()
  })

  test('upserts project color themes', () => {
    const settings = [{ repoId: '/repo-a' }]

    expect(setRepoSettingsEntryColorTheme(settings, '/repo-a', 'cursor')).toEqual([
      { repoId: '/repo-a', colorTheme: 'cursor' },
    ])

    expect(setRepoSettingsEntryColorTheme(settings, '/repo-b', 'github')).toEqual([
      { repoId: '/repo-b', colorTheme: 'github' },
      settings[0],
    ])
  })

  test('clears project color themes and removes empty entries', () => {
    const settings = [
      { repoId: '/repo-a', colorTheme: 'cursor' as const },
      { repoId: '/repo-b', colorTheme: 'github' as const },
    ]

    expect(clearRepoSettingsEntryColorTheme(settings, '/repo-a')).toEqual([{ repoId: '/repo-b', colorTheme: 'github' }])
    expect(clearRepoSettingsEntryColorTheme(settings, '/repo-b')).toEqual([{ repoId: '/repo-a', colorTheme: 'cursor' }])
  })

  test('detects whether repo settings entries contain persisted fields', () => {
    expect(repoSettingsEntryHasPersistedFields({ repoId: '/repo-a' })).toBe(false)
    expect(repoSettingsEntryHasPersistedFields({ repoId: '/repo-a', colorTheme: 'cursor' })).toBe(true)
  })
})

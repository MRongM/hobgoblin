import { describe, expect, test } from 'vitest'
import {
  clearRepoSettingsEntryColorTheme,
  isRepoWorktreeBootstrapConfigTrusted,
  isWorktreeBootstrapConfigHash,
  repoSettingsEntryColorTheme,
  repoSettingsEntryForRepo,
  repoSettingsEntryHasPersistedFields,
  setRepoSettingsEntryColorTheme,
  WORKTREE_BOOTSTRAP_CONFIG_HASH_RE,
} from '#/shared/repo-settings.ts'

const HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('repo settings helpers', () => {
  test('validates bootstrap config hash shape', () => {
    expect(WORKTREE_BOOTSTRAP_CONFIG_HASH_RE.test(HASH)).toBe(true)
    expect(isWorktreeBootstrapConfigHash(HASH)).toBe(true)
    expect(isWorktreeBootstrapConfigHash('sha256:bad')).toBe(false)
    expect(isWorktreeBootstrapConfigHash('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
  })

  test('finds repo entries and exact trusted hashes', () => {
    const settings = [
      {
        repoId: '/repo-a',
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      },
    ]

    expect(repoSettingsEntryForRepo(settings, '/repo-a')).toEqual(settings[0])
    expect(isRepoWorktreeBootstrapConfigTrusted(settings, '/repo-a', HASH)).toBe(true)
    expect(isRepoWorktreeBootstrapConfigTrusted(settings, '/repo-a', null)).toBe(false)
    expect(
      isRepoWorktreeBootstrapConfigTrusted(
        settings,
        '/repo-a',
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
    ).toBe(false)
    expect(isRepoWorktreeBootstrapConfigTrusted(settings, '/repo-b', HASH)).toBe(false)
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

  test('upserts project color themes while preserving unrelated repo settings', () => {
    const settings = [
      {
        repoId: '/repo-a',
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      },
    ]

    expect(setRepoSettingsEntryColorTheme(settings, '/repo-a', 'cursor')).toEqual([
      {
        repoId: '/repo-a',
        colorTheme: 'cursor',
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      },
    ])

    expect(setRepoSettingsEntryColorTheme(settings, '/repo-b', 'github')).toEqual([
      { repoId: '/repo-b', colorTheme: 'github' },
      settings[0],
    ])
  })

  test('clears project color themes without dropping remaining repo settings fields', () => {
    const settings = [
      {
        repoId: '/repo-a',
        colorTheme: 'cursor' as const,
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      },
      { repoId: '/repo-b', colorTheme: 'github' as const },
    ]

    expect(clearRepoSettingsEntryColorTheme(settings, '/repo-a')).toEqual([
      {
        repoId: '/repo-a',
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      },
      { repoId: '/repo-b', colorTheme: 'github' },
    ])
    expect(clearRepoSettingsEntryColorTheme(settings, '/repo-b')).toEqual([
      {
        repoId: '/repo-a',
        colorTheme: 'cursor',
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      },
    ])
  })

  test('detects whether repo settings entries contain persisted fields', () => {
    expect(repoSettingsEntryHasPersistedFields({ repoId: '/repo-a' })).toBe(false)
    expect(repoSettingsEntryHasPersistedFields({ repoId: '/repo-a', colorTheme: 'cursor' })).toBe(true)
    expect(
      repoSettingsEntryHasPersistedFields({
        repoId: '/repo-a',
        worktreeBootstrapTrust: { configHash: HASH, trustedAt: '2026-07-08T00:00:00.000Z' },
      }),
    ).toBe(true)
  })
})

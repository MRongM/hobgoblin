import { describe, expect, test } from 'vitest'
import {
  isRepoWorktreeBootstrapConfigTrusted,
  isWorktreeBootstrapConfigHash,
  repoSettingsEntryForRepo,
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
})

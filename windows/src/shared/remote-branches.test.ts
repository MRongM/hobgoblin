import { describe, expect, test } from 'vitest'
import {
  isProtectedRemoteBranchRef,
  parseRemoteBranchRef,
  parseRemoteTrackingBranchInfo,
  remoteBranchRefMatchesQuery,
  remoteBranchSortKey,
} from '#/shared/remote-branches.ts'

describe('remote branch helpers', () => {
  test('parses nested remote branch refs at the first slash', () => {
    expect(parseRemoteBranchRef('origin/feature/api-client')).toEqual({
      remote: 'origin',
      branch: 'feature/api-client',
      fullRef: 'origin/feature/api-client',
    })
  })

  test('trims valid refs and rejects invalid remote tracking refs', () => {
    expect(parseRemoteBranchRef('  upstream/release/1.0  ')).toEqual({
      remote: 'upstream',
      branch: 'release/1.0',
      fullRef: 'upstream/release/1.0',
    })
    expect(parseRemoteBranchRef('origin/HEAD')).toBeNull()
    expect(parseRemoteBranchRef('origin/-bad')).toBeNull()
    expect(parseRemoteBranchRef('/feature/a')).toBeNull()
    expect(parseRemoteBranchRef('origin')).toBeNull()
  })

  test('marks protected branch names across remotes', () => {
    expect(isProtectedRemoteBranchRef('origin/main')).toBe(true)
    expect(isProtectedRemoteBranchRef('upstream/master')).toBe(true)
    expect(isProtectedRemoteBranchRef('mirror/develop')).toBe(true)
    expect(isProtectedRemoteBranchRef('origin/trunk')).toBe(true)
    expect(isProtectedRemoteBranchRef('origin/feature/main-fix')).toBe(false)
    expect(isProtectedRemoteBranchRef('origin/HEAD')).toBe(false)
  })

  test('matches search query tokens against the full ref', () => {
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', 'api')).toBe(true)
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', 'origin api')).toBe(true)
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', 'bugfix')).toBe(false)
    expect(remoteBranchRefMatchesQuery('origin/feature/api-client', '   ')).toBe(true)
  })

  test('sorts refs by remote then branch name', () => {
    expect(['upstream/main', 'origin/z', 'origin/a'].sort((a, b) => remoteBranchSortKey(a).localeCompare(remoteBranchSortKey(b)))).toEqual([
      'origin/a',
      'origin/z',
      'upstream/main',
    ])
  })

  test('parses remote tracking refs with SHA-1 and SHA-256 heads', () => {
    const sha1 = 'a'.repeat(40)
    const sha256 = 'b'.repeat(64)

    expect(
      parseRemoteTrackingBranchInfo(
        [`upstream/release/v2\0${sha256}`, `origin/main\0${sha1}`, `origin/HEAD\0${sha1}`].join('\n'),
      ),
    ).toEqual([
      { remoteRef: 'origin/main', head: sha1 },
      { remoteRef: 'upstream/release/v2', head: sha256 },
    ])
  })

  test('ignores malformed and duplicate remote tracking ref facts', () => {
    const firstHead = '1'.repeat(40)
    const duplicateHead = '2'.repeat(40)

    expect(
      parseRemoteTrackingBranchInfo(
        [
          `origin/main\0${firstHead}`,
          `origin/main\0${duplicateHead}`,
          'origin/missing-head',
          'origin/bad\0not-a-hash',
          `invalid\0${firstHead}`,
          `origin/extra\0${firstHead}\0trailing`,
          '',
        ].join('\n'),
      ),
    ).toEqual([{ remoteRef: 'origin/main', head: firstHead }])
  })
})

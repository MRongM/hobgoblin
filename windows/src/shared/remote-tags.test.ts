import { describe, expect, test } from 'vitest'
import { parseRemoteTagRef, remoteTagRefMatchesQuery, remoteTagSortKey } from '#/shared/remote-tags.ts'

describe('remote tag helpers', () => {
  test('parses nested remote tag refs at the first slash', () => {
    expect(parseRemoteTagRef('origin/release/1.0')).toEqual({
      remote: 'origin',
      tag: 'release/1.0',
      fullRef: 'origin/release/1.0',
    })
  })

  test('trims valid refs and rejects invalid remote tag refs', () => {
    expect(parseRemoteTagRef('  upstream/v1.0.0  ')).toEqual({
      remote: 'upstream',
      tag: 'v1.0.0',
      fullRef: 'upstream/v1.0.0',
    })
    expect(parseRemoteTagRef('bad remote/v1.0.0')).toBeNull()
    expect(parseRemoteTagRef('origin/-bad')).toBeNull()
    expect(parseRemoteTagRef('/v1.0.0')).toBeNull()
    expect(parseRemoteTagRef('origin')).toBeNull()
  })

  test('matches search query tokens against the full ref', () => {
    expect(remoteTagRefMatchesQuery('origin/release/v1.0.0', 'release')).toBe(true)
    expect(remoteTagRefMatchesQuery('origin/release/v1.0.0', 'origin v1')).toBe(true)
    expect(remoteTagRefMatchesQuery('origin/release/v1.0.0', 'bugfix')).toBe(false)
    expect(remoteTagRefMatchesQuery('origin/release/v1.0.0', '   ')).toBe(true)
  })

  test('sorts refs by remote then tag name', () => {
    expect(['upstream/v1.0.0', 'origin/v2.0.0', 'origin/v1.0.0'].sort((a, b) => remoteTagSortKey(a).localeCompare(remoteTagSortKey(b)))).toEqual([
      'origin/v1.0.0',
      'origin/v2.0.0',
      'upstream/v1.0.0',
    ])
  })
})

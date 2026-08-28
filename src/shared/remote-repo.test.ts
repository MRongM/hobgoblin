import { describe, expect, test } from 'vitest'
import {
  isRemoteRepoId,
  isSshRepoId,
  normalizeRepoSessionEntry,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteWorkspaceChildRef,
} from '#/shared/remote-repo.ts'

describe('remote workspace repository references', () => {
  const root = normalizeRemoteRepoRef({ alias: 'prod host', remotePath: '/srv/work space' })!

  test('derives an encoded child repository on the same SSH alias', () => {
    expect(remoteWorkspaceChildRef(root, 'api service')).toEqual({
      id: 'ssh-config://prod%20host/srv/work%20space/api%20service',
      alias: 'prod host',
      remotePath: '/srv/work space/api service',
      displayName: 'prod host:api service',
    })
  })

  test.each(['', '.', '..', 'a/b', 'a\\b', 'bad\0name'])('rejects unsafe workspace member %j', (member) => {
    expect(remoteWorkspaceChildRef(root, member)).toBeNull()
  })

  test('round-trips a WSL distribution and Linux path without changing it into an SSH reference', () => {
    const ref = normalizeRemoteRepoRef({ transport: 'wsl', alias: 'Ubuntu Dev', remotePath: '/root/src/hobgoblin' })

    expect(ref).toEqual({
      id: 'wsl://Ubuntu%20Dev/root/src/hobgoblin',
      alias: 'Ubuntu Dev',
      remotePath: '/root/src/hobgoblin',
      displayName: 'Ubuntu Dev:hobgoblin',
      transport: 'wsl',
    })
    expect(isRemoteRepoId(ref!.id)).toBe(true)
    expect(isSshRepoId(ref!.id)).toBe(false)
    expect(parseRemoteRepoId(ref!.id)).toEqual({
      alias: 'Ubuntu Dev',
      remotePath: '/root/src/hobgoblin',
      transport: 'wsl',
    })
  })

  test('normalizes Linux dot segments before creating the WSL identity', () => {
    expect(
      normalizeRemoteRepoRef({
        transport: 'wsl',
        alias: 'Ubuntu',
        remotePath: '/root/tmp/../src/./hobgoblin//',
      }),
    ).toMatchObject({
      id: 'wsl://Ubuntu/root/src/hobgoblin',
      remotePath: '/root/src/hobgoblin',
    })
  })

  test('restores WSL transport from a persisted session identity', () => {
    expect(
      normalizeRepoSessionEntry({
        kind: 'remote',
        id: 'wsl://Ubuntu/root/src/hobgoblin',
        ref: {
          id: 'wsl://Ubuntu/root/src/hobgoblin',
          alias: 'Ubuntu',
          remotePath: '/root/src/hobgoblin',
          displayName: 'Ubuntu:hobgoblin',
        },
      }),
    ).toMatchObject({
      kind: 'remote',
      id: 'wsl://Ubuntu/root/src/hobgoblin',
      ref: { transport: 'wsl' },
    })
  })

  test('rejects a persisted remote entry whose identity and reference disagree', () => {
    expect(
      normalizeRepoSessionEntry({
        kind: 'remote',
        id: 'wsl://Ubuntu/root/src/one',
        ref: {
          alias: 'Ubuntu',
          remotePath: '/root/src/two',
          displayName: 'Ubuntu:two',
        },
      }),
    ).toBeNull()
  })

  test('keeps WSL workspace children in the same distribution', () => {
    const wslRoot = normalizeRemoteRepoRef({ transport: 'wsl', alias: 'Ubuntu', remotePath: '/root/src' })!
    expect(remoteWorkspaceChildRef(wslRoot, 'hobgoblin')).toMatchObject({
      id: 'wsl://Ubuntu/root/src/hobgoblin',
      transport: 'wsl',
    })
  })
})

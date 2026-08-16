import { describe, expect, test } from 'vitest'
import { normalizeRemoteRepoRef, remoteWorkspaceChildRef } from '#/shared/remote-repo.ts'

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
})

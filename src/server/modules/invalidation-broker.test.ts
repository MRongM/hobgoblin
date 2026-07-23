import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  disconnectAllInvalidationSockets,
  publishRepoQueryInvalidation,
  publishWorkspaceInvalidation,
  registerInvalidationSocket,
} from '#/server/modules/invalidation-broker.ts'

describe('invalidation broker', () => {
  beforeEach(() => {
    disconnectAllInvalidationSockets()
  })

  test('disconnects every registered invalidation socket during shutdown', () => {
    const first = { send: vi.fn(), close: vi.fn() }
    const second = { send: vi.fn(), close: vi.fn() }
    registerInvalidationSocket(first)
    registerInvalidationSocket(second)

    disconnectAllInvalidationSockets()
    publishRepoQueryInvalidation({ repoId: 'repo_1', query: 'repo-snapshot' })

    expect(first.close).toHaveBeenCalledWith(1001, 'server shutting down')
    expect(second.close).toHaveBeenCalledWith(1001, 'server shutting down')
    expect(first.send).not.toHaveBeenCalled()
    expect(second.send).not.toHaveBeenCalled()
  })

  test('publishes a targeted workspace invalidation payload', () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerInvalidationSocket(socket)

    publishWorkspaceInvalidation('/workspace')

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'workspace-invalidated', rootId: '/workspace' }))
  })

  test('preserves a valid workspace mutation source token', () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerInvalidationSocket(socket)

    publishWorkspaceInvalidation('/workspace', 'workspace_create_1')

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'workspace-invalidated',
        rootId: '/workspace',
        sourceToken: 'workspace_create_1',
      }),
    )
  })
})

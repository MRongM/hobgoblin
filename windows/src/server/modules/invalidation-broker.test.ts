import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  disconnectAllInvalidationSockets,
  publishBranchWorkspaceOperationUpdate,
  publishRepoQueryInvalidation,
  publishWorkspaceConfigurationInvalidation,
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

  test('publishes a targeted workspace configuration invalidation payload', () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerInvalidationSocket(socket)

    publishWorkspaceConfigurationInvalidation('/workspace', 'workspace_import_1')

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'workspace-configuration-invalidated',
        rootId: '/workspace',
        sourceToken: 'workspace_import_1',
      }),
    )
  })

  test('publishes a branch workspace operation update payload', () => {
    const socket = { send: vi.fn(), close: vi.fn() }
    registerInvalidationSocket(socket)
    const operation = {
      kind: 'pull' as const,
      currentStep: 1,
      completedCount: 0,
      totalCount: 2,
      cancellable: true,
      repositoryName: 'api',
      step: 'pull' as const,
    }

    publishBranchWorkspaceOperationUpdate('/workspace', 'workspace_1', operation)
    publishBranchWorkspaceOperationUpdate('/workspace', 'workspace_1', null)

    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: 'branch-workspace-operation-updated',
        rootId: '/workspace',
        branchWorkspaceId: 'workspace_1',
        operation,
      }),
    )
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        type: 'branch-workspace-operation-updated',
        rootId: '/workspace',
        branchWorkspaceId: 'workspace_1',
        operation: null,
      }),
    )
  })
})

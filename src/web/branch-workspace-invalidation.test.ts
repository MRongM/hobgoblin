import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  subscribeServerInvalidationIngress: vi.fn(),
}))

vi.mock('#/web/server-invalidation-ingress.ts', () => ({
  subscribeServerInvalidationIngress: mocks.subscribeServerInvalidationIngress,
}))

import { branchWorkspaceQueryKey } from '#/web/branch-workspace-queries.ts'
import { subscribeBranchWorkspaceInvalidation } from '#/web/branch-workspace-invalidation.ts'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import {
  beginRepoInvalidationSource,
  resetRepoInvalidationSourceState,
} from '#/web/stores/repos/invalidation-sources.ts'

describe('branch workspace invalidation', () => {
  beforeEach(() => {
    mocks.subscribeServerInvalidationIngress.mockReset()
    resetRepoInvalidationSourceState()
  })

  test('invalidates only the exact affected branch workspace query', () => {
    let emit: (event: unknown) => void = () => {
      throw new Error('missing invalidation listener')
    }
    const disposeIngress = vi.fn()
    mocks.subscribeServerInvalidationIngress.mockImplementation((listener) => {
      emit = listener
      return disposeIngress
    })
    const invalidateQueries = vi.fn()

    const dispose = subscribeBranchWorkspaceInvalidation({ invalidateQueries, setQueryData: vi.fn() })
    emit({ type: 'workspace-invalidated', rootId: '/workspace' })
    emit({ type: 'settings-invalidated', scopes: ['theme'] })

    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: branchWorkspaceQueryKey('/workspace'),
      exact: true,
    })
    dispose()
    expect(disposeIngress).toHaveBeenCalledTimes(1)
  })

  test('suppresses invalidation events emitted by the active local workspace mutation', () => {
    let emit: (event: unknown) => void = () => {
      throw new Error('missing invalidation listener')
    }
    mocks.subscribeServerInvalidationIngress.mockImplementation((listener) => {
      emit = listener
      return () => undefined
    })
    const invalidateQueries = vi.fn()
    beginRepoInvalidationSource('workspace_create_1')

    subscribeBranchWorkspaceInvalidation({ invalidateQueries, setQueryData: vi.fn() })
    emit({ type: 'workspace-invalidated', rootId: '/workspace', sourceToken: 'workspace_create_1' })

    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  test('projects operation updates into the matching cached workspace without refetching', () => {
    let emit: (event: unknown) => void = () => {
      throw new Error('missing invalidation listener')
    }
    mocks.subscribeServerInvalidationIngress.mockImplementation((listener) => {
      emit = listener
      return () => undefined
    })
    const invalidateQueries = vi.fn()
    let cached: BranchWorkspaceReadResult | undefined = successfulRead()
    const setQueryData = vi.fn(
      (
        _queryKey: readonly unknown[],
        updater: (current: BranchWorkspaceReadResult | undefined) => BranchWorkspaceReadResult | undefined,
      ) => {
        cached = updater(cached)
      },
    )
    const operation = {
      kind: 'batch-merge-in' as const,
      currentStep: 1,
      completedCount: 0,
      totalCount: 2,
      cancellable: true,
      repositoryName: 'api',
      step: 'pull' as const,
    }

    subscribeBranchWorkspaceInvalidation({ invalidateQueries, setQueryData })
    emit({
      type: 'branch-workspace-operation-updated',
      rootId: '/workspace',
      branchWorkspaceId: 'workspace_1',
      operation,
    })

    expect(setQueryData).toHaveBeenCalledWith(branchWorkspaceQueryKey('/workspace'), expect.any(Function))
    expect(cached?.ok && cached.items[0]?.activeOperation).toEqual(operation)
    expect(cached?.ok && cached.items[1]?.activeOperation).toBeUndefined()
    expect(invalidateQueries).not.toHaveBeenCalled()

    emit({
      type: 'branch-workspace-operation-updated',
      rootId: '/workspace',
      branchWorkspaceId: 'workspace_1',
      operation: null,
    })

    expect(cached?.ok && cached.items[0] && 'activeOperation' in cached.items[0]).toBe(false)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  test('projects an active batch upstream operation without refetching', () => {
    let emit: (event: unknown) => void = () => {
      throw new Error('missing invalidation listener')
    }
    mocks.subscribeServerInvalidationIngress.mockImplementation((listener) => {
      emit = listener
      return () => undefined
    })
    const invalidateQueries = vi.fn()
    let cached: BranchWorkspaceReadResult | undefined = successfulRead()
    const setQueryData = vi.fn(
      (
        _queryKey: readonly unknown[],
        updater: (current: BranchWorkspaceReadResult | undefined) => BranchWorkspaceReadResult | undefined,
      ) => {
        cached = updater(cached)
      },
    )
    const operation = {
      kind: 'batch-set-upstream' as const,
      currentStep: 1,
      completedCount: 0,
      totalCount: 2,
      cancellable: true,
      repositoryName: 'api',
      step: 'upstream' as const,
    }

    subscribeBranchWorkspaceInvalidation({ invalidateQueries, setQueryData })
    emit({
      type: 'branch-workspace-operation-updated',
      rootId: '/workspace',
      branchWorkspaceId: 'workspace_1',
      operation,
    })

    expect(cached?.ok && cached.items[0]?.activeOperation).toEqual(operation)
    expect(invalidateQueries).not.toHaveBeenCalled()
  })
})

function successfulRead(): Extract<BranchWorkspaceReadResult, { ok: true }> {
  return {
    ok: true,
    rootId: '/workspace',
    auxiliaryCandidates: [],
    items: ['workspace_1', 'workspace_2'].map((id) => ({
      id,
      rootId: '/workspace',
      branch: `feature/${id}`,
      directoryName: `hobgoblin-${id}`,
      path: `/workspace/hobgoblin-${id}`,
      state: { kind: 'ready' as const },
      available: true,
      issues: [],
      repositories: [],
      auxiliaryEntries: [],
    })),
  }
}

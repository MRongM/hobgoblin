import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  subscribeServerInvalidationIngress: vi.fn(),
}))

vi.mock('#/web/server-invalidation-ingress.ts', () => ({
  subscribeServerInvalidationIngress: mocks.subscribeServerInvalidationIngress,
}))

import { branchWorkspaceQueryKey } from '#/web/branch-workspace-queries.ts'
import { subscribeBranchWorkspaceInvalidation } from '#/web/branch-workspace-invalidation.ts'

describe('branch workspace invalidation', () => {
  beforeEach(() => {
    mocks.subscribeServerInvalidationIngress.mockReset()
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

    const dispose = subscribeBranchWorkspaceInvalidation({ invalidateQueries })
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
})

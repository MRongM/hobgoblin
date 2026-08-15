import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  subscribeServerInvalidationIngress: vi.fn(),
}))

vi.mock('#/web/server-invalidation-ingress.ts', () => ({
  subscribeServerInvalidationIngress: mocks.subscribeServerInvalidationIngress,
}))

import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import {
  beginRepoInvalidationSource,
  resetRepoInvalidationSourceState,
} from '#/web/stores/repos/invalidation-sources.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { subscribeWorkspaceConfigurationInvalidation } from '#/web/workspace-configuration-invalidation.ts'

describe('workspace configuration invalidation', () => {
  beforeEach(() => {
    mocks.subscribeServerInvalidationIngress.mockReset()
    resetRepoInvalidationSourceState()
    resetReposStore()
  })

  test('rescans only an open plain workspace affected by the event', () => {
    let emit: (event: unknown) => void = () => {
      throw new Error('missing invalidation listener')
    }
    const disposeIngress = vi.fn()
    mocks.subscribeServerInvalidationIngress.mockImplementation((listener) => {
      emit = listener
      return disposeIngress
    })
    const root = emptyRepo('/workspace', 'workspace')
    root.isGitRepo = false
    const rescanWorkspace = vi.fn(async () => undefined)
    useReposStore.setState({ repos: { [root.id]: root }, rescanWorkspace })

    const dispose = subscribeWorkspaceConfigurationInvalidation()
    emit({ type: 'settings-invalidated', scopes: ['theme'] })
    emit({ type: 'workspace-configuration-invalidated', rootId: '/closed' })
    emit({ type: 'workspace-configuration-invalidated', rootId: root.id })

    expect(rescanWorkspace).toHaveBeenCalledTimes(1)
    expect(rescanWorkspace).toHaveBeenCalledWith(root.id)
    dispose()
    expect(disposeIngress).toHaveBeenCalledTimes(1)
  })

  test('suppresses an invalidation emitted by the active local import', () => {
    let emit: (event: unknown) => void = () => {
      throw new Error('missing invalidation listener')
    }
    mocks.subscribeServerInvalidationIngress.mockImplementation((listener) => {
      emit = listener
      return () => undefined
    })
    const root = emptyRepo('/workspace', 'workspace')
    root.isGitRepo = false
    const rescanWorkspace = vi.fn(async () => undefined)
    useReposStore.setState({ repos: { [root.id]: root }, rescanWorkspace })
    beginRepoInvalidationSource('workspace_import_1')

    subscribeWorkspaceConfigurationInvalidation()
    emit({
      type: 'workspace-configuration-invalidated',
      rootId: root.id,
      sourceToken: 'workspace_import_1',
    })

    expect(rescanWorkspace).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const mocks = vi.hoisted(() => ({ readBranchWorkspaces: vi.fn() }))
vi.mock('#/web/workspace-client.ts', () => ({ readBranchWorkspaces: mocks.readBranchWorkspaces }))

test('automatic discovery projects new independent members and reads only branch snapshots', async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  environment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  const actions = {
    refreshSnapshot: useReposStore.getState().refreshSnapshot,
    refreshCoreData: useReposStore.getState().refreshCoreData,
  }
  const refreshSnapshot = vi.fn().mockResolvedValue(undefined)
  const refreshCoreData = vi.fn().mockResolvedValue(undefined)
  const rootRepo = emptyRepo('/workspace', 'workspace')
  rootRepo.isGitRepo = false
  useReposStore.setState({ repos: { [rootRepo.id]: rootRepo }, refreshSnapshot, refreshCoreData })
  const result: BranchWorkspaceReadResult = {
    ok: true,
    rootId: rootRepo.id,
    auxiliaryCandidates: [],
    items: [
      {
        id: 'folder',
        rootId: rootRepo.id,
        branch: '',
        directoryName: 'folder',
        path: '/workspace/folder',
        state: { kind: 'ready' },
        available: true,
        issues: [],
        auxiliaryEntries: [],
        repositories: [
          {
            kind: 'repository',
            repositoryId: '/workspace/folder/independent',
            repositoryName: 'independent',
            currentBranch: 'feature/current',
            targetBranch: 'feature/current',
            worktreePath: '/workspace/folder/independent',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
            branchOrigin: 'pre-existing',
            progress: 'complete',
            ready: true,
          },
        ],
      },
    ],
  }
  mocks.readBranchWorkspaces.mockResolvedValue(result)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement('div')
  const root = createRoot(container)
  function Harness() {
    useBranchWorkspaceQuery(rootRepo.id)
    return null
  }
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      ),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(useReposStore.getState().repos['/workspace/folder/independent']?.workspaceRootId).toBe(rootRepo.id)
    expect(refreshSnapshot).toHaveBeenCalledWith('/workspace/folder/independent', { token: expect.any(Number) })
    expect(refreshCoreData).not.toHaveBeenCalled()
  } finally {
    act(() => root.unmount())
    client.clear()
    resetReposStore()
    useReposStore.setState(actions)
    environment.IS_REACT_ACT_ENVIRONMENT = false
  }
})

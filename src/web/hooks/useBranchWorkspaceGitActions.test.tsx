// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useBranchWorkspaceGitActions } from '#/web/hooks/useBranchWorkspaceGitActions.ts'
import type { BranchWorkspaceGitActionPlan } from '#/shared/branch-workspace-git-actions.ts'

const mocks = vi.hoisted(() => ({ plan: vi.fn(), execute: vi.fn(), abort: vi.fn() }))

vi.mock('#/web/workspace-client.ts', () => ({
  planBranchWorkspaceGitAction: mocks.plan,
  executeBranchWorkspaceGitAction: mocks.execute,
  abortBranchWorkspaceGitAction: mocks.abort,
}))

const plan: BranchWorkspaceGitActionPlan = {
  kind: 'batch-commit',
  token: 'sha256:plan',
  rootId: '/workspace',
  branchWorkspaceId: 'ws-1',
  members: [],
}

function syncPlan(kind: 'pull' | 'push'): BranchWorkspaceGitActionPlan {
  return {
    kind,
    token: `sha256:${kind}`,
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    ready: true,
    members: [],
  }
}

let container: HTMLDivElement
let root: Root
let queryClient: QueryClient

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  act(() => root.unmount())
  queryClient.clear()
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useBranchWorkspaceGitActions', () => {
  test('plans and executes a batch commit while retaining result state', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: true,
      kind: 'batch-commit',
      planToken: plan.token,
      branchWorkspaceId: 'ws-1',
      members: [],
    })
    let state: ReturnType<typeof useBranchWorkspaceGitActions> | null = null
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () => state!.requestPlan('batch-commit', 'ws-1'))
    await act(async () => state!.executeBatchCommit([]))

    expect(state!.plan).toEqual(plan)
    expect(state!.result?.ok).toBe(true)
    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      kind: 'batch-commit',
      planToken: plan.token,
      messages: [],
    })
  })

  test.each(['pull', 'push'] as const)('plans and executes coordinated %s', async (kind) => {
    const expectedPlan = syncPlan(kind)
    mocks.plan.mockResolvedValue({ ok: true, plan: expectedPlan })
    mocks.execute.mockResolvedValue({
      ok: true,
      kind,
      planToken: expectedPlan.token,
      branchWorkspaceId: 'ws-1',
      members: [],
    })
    let state: ReturnType<typeof useBranchWorkspaceGitActions> | null = null
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () => state!.requestPlan(kind, 'ws-1'))
    await act(async () => state!.executeSync(kind))

    expect(state!.plan).toEqual(expectedPlan)
    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      kind,
      planToken: expectedPlan.token,
    })
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useBranchWorkspaceGitActions>) => void }) {
  const value = useBranchWorkspaceGitActions('/workspace')
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return null
}

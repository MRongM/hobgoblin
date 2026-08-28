// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { BranchWorkspaceDependencyPlan } from '#/shared/branch-workspace-dependencies.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import { useBranchWorkspaceDependencyActions } from '#/web/hooks/useBranchWorkspaceDependencyActions.ts'

const mocks = vi.hoisted(() => ({ read: vi.fn(), plan: vi.fn(), execute: vi.fn(), abort: vi.fn() }))

vi.mock('#/web/workspace-client.ts', () => ({
  readBranchWorkspaceDependencies: mocks.read,
  planBranchWorkspaceDependencies: mocks.plan,
  executeBranchWorkspaceDependencies: mocks.execute,
  abortBranchWorkspaceDependencies: mocks.abort,
}))

const plan: BranchWorkspaceDependencyPlan = {
  token: 'sha256:dependencies',
  rootId: '/workspace',
  operation: 'remove',
  branchWorkspaceId: 'branch-1',
  requiredApprovals: [],
  entries: [
    {
      name: '.env',
      sourcePath: '/workspace/.env',
      targetPath: '/workspace/hobgoblin-feature/.env',
      targetKind: 'file',
      fingerprint: 'fingerprint:.env',
    },
  ],
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

describe('useBranchWorkspaceDependencyActions', () => {
  test('separates planning from execution and forwards preview cancellation', async () => {
    const execution = deferred<Awaited<ReturnType<typeof mocks.execute>>>()
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockImplementation(async () => await execution.promise)
    let state: ReturnType<typeof useBranchWorkspaceDependencyActions> | null = null
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )
    const request = { operation: 'remove' as const, branchWorkspaceId: 'branch-1', names: ['.env'] }
    const controller = new AbortController()

    await act(async () => state!.requestPlan(request, controller.signal))

    expect(mocks.plan).toHaveBeenCalledWith('/workspace', request, controller.signal)
    expect(state!.planning).toBe(false)
    expect(state!.executing).toBe(false)

    let confirmation!: ReturnType<ReturnType<typeof useBranchWorkspaceDependencyActions>['confirm']>
    act(() => {
      confirmation = state!.confirm([])
    })
    expect(state!.executing).toBe(true)
    expect(state!.pending).toBe(true)

    await act(async () => {
      execution.resolve({
        ok: true,
        operation: 'remove',
        branchWorkspaceId: 'branch-1',
        completedNames: ['.env'],
      })
      await confirmation
    })
    expect(state!.executing).toBe(false)
    expect(state!.pending).toBe(false)
  })

  test('reads candidates, previews a request, and executes with exact-root invalidation', async () => {
    const candidates = [
      {
        name: '.env',
        sourcePath: '/workspace/.env',
        sourceKind: 'file' as const,
        targetPath: '/workspace/hobgoblin-feature/.env',
        targetKind: 'file' as const,
        outsideRoot: false,
      },
    ]
    mocks.read.mockResolvedValue({ ok: true, rootId: '/workspace', branchWorkspaceId: 'branch-1', candidates })
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: true,
      operation: 'remove',
      branchWorkspaceId: 'branch-1',
      completedNames: ['.env'],
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let state: ReturnType<typeof useBranchWorkspaceDependencyActions> | null = null
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () => state!.read('branch-1'))
    expect(state!.candidates).toEqual(candidates)
    await act(async () => state!.requestPlan({ operation: 'remove', branchWorkspaceId: 'branch-1', names: ['.env'] }))
    expect(state!.plan).toEqual(plan)
    await act(async () => state!.confirm([]))

    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      planToken: plan.token,
      approvals: [],
      sourceToken: expect.stringMatching(/^repo_workspace_/),
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: branchWorkspaceQueryKey('/workspace'), exact: true })
    expect(state!.result?.ok).toBe(true)
  })

  test('retains a partial failure, invalidates live state, and cancels through the service', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: false,
      message: 'remove failed',
      operation: 'remove',
      branchWorkspaceId: 'branch-1',
      completedNames: ['.env'],
    })
    mocks.abort.mockResolvedValue({ ok: true })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let state: ReturnType<typeof useBranchWorkspaceDependencyActions> | null = null
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () => state!.requestPlan({ operation: 'remove', branchWorkspaceId: 'branch-1', names: ['.env'] }))
    await act(async () => state!.confirm([]))
    await act(async () => state!.cancel())

    expect(state!.error).toBe('remove failed')
    expect(state!.result).toMatchObject({ ok: false, completedNames: ['.env'] })
    expect(invalidate).toHaveBeenCalledOnce()
    expect(mocks.abort).toHaveBeenCalledWith('/workspace')
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useBranchWorkspaceDependencyActions>) => void }) {
  const value = useBranchWorkspaceDependencyActions('/workspace')
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

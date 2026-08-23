// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useBranchWorkspaceActions } from '#/web/hooks/useBranchWorkspaceActions.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-queries.ts'
import type { BranchWorkspacePlan } from '#/shared/branch-workspaces.ts'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  execute: vi.fn(),
  abort: vi.fn(),
  reorder: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { warning: mocks.warning } }))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params?.count === undefined ? key : `${key}:${params.count}`,
}))

vi.mock('#/web/workspace-client.ts', () => ({
  planBranchWorkspace: mocks.plan,
  executeBranchWorkspace: mocks.execute,
  abortBranchWorkspace: mocks.abort,
  reorderBranchWorkspaces: mocks.reorder,
}))

const plan = {
  token: 'sha256:plan',
  rootId: '/workspace',
  operation: 'create',
  branchWorkspaceId: 'branch-1',
  branch: 'feature/auth',
  directoryName: 'goblin-feature-auth',
  path: '/workspace/goblin-feature-auth',
  manifest: {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    repositories: [],
    auxiliaryEntries: [],
  },
  repositories: [],
  auxiliaryEntries: [],
  requiredApprovals: ['worktree-bootstrap'],
  steps: [],
  terminalSessionIds: [],
} satisfies BranchWorkspacePlan

const readySnapshot = {
  id: 'branch-1',
  rootId: '/workspace',
  branch: 'feature/auth',
  directoryName: 'goblin-feature-auth',
  path: '/workspace/goblin-feature-auth',
  state: { kind: 'ready' as const },
  available: true,
  issues: [],
  repositories: [],
  auxiliaryEntries: [],
}

let container: HTMLDivElement | null = null
let root: Root | null = null
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
  act(() => root?.unmount())
  queryClient.clear()
  container?.remove()
  root = null
  container = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useBranchWorkspaceActions', () => {
  test('shows successful one-time dependency warnings without changing settlement behavior', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: true,
      branchWorkspaceId: 'branch-1',
      snapshot: readySnapshot,
      warnings: [
        {
          kind: 'repository-dependency-failed',
          repositoryName: 'api',
          message: 'link failed',
        },
        {
          kind: 'workspace-dependency-failed',
          entryName: 'README.md',
          message: 'copy failed',
        },
      ],
    })
    let state: ReturnType<typeof useBranchWorkspaceActions> | null = null
    await act(async () =>
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () =>
      state!.requestPlan({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
          },
        ],
        auxiliaryEntries: [],
      }),
    )
    await act(async () => state!.confirm(['worktree-bootstrap']))

    expect(mocks.warning).toHaveBeenCalledWith('workspace.branch-workspace.dependency-warning:2', {
      description: 'api: link failed\nREADME.md: copy failed',
    })
    expect(state!.result).toMatchObject({
      ok: true,
      warnings: [{ repositoryName: 'api' }, { entryName: 'README.md' }],
    })
  })

  test('sends force removal separately and reports member cleanup warnings', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: true,
      branchWorkspaceId: 'branch-1',
      warnings: [
        {
          kind: 'member-worktree-cleanup-failed',
          repositoryName: 'api',
          message: 'cleanup failed',
        },
      ],
    })
    let state: ReturnType<typeof useBranchWorkspaceActions> | null = null
    await act(async () =>
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )
    await act(async () =>
      state!.requestPlan({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
          },
        ],
        auxiliaryEntries: [],
      }),
    )

    await act(async () => state!.forceConfirm(['worktree-bootstrap']))

    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      planToken: plan.token,
      approvals: ['worktree-bootstrap'],
      force: true,
    })
    expect(mocks.warning).toHaveBeenCalledWith('workspace.branch-workspace.force-delete-cleanup-warning:1', {
      description: 'api: cleanup failed',
    })
  })

  test('writes a successful creation snapshot into cache without refetching', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({ ok: true, branchWorkspaceId: 'branch-1', snapshot: readySnapshot })
    queryClient.setQueryData(branchWorkspaceQueryKey('/workspace'), {
      ok: true,
      rootId: '/workspace',
      items: [],
      auxiliaryCandidates: [],
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let state: ReturnType<typeof useBranchWorkspaceActions> | null = null
    await act(async () =>
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () =>
      state!.requestPlan({
        operation: 'create',
        branch: 'feature/auth',
        repositories: [
          {
            repositoryName: 'api',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
          },
        ],
        auxiliaryEntries: [],
      }),
    )
    await act(async () => state!.confirm(['worktree-bootstrap']))

    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      planToken: plan.token,
      approvals: ['worktree-bootstrap'],
    })
    expect(queryClient.getQueryData(branchWorkspaceQueryKey('/workspace'))).toMatchObject({
      ok: true,
      items: [readySnapshot],
    })
    expect(invalidate).not.toHaveBeenCalled()
  })

  test('keeps dialog plan/result state and invalidates the exact root after settlement', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({ ok: true, branchWorkspaceId: 'branch-1' })
    mocks.abort.mockResolvedValue({ ok: true })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let state: ReturnType<typeof useBranchWorkspaceActions> | null = null
    await act(async () =>
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )
    const request = {
      operation: 'create' as const,
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch' as const, branch: 'main' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [],
    }

    await act(async () => state!.requestPlan(request))
    expect(state!.plan).toEqual(plan)
    await act(async () => state!.confirm(['worktree-bootstrap']))
    expect(state!.result).toEqual({ ok: true, branchWorkspaceId: 'branch-1' })
    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      planToken: plan.token,
      approvals: ['worktree-bootstrap'],
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: branchWorkspaceQueryKey('/workspace'), exact: true })
    await act(async () => state!.cancel())
    expect(mocks.abort).toHaveBeenCalledWith('/workspace')
  })

  test('returns a failed execution to selection without discarding its request', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: false,
      message: 'workspace.branch-workspace.execute-failed',
      branchWorkspaceId: 'branch-1',
    })
    let state: ReturnType<typeof useBranchWorkspaceActions> | null = null
    await act(async () =>
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )
    const request = {
      operation: 'create' as const,
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch' as const, branch: 'main' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [],
    }

    await act(async () => state!.requestPlan(request))
    await act(async () => state!.confirm([]))
    act(() => state!.returnToSelection())

    expect(state!.plan).toBeNull()
    expect(state!.result).toBeNull()
    expect(state!.error).toBeNull()
    expect(state!.request).toEqual(request)
    expect(mocks.plan).toHaveBeenCalledTimes(1)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })

  test('reorders through the server and invalidates only after success', async () => {
    mocks.reorder.mockResolvedValue({ ok: true })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let state: ReturnType<typeof useBranchWorkspaceActions> | null = null
    await act(async () =>
      root!.render(
        <QueryClientProvider client={queryClient}>
          <Harness onReady={(value) => (state = value)} />
        </QueryClientProvider>,
      ),
    )

    await act(async () => state!.reorder(['third', 'first']))

    expect(mocks.reorder).toHaveBeenCalledWith('/workspace', ['third', 'first'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: branchWorkspaceQueryKey('/workspace'), exact: true })
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useBranchWorkspaceActions>) => void }) {
  const value = useBranchWorkspaceActions('/workspace')
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return null
}

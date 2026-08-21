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

const discardPlan: BranchWorkspaceGitActionPlan = {
  kind: 'batch-discard',
  token: 'sha256:discard',
  rootId: '/workspace',
  branchWorkspaceId: 'ws-1',
  members: [],
}

const upstreamPlan: BranchWorkspaceGitActionPlan = {
  kind: 'batch-set-upstream',
  token: 'sha256:upstream',
  rootId: '/workspace',
  branchWorkspaceId: 'ws-1',
  ready: true,
  members: [],
}

function syncPlan(kind: 'pull' | 'push'): BranchWorkspaceGitActionPlan {
  return {
    kind,
    token: `sha256:${kind}`,
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    ready: true,
    members: [
      {
        repositoryName: 'api',
        repoId: '/workspace/api',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/goblin-feature-a/api',
        targetHead: 'target-head',
        upstream: 'origin/feature/a',
        trackingGone: false,
        ready: true,
        fingerprint: 'sha256:api',
      },
    ],
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

  test.each(['pull', 'push'] as const)('plans and executes selected coordinated %s members', async (kind) => {
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
    await act(async () => state!.executeSync(kind, ['api']))

    expect(state!.plan).toEqual(expectedPlan)
    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      kind,
      planToken: expectedPlan.token,
      repositoryNames: ['api'],
    })
  })

  test('plans and executes batch discard with only the server-owned plan token', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan: discardPlan })
    mocks.execute.mockResolvedValue({
      ok: true,
      kind: 'batch-discard',
      planToken: discardPlan.token,
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

    await act(async () => state!.requestPlan('batch-discard', 'ws-1'))
    await act(async () => state!.executeBatchDiscard())

    expect(state!.plan).toEqual(discardPlan)
    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      kind: 'batch-discard',
      planToken: discardPlan.token,
    })
  })

  test('executes the batch upstream mappings from the loaded plan', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan: upstreamPlan })
    mocks.execute.mockResolvedValue({
      ok: true,
      kind: 'batch-set-upstream',
      planToken: upstreamPlan.token,
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

    await act(async () => state!.requestPlan('batch-set-upstream', 'ws-1'))
    await act(async () =>
      state!.executeBatchSetUpstream([{ repositoryName: 'api', action: 'set', remoteRef: 'origin/release' }]),
    )

    expect(mocks.execute).toHaveBeenCalledWith('/workspace', {
      kind: 'batch-set-upstream',
      planToken: 'sha256:upstream',
      upstreams: [{ repositoryName: 'api', action: 'set', remoteRef: 'origin/release' }],
    })
  })

  test('batch commits, requests a fresh push plan, then executes that push plan', async () => {
    const pushPlan = syncPlan('push')
    const calls: string[] = []
    mocks.plan.mockImplementation(async (_rootId, request) => {
      calls.push(`plan:${request.kind}`)
      return { ok: true, plan: request.kind === 'batch-commit' ? plan : pushPlan }
    })
    mocks.execute.mockImplementation(async (_rootId, input) => {
      calls.push(`execute:${input.kind}`)
      return {
        ok: true,
        kind: input.kind,
        planToken: input.planToken,
        branchWorkspaceId: 'ws-1',
        members: [],
      }
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
    await act(async () => state!.executeBatchCommitAndPush([]))

    expect(calls).toEqual(['plan:batch-commit', 'execute:batch-commit', 'plan:push', 'execute:push'])
    expect(state!.plan).toEqual(pushPlan)
    expect(state!.result).toMatchObject({ ok: true, kind: 'push', planToken: pushPlan.token })
  })

  test('stops automatic batch flow when commit fails', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue({
      ok: false,
      kind: 'batch-commit',
      planToken: plan.token,
      branchWorkspaceId: 'ws-1',
      members: [],
      message: 'commit failed',
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
    mocks.plan.mockClear()
    await act(async () => state!.executeBatchCommitAndPush([]))

    expect(mocks.plan).not.toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(state!.error).toBe('commit failed')
  })

  test('keeps a failed fresh push plan visible without executing push', async () => {
    mocks.plan
      .mockResolvedValueOnce({ ok: true, plan })
      .mockResolvedValueOnce({ ok: false, message: 'push planning failed' })
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
    await act(async () => state!.executeBatchCommitAndPush([]))

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(state!.plan).toBeNull()
    expect(state!.error).toBe('push planning failed')
  })

  test('stops after planning when the fresh push plan is not ready', async () => {
    const pushPlan: BranchWorkspaceGitActionPlan = {
      kind: 'push',
      token: 'sha256:push-unready',
      rootId: '/workspace',
      branchWorkspaceId: 'ws-1',
      ready: false,
      members: [
        {
          repositoryName: 'api',
          repoId: '/workspace/api',
          targetBranch: 'feature/a',
          targetWorktreePath: '/workspace/goblin-feature-a/api',
          targetHead: 'target-head',
          upstream: null,
          trackingGone: false,
          ready: false,
          message: 'workspace.branch-workspace.git-action.remote-required',
          fingerprint: 'sha256:api',
        },
      ],
    }
    mocks.plan.mockResolvedValueOnce({ ok: true, plan }).mockResolvedValueOnce({ ok: true, plan: pushPlan })
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
    await act(async () => state!.executeBatchCommitAndPush([]))

    expect(mocks.execute).toHaveBeenCalledTimes(1)
    expect(state!.plan).toEqual(pushPlan)
    expect(state!.error).toBe('workspace.branch-workspace.git-action.remote-required')
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useBranchWorkspaceGitActions>) => void }) {
  const value = useBranchWorkspaceGitActions('/workspace')
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return null
}

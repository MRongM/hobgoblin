// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useWorkspaceWorktreeActions } from '#/web/hooks/useWorkspaceWorktreeActions.ts'
import type { WorkspaceWorktreePlan } from '#/shared/workspace-worktrees.ts'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  execute: vi.fn(),
  abort: vi.fn(),
}))

vi.mock('#/web/workspace-client.ts', () => ({
  planWorkspaceWorktree: mocks.plan,
  executeWorkspaceWorktree: mocks.execute,
  abortWorkspaceWorktree: mocks.abort,
}))

const plan: WorkspaceWorktreePlan = {
  token: 'sha256:plan',
  rootId: '/workspace',
  operation: 'create',
  branch: 'feature/a',
  members: [
    {
      repoId: '/workspace/api',
      branch: 'feature/a',
      baseRef: 'main',
      worktreePath: '/workspace/api-feature-a',
      worktreeBootstrap: { kind: 'skip' },
    },
  ],
}

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useWorkspaceWorktreeActions', () => {
  test('loads a plan, confirms it, retains partial results, retries, and cancels', async () => {
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute
      .mockResolvedValueOnce({
        ok: false,
        planToken: plan.token,
        operation: 'create',
        branch: 'feature/a',
        members: [{ repoId: '/workspace/api', phase: 'failed', message: 'busy' }],
        message: 'busy',
      })
      .mockResolvedValueOnce({
        ok: true,
        planToken: plan.token,
        operation: 'create',
        branch: 'feature/a',
        members: [{ repoId: '/workspace/api', phase: 'succeeded' }],
      })
    mocks.abort.mockResolvedValue({ ok: true })
    let state: ReturnType<typeof useWorkspaceWorktreeActions> | null = null
    await act(async () => root!.render(<Harness onReady={(value) => (state = value)} />))

    await act(async () => state!.requestCreate('feature/a', 'main'))
    expect(state!.plan).toEqual(plan)
    await act(async () => state!.confirm())
    expect(state!.result?.members[0]?.phase).toBe('failed')
    await act(async () => state!.retry())
    expect(state!.result?.ok).toBe(true)
    await act(async () => state!.cancel())

    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.abort).toHaveBeenCalledWith('/workspace')
    expect(mocks.plan).toHaveBeenCalledWith('/workspace', {
      operation: 'create',
      branch: 'feature/a',
      baseBranch: 'main',
    })
  })

  test('refreshes a stale plan instead of executing stale intent again', async () => {
    const refreshed = { ...plan, token: 'sha256:refreshed' }
    mocks.plan.mockResolvedValueOnce({ ok: true, plan }).mockResolvedValueOnce({ ok: true, plan: refreshed })
    mocks.execute.mockResolvedValue({
      ok: false,
      planToken: plan.token,
      operation: 'create',
      branch: 'feature/a',
      members: [],
      message: 'workspace.worktree.plan-stale',
    })
    let state: ReturnType<typeof useWorkspaceWorktreeActions> | null = null
    await act(async () => root!.render(<Harness onReady={(value) => (state = value)} />))

    await act(async () => state!.requestCreate('feature/a', 'main'))
    await act(async () => state!.confirm())

    expect(state!.plan?.token).toBe('sha256:refreshed')
    expect(mocks.plan).toHaveBeenCalledTimes(2)
  })

  test('loads a branchless pull plan', async () => {
    const pullPlan: WorkspaceWorktreePlan = { ...plan, operation: 'pull', branch: '' }
    mocks.plan.mockResolvedValue({ ok: true, plan: pullPlan })
    let state: ReturnType<typeof useWorkspaceWorktreeActions> | null = null
    await act(async () => root!.render(<Harness onReady={(value) => (state = value)} />))

    await act(async () => state!.requestPull())

    expect(mocks.plan).toHaveBeenCalledWith('/workspace', { operation: 'pull' })
    expect(state!.plan).toEqual(pullPlan)
  })

  test('loads removal branch cleanup options as one plan request', async () => {
    const removePlan: WorkspaceWorktreePlan = {
      ...plan,
      operation: 'remove',
      removalOptions: { alsoDeleteBranch: true, alsoDeleteUpstream: true },
    }
    mocks.plan.mockResolvedValue({ ok: true, plan: removePlan })
    let state: ReturnType<typeof useWorkspaceWorktreeActions> | null = null
    await act(async () => root!.render(<Harness onReady={(value) => (state = value)} />))

    await act(async () => state!.requestRemove('feature/a', true, true))

    expect(mocks.plan).toHaveBeenCalledWith('/workspace', {
      operation: 'remove',
      branch: 'feature/a',
      alsoDeleteBranch: true,
      alsoDeleteUpstream: true,
    })
  })

  test('returns a successful batch result even when best-effort refresh fails', async () => {
    const success = {
      ok: true,
      planToken: plan.token,
      operation: 'create' as const,
      branch: plan.branch,
      members: [{ repoId: '/workspace/api', phase: 'succeeded' as const }],
    }
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue(success)
    const onSettled = vi.fn(async () => {
      throw new Error('refresh failed')
    })
    let state: ReturnType<typeof useWorkspaceWorktreeActions> | null = null
    await act(async () => root!.render(<Harness onReady={(value) => (state = value)} onSettled={onSettled} />))

    await act(async () => state!.requestCreate('feature/a', 'main'))
    let result
    await act(async () => {
      result = await state!.confirm()
    })

    expect(result).toEqual(success)
    expect(state!.result).toEqual(success)
    expect(onSettled).toHaveBeenCalledWith(success)
  })
})

function Harness({
  onReady,
  onSettled,
}: {
  onReady: (value: ReturnType<typeof useWorkspaceWorktreeActions>) => void
  onSettled?: Parameters<typeof useWorkspaceWorktreeActions>[1]
}) {
  const value = useWorkspaceWorktreeActions('/workspace', onSettled)
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return null
}

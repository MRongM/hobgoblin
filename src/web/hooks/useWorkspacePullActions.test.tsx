// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorkspacePullPlan, WorkspacePullResult } from '#/shared/workspace-pull.ts'
import { useWorkspacePullActions } from '#/web/hooks/useWorkspacePullActions.ts'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  execute: vi.fn(),
  abort: vi.fn(),
}))

vi.mock('#/web/workspace-client.ts', () => ({
  planWorkspacePull: mocks.plan,
  executeWorkspacePull: mocks.execute,
  abortWorkspacePull: mocks.abort,
}))

const plan: WorkspacePullPlan = {
  token: 'sha256:pull',
  rootId: '/workspace',
  members: [{ repoId: '/workspace/api', branch: 'main', worktreePath: '/workspace/api' }],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useWorkspacePullActions', () => {
  test('plans, retains a partial result, retries, and cancels', async () => {
    const partial: WorkspacePullResult = {
      ok: false,
      planToken: plan.token,
      members: [{ repoId: '/workspace/api', phase: 'failed', message: 'busy' }],
      message: 'busy',
    }
    const success: WorkspacePullResult = {
      ok: true,
      planToken: plan.token,
      members: [{ repoId: '/workspace/api', phase: 'succeeded' }],
    }
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValueOnce(partial).mockResolvedValueOnce(success)
    mocks.abort.mockResolvedValue({ ok: true })
    const onSettled = vi.fn(async () => {})
    let state: ReturnType<typeof useWorkspacePullActions> | null = null
    await act(async () => root.render(<Harness onReady={(value) => (state = value)} onSettled={onSettled} />))

    await act(async () => state!.requestPlan())
    await act(async () => state!.confirm())
    expect(state!.result).toEqual(partial)
    await act(async () => state!.retry())
    expect(state!.result).toEqual(success)
    await act(async () => state!.cancel())

    expect(mocks.plan).toHaveBeenCalledWith('/workspace')
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute).toHaveBeenCalledWith('/workspace', { planToken: plan.token })
    expect(mocks.abort).toHaveBeenCalledWith('/workspace')
    expect(onSettled).toHaveBeenCalledTimes(2)
  })

  test('replaces a stale plan and does not report it as a completed pull', async () => {
    const refreshed = { ...plan, token: 'sha256:refreshed' }
    mocks.plan.mockResolvedValueOnce({ ok: true, plan }).mockResolvedValueOnce({ ok: true, plan: refreshed })
    mocks.execute.mockResolvedValue({
      ok: false,
      planToken: plan.token,
      members: [],
      message: 'workspace.pull.plan-stale',
    } satisfies WorkspacePullResult)
    const onSettled = vi.fn()
    let state: ReturnType<typeof useWorkspacePullActions> | null = null
    await act(async () => root.render(<Harness onReady={(value) => (state = value)} onSettled={onSettled} />))

    await act(async () => state!.requestPlan())
    await act(async () => state!.confirm())

    expect(state!.plan).toEqual(refreshed)
    expect(state!.result).toBeNull()
    expect(mocks.plan).toHaveBeenCalledTimes(2)
    expect(onSettled).not.toHaveBeenCalled()
  })

  test('keeps a successful result when best-effort refresh fails', async () => {
    const success: WorkspacePullResult = {
      ok: true,
      planToken: plan.token,
      members: [{ repoId: '/workspace/api', phase: 'succeeded' }],
    }
    mocks.plan.mockResolvedValue({ ok: true, plan })
    mocks.execute.mockResolvedValue(success)
    const onSettled = vi.fn(async () => {
      throw new Error('refresh failed')
    })
    let state: ReturnType<typeof useWorkspacePullActions> | null = null
    await act(async () => root.render(<Harness onReady={(value) => (state = value)} onSettled={onSettled} />))

    await act(async () => state!.requestPlan())
    let result: WorkspacePullResult | null = null
    await act(async () => {
      result = await state!.confirm()
    })

    expect(result).toEqual(success)
    expect(state!.result).toEqual(success)
  })
})

function Harness({
  onReady,
  onSettled,
}: {
  onReady: (value: ReturnType<typeof useWorkspacePullActions>) => void
  onSettled?: Parameters<typeof useWorkspacePullActions>[1]
}) {
  const value = useWorkspacePullActions('/workspace', onSettled)
  useEffect(() => {
    onReady(value)
  }, [onReady, value])
  return null
}

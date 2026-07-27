import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import {
  branchWorkspaceQueryKey,
  branchWorkspaceQueryOptions,
  refreshBranchWorkspaceQuery,
} from '#/web/branch-workspace-queries.ts'

const mocks = vi.hoisted(() => ({
  readBranchWorkspaces: vi.fn(),
}))

vi.mock('#/web/workspace-client.ts', () => ({
  readBranchWorkspaces: mocks.readBranchWorkspaces,
}))

const ROOT = '/workspace'
const REMOTE_ROOT = 'ssh-config://prod/srv/workspace'

beforeEach(() => {
  mocks.readBranchWorkspaces.mockReset()
})

describe('branch workspace query cache', () => {
  test('reuses an SSH workspace snapshot for one minute', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const queryClient = new QueryClient()
    const current = successfulRead([], REMOTE_ROOT)
    mocks.readBranchWorkspaces.mockResolvedValue(current)

    try {
      await queryClient.fetchQuery(branchWorkspaceQueryOptions(REMOTE_ROOT))
      vi.advanceTimersByTime(59_999)
      await queryClient.fetchQuery(branchWorkspaceQueryOptions(REMOTE_ROOT))

      expect(mocks.readBranchWorkspaces).toHaveBeenCalledTimes(1)
    } finally {
      queryClient.clear()
      vi.useRealTimers()
    }
  })

  test('preserves the last successful snapshot when an automatic refetch reports a failure', async () => {
    const queryClient = new QueryClient()
    const current = successfulRead(['docs'])
    const failure = { ok: false as const, message: 'workspace.branch-workspace.read-failed' }
    mocks.readBranchWorkspaces.mockResolvedValueOnce(current).mockResolvedValueOnce(failure)

    try {
      await queryClient.fetchQuery(branchWorkspaceQueryOptions(ROOT))
      await queryClient.fetchQuery(branchWorkspaceQueryOptions(ROOT))

      expect(mocks.readBranchWorkspaces).toHaveBeenCalledTimes(2)
      expect(queryClient.getQueryData(branchWorkspaceQueryKey(ROOT))).toBe(current)
    } finally {
      queryClient.clear()
    }
  })
})

describe('manual branch workspace query refresh', () => {
  test('replaces the cached snapshot after a successful read', async () => {
    const queryClient = new QueryClient()
    const current = successfulRead(['docs'])
    const refreshed = successfulRead(['AGENTS.md'])
    queryClient.setQueryData(branchWorkspaceQueryKey(ROOT), current)
    mocks.readBranchWorkspaces.mockResolvedValue(refreshed)

    await expect(refreshBranchWorkspaceQuery(queryClient, ROOT)).resolves.toBe(refreshed)

    expect(mocks.readBranchWorkspaces).toHaveBeenCalledWith(ROOT)
    expect(queryClient.getQueryData(branchWorkspaceQueryKey(ROOT))).toEqual(refreshed)
  })

  test('preserves the last successful snapshot when the read reports a failure', async () => {
    const queryClient = new QueryClient()
    const current = successfulRead(['docs'])
    const failure = { ok: false as const, message: 'workspace.branch-workspace.read-failed' }
    queryClient.setQueryData(branchWorkspaceQueryKey(ROOT), current)
    mocks.readBranchWorkspaces.mockResolvedValue(failure)

    await expect(refreshBranchWorkspaceQuery(queryClient, ROOT)).resolves.toBe(failure)

    expect(queryClient.getQueryData(branchWorkspaceQueryKey(ROOT))).toBe(current)
  })
})

function successfulRead(names: string[], rootId = ROOT): Extract<BranchWorkspaceReadResult, { ok: true }> {
  return {
    ok: true,
    rootId,
    items: [],
    auxiliaryCandidates: names.map((name) => ({
      name,
      path: `${rootId}/${name}`,
      kind: 'file',
      outsideRoot: false,
    })),
  }
}

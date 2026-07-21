import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import { branchWorkspaceQueryKey, refreshBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'

const mocks = vi.hoisted(() => ({
  readBranchWorkspaces: vi.fn(),
}))

vi.mock('#/web/workspace-client.ts', () => ({
  readBranchWorkspaces: mocks.readBranchWorkspaces,
}))

const ROOT = '/workspace'

describe('manual branch workspace query refresh', () => {
  beforeEach(() => {
    mocks.readBranchWorkspaces.mockReset()
  })

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

function successfulRead(names: string[]): Extract<BranchWorkspaceReadResult, { ok: true }> {
  return {
    ok: true,
    rootId: ROOT,
    items: [],
    auxiliaryCandidates: names.map((name) => ({
      name,
      path: `${ROOT}/${name}`,
      kind: 'file',
      outsideRoot: false,
    })),
  }
}

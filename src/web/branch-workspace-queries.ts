import { useCallback, useEffect } from 'react'
import { queryOptions, replaceEqualDeep, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { readBranchWorkspaces } from '#/web/workspace-client.ts'
import { subscribeBranchWorkspaceInvalidation } from '#/web/branch-workspace-invalidation.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'

export { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'

const REMOTE_BRANCH_WORKSPACE_CACHE_TTL_MS = 60_000

export function branchWorkspaceQueryOptions(rootId: string) {
  return queryOptions<BranchWorkspaceReadResult>({
    queryKey: branchWorkspaceQueryKey(rootId),
    queryFn: ({ signal }) => readBranchWorkspaces(rootId, signal),
    enabled: rootId.length > 0,
    staleTime: isRemoteRepoId(rootId) ? REMOTE_BRANCH_WORKSPACE_CACHE_TTL_MS : 0,
    gcTime: 5 * 60_000,
    structuralSharing: (previous, current) => {
      const previousResult = previous as BranchWorkspaceReadResult | undefined
      const currentResult = current as BranchWorkspaceReadResult
      return previousResult?.ok && !currentResult.ok ? previousResult : replaceEqualDeep(previous, current)
    },
  })
}

export function useBranchWorkspaceQuery(rootId: string) {
  const queryClient = useQueryClient()
  const query = useQuery(branchWorkspaceQueryOptions(rootId))
  const refresh = useCallback(async () => await refreshBranchWorkspaceQuery(queryClient, rootId), [queryClient, rootId])
  return { ...query, refresh }
}

export async function refreshBranchWorkspaceQuery(
  queryClient: QueryClient,
  rootId: string,
): Promise<BranchWorkspaceReadResult> {
  const result = await readBranchWorkspaces(rootId)
  if (result.ok) queryClient.setQueryData(branchWorkspaceQueryKey(rootId), result)
  return result
}

export function useBranchWorkspaceInvalidationSync(): void {
  const queryClient = useQueryClient()
  useEffect(() => subscribeBranchWorkspaceInvalidation(queryClient), [queryClient])
}

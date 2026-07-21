import { useEffect } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import { readBranchWorkspaces } from '#/web/workspace-client.ts'
import { subscribeBranchWorkspaceInvalidation } from '#/web/branch-workspace-invalidation.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'

export { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'

export function branchWorkspaceQueryOptions(rootId: string) {
  return queryOptions<BranchWorkspaceReadResult>({
    queryKey: branchWorkspaceQueryKey(rootId),
    queryFn: ({ signal }) => readBranchWorkspaces(rootId, signal),
    enabled: rootId.length > 0,
    staleTime: 0,
    gcTime: 5 * 60_000,
  })
}

export function useBranchWorkspaceQuery(rootId: string) {
  return useQuery(branchWorkspaceQueryOptions(rootId))
}

export function useBranchWorkspaceInvalidationSync(): void {
  const queryClient = useQueryClient()
  useEffect(() => subscribeBranchWorkspaceInvalidation(queryClient), [queryClient])
}

import { isWorkspaceInvalidationEvent } from '#/shared/server-invalidation.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import { subscribeServerInvalidationIngress } from '#/web/server-invalidation-ingress.ts'

interface BranchWorkspaceQueryInvalidator {
  invalidateQueries(input: { queryKey: readonly unknown[]; exact: true }): unknown
}

export function subscribeBranchWorkspaceInvalidation(queryClient: BranchWorkspaceQueryInvalidator): () => void {
  return subscribeServerInvalidationIngress((event) => {
    if (!isWorkspaceInvalidationEvent(event)) return
    void queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(event.rootId), exact: true })
  })
}

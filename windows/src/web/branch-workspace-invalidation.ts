import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'
import {
  isBranchWorkspaceOperationUpdatedEvent,
  isWorkspaceInvalidationEvent,
} from '#/shared/server-invalidation.ts'
import { branchWorkspaceQueryKey } from '#/web/branch-workspace-query-cache.ts'
import { subscribeServerInvalidationIngress } from '#/web/server-invalidation-ingress.ts'
import { shouldSuppressRepoInvalidationSource } from '#/web/stores/repos/invalidation-sources.ts'

interface BranchWorkspaceQueryInvalidator {
  invalidateQueries(input: { queryKey: readonly unknown[]; exact: true }): unknown
  setQueryData(
    queryKey: readonly unknown[],
    updater: (current: BranchWorkspaceReadResult | undefined) => BranchWorkspaceReadResult | undefined,
  ): unknown
}

export function subscribeBranchWorkspaceInvalidation(queryClient: BranchWorkspaceQueryInvalidator): () => void {
  return subscribeServerInvalidationIngress((event) => {
    if (isBranchWorkspaceOperationUpdatedEvent(event)) {
      queryClient.setQueryData(branchWorkspaceQueryKey(event.rootId), (current) => {
        if (!current?.ok || current.rootId !== event.rootId) return current
        const itemIndex = current.items.findIndex((item) => item.id === event.branchWorkspaceId)
        if (itemIndex < 0) return current
        const item = current.items[itemIndex]
        if (!item) return current
        const nextItem = event.operation
          ? { ...item, activeOperation: event.operation }
          : removeActiveOperation(item)
        return {
          ...current,
          items: current.items.map((candidate, index) => (index === itemIndex ? nextItem : candidate)),
        }
      })
      return
    }
    if (!isWorkspaceInvalidationEvent(event)) return
    if (shouldSuppressRepoInvalidationSource(event.sourceToken)) return
    void queryClient.invalidateQueries({ queryKey: branchWorkspaceQueryKey(event.rootId), exact: true })
  })
}

function removeActiveOperation(
  item: Extract<BranchWorkspaceReadResult, { ok: true }>['items'][number],
): Extract<BranchWorkspaceReadResult, { ok: true }>['items'][number] {
  if (!('activeOperation' in item)) return item
  const { activeOperation: _activeOperation, ...rest } = item
  return rest
}

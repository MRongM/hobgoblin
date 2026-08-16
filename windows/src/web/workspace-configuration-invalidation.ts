import { useEffect } from 'react'
import { isWorkspaceConfigurationInvalidationEvent } from '#/shared/server-invalidation.ts'
import { subscribeServerInvalidationIngress } from '#/web/server-invalidation-ingress.ts'
import { shouldSuppressRepoInvalidationSource } from '#/web/stores/repos/invalidation-sources.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

export function subscribeWorkspaceConfigurationInvalidation(): () => void {
  return subscribeServerInvalidationIngress((event) => {
    if (!isWorkspaceConfigurationInvalidationEvent(event)) return
    if (shouldSuppressRepoInvalidationSource(event.sourceToken)) return
    const state = useReposStore.getState()
    if (state.repos[event.rootId]?.isGitRepo !== false) return
    void state.rescanWorkspace(event.rootId)
  })
}

export function useWorkspaceConfigurationInvalidationSync(): void {
  useEffect(() => subscribeWorkspaceConfigurationInvalidation(), [])
}

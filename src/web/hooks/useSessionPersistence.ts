import { useEffect, useRef } from 'react'
import { persistSessionState } from '#/web/settings-write-paths.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { restorableWorkspaceStateFromStore } from '#/web/stores/repos/selector-state.ts'
import { sessionStateFromRestorableWorkspaceState } from '#/web/restorable-workspace-state.ts'
import { useTerminalStashStore } from '#/web/components/terminal/terminal-stash-store.ts'
const SESSION_SAVE_DEBOUNCE_MS = 200

export function useSessionPersistence() {
  const activeId = useReposStore((s) => s.activeId)
  const activeProjectId = useReposStore((s) => s.activeProjectId)
  const order = useReposStore((s) => s.order)
  const workspaceActiveContextByRoot = useReposStore((s) => s.workspaceActiveContextByRoot)
  const workspaceRepositoryListExpandedByRoot = useReposStore((s) => s.workspaceRepositoryListExpandedByRoot)
  const workspaceRepositoryListHeightByRoot = useReposStore((s) => s.workspaceRepositoryListHeightByRoot)
  const projectListExpanded = useReposStore((s) => s.projectListExpanded)
  const detailCollapsed = useReposStore((s) => s.detailCollapsed)
  const detailFocusMode = useReposStore((s) => s.detailFocusMode)
  const workspaceLayout = useReposStore((s) =>
    s.activeId ? (s.repos[s.activeId]?.ui.workspaceLayout ?? s.workspaceLayout) : s.workspaceLayout,
  )
  const detailPaneSizes = useReposStore((s) => s.detailPaneSizes)
  const fileTreePaneSizes = useReposStore((s) => s.fileTreePaneSizes)
  const selectedTerminalByWorktree = useReposStore((s) => s.selectedTerminalByWorktree)
  const stashedTerminals = useTerminalStashStore((s) => s.stashedTerminals)
  const sessionReady = useReposStore((s) => s.sessionReady)
  const repos = useReposStore((s) => s.repos)
  const lastSavedRef = useRef<string | null>(null)
  const lastImmediateKeyRef = useRef<string | null>(null)

  useEffect(() => {
    // Renderer -> persistence only. Boot restore runs elsewhere first, and
    // sessionReady gates this effect so we never overwrite restorable session
    // state with an empty pre-bootstrap workspace.
    if (!sessionReady) return
    const restorableWorkspaceState = restorableWorkspaceStateFromStore({
      repos,
      order,
      activeId,
      activeProjectId,
      workspaceActiveContextByRoot,
      workspaceRepositoryListExpandedByRoot,
      workspaceRepositoryListHeightByRoot,
      projectListExpanded,
      detailCollapsed,
      detailFocusMode,
      workspaceLayout,
      detailPaneSizes,
      fileTreePaneSizes,
      selectedTerminalByWorktree,
    })
    const session = sessionStateFromRestorableWorkspaceState({
      repos,
      restorableWorkspaceState,
    })
    if (Object.keys(stashedTerminals).length > 0) session.stashedTerminals = stashedTerminals
    const serialized = JSON.stringify(session)
    const immediateKey = JSON.stringify({
      openRepos: session.openRepos,
      activeRepo: session.activeRepo,
      activeProject: session.activeProject,
      workspaceActiveContextByRoot: session.workspaceActiveContextByRoot,
      workspaceRepositoryListExpandedByRoot: session.workspaceRepositoryListExpandedByRoot,
      projectListExpanded,
      detailCollapsed,
      detailFocusMode,
      workspaceLayout: restorableWorkspaceState.workspaceLayout,
      selectedTerminalByWorktree: session.selectedTerminalByWorktree,
      stashedTerminals,
    })
    const immediate = lastImmediateKeyRef.current !== immediateKey
    lastImmediateKeyRef.current = immediateKey
    if (lastSavedRef.current === serialized) return
    const save = () => {
      lastSavedRef.current = serialized
      void persistSessionState(session).catch((err) => {
        lastSavedRef.current = null
        console.warn('[session] save failed', err)
      })
    }
    if (immediate) {
      save()
      return
    }
    const timeout = window.setTimeout(save, SESSION_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [
    sessionReady,
    order,
    activeId,
    activeProjectId,
    workspaceActiveContextByRoot,
    workspaceRepositoryListExpandedByRoot,
    workspaceRepositoryListHeightByRoot,
    projectListExpanded,
    detailCollapsed,
    detailFocusMode,
    detailPaneSizes,
    fileTreePaneSizes,
    selectedTerminalByWorktree,
    stashedTerminals,
    repos,
  ])
}

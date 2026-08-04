import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'

import type { TerminalSessionSnapshot, TerminalSessionSummary } from '#/shared/terminal.ts'
import '#/web/components/terminal/terminal-session.css'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { terminalBridge } from '#/web/terminal.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import { readOrCreateWebTerminalAttachmentId } from '#/web/renderer-terminal-bridge.ts'
import { mainWindowQueryClient } from '#/web/main-window-queries.ts'
import { terminalSessionsQueryKey, terminalSessionsQueryOptions } from '#/web/terminal-session-queries.ts'
import { TerminalSessionRegistry } from '#/web/components/terminal/TerminalSessionRegistry.ts'
import { notifyTerminalOutputCompletion } from '#/web/components/terminal/terminal-output-completion-controller.ts'
import { setTerminalSessionCommandBridge } from '#/web/components/terminal/terminal-session-command-bridge.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import {
  repoIndexEqual,
  repoIndexFromRepos,
  repoIndexWithBranchWorkspaces,
} from '#/web/components/terminal/terminal-repo-index.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'
import { activeWorkspaceRootId } from '#/web/stores/repos/workspace-projects.ts'
import { RepoSyncTracker } from '#/web/components/terminal/repo-sync-tracker.ts'
import { useRuntimeTerminalSettings } from '#/web/runtime-settings-terminal-buttons.ts'
import type { TerminalSessionContextValue, TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'

interface TerminalSessionProviderProps {
  currentRepoId: string | null
  children: ReactNode
  /** @internal For tests only. */
  syncTracker?: RepoSyncTracker
}

const EMPTY_BRANCH_WORKSPACES = [] as const

export function TerminalSessionProvider({
  currentRepoId,
  children,
  syncTracker: syncTrackerProp,
}: TerminalSessionProviderProps) {
  const baseRepoIndex = useStoreWithEqualityFn(useReposStore, (s) => repoIndexFromRepos(s.repos), repoIndexEqual)
  const workspaceRootId = useReposStore(activeWorkspaceRootId)
  const branchWorkspaceQuery = useBranchWorkspaceQuery(workspaceRootId ?? '')
  const branchWorkspaces = branchWorkspaceQuery.data?.ok ? branchWorkspaceQuery.data.items : EMPTY_BRANCH_WORKSPACES
  const repoIndex = useMemo(
    () => repoIndexWithBranchWorkspaces(baseRepoIndex, branchWorkspaces),
    [baseRepoIndex, branchWorkspaces],
  )
  const { terminalFontSize, terminalThemeSyncEnabled = true } = useRuntimeTerminalSettings()
  const terminalThemeMode = terminalThemeSyncEnabled ? 'theme' : 'classic'
  const currentRepoInstanceToken = currentRepoId ? (repoIndex[currentRepoId]?.instanceToken ?? null) : null
  const currentRepoTerminalPaths = currentRepoId ? (repoIndex[currentRepoId]?.branchByWorktreePath ?? null) : null
  const selectedTerminalByWorktree = useReposStore((s) => s.selectedTerminalByWorktree)
  const selectedBranchName = useReposStore(
    useCallback((s) => (currentRepoId ? (s.repos[currentRepoId]?.ui.selectedBranch ?? null) : null), [currentRepoId]),
  )
  const selectedTerminalWorktreeKey = useReposStore(
    useCallback(
      (s) => {
        if (!currentRepoId) return null
        const repo = s.repos[currentRepoId]
        if (!repo) return null
        const branch = repo.data.branches.find((candidate) => candidate.name === repo.ui.selectedBranch)
        const worktreePath = branch?.worktree?.path
        return worktreePath ? worktreeTerminalKey(repo.id, worktreePath) : null
      },
      [currentRepoId],
    ),
  )
  const terminalDetailVisible = useReposStore(
    useCallback((s) => !!currentRepoId && s.repos[currentRepoId]?.ui.detailTab === 'terminal', [currentRepoId]),
  )
  const setSelectedTerminal = useReposStore((s) => s.setSelectedTerminal)
  const setDetailTab = useReposStore((s) => s.setDetailTab)
  const dismissExitedTerminalDetail = useReposStore((s) => s.dismissExitedTerminalDetail)
  const parkingRootRef = useRef<HTMLDivElement | null>(null)
  const currentRepoIdRef = useRef(currentRepoId)
  currentRepoIdRef.current = currentRepoId
  const previousCurrentRepoIdRef = useRef<string | null>(null)
  const previousSelectedBranchRef = useRef<{ repoRoot: string | null; branch: string | null }>({
    repoRoot: null,
    branch: null,
  })
  const repoIndexRef = useRef(repoIndex)
  repoIndexRef.current = repoIndex

  const syncTrackerRef = useRef(syncTrackerProp ?? new RepoSyncTracker())
  const syncTracker = syncTrackerRef.current

  const registryRef = useRef<TerminalSessionRegistry | null>(null)
  if (!registryRef.current) {
    registryRef.current = new TerminalSessionRegistry(
      setSelectedTerminal,
      (repoRoot, worktreePath) => dismissExitedTerminalDetail(repoRoot, worktreePath),
      notifyTerminalOutputCompletion,
    )
  }
  const registry = registryRef.current

  const loadMissingSnapshots = useCallback(
    async (serverSessions: TerminalSessionSummary[]): Promise<Map<string, TerminalSessionSnapshot>> => {
      const snapshotEntries = await Promise.all(
        serverSessions.map(async (session) => {
          try {
            const snapshot = await terminalBridge.getSessionSnapshot({ sessionId: session.sessionId })
            return snapshot ? ([session.sessionId, snapshot] as const) : null
          } catch (err) {
            console.debug('[TerminalSessionProvider] failed to load terminal session snapshot:', err)
            return null
          }
        }),
      )
      return new Map(snapshotEntries.filter((entry) => entry !== null))
    },
    [registry],
  )

  const syncServerSessions = useCallback(
    async (repoRoot: string) => {
      if (!repoRoot || !repoIndexRef.current[repoRoot]) return
      try {
        const attachmentId = readOrCreateWebTerminalAttachmentId()
        const serverSessions = await mainWindowQueryClient.fetchQuery(terminalSessionsQueryOptions(repoRoot))
        const snapshotsBySessionId = await loadMissingSnapshots(serverSessions)
        if (!repoIndexRef.current[repoRoot]) return
        registry.reconcileServerSessions(repoRoot, serverSessions, attachmentId, snapshotsBySessionId)
      } catch (err) {
        console.debug('[TerminalSessionProvider] failed to sync server sessions:', err)
      } finally {
        const instanceToken = repoIndexRef.current[repoRoot]?.instanceToken
        if (typeof instanceToken === 'number') {
          syncTracker.markReady(repoRoot, instanceToken)
        }
      }
    },
    [loadMissingSnapshots, registry, syncTracker],
  )

  // Registry state sync
  useEffect(() => {
    registry.setRepoIndex(repoIndex)
    registry.setPreferredSelectedTerminalKeys(selectedTerminalByWorktree)
  }, [registry, repoIndex, selectedTerminalByWorktree])

  useEffect(() => {
    const previous = previousSelectedBranchRef.current
    previousSelectedBranchRef.current = {
      repoRoot: currentRepoId,
      branch: selectedBranchName,
    }
    if (!currentRepoId || !selectedBranchName || !selectedTerminalWorktreeKey) return
    if (previous.repoRoot !== currentRepoId) return
    if (!previous.branch || previous.branch === selectedBranchName) return
    if (!registry.focusSelectedTerminalForWorktree(selectedTerminalWorktreeKey)) return
    if (!terminalDetailVisible) setDetailTab(currentRepoId, 'terminal')
  }, [currentRepoId, registry, selectedBranchName, selectedTerminalWorktreeKey, setDetailTab, terminalDetailVisible])

  // Parking DOM
  useEffect(() => {
    registry.setParkingRoot(parkingRootRef.current)
  })

  // Font settings
  useEffect(() => {
    registry.setFontSize(terminalFontSize)
  }, [registry, terminalFontSize])

  // Terminal theme settings
  useEffect(() => {
    registry.setTerminalThemeMode(terminalThemeMode)
  }, [registry, terminalThemeMode])

  // Registry lifecycle (event listeners + bridge + destroy)
  useEffect(() => {
    const offOutput = terminalBridge.onOutput((event) => {
      registry.handleOutput(event)
    })
    const offTitle = terminalBridge.onTitle((event) => {
      registry.handleServerTitle(event)
    })
    const offExit = terminalBridge.onExit((event) => {
      registry.handleExit(event)
    })
    const offOwnership = terminalBridge.onOwnership((event) => {
      registry.handleOwnership(event)
    })

    setTerminalSessionCommandBridge({
      worktreeSnapshot: registry.worktreeSnapshot,
      createTerminal: registry.createTerminal,
      selectTerminal: registry.selectTerminal,
      waitForInputReady: registry.waitForInputReady,
      writeInput: registry.writeInput,
    })

    return () => {
      offOutput()
      offTitle()
      offExit()
      offOwnership()
      registry.destroy()
    }
  }, [registry])

  // Server sync (initial + focus + external session changes)
  useEffect(() => {
    const previousCurrentRepoId = previousCurrentRepoIdRef.current
    previousCurrentRepoIdRef.current = currentRepoId
    if (!currentRepoId) return
    const shouldFocusTerminalAfterSync = previousCurrentRepoId !== null && previousCurrentRepoId !== currentRepoId
    void syncServerSessions(currentRepoId).then(() => {
      if (shouldFocusTerminalAfterSync && currentRepoIdRef.current === currentRepoId) {
        registry.focusRunningTerminalForRepo(currentRepoId)
      }
    })

    const handleFocus = () => {
      if (!currentRepoIdRef.current) return
      const repoRoot = currentRepoIdRef.current
      if (!syncTracker.shouldSync(repoRoot)) return
      void syncServerSessions(repoRoot)
    }
    window.addEventListener('focus', handleFocus)

    const offSessionsChanged = terminalBridge.onSessionsChanged((repoRoot) => {
      void mainWindowQueryClient.invalidateQueries({ queryKey: terminalSessionsQueryKey(repoRoot), exact: true })
      void syncServerSessions(repoRoot)
    })

    return () => {
      window.removeEventListener('focus', handleFocus)
      offSessionsChanged()
    }
  }, [currentRepoId, currentRepoInstanceToken, currentRepoTerminalPaths, registry, syncServerSessions, syncTracker])

  const commandValue = useMemo<TerminalSessionContextValue>(
    () => ({
      createTerminal: registry.createTerminal,
      restoreTmuxSessions: registry.restoreTmuxSessions,
      selectTerminal: registry.selectTerminal,
      scrollToBottom: registry.scrollToBottom,
      focusTerminal: registry.focusTerminal,
      scrollLines: registry.scrollLines,
      scrollByTouch: registry.scrollByTouch,
      clearBell: registry.clearBell,
      closeTerminalAndDismissDetailIfLast: registry.closeTerminalAndDismissDetailIfLast,
      registerWorktreeHost: registry.registerWorktreeHost,
      attach: registry.attach,
      detach: registry.detach,
      restart: registry.restart,
      isTerminalFocusTarget: registry.isTerminalFocusTarget,
      findNext: registry.findNext,
      findPrevious: registry.findPrevious,
      clearSearch: registry.clearSearch,
      writeExtraKey: registry.writeExtraKey,
      writeInput: registry.writeInput,
      takeover: registry.takeover,
      reorderSessions: registry.reorderSessions,
      serialize: registry.serialize,
    }),
    [registry],
  )
  const readValue = useMemo<TerminalSessionReadContextValue>(
    () => ({
      worktreeSnapshot: registry.worktreeSnapshot,
      subscribeWorktree: registry.subscribeWorktree,
      repoSyncReady: (repoRoot: string) => {
        const instanceToken = repoIndex[repoRoot]?.instanceToken
        return syncTracker.isReady(repoRoot, instanceToken)
      },
      subscribeRepoSync: syncTracker.subscribe,
      snapshot: registry.snapshot,
      subscribeSnapshot: registry.subscribeSnapshot,
    }),
    [registry, repoIndex, syncTracker],
  )

  return (
    <TerminalSessionContext.Provider value={commandValue}>
      <TerminalSessionReadContext.Provider value={readValue}>
        {children}
        <div ref={parkingRootRef} className="goblin-terminal-parking" aria-hidden="true" />
      </TerminalSessionReadContext.Provider>
    </TerminalSessionContext.Provider>
  )
}

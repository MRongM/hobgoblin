import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import {
  TerminalSessionReadContext,
  useTerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  WorktreeTerminalSnapshot,
  TerminalSnapshot,
  TerminalDescriptor,
  TerminalSessionSummary,
} from '#/web/components/terminal/types.ts'
import { worktreeTerminalKey as makeWorktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'

const EMPTY_WORKTREE_TERMINAL_SNAPSHOT: WorktreeTerminalSnapshot = {
  worktreeTerminalKey: '',
  selectedDescriptor: null,
  sessions: [],
  count: 0,
}

const EMPTY_TERMINAL_SNAPSHOT: TerminalSnapshot = { phase: 'opening', message: null, processName: 'terminal' }

function hasTerminalBell(snapshot: WorktreeTerminalSnapshot): boolean {
  return snapshot.sessions.some((session) => session.hasBell)
}

export function useWorktreeTerminalSnapshot(worktreeTerminalKey: string | null): WorktreeTerminalSnapshot {
  const { worktreeSnapshot, subscribeWorktree } = useTerminalSessionReadContext()
  const subscribe = useCallback(
    (listener: () => void) => (worktreeTerminalKey ? subscribeWorktree(worktreeTerminalKey, listener) : () => {}),
    [worktreeTerminalKey, subscribeWorktree],
  )
  const getSnapshot = useCallback(
    () => (worktreeTerminalKey ? worktreeSnapshot(worktreeTerminalKey) : EMPTY_WORKTREE_TERMINAL_SNAPSHOT),
    [worktreeTerminalKey, worktreeSnapshot],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useWorktreeTerminalCount(worktreeTerminalKey: string | null): number {
  const { worktreeSnapshot, subscribeWorktree } = useTerminalSessionReadContext()
  const subscribe = useCallback(
    (listener: () => void) => (worktreeTerminalKey ? subscribeWorktree(worktreeTerminalKey, listener) : () => {}),
    [worktreeTerminalKey, subscribeWorktree],
  )
  const getSnapshot = useCallback(
    () => (worktreeTerminalKey ? worktreeSnapshot(worktreeTerminalKey).count : 0),
    [worktreeTerminalKey, worktreeSnapshot],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useWorktreeTerminalSelectedDescriptor(worktreeTerminalKey: string | null): TerminalDescriptor | null {
  const { worktreeSnapshot, subscribeWorktree } = useTerminalSessionReadContext()
  const subscribe = useCallback(
    (listener: () => void) => (worktreeTerminalKey ? subscribeWorktree(worktreeTerminalKey, listener) : () => {}),
    [worktreeTerminalKey, subscribeWorktree],
  )
  const getSnapshot = useCallback(
    () => (worktreeTerminalKey ? worktreeSnapshot(worktreeTerminalKey).selectedDescriptor : null),
    [worktreeTerminalKey, worktreeSnapshot],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useTerminalSessionSummaries(worktreeTerminalKey: string | null): TerminalSessionSummary[] {
  const { worktreeSnapshot, subscribeWorktree } = useTerminalSessionReadContext()
  const subscribe = useCallback(
    (listener: () => void) => (worktreeTerminalKey ? subscribeWorktree(worktreeTerminalKey, listener) : () => {}),
    [worktreeTerminalKey, subscribeWorktree],
  )
  const getSnapshot = useCallback(
    () => (worktreeTerminalKey ? worktreeSnapshot(worktreeTerminalKey).sessions : []),
    [worktreeTerminalKey, worktreeSnapshot],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useWorktreeTerminalHasBell(worktreeTerminalKey: string | null): boolean {
  const readContext = useContext(TerminalSessionReadContext)
  const subscribe = useCallback(
    (listener: () => void) =>
      readContext && worktreeTerminalKey ? readContext.subscribeWorktree(worktreeTerminalKey, listener) : () => {},
    [readContext, worktreeTerminalKey],
  )
  const getSnapshot = useCallback(
    () =>
      readContext && worktreeTerminalKey ? hasTerminalBell(readContext.worktreeSnapshot(worktreeTerminalKey)) : false,
    [readContext, worktreeTerminalKey],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useRepoTerminalHasBell(repoRoot: string | null, worktreePaths: readonly string[]): boolean {
  const readContext = useContext(TerminalSessionReadContext)
  const worktreeKeys = useMemo(
    () => (repoRoot ? worktreePaths.map((path) => makeWorktreeTerminalKey(repoRoot, path)) : []),
    [repoRoot, worktreePaths],
  )
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!readContext || worktreeKeys.length === 0) return () => {}
      const unsubscribers = worktreeKeys.map((key) => readContext.subscribeWorktree(key, listener))
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe()
      }
    },
    [readContext, worktreeKeys],
  )
  const getSnapshot = useCallback(
    () => (readContext ? worktreeKeys.some((key) => hasTerminalBell(readContext.worktreeSnapshot(key))) : false),
    [readContext, worktreeKeys],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useTerminalRepoSyncReady(repoRoot: string | null): boolean {
  const { repoSyncReady, subscribeRepoSync } = useTerminalSessionReadContext()
  const subscribe = useCallback(
    (listener: () => void) => (repoRoot ? subscribeRepoSync(repoRoot, listener) : () => {}),
    [repoRoot, subscribeRepoSync],
  )
  const getSnapshot = useCallback(() => (repoRoot ? repoSyncReady(repoRoot) : false), [repoRoot, repoSyncReady])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useTerminalSnapshot(key: string | null): TerminalSnapshot {
  const { snapshot, subscribeSnapshot } = useTerminalSessionReadContext()
  const subscribe = useCallback(
    (listener: () => void) => (key ? subscribeSnapshot(key, listener) : () => {}),
    [key, subscribeSnapshot],
  )
  const getSnapshot = useCallback(() => (key ? snapshot(key) : EMPTY_TERMINAL_SNAPSHOT), [key, snapshot])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

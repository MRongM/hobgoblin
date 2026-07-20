import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react'
import {
  TerminalSessionReadContext,
  useTerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  WorktreeTerminalSnapshot,
  TerminalSnapshot,
  TerminalDescriptor,
  TerminalSessionReadContextValue,
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

function hasTerminalOutputActivity(snapshot: WorktreeTerminalSnapshot): boolean {
  return snapshot.sessions.some((session) => !!session.isOutputActive)
}

function useTerminalAggregateValue<T>(
  worktreeTerminalKeys: readonly string[],
  emptyValue: T,
  readValue: (readContext: TerminalSessionReadContextValue, keys: readonly string[]) => T,
): T {
  const readContext = useContext(TerminalSessionReadContext)
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!readContext || worktreeTerminalKeys.length === 0) return () => {}
      const unsubscribers = worktreeTerminalKeys.map((key) => readContext.subscribeWorktree(key, listener))
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe()
      }
    },
    [readContext, worktreeTerminalKeys],
  )
  const getSnapshot = useCallback(
    () => (readContext ? readValue(readContext, worktreeTerminalKeys) : emptyValue),
    [emptyValue, readContext, readValue, worktreeTerminalKeys],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const aggregateTerminalCount = (readContext: TerminalSessionReadContextValue, keys: readonly string[]) =>
  keys.reduce((sum, key) => sum + readContext.worktreeSnapshot(key).count, 0)

const aggregateHasBell = (readContext: TerminalSessionReadContextValue, keys: readonly string[]) =>
  keys.some((key) => hasTerminalBell(readContext.worktreeSnapshot(key)))

const aggregateHasOutputActivity = (readContext: TerminalSessionReadContextValue, keys: readonly string[]) =>
  keys.some((key) => hasTerminalOutputActivity(readContext.worktreeSnapshot(key)))

export function useTerminalAggregateCount(worktreeTerminalKeys: readonly string[]): number {
  return useTerminalAggregateValue(worktreeTerminalKeys, 0, aggregateTerminalCount)
}

export function useTerminalAggregateHasBell(worktreeTerminalKeys: readonly string[]): boolean {
  return useTerminalAggregateValue(worktreeTerminalKeys, false, aggregateHasBell)
}

export function useTerminalAggregateHasOutputActivity(worktreeTerminalKeys: readonly string[]): boolean {
  return useTerminalAggregateValue(worktreeTerminalKeys, false, aggregateHasOutputActivity)
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

export function useWorktreeTerminalHasOutputActivity(worktreeTerminalKey: string | null): boolean {
  const readContext = useContext(TerminalSessionReadContext)
  const subscribe = useCallback(
    (listener: () => void) =>
      readContext && worktreeTerminalKey ? readContext.subscribeWorktree(worktreeTerminalKey, listener) : () => {},
    [readContext, worktreeTerminalKey],
  )
  const getSnapshot = useCallback(
    () =>
      readContext && worktreeTerminalKey
        ? hasTerminalOutputActivity(readContext.worktreeSnapshot(worktreeTerminalKey))
        : false,
    [readContext, worktreeTerminalKey],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function useRepoTerminalWorktreeKeys(repoRoot: string | null, worktreePaths: readonly string[]): string[] {
  return useMemo(
    () => (repoRoot ? worktreePaths.map((path) => makeWorktreeTerminalKey(repoRoot, path)) : []),
    [repoRoot, worktreePaths],
  )
}

export function useRepoTerminalHasBell(repoRoot: string | null, worktreePaths: readonly string[]): boolean {
  return useTerminalAggregateHasBell(useRepoTerminalWorktreeKeys(repoRoot, worktreePaths))
}

export function useRepoTerminalCount(repoRoot: string | null, worktreePaths: readonly string[]): number {
  return useTerminalAggregateCount(useRepoTerminalWorktreeKeys(repoRoot, worktreePaths))
}

export function useRepoTerminalHasOutputActivity(repoRoot: string | null, worktreePaths: readonly string[]): boolean {
  return useTerminalAggregateHasOutputActivity(useRepoTerminalWorktreeKeys(repoRoot, worktreePaths))
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

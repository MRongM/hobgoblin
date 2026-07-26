// Git domain types shared by main (which produces them) and renderer
// (which consumes them via IPC). Putting these in `src/shared/` keeps
// main/renderer bundles independent — neither side has to import the
// other's module graph just to know what a `BranchSnapshotInfo` looks like.

import type { WorktreeBootstrapSummary } from '#/shared/worktree-bootstrap-summary.ts'

export interface BranchSnapshotInfo {
  name: string
  isCurrent: boolean
  isDefault?: boolean
  tracking?: string
  trackingGone?: boolean
  ahead: number
  behind: number
  lastCommitHash: string
  lastCommitMessage: string
  lastCommitDate: string
  lastCommitAuthor: string
  worktree?: BranchWorktreeSnapshot
  createdFrom?: string
}

export interface BranchWorktreeSnapshot {
  path: string
  isPrimary?: boolean
  isLocked?: boolean
  isPrunable?: boolean
  head?: string
  summary?: BranchWorktreeSnapshotSummary
}

export interface BranchWorktreeSnapshotSummary {
  dirty?: boolean
  changeCount?: number
}

export interface WorktreeInfo {
  path: string
  branch?: string
  head?: string
  isBare: boolean
  isPrimary: boolean
  isDirty?: boolean
  changeCount?: number
  isLocked?: boolean
  isPrunable?: boolean
}

export interface StatusEntry {
  x: string
  y: string
  path: string
  originalPath?: string
}

/** One worktree's working-tree status. The Status tab groups entries by
 *  worktree so users with linked worktrees see all dirty changes, not
 *  just the main worktree's. `isMain` marks the primary worktree (the
 *  repo root), so the UI can surface it differently. */
export interface WorktreeStatus {
  path: string
  branch?: string
  head?: string
  isMain: boolean
  entries: StatusEntry[]
}

export interface CommitHistoryEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents: string[]
}

export type CommitFileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown'

export interface CommitFileChange {
  path: string
  status: CommitFileChangeStatus
  additions: number
  deletions: number
  oldPath?: string
}

export interface CommitDetail {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents: string[]
  files: CommitFileChange[]
}

export interface GitRemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

export type BrowserRemoteProvider = 'github' | 'gitlab' | 'external'

export interface RepoRemoteInfo {
  remotes: GitRemoteInfo[]
  hasRemotes: boolean
  hasBrowserRemote: boolean
  browserRemoteProvider?: BrowserRemoteProvider
  remoteProviders: Record<string, BrowserRemoteProvider>
  hasGitHubRemote: boolean
}

export const GIT_HASH_RE = /^[0-9a-fA-F]{7,64}$/

export type GitFailureReason = 'merge-conflict'

export interface ExecResult {
  ok: boolean
  message: string
  reason?: GitFailureReason
  repoChanged?: boolean
  worktreeBootstrap?: WorktreeBootstrapSummary
}

/** Branch names we treat as protected — direct push/delete/etc. require
 *  extra confirmation, and "delete branch" is forbidden outright. Shared
 *  between main (server-side enforcement in IPC handlers) and renderer
 *  (UX gating in menus and dialogs) so both sides agree on the list. */
export const PROTECTED_BRANCHES: ReadonlySet<string> = new Set(['main', 'master', 'develop', 'trunk'])

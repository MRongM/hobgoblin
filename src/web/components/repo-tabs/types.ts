import type { GitRemoteInfo } from '#/web/types.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
export interface RepoTabSummary {
  id: string
  name: string
  remoteDetails: GitRemoteInfo[]
  worktreePaths?: string[]
  remoteTarget?: RemoteRepoTarget
  unavailable?: boolean
  isGitRepo?: boolean
}

export interface RepoTabStripLabels {
  repositories: string
  closeWithName: (name: string) => string
  more: string
  dragToReorder: string
  open: string
  openLocal: string
  openLocalShortcut: string | null
  openRemote: string
  openRemoteShortcut: string | null
  clone: string
  cloneShortcut: string | null
  openRecent: string
  noRecent: string
  clearRecent: string
  clearCache: string
  clearCacheConfirmTitle: string
  clearCacheConfirmMessage: string
  clearCacheConfirmLabel: string
  unavailable: string
}

export interface RecentRepoMenuActions {
  recentRepos?: RepoSessionEntry[]
  onOpenRecent?: (entry: RepoSessionEntry) => void
  onClearRecent?: () => void
}

// Pure parsers for the raw stdout of various `git` invocations. Kept
// free of any I/O so they're trivially testable — the unit tests feed
// hand-crafted git output and assert the resulting domain objects.
//
// Each parser is paired with the exact git command it expects in a
// JSDoc comment; if a callsite changes the command (different format
// string, removed flag), the parser must be updated in lockstep.

import type {
  BranchSnapshotInfo,
  CommitFileChange,
  CommitFileChangeStatus,
  CommitHistoryEntry,
  LogEntry,
  StatusEntry,
  WorktreeInfo,
} from '#/shared/git-types.ts'

/** ASCII Unit Separator. Safe against subjects / author names / paths
 *  containing it. Used by both the branch and log format strings. */
export const FIELD_SEP = '\x1f'

/**
 * Parse `git for-each-ref --format=<fields joined by FIELD_SEP> refs/heads/`.
 * Fields, in order: refname:short, objectname:short, subject,
 * authordate:iso-strict, authorname, upstream:short, upstream:track.
 */
export function parseBranches(output: string, currentBranch: string, worktrees: WorktreeInfo[] = []): BranchSnapshotInfo[] {
  if (!output) return []

  const worktreeMap = new Map<
    string,
    { path: string; isDirty?: boolean; isPrimary: boolean; changeCount?: number; isLocked?: boolean }
  >()
  for (const wt of worktrees) {
    if (wt.branch) {
      worktreeMap.set(wt.branch, {
        path: wt.path,
        isDirty: wt.isDirty,
        isPrimary: wt.isPrimary,
        changeCount: wt.changeCount,
        isLocked: wt.isLocked,
      })
    }
  }

  const lines = output.split('\n').filter(Boolean)
  const branches: BranchSnapshotInfo[] = []

  for (const line of lines) {
    const parts = line.split(FIELD_SEP)
    const name = parts[0] ?? ''
    const hash = parts[1] ?? ''
    const subject = parts[2] ?? ''
    const date = parts[3] ?? ''
    const author = parts[4] ?? ''
    const upstream = parts[5] ?? ''
    const track = parts[6] ?? ''

    let ahead = 0
    let behind = 0
    const aheadMatch = track.match(/ahead (\d+)/)
    const behindMatch = track.match(/behind (\d+)/)
    if (aheadMatch) ahead = parseInt(aheadMatch[1] ?? '0', 10)
    if (behindMatch) behind = parseInt(behindMatch[1] ?? '0', 10)

    const branchInfo: BranchSnapshotInfo = {
      name,
      isCurrent: name === currentBranch,
      ahead,
      behind,
      lastCommitHash: hash,
      lastCommitMessage: subject,
      lastCommitDate: date,
      lastCommitAuthor: author,
    }

    if (upstream) {
      branchInfo.tracking = upstream
      branchInfo.trackingGone = track.includes('gone')
    }

    const wtInfo = worktreeMap.get(name)
    if (wtInfo) {
      const hasSummary = wtInfo.isDirty !== undefined || wtInfo.changeCount !== undefined
      branchInfo.worktree = {
        path: wtInfo.path,
        isPrimary: wtInfo.isPrimary,
        ...(wtInfo.isLocked !== undefined ? { isLocked: wtInfo.isLocked } : {}),
        ...(hasSummary
          ? {
              summary: {
                ...(wtInfo.isDirty !== undefined ? { dirty: wtInfo.isDirty } : {}),
                ...(wtInfo.changeCount !== undefined ? { changeCount: wtInfo.changeCount } : {}),
              },
            }
          : {}),
      }
    }

    branches.push(branchInfo)
  }

  return branches
}

/**
 * Parse `git log --format=<%H, %h, %s, %an, %aI joined by FIELD_SEP>`.
 */
export function parseLog(output: string): LogEntry[] {
  if (!output) return []
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(FIELD_SEP)
      return {
        hash: parts[0] ?? '',
        shortHash: parts[1] ?? '',
        message: parts[2] ?? '',
        author: parts[3] ?? '',
        date: parts[4] ?? '',
      }
    })
}

/**
 * Parse `git log --format=<%H, %h, %s, %an, %aI, %P joined by FIELD_SEP>`.
 */
export function parseCommitHistory(output: string): CommitHistoryEntry[] {
  if (!output) return []
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(FIELD_SEP)
      const parents = (parts[5] ?? '')
        .split(' ')
        .map((part) => part.trim())
        .filter(Boolean)
      return {
        hash: parts[0] ?? '',
        shortHash: parts[1] ?? '',
        subject: parts[2] ?? '',
        author: parts[3] ?? '',
        date: parts[4] ?? '',
        parents,
      }
    })
}

interface ParsedNameStatusChange {
  path: string
  oldPath?: string
  status: CommitFileChangeStatus
}

interface ParsedNumstatChange {
  path: string
  oldPath?: string
  additions: number
  deletions: number
}

function statusFromNameStatus(code: string): CommitFileChangeStatus {
  const kind = code[0] ?? ''
  if (kind === 'A') return 'added'
  if (kind === 'M') return 'modified'
  if (kind === 'D') return 'deleted'
  if (kind === 'R') return 'renamed'
  if (kind === 'C') return 'copied'
  return 'unknown'
}

function parseNumstatCount(value: string | undefined): number {
  if (!value || value === '-') return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function parseCommitNameStatus(output: string): ParsedNameStatusChange[] {
  const records = output.split('\0').filter(Boolean)
  const changes: ParsedNameStatusChange[] = []
  for (let i = 0; i < records.length; i += 1) {
    const code = records[i] ?? ''
    const status = statusFromNameStatus(code)
    if (status === 'renamed' || status === 'copied') {
      const oldPath = records[i + 1] ?? ''
      const newPath = records[i + 2] ?? ''
      i += 2
      if (newPath) changes.push({ path: newPath, oldPath, status })
      continue
    }
    const filePath = records[i + 1] ?? ''
    i += 1
    if (filePath) changes.push({ path: filePath, status })
  }
  return changes
}

export function parseCommitNumstat(output: string): ParsedNumstatChange[] {
  const records = output.split('\0').filter(Boolean)
  const changes: ParsedNumstatChange[] = []
  for (let i = 0; i < records.length; i += 1) {
    const head = records[i] ?? ''
    const parts = head.split('\t')
    const additions = parseNumstatCount(parts[0])
    const deletions = parseNumstatCount(parts[1])
    const inlinePath = parts[2] ?? ''
    if (inlinePath) {
      changes.push({ path: inlinePath, additions, deletions })
      continue
    }
    const oldPath = records[i + 1] ?? ''
    const newPath = records[i + 2] ?? ''
    i += 2
    if (newPath) changes.push({ path: newPath, oldPath, additions, deletions })
  }
  return changes
}

export function parseCommitFileChanges(nameStatusOutput: string, numstatOutput: string): CommitFileChange[] {
  const statusEntries = parseCommitNameStatus(nameStatusOutput)
  const statByPath = new Map(parseCommitNumstat(numstatOutput).map((entry) => [entry.path, entry]))
  return statusEntries.map((entry) => {
    const stats = statByPath.get(entry.path)
    return {
      path: entry.path,
      status: entry.status,
      additions: stats?.additions ?? 0,
      deletions: stats?.deletions ?? 0,
      ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    }
  })
}

/**
 * Parse `git status --porcelain -z`. -z gives NUL-terminated entries
 * with quoting disabled — needed to handle filenames with spaces /
 * quotes / unicode without manual unescaping.
 *
 * Rename and copy entries occupy TWO records: the new path first,
 * then the original path. We surface both so UI features can show
 * virtual old-path nodes when needed.
 */
export function parseStatus(output: string): StatusEntry[] {
  if (!output) return []
  const records = output.split('\0').filter((s) => s.length > 0)
  const entries: StatusEntry[] = []
  for (let i = 0; i < records.length; i++) {
    const line = records[i]!
    if (line.length < 3) continue
    const x = line[0] ?? ' '
    const y = line[1] ?? ' '
    const path = line.slice(3)
    const originalPath = x === 'R' || x === 'C' ? records[i + 1] : undefined
    if (x === 'R' || x === 'C') i++
    entries.push(originalPath ? { x, y, path, originalPath } : { x, y, path })
  }
  return entries
}

/**
 * Parse `git worktree list --porcelain`. Blocks are separated by a
 * blank line; each block contains `worktree <path>` and either a
 * `branch refs/heads/<name>` line, a `detached` marker, or a `bare`
 * marker. Dirtiness is filled in later by `getWorktrees` because it
 * requires running another git command per worktree.
 */
export function parseWorktrees(output: string): WorktreeInfo[] {
  if (!output) return []
  const worktrees: WorktreeInfo[] = []
  const blocks = output.split('\n\n').filter(Boolean)

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean)
    let path = ''
    let branch: string | undefined
    let head: string | undefined
    let isBare = false
    let isLocked = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length)
        branch = ref.replace(/^refs\/heads\//, '')
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true
      }
    }

    if (path) worktrees.push({ path, branch, head, isBare, isPrimary: worktrees.length === 0, isLocked })
  }

  return worktrees
}

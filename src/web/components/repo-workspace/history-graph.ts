import type { CommitFileChangeStatus, CommitHistoryEntry } from '#/web/types.ts'

export interface HistoryGraphRow {
  commit: CommitHistoryEntry
  lane: number
  laneCount: number
  parentLanes: number[]
}

export function buildHistoryGraphRows(commits: CommitHistoryEntry[]): HistoryGraphRow[] {
  const active: Array<string | null> = []
  const rows: HistoryGraphRow[] = []

  for (const commit of commits) {
    let lane = active.indexOf(commit.hash)
    if (lane === -1) {
      lane = active.indexOf(null)
      if (lane === -1) {
        lane = active.length
        active.push(commit.hash)
      } else {
        active[lane] = commit.hash
      }
    }

    const parentLanes = commit.parents.map((_parent, index) => lane + index)
    if (commit.parents.length > 0) {
      active.splice(lane, 1, ...commit.parents)
    } else {
      active[lane] = null
    }

    rows.push({
      commit,
      lane,
      laneCount: Math.max(1, active.length, lane + 1),
      parentLanes,
    })
  }

  return rows
}

export function commitFileStatusLabel(status: CommitFileChangeStatus): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'modified':
      return 'M'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    case 'unknown':
      return '?'
  }
  const exhaustive: never = status
  return exhaustive
}

export function commitFileStatusTone(status: CommitFileChangeStatus): string {
  switch (status) {
    case 'added':
    case 'copied':
      return 'text-success'
    case 'deleted':
      return 'text-danger'
    case 'modified':
    case 'renamed':
      return 'text-warning'
    case 'unknown':
      return 'text-muted-foreground'
  }
  const exhaustive: never = status
  return exhaustive
}

export function formatHistoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

import type { CommitFileChangeStatus } from '#/web/types.ts'

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

import { EmptyState } from '#/web/components/Layout.tsx'
import { FilePathText } from '#/web/components/FilePathText.tsx'
import { useT } from '#/web/stores/i18n.ts'
import type { StatusEntry, WorktreeStatus } from '#/web/types.ts'

interface Props {
  status: WorktreeStatus[]
  emptyTitleKey?: string
  emptyBodyKey?: string
  onPathClick?: (path: string) => void
}

function isUnmergedStatus(entry: StatusEntry): boolean {
  return entry.x === 'U' || entry.y === 'U' || (entry.x === entry.y && (entry.x === 'A' || entry.x === 'D'))
}

function hasStatusCode(entry: StatusEntry, code: string): boolean {
  return entry.x === code || entry.y === code
}

function statusDisplay(entry: StatusEntry): { code: string; label: string; className: string } {
  if (isUnmergedStatus(entry)) return { code: 'U', label: 'U unmerged', className: 'text-danger' }
  if (hasStatusCode(entry, '?') || hasStatusCode(entry, 'A')) {
    return { code: 'N', label: 'N new', className: 'text-success' }
  }
  if (hasStatusCode(entry, 'D')) return { code: 'D', label: 'D deleted', className: 'text-danger' }
  if (hasStatusCode(entry, 'M')) return { code: 'M', label: 'M modified', className: 'text-warning' }
  if (hasStatusCode(entry, '!')) return { code: '!', label: '! ignored', className: 'text-muted-foreground' }

  const fallback = entry.x.trim() || entry.y.trim() || ' '
  return { code: fallback, label: `${entry.x}${entry.y}`, className: 'text-muted-foreground' }
}

function StatusCode({ entry }: { entry: StatusEntry }) {
  const display = statusDisplay(entry)
  return (
    <span
      className={`inline-flex w-[2ch] shrink-0 justify-center font-mono text-sm font-semibold leading-none ${display.className}`}
      aria-label={display.label}
    >
      {display.code === ' ' ? '\u00a0' : display.code}
    </span>
  )
}

export function StatusList({
  status,
  emptyTitleKey = 'status.clean-title',
  emptyBodyKey = 'status.clean-body',
  onPathClick,
}: Props) {
  const t = useT()
  const totalEntries = status.reduce((n, w) => n + w.entries.length, 0)
  const dirtyWorktrees = status.filter((wt) => wt.entries.length > 0)

  if (totalEntries === 0) {
    return <EmptyState icon="✓" title={t(emptyTitleKey)} body={t(emptyBodyKey)} tone="success" />
  }

  return (
    <>
      {dirtyWorktrees.map((wt) => (
        <ul key={wt.path} className="py-1.5 tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
          {wt.entries.map((entry) => (
            <li
              key={`${wt.path}-${entry.path}`}
              className="grid grid-cols-[2ch_minmax(0,1fr)] items-center gap-3 px-1.5"
            >
              <StatusCode entry={entry} />
              {onPathClick ? (
                <button
                  type="button"
                  aria-label={entry.path}
                  onClick={() => onPathClick(entry.path)}
                  className="min-w-0 truncate text-left text-foreground underline decoration-border underline-offset-2 hover:text-brand-text hover:decoration-brand-text"
                >
                  <FilePathText path={entry.path} />
                </button>
              ) : (
                <FilePathText path={entry.path} />
              )}
            </li>
          ))}
        </ul>
      ))}
    </>
  )
}

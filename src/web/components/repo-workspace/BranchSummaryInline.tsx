import { ArrowDown, ArrowUp, FolderTree, GitBranch, GitCompareArrows, Terminal } from 'lucide-react'
import { useT } from '#/web/stores/i18n.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { cn } from '#/web/lib/cn.ts'
import { formatWorktreeListPath, lastPathSegment } from '#/web/lib/paths.ts'
import { getBranchWorktreeState, type BranchWorktreeRepo } from '#/web/stores/repos/worktree-state.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import {
  useWorktreeTerminalCount,
  useWorktreeTerminalHasBell,
  useWorktreeTerminalHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'

export type BranchSummaryInlineRepo = BranchWorktreeRepo & {
  id: string
  data: BranchWorktreeRepo['data'] & { currentBranch: string }
  remote?: { target?: RemoteRepoTarget }
}

interface BranchSummaryInlineProps {
  repo: BranchSummaryInlineRepo
  branch: RepoBranchState
  selected?: boolean
  className?: string
}

function Delta({ direction, count, label }: { direction: 'ahead' | 'behind'; count: number; label: string }) {
  const Icon = direction === 'ahead' ? ArrowUp : ArrowDown
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-xs',
        direction === 'ahead' ? 'text-success' : 'text-attention',
      )}
    >
      <Icon size={11} />
      {count}
    </span>
  )
}

function shortHashTag(hash: string): string | null {
  const trimmed = hash.trim()
  return trimmed ? `#${trimmed.slice(0, 7)}` : null
}

export function BranchSummaryInline({ repo, branch, selected = false, className }: BranchSummaryInlineProps) {
  const t = useT()
  const isCurrent = branch.name === repo.data.currentBranch
  const hasWorktree = !!branch.worktree?.path
  const worktreeState = getBranchWorktreeState(repo, branch)
  const worktreeDirty = worktreeState?.dirty ?? false
  const repoRoot = repo.remote?.target?.remotePath ?? repo.id
  const worktreePath = branch.worktree?.path
    ? lastPathSegment(branch.worktree.path) || formatWorktreeListPath(branch.worktree.path, repo.remote?.target, repoRoot)
    : null
  const terminalWorktreeKey = branch.worktree?.path ? worktreeTerminalKey(repo.id, branch.worktree.path) : null
  const terminalCount = useWorktreeTerminalCount(terminalWorktreeKey)
  const hasTerminalBell = useWorktreeTerminalHasBell(terminalWorktreeKey)
  const hasTerminalOutputActivity = useWorktreeTerminalHasOutputActivity(terminalWorktreeKey)
  const terminalCountLabel = terminalCount > 0 ? t('terminal.open-count', { count: terminalCount }) : null
  const terminalBellLabel = t('terminal.bell-unread')
  const terminalOutputActiveLabel = t('terminal.output-active')
  const commitHashTag = shortHashTag(branch.lastCommitHash)
  const title = [
    branch.name,
    commitHashTag,
    isCurrent ? t('branch-status.current') : null,
    branch.isDefault ? t('branches.default') : null,
    hasWorktree ? t(worktreeDirty ? 'branches.dirty' : 'branches.worktree') : null,
    terminalCountLabel,
    hasTerminalBell ? terminalBellLabel : null,
    hasTerminalOutputActivity ? terminalOutputActiveLabel : null,
    worktreePath,
    branch.trackingGone ? t('branches.gone') : null,
    branch.ahead > 0 ? t('branch-status.sync.ahead', { n: branch.ahead }) : null,
    branch.behind > 0 ? t('branch-status.sync.behind', { n: branch.behind }) : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div title={title} className={cn('grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-1.5', className)}>
      <span className="flex w-4 shrink-0 items-center justify-center">
        {hasWorktree ? (
          <FolderTree size={13} className={worktreeDirty ? 'text-attention' : 'text-brand-text'} />
        ) : (
          <GitBranch size={13} className={selected ? 'text-selected-muted-foreground' : 'text-muted-foreground'} />
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-px">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 truncate text-sm leading-4 font-medium',
              selected ? 'text-selected-foreground' : 'text-foreground',
            )}
          >
            {branch.name}
          </span>
          {commitHashTag && (
            <Badge
              data-testid="branch-hash-tag"
              variant="outline"
              title={commitHashTag}
              className={cn(
                'h-4 border-border/60 px-1 font-mono text-[10px] font-medium tabular-nums',
                selected
                  ? 'text-selected-muted-foreground border-selected-muted-foreground/40'
                  : 'text-muted-foreground',
              )}
            >
              {commitHashTag}
            </Badge>
          )}
          {terminalCount > 0 && (
            <Badge
              data-testid="terminal-count-badge"
              aria-label={terminalCountLabel ?? undefined}
              title={terminalCountLabel ?? undefined}
              variant="brand"
              className="h-4 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
            >
              {hasTerminalOutputActivity ? (
                <TerminalOutputActivityIndicator label={terminalOutputActiveLabel} className="size-2.5" size={10} />
              ) : (
                <Terminal size={10} aria-hidden="true" />
              )}
              {terminalCount}
            </Badge>
          )}
          {hasTerminalBell && <TerminalBellDot label={terminalBellLabel} />}
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 overflow-hidden text-xs',
              selected ? 'text-selected-muted-foreground' : 'text-muted-foreground',
            )}
          >
            {hasWorktree && worktreeDirty ? (
              <Badge
                data-testid="dirty-worktree-badge"
                variant="attention"
                aria-label={t('branches.dirty')}
                title={t('branches.dirty')}
                className="h-4 px-1"
              >
                <GitCompareArrows size={10} aria-hidden="true" />
              </Badge>
            ) : null}
            {branch.trackingGone && <Badge variant="attention">{t('branches.gone')}</Badge>}
            {branch.ahead > 0 && (
              <Delta
                direction="ahead"
                count={branch.ahead}
                label={t('branch-status.sync.ahead', { n: branch.ahead })}
              />
            )}
            {branch.behind > 0 && (
              <Delta
                direction="behind"
                count={branch.behind}
                label={t('branch-status.sync.behind', { n: branch.behind })}
              />
            )}
          </span>
        </div>
        {worktreePath && (
          <span
            title={worktreePath}
            aria-label={worktreePath}
            className={cn(
              'block min-w-0 truncate font-mono text-[11px] leading-3',
              selected ? 'text-selected-muted-foreground/90' : 'text-muted-foreground/85',
            )}
          >
            {worktreePath}
          </span>
        )}
      </div>
    </div>
  )
}

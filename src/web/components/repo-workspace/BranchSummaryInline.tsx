import { ArrowDown, ArrowUp, FolderTree, GitBranch, Terminal } from 'lucide-react'
import { useI18nStore, useT } from '#/web/stores/i18n.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { cn } from '#/web/lib/cn.ts'
import { formatRelativeTimeOrNull } from '#/web/lib/dates.ts'
import { formatWorktreeListPath, lastPathSegment } from '#/web/lib/paths.ts'
import { getBranchWorktreeState, type BranchWorktreeRepo } from '#/web/stores/repos/worktree-state.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { useWorktreeTerminalCount, useWorktreeTerminalHasBell } from '#/web/components/terminal/terminal-session-store.ts'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'

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

export function BranchSummaryInline({ repo, branch, selected = false, className }: BranchSummaryInlineProps) {
  const t = useT()
  const lang = useI18nStore((s) => s.lang)
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
  const terminalCountLabel = terminalCount > 0 ? t('terminal.open-count', { count: terminalCount }) : null
  const terminalBellLabel = t('terminal.bell-unread')
  const commitTime = formatRelativeTimeOrNull(branch.lastCommitDate, lang)
  const commitMeta = commitTime
    ? branch.lastCommitAuthor
      ? `${branch.lastCommitAuthor} · ${commitTime}`
      : commitTime
    : null
  const title = [
    branch.name,
    isCurrent ? t('branch-status.current') : null,
    branch.isDefault ? t('branches.default') : null,
    hasWorktree ? t(worktreeDirty ? 'branches.dirty' : 'branches.worktree') : null,
    terminalCountLabel,
    hasTerminalBell ? terminalBellLabel : null,
    worktreePath,
    branch.trackingGone ? t('branches.gone') : null,
    branch.ahead > 0 ? t('branch-status.sync.ahead', { n: branch.ahead }) : null,
    branch.behind > 0 ? t('branch-status.sync.behind', { n: branch.behind }) : null,
    commitMeta,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div title={title} className={cn('flex min-w-0 flex-col gap-px', className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex w-4 shrink-0 items-center justify-center">
          {hasWorktree ? (
            <FolderTree size={13} className={worktreeDirty ? 'text-attention' : 'text-brand-text'} />
          ) : (
            <GitBranch size={13} className={selected ? 'text-selected-muted-foreground' : 'text-muted-foreground'} />
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span
            className={cn(
              'shrink-0 truncate text-sm leading-4 font-medium',
              selected ? 'text-selected-foreground' : 'text-foreground',
            )}
          >
            {branch.name}
          </span>
          {terminalCount > 0 && (
            <Badge
              data-testid="terminal-count-badge"
              aria-label={terminalCountLabel ?? undefined}
              title={terminalCountLabel ?? undefined}
              variant="brand"
              className="h-4 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
            >
              <Terminal size={10} aria-hidden="true" />
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
            {branch.isDefault && (
              <Badge variant="outline" className="text-muted-foreground">
                {t('branches.default')}
              </Badge>
            )}
            {hasWorktree && worktreeDirty ? (
              <Badge variant="attention" className="gap-1">
                <FolderTree size={10} />
                {t('branches.dirty')}
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
            {commitMeta && (
              <span
                className={cn(
                  'min-h-4 min-w-0 truncate whitespace-nowrap text-[11px] leading-4',
                  selected ? 'text-selected-muted-foreground/90' : 'text-muted-foreground/85',
                )}
                title={commitMeta}
              >
                {commitMeta}
              </span>
            )}
          </span>
        </span>
      </div>
      {worktreePath && (
        <span
          title={worktreePath}
          aria-label={worktreePath}
          className={cn(
            'block min-w-0 truncate pl-[22px] font-mono text-[11px] leading-3',
            selected ? 'text-selected-muted-foreground/90' : 'text-muted-foreground/85',
          )}
        >
          {worktreePath}
        </span>
      )}
    </div>
  )
}

import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  FolderGit2,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitFork,
  Hash,
  MessageSquare,
  RadioTower,
  RefreshCw,
  User,
} from 'lucide-react'
import { useT } from '#/web/stores/i18n.ts'
import { EmptyState } from '#/web/components/Layout.tsx'
import { CopyButton } from '#/web/components/CopyButton.tsx'
import {
  CopyableValue,
  MonoValue,
  StatusChip,
  StatusRow,
  StatusRows,
  STATUS_INLINE_GROUP_CLASS,
  type Tone,
} from '#/web/components/branch-detail/status-ui.tsx'
import { PROTECTED_BRANCHES } from '#/shared/git-types.ts'
import type { SelectedBranchDetail } from '#/web/components/branch-detail/model.ts'
import { cn } from '#/web/lib/cn.ts'
import { lastPathSegment } from '#/web/lib/paths.ts'

type TFn = (key: string, params?: Record<string, string | number>) => string

function worktreeFolderName(worktreePath: string | undefined, repoId: string): string {
  const fromWorktree = worktreePath ? lastPathSegment(worktreePath) : ''
  if (fromWorktree) return fromWorktree
  return lastPathSegment(repoId) || repoId
}
interface Props {
  detail: SelectedBranchDetail
  repoName: string
  repoId: string
}

function SyncValue({
  ahead,
  behind,
  noUpstream,
  upToDateLabel,
  aheadLabel,
  behindLabel,
}: {
  ahead: number
  behind: number
  noUpstream: boolean
  upToDateLabel: string
  aheadLabel: string
  behindLabel: string
}) {
  if (noUpstream) return <StatusChip tone="attention">{upToDateLabel}</StatusChip>
  if (ahead === 0 && behind === 0) {
    return (
      <StatusChip tone="success">
        <Check size={11} />
        {upToDateLabel}
      </StatusChip>
    )
  }

  return (
    <>
      {ahead > 0 && (
        <StatusChip tone="success">
          <ArrowUp size={12} />
          {aheadLabel}
        </StatusChip>
      )}
      {behind > 0 && (
        <StatusChip tone="attention">
          <ArrowDown size={12} />
          {behindLabel}
        </StatusChip>
      )}
    </>
  )
}

function formatCommitTime(value: string): string {
  if (!value) return ''
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

function syncClipboardValue(branch: NonNullable<SelectedBranchDetail['branch']>, t: TFn): string {
  if (!branch.tracking) return t('branches.no-upstream')
  const parts = [
    branch.ahead > 0 ? t('branch-status.sync.ahead', { n: branch.ahead }) : null,
    branch.behind > 0 ? t('branch-status.sync.behind', { n: branch.behind }) : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : t('branch-status.sync.up-to-date')
}

function createdFromClipboardValue(branch: NonNullable<SelectedBranchDetail['branch']>, t: TFn): string {
  return branch.createdFrom ?? t('branch-status.created-from-unknown')
}

function emptyClipboardValue(value: string): string {
  return value.trim().length > 0 ? value : '—'
}

export function branchStatusClipboardText(detail: SelectedBranchDetail, repoName: string, repoId: string, t: TFn): string {
  const { branch } = detail
  if (!branch) return ''

  const folderName = worktreeFolderName(branch.worktree?.path, repoId)

  const rows: Array<[string, string]> = [
    [t('branch-status.signal.folder'), folderName],
    [t('branch-status.signal.project'), repoName],
    [t('branch-status.signal.branch'), branch.name],
    [t('branch-status.signal.worktree'), branch.worktree?.path ?? t('branch-status.worktree.none')],
    [t('branch-status.signal.upstream'), branch.tracking ?? t('branches.no-upstream')],
    [t('branch-status.signal.sync'), syncClipboardValue(branch, t)],
    [t('branch-status.signal.commit-hash'), branch.lastCommitHash],
    [t('branch-status.signal.commit-message'), branch.lastCommitMessage],
    [t('branch-status.signal.commit-author'), branch.lastCommitAuthor],
    [t('branch-status.signal.commit-time'), branch.lastCommitDate],
  ]

  if (!branch.isDefault) {
    rows.push([t('branch-status.signal.created-from'), createdFromClipboardValue(branch, t)])
  }
  return rows.map(([label, value]) => `${label}: ${emptyClipboardValue(value)}`).join('\n')
}

function CommitMetadataValue({
  value,
  displayValue = value,
  copyLabel,
  copiedLabel,
  mono = false,
}: {
  value: string
  displayValue?: string
  copyLabel: string
  copiedLabel: string
  mono?: boolean
}) {
  const hasValue = value.trim().length > 0
  return (
    <div className={STATUS_INLINE_GROUP_CLASS}>
      <span
        className={cn('block min-w-0 flex-1 truncate', mono && 'font-mono')}
        title={hasValue ? value : undefined}
      >
        {hasValue ? displayValue : '—'}
      </span>
      <CopyButton
        value={value}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
        disabled={!hasValue}
        className="shrink-0"
      />
    </div>
  )
}

export function BranchStatus({ detail, repoName, repoId }: Props) {
  const t = useT()
  const { branch, statusCount } = detail
  if (!branch) return <EmptyState title={t('branches.empty')} />

  const folderName = worktreeFolderName(branch.worktree?.path, repoId)

  const protectedBranch = PROTECTED_BRANCHES.has(branch.name)
  const worktreePath = branch.worktree?.path ?? ''
  const worktreeChangeCount = detail.worktreeState?.changeCount ?? statusCount
  const hasRole = branch.isCurrent || branch.isDefault || protectedBranch
  const hasWorktreeChanges = !!branch.worktree?.path && (detail.worktreeState?.dirty || worktreeChangeCount > 0)
  const showCreatedFrom = !branch.isDefault
  const commitTime = formatCommitTime(branch.lastCommitDate)
  const upstreamTone: Tone = branch.trackingGone || !branch.tracking ? 'attention' : 'brand'
  const syncTone: Tone = !branch.tracking ? 'attention' : branch.behind > 0 ? 'attention' : 'success'
  const worktreeLocked = detail.worktreeState?.isLocked ?? false
  const worktreeTone: Tone =
    worktreeLocked || hasWorktreeChanges ? 'attention' : branch.worktree?.path ? 'brand' : 'neutral'
  const worktreeValue = branch.worktree?.path ? (
    <CopyableValue
      value={worktreePath}
      copyLabel={t('branch-status.copy-worktree-path')}
      copiedLabel={t('branch-status.copied')}
    />
  ) : (
    <StatusChip>{t('branch-status.worktree.none')}</StatusChip>
  )
  const worktreeAfter =
    worktreeLocked || hasWorktreeChanges ? (
      <>
        {worktreeLocked && <StatusChip tone="attention">{t('branch-status.worktree.locked')}</StatusChip>}
        {hasWorktreeChanges && (
          <StatusChip tone="attention">{t('branch-status.worktree-dirty', { n: worktreeChangeCount })}</StatusChip>
        )}
      </>
    ) : undefined
  const upstreamValue = branch.tracking ? (
    <MonoValue title={branch.tracking} tone={branch.trackingGone ? 'attention' : undefined} truncate>
      {branch.tracking}
    </MonoValue>
  ) : (
    <StatusChip tone="attention">{t('branches.no-upstream')}</StatusChip>
  )
  const upstreamAfter = branch.trackingGone ? <StatusChip tone="attention">{t('branches.gone')}</StatusChip> : undefined

  const roleChips = hasRole ? (
    <>
      {branch.isCurrent && <StatusChip tone="success">{t('branch-status.current')}</StatusChip>}
      {branch.isDefault && <StatusChip>{t('branches.default')}</StatusChip>}
      {protectedBranch && <StatusChip>{t('branch-status.protected')}</StatusChip>}
    </>
  ) : undefined
  return (
    <StatusRows>
      <StatusRow
        icon={<FolderOpen size={14} />}
        label={t('branch-status.signal.folder')}
        value={
          <CommitMetadataValue
            value={folderName}
            copyLabel={t('branch-status.copy-folder-name')}
            copiedLabel={t('branch-status.copied')}
          />
        }
        valueLayout="fill"
        tone="neutral"
      />
      <StatusRow
        icon={<FolderGit2 size={14} />}
        label={t('branch-status.signal.project')}
        value={
          <CommitMetadataValue
            value={repoName}
            copyLabel={t('branch-status.copy-project-name')}
            copiedLabel={t('branch-status.copied')}
          />
        }
        valueLayout="fill"
        tone="brand"
      />
      <StatusRow
        icon={<GitBranch size={15} />}
        label={t('branch-status.signal.branch')}
        value={
          <CopyableValue
            value={branch.name}
            copyLabel={t('branch-status.copy-branch-name')}
            copiedLabel={t('branch-status.copied')}
          />
        }
        after={roleChips}
        valueLayout="inline"
        tone={branch.isCurrent ? 'success' : branch.isDefault ? 'brand' : 'neutral'}
      />
      <StatusRow
        icon={<FolderTree size={14} />}
        label={t('branch-status.signal.worktree')}
        value={worktreeValue}
        after={worktreeAfter}
        valueLayout="inline"
        tone={worktreeTone}
      />
      <StatusRow
        icon={<RadioTower size={14} />}
        label={t('branch-status.signal.upstream')}
        value={upstreamValue}
        after={upstreamAfter}
        valueLayout="inline"
        tone={upstreamTone}
      />
      <StatusRow
        icon={<RefreshCw size={14} />}
        label={t('branch-status.signal.sync')}
        value={
          <SyncValue
            ahead={branch.ahead}
            behind={branch.behind}
            noUpstream={!branch.tracking}
            upToDateLabel={!branch.tracking ? t('branches.no-upstream') : t('branch-status.sync.up-to-date')}
            aheadLabel={t('branch-status.sync.ahead', { n: branch.ahead })}
            behindLabel={t('branch-status.sync.behind', { n: branch.behind })}
          />
        }
        valueLayout="chips"
        tone={syncTone}
      />
      <StatusRow
        icon={<Hash size={14} />}
        label={t('branch-status.signal.commit-hash')}
        value={
          <CommitMetadataValue
            value={branch.lastCommitHash}
            copyLabel={t('branch-status.copy-commit-hash')}
            copiedLabel={t('branch-status.copied')}
            mono
          />
        }
        valueLayout="fill"
      />
      <StatusRow
        icon={<MessageSquare size={14} />}
        label={t('branch-status.signal.commit-message')}
        value={
          <CommitMetadataValue
            value={branch.lastCommitMessage}
            copyLabel={t('branch-status.copy-commit-message')}
            copiedLabel={t('branch-status.copied')}
          />
        }
        valueLayout="fill"
      />
      <StatusRow
        icon={<User size={14} />}
        label={t('branch-status.signal.commit-author')}
        value={
          <CommitMetadataValue
            value={branch.lastCommitAuthor}
            copyLabel={t('branch-status.copy-commit-author')}
            copiedLabel={t('branch-status.copied')}
          />
        }
        valueLayout="fill"
      />
      <StatusRow
        icon={<Clock size={14} />}
        label={t('branch-status.signal.commit-time')}
        value={
          <CommitMetadataValue
            value={branch.lastCommitDate}
            displayValue={commitTime}
            copyLabel={t('branch-status.copy-commit-time')}
            copiedLabel={t('branch-status.copied')}
          />
        }
        valueLayout="fill"
      />
      {showCreatedFrom && (
        <StatusRow
          icon={<GitFork size={14} />}
          label={t('branch-status.signal.created-from')}
          value={
            branch.createdFrom ? (
              <MonoValue title={branch.createdFrom} truncate>
                {branch.createdFrom}
              </MonoValue>
            ) : (
              <StatusChip>{t('branch-status.created-from-unknown')}</StatusChip>
            )
          }
          valueLayout="inline"
          tone="neutral"
        />
      )}
    </StatusRows>
  )
}

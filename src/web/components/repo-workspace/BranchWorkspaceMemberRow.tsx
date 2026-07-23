import { useMemo, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  ExternalLink,
  FolderTree,
  GitBranch,
  GitCompareArrows,
  GitMerge,
  RadioTower,
  RotateCcw,
  SendHorizontal,
  Tag,
  Terminal,
  X,
} from 'lucide-react'
import type { BranchWorkspaceRepositorySnapshot, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { EditorAppIcon, TerminalAppIcon } from '#/web/components/ExternalAppIcon/index.tsx'
import { Badge } from '#/web/components/ui/badge.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import {
  useWorktreeTerminalCount,
  useWorktreeTerminalHasBell,
  useWorktreeTerminalHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { projectWorktreeListItemActions } from '#/web/components/branch-list/worktree-list-item-actions.ts'
import { useBranchActionItems, type BranchActionItemGroups } from '#/web/hooks/useBranchActionItems.tsx'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { cn } from '#/web/lib/cn.ts'
import { useT } from '#/web/stores/i18n.ts'
import { useAssociatedTmuxCleanup } from '#/web/hooks/useAssociatedTmuxCleanup.tsx'

export interface BranchWorkspaceMemberActionTarget {
  repo: BranchActionRepo
  branch: RepoBranchState
}

export interface BranchWorkspaceMemberPresentation {
  dirty: boolean
  changeCount: number | null
  navigable: boolean
  repositoryId?: string
  worktreePath?: string
  reason?: string
  actionTarget?: BranchWorkspaceMemberActionTarget
}

interface BranchWorkspaceMemberRowProps {
  item: BranchWorkspaceSnapshot
  member: BranchWorkspaceRepositorySnapshot
  selected: boolean
  disabled: boolean
  presentation: BranchWorkspaceMemberPresentation
  onOpenRepositoryMember?: (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => void
  onOpenInternalTerminal?: (item: BranchWorkspaceSnapshot, member: BranchWorkspaceRepositorySnapshot) => void
}

export function BranchWorkspaceMemberRow(props: BranchWorkspaceMemberRowProps) {
  return props.presentation.actionTarget ? (
    <ResolvedBranchWorkspaceMemberRow {...props} actionTarget={props.presentation.actionTarget} />
  ) : (
    <DisabledBranchWorkspaceMemberRow {...props} />
  )
}

function ResolvedBranchWorkspaceMemberRow({
  actionTarget,
  item,
  member,
  onOpenInternalTerminal,
  ...props
}: BranchWorkspaceMemberRowProps & { actionTarget: BranchWorkspaceMemberActionTarget }) {
  const actions = useBranchActionItems(actionTarget.repo, actionTarget.branch, {
    onNavigateToInternalTerminal: () => onOpenInternalTerminal?.(item, member),
  })
  return (
    <BranchWorkspaceMemberRowFrame
      {...props}
      item={item}
      member={member}
      onOpenInternalTerminal={onOpenInternalTerminal}
      actions={actions}
    />
  )
}

function DisabledBranchWorkspaceMemberRow(props: BranchWorkspaceMemberRowProps) {
  const t = useT()
  return <BranchWorkspaceMemberRowFrame {...props} actions={disabledMemberActionGroups(t)} />
}

function BranchWorkspaceMemberRowFrame({
  item,
  member,
  selected,
  disabled,
  presentation,
  actions,
  onOpenRepositoryMember,
  onOpenInternalTerminal,
}: BranchWorkspaceMemberRowProps & { actions: BranchActionItemGroups }) {
  const t = useT()
  const terminalKey =
    presentation.repositoryId && presentation.worktreePath
      ? worktreeTerminalKey(presentation.repositoryId, presentation.worktreePath)
      : null
  const terminalKeys = useMemo(() => (terminalKey ? [terminalKey] : []), [terminalKey])
  const terminalCount = useWorktreeTerminalCount(terminalKey)
  const hasTerminalBell = useWorktreeTerminalHasBell(terminalKey)
  const hasTerminalOutputActivity = useWorktreeTerminalHasOutputActivity(terminalKey)
  const dirtyLabel = presentation.dirty
    ? presentation.changeCount === null
      ? t('branches.dirty')
      : t('branch-status.worktree-dirty', { n: presentation.changeCount })
    : null
  const unavailableLabel = presentation.reason ? t(presentation.reason) : null
  const forceDisabled = disabled || !presentation.navigable
  const tmuxCleanup = useAssociatedTmuxCleanup({
    projectRoot: presentation.repositoryId,
    itemPath: presentation.worktreePath ?? member.worktreePath,
    disabled:
      disabled ||
      (presentation.actionTarget ? presentation.actionTarget.repo.operations.branchAction.phase !== 'idle' : false),
  })
  const actionProjection = projectWorktreeListItemActions(actions, {
    policy: 'branch-workspace-member',
    hasWorktree: true,
    forceDisabled,
    tmuxTerminalLabel: t('terminal.restore-directory-tmux'),
  })
  const internalTerminalAction = actionProjection.internalTerminal
    ? {
        ...actionProjection.internalTerminal,
        disabled: actionProjection.internalTerminal.disabled || !onOpenInternalTerminal,
      }
    : undefined
  const internalTerminalContextAction = {
    ...actionProjection.contextMenu.internalTerminal,
    disabled: actionProjection.contextMenu.internalTerminal.disabled || !onOpenInternalTerminal,
  }
  const tmuxTerminalContextAction = {
    ...actionProjection.contextMenu.tmuxTerminal,
    disabled: actionProjection.contextMenu.tmuxTerminal.disabled || !onOpenInternalTerminal,
  }
  const row = (
    <WorkspaceListItemFrame
      size="member"
      leadingIcon={<FolderTree className="size-3.5" aria-hidden="true" />}
      selected={selected}
      unavailable={!presentation.navigable}
      className={cn(
        selected && 'before:absolute before:-left-2.5 before:top-1/2 before:h-px before:w-2.5 before:bg-brand-border',
      )}
      buttonProps={{
        'data-testid': `branch-workspace-member-${member.repositoryName}`,
        disabled: disabled || !presentation.navigable,
        'aria-current': selected ? 'page' : undefined,
        'aria-label': [member.repositoryName, dirtyLabel, unavailableLabel].filter(Boolean).join('. '),
        title: presentation.navigable
          ? t('workspace.branch-workspace.member.open-worktree')
          : (unavailableLabel ?? undefined),
        className: presentation.navigable && !disabled ? undefined : 'cursor-default',
        onClick: () => onOpenRepositoryMember?.(item, member),
      }}
      actions={
        <WorkspaceListItemActionDock
          editor={actionProjection.editor}
          internalTerminal={internalTerminalAction}
          moreMenu={
            <WorkspaceListItemMenu
              label={t('action.menu')}
              groups={
                tmuxCleanup.visible
                  ? [...actionProjection.menuGroups, [tmuxCleanup.action]]
                  : actionProjection.menuGroups
              }
            />
          }
        />
      }
      expandedContent={
        <>
          {actions.inlinePanel ? (
            <div onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
              {actions.inlinePanel}
            </div>
          ) : null}
          {actions.dialogs}
          {tmuxCleanup.dialog}
        </>
      }
    >
      <span data-branch-workspace-member-summary className="inline-flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate">{member.repositoryName}</span>
        {terminalCount > 0 ? (
          <Badge
            data-testid="branch-workspace-member-terminal-count-badge"
            variant="brand"
            aria-label={t('terminal.open-count', { count: terminalCount })}
            className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          >
            {hasTerminalOutputActivity ? (
              <TerminalOutputActivityIndicator label={t('terminal.output-active')} className="size-2.5" size={10} />
            ) : (
              <Terminal className="size-2.5" aria-hidden="true" />
            )}
            {terminalCount}
          </Badge>
        ) : null}
        {presentation.dirty ? (
          <Badge
            data-testid="branch-workspace-member-change-count-badge"
            aria-label={dirtyLabel ?? undefined}
            title={dirtyLabel ?? undefined}
            variant="attention"
            className="h-4 shrink-0 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          >
            <GitCompareArrows size={10} aria-hidden="true" />
            {presentation.changeCount}
          </Badge>
        ) : null}
      </span>
      {hasTerminalBell ? <TerminalBellDot label={t('terminal.bell-unread')} /> : null}
    </WorkspaceListItemFrame>
  )

  return (
    <WorkspaceItemContextMenu
      editor={actionProjection.contextMenu.editor}
      externalTerminal={actionProjection.contextMenu.externalTerminal}
      internalTerminal={internalTerminalContextAction}
      tmuxTerminal={tmuxTerminalContextAction}
      tmuxTerminalLabel={t('terminal.restore-directory-tmux')}
      worktreeTerminalKeys={forceDisabled ? [] : terminalKeys}
      additionalActions={tmuxCleanup.visible ? [tmuxCleanup.contextAction] : []}
    >
      {row}
    </WorkspaceItemContextMenu>
  )
}

function disabledMemberActionGroups(t: ReturnType<typeof useT>): BranchActionItemGroups {
  const disabledAction = (
    id: Parameters<typeof createDisabledAction>[0],
    label: string,
    icon: ReactNode,
    options: { destructive?: boolean; menuOnly?: boolean } = {},
  ) => createDisabledAction(id, t(label), icon, options)

  return {
    externalItems: [
      disabledAction('editor', 'worktrees.open-in-editor-label', <EditorAppIcon pref="auto" />),
      disabledAction('terminal', 'terminal.internal', <Terminal aria-hidden="true" />),
      disabledAction('terminalTmux', 'terminal.new-with-tmux', <Terminal aria-hidden="true" />, { menuOnly: true }),
      disabledAction('externalTerminal', 'terminal.external', <TerminalAppIcon pref="auto" />),
      disabledAction('remote', 'action.remote', <ExternalLink aria-hidden="true" />),
    ],
    mainItems: [
      disabledAction('pull', 'action.pull', <ArrowDown aria-hidden="true" />),
      disabledAction('push', 'action.push', <ArrowUp aria-hidden="true" />),
      disabledAction('createBranch', 'action.create-branch', <GitBranch aria-hidden="true" />),
      disabledAction('pullRemoteBranch', 'action.pull-remote-branch', <RadioTower aria-hidden="true" />),
      disabledAction('merge', 'action.merge', <GitMerge aria-hidden="true" />),
      disabledAction('commit', 'action.commit', <SendHorizontal aria-hidden="true" />),
      disabledAction('copyPatch', 'status.copy-patch', <ClipboardCopy aria-hidden="true" />),
    ],
    patchItems: [disabledAction('createTag', 'action.create-tag', <Tag aria-hidden="true" />)],
    destructiveItems: [
      disabledAction('closeAllTerminals', 'terminal.close-all', <X aria-hidden="true" />, {
        destructive: true,
        menuOnly: true,
      }),
      disabledAction('resetHard', 'action.reset-hard', <RotateCcw aria-hidden="true" />, { destructive: true }),
    ],
    dialogs: null,
  }
}

function createDisabledAction(
  id:
    | 'editor'
    | 'terminal'
    | 'terminalTmux'
    | 'externalTerminal'
    | 'remote'
    | 'pull'
    | 'push'
    | 'createBranch'
    | 'pullRemoteBranch'
    | 'merge'
    | 'commit'
    | 'copyPatch'
    | 'createTag'
    | 'closeAllTerminals'
    | 'resetHard',
  label: string,
  icon: ReactNode,
  options: { destructive?: boolean; menuOnly?: boolean },
) {
  return {
    id,
    label,
    disabled: true,
    visible: true,
    icon,
    onSelect: () => {},
    ...options,
  }
}

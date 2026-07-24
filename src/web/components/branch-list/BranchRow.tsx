import { type CSSProperties, type RefObject, useCallback, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { BranchSummaryInline } from '#/web/components/repo-workspace/BranchSummaryInline.tsx'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.tsx'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemDragHandle,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
import { projectWorktreeListItemActions } from '#/web/components/branch-list/worktree-list-item-actions.ts'
import { useAssociatedTmuxCleanup } from '#/web/hooks/useAssociatedTmuxCleanup.tsx'
import { useT } from '#/web/stores/i18n.ts'

interface BranchRowSortable {
  setNodeRef: (node: HTMLLIElement | null) => void
  style?: CSSProperties
  isDragging?: boolean
  dragHandle: Pick<WorkspaceListItemDragHandle, 'setActivatorNodeRef' | 'props'>
}

interface BranchRowProps {
  repo: BranchActionRepo
  branch: RepoBranchState
  displayName?: string
  workspaceRemoveAction?: { label: string; onSelect: () => void }
  selected: string | null
  onSelectBranch: (branch: string) => void
  selectedRef: RefObject<HTMLLIElement | null>
  showActions?: boolean
  actionMenuOpen?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
  sortable?: BranchRowSortable
}

export function BranchRow({
  repo,
  branch,
  displayName,
  workspaceRemoveAction,
  selected,
  onSelectBranch,
  selectedRef,
  showActions = true,
  actionMenuOpen,
  onActionMenuOpenChange,
  sortable,
}: BranchRowProps) {
  const t = useT()
  const isSelected = branch.name === selected
  const worktreePath = branch.worktree?.path
  const terminalWorktreeKeys = useMemo(
    () => (worktreePath ? [worktreeTerminalKey(repo.id, worktreePath)] : []),
    [repo.id, worktreePath],
  )
  const actions = useBranchActionItems(repo, branch)
  const tmuxCleanup = useAssociatedTmuxCleanup({
    projectRoot: repo.id,
    itemPath: worktreePath,
    disabled: repo.operations.branchAction.phase !== 'idle',
  })
  const actionProjection = projectWorktreeListItemActions(actions, {
    policy: 'ordinary-worktree',
    hasWorktree: !!worktreePath,
  })
  const setItemRef = useCallback(
    (node: HTMLLIElement | null) => {
      if (isSelected) {
        ;(selectedRef as { current: HTMLLIElement | null }).current = node
      }
      sortable?.setNodeRef(node)
    },
    [isSelected, selectedRef, sortable],
  )

  const row = (
    <WorkspaceListItemFrame
      selected={isSelected}
      dragging={sortable?.isDragging}
      itemRef={sortable || isSelected ? setItemRef : undefined}
      itemStyle={sortable?.style}
      itemProps={{ className: 'mx-1.5' }}
      dragHandle={
        sortable
          ? {
              label: t('branches.reorder-worktree'),
              setActivatorNodeRef: sortable.dragHandle.setActivatorNodeRef,
              props: sortable.dragHandle.props,
            }
          : undefined
      }
      buttonProps={{
        'aria-current': isSelected ? 'page' : undefined,
        className: !showActions
          ? workspaceRemoveAction
            ? 'pr-8'
            : 'pr-2'
          : workspaceRemoveAction
            ? 'pr-[5.75rem]'
            : undefined,
        onClick: () => onSelectBranch(branch.name),
      }}
      auxiliaryActions={workspaceRemoveAction ? <WorkspaceRemoveButton action={workspaceRemoveAction} /> : undefined}
      actions={
        showActions ? (
          <WorkspaceListItemActionDock
            editor={actionProjection.editor}
            internalTerminal={actionProjection.internalTerminal}
            moreMenu={
              <WorkspaceListItemMenu
                label={t('action.menu')}
                groups={
                  tmuxCleanup.visible
                    ? [...actionProjection.menuGroups, [tmuxCleanup.action]]
                    : actionProjection.menuGroups
                }
                open={actionMenuOpen}
                onOpenChange={onActionMenuOpenChange}
              />
            }
          />
        ) : undefined
      }
      expandedContent={
        <>
          {showActions ? (
            <>
              {actions.inlinePanel ? (
                <div onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                  {actions.inlinePanel}
                </div>
              ) : null}
              {actions.dialogs}
            </>
          ) : null}
          {tmuxCleanup.dialog}
        </>
      }
    >
      <BranchSummaryInline
        repo={repo}
        branch={branch}
        displayName={displayName}
        selected={isSelected}
        className="w-full"
      />
    </WorkspaceListItemFrame>
  )

  return worktreePath ? (
    <WorkspaceItemContextMenu
      editor={actionProjection.contextMenu.editor}
      externalTerminal={actionProjection.contextMenu.externalTerminal}
      internalTerminal={actionProjection.contextMenu.internalTerminal}
      tmuxTerminal={actionProjection.contextMenu.tmuxTerminal}
      restoreTmuxTerminals={actionProjection.contextMenu.restoreTmuxTerminals}
      worktreeTerminalKeys={terminalWorktreeKeys}
      additionalActions={tmuxCleanup.visible ? [tmuxCleanup.contextAction] : []}
    >
      {row}
    </WorkspaceItemContextMenu>
  ) : (
    row
  )
}

function WorkspaceRemoveButton({ action }: { action: { label: string; onSelect: () => void } }) {
  return (
    <Tip label={action.label}>
      <span className="inline-flex">
        <AsyncButton
          variant="ghost"
          size="icon-sm"
          aria-label={action.label}
          className="text-danger hover:bg-danger-surface hover:text-danger"
          onClick={(event) => {
            event.stopPropagation()
            action.onSelect()
          }}
        >
          {() => <Trash2 aria-hidden="true" />}
        </AsyncButton>
      </span>
    </Tip>
  )
}

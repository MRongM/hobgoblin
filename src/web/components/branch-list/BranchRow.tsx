import { type CSSProperties, type HTMLAttributes, type RefObject, useCallback } from 'react'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { BranchActionsDropdown } from '#/web/components/BranchActionsMenu.tsx'
import { BranchSummaryInline } from '#/web/components/repo-workspace/BranchSummaryInline.tsx'
import { cn } from '#/web/lib/cn.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { useBranchActionItems } from '#/web/hooks/useBranchActionItems.ts'

interface BranchRowSortable {
  setNodeRef: (node: HTMLLIElement | null) => void
  style?: CSSProperties
  isDragging?: boolean
  props?: HTMLAttributes<HTMLLIElement>
}

interface BranchRowProps {
  repo: BranchActionRepo
  branch: RepoBranchState
  selected: string | null
  onSelectBranch: (branch: string) => void
  onOpenBranchStatus: (branch: string) => void
  selectedRef: RefObject<HTMLLIElement | null>
  showActions?: boolean
  actionMenuOpen?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
  sortable?: BranchRowSortable
}

export function BranchRow({
  repo,
  branch,
  selected,
  onSelectBranch,
  onOpenBranchStatus,
  selectedRef,
  showActions = true,
  actionMenuOpen,
  onActionMenuOpenChange,
  sortable,
}: BranchRowProps) {
  const isSelected = branch.name === selected
  const setItemRef = useCallback(
    (node: HTMLLIElement | null) => {
      if (isSelected) {
        ;(selectedRef as { current: HTMLLIElement | null }).current = node
      }
      sortable?.setNodeRef(node)
    },
    [isSelected, selectedRef, sortable],
  )

  return (
    <li
      {...sortable?.props}
      ref={sortable || isSelected ? setItemRef : undefined}
      style={sortable?.style}
      onClick={() => onSelectBranch(branch.name)}
      onDoubleClick={() => onOpenBranchStatus(branch.name)}
      className={cn(
        'relative grid min-h-8 items-stretch cursor-pointer',
        showActions ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1',
        'transition-colors duration-100',
        isSelected
          ? 'bg-list-row-selected text-list-row-selected-foreground hover:bg-list-row-selected'
          : 'hover:bg-list-row-hover',
        sortable?.isDragging && 'z-10 bg-[var(--goblin-card-bg,var(--color-card))] text-foreground shadow-sm',
      )}
    >
      <div className="pointer-events-none relative z-10 flex min-w-0 items-center px-4 py-1">
        <BranchSummaryInline repo={repo} branch={branch} selected={isSelected} />
      </div>
      {showActions && (
        <BranchRowActions
          repo={repo}
          branch={branch}
          actionMenuOpen={actionMenuOpen}
          onActionMenuOpenChange={onActionMenuOpenChange}
        />
      )}
    </li>
  )
}

function BranchRowActions({
  repo,
  branch,
  actionMenuOpen,
  onActionMenuOpenChange,
}: {
  repo: BranchActionRepo
  branch: RepoBranchState
  actionMenuOpen?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
}) {
  const actions = useBranchActionItems(repo, branch)
  return (
    <>
      <div className="pointer-events-none relative z-20 flex shrink-0 items-center py-1 pr-4">
        <div className="pointer-events-auto">
          <BranchActionsDropdown
            repoId={repo.id}
            branchName={branch.name}
            patchItems={actions.patchItems}
            mainItems={actions.mainItems}
            externalItems={actions.externalItems}
            destructiveItems={actions.destructiveItems}
            open={actionMenuOpen}
            onOpenChange={onActionMenuOpenChange}
          />
        </div>
      </div>
      {actions.inlinePanel ? (
        <div
          className="col-span-full"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {actions.inlinePanel}
        </div>
      ) : null}
      {actions.dialogs}
    </>
  )
}

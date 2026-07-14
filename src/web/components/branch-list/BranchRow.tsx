import { type CSSProperties, type HTMLAttributes, type RefObject, useCallback, useMemo } from 'react'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import { BranchActionsDropdown } from '#/web/components/BranchActionsMenu.tsx'
import { BranchSummaryInline } from '#/web/components/repo-workspace/BranchSummaryInline.tsx'
import { cn } from '#/web/lib/cn.ts'
import type { BranchActionRepo } from '#/web/hooks/branch-action-state.ts'
import { useBranchActionItems, type BranchActionItem } from '#/web/hooks/useBranchActionItems.tsx'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { Tip } from '#/web/components/Tip.tsx'

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
        <div className="pointer-events-auto flex items-center gap-0.5">
          {branch.worktree?.path && (
            <div className="hidden md:flex items-center gap-0.5">
              <BranchRowExternalActions actions={actions} />
              <BranchRowRecentActions repo={repo} branch={branch} />
            </div>
          )}
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

const REPEATABLE_ACTION_IDS = ['checkout', 'pull', 'push'] as const
type RepeatableActionId = (typeof REPEATABLE_ACTION_IDS)[number]

function BranchRowExternalActions({ actions }: { actions: ReturnType<typeof useBranchActionItems> }) {
  const editorItem = actions.externalItems.find((item) => item.id === 'editor')
  const terminalItem = actions.externalItems.find((item) => item.id === 'terminal')
  return (
    <>
      {editorItem && (
        <Tip label={editorItem.title ?? editorItem.label}>
          <span className="inline-flex">
            <AsyncButton
              data-testid="branch-row-editor-btn"
              variant="ghost"
              size="icon-sm"
              loading={editorItem.busy}
              disabled={editorItem.disabled}
              onClick={(e) => {
                e.stopPropagation()
                return editorItem.onSelect()
              }}
              aria-label={editorItem.ariaLabel ?? editorItem.label}
            >
              {() => editorItem.icon}
            </AsyncButton>
          </span>
        </Tip>
      )}
      {terminalItem && (
        <Tip label={terminalItem.title ?? terminalItem.label}>
          <span className="inline-flex">
            <AsyncButton
              data-testid="branch-row-terminal-btn"
              variant="ghost"
              size="icon-sm"
              loading={terminalItem.busy}
              disabled={terminalItem.disabled}
              onClick={(e) => {
                e.stopPropagation()
                return terminalItem.onSelect()
              }}
              aria-label={terminalItem.ariaLabel ?? terminalItem.label}
            >
              {() => terminalItem.icon}
            </AsyncButton>
          </span>
        </Tip>
      )}
    </>
  )
}

function BranchRowRecentActions({ repo, branch }: { repo: BranchActionRepo; branch: RepoBranchState }) {
  const ids = useStoreWithEqualityFn(
    useReposStore,
    (s) => {
      const r = s.repos[repo.id]
      if (!r) return [] as RepeatableActionId[]
      const found: RepeatableActionId[] = []
      for (let i = r.events.length - 1; i >= 0 && found.length < 1; i--) {
        const ev = r.events[i]
        if (
          ev.kind === 'result' &&
          ev.action &&
          (REPEATABLE_ACTION_IDS as readonly string[]).includes(ev.action.kind) &&
          ev.action.branch === branch.name
        ) {
          const id = ev.action.kind as RepeatableActionId
          if (!found.includes(id)) found.push(id)
        }
      }
      return found
    },
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  )

  if (ids.length === 0) return null
  return <BranchRowRecentActionsInner repo={repo} branch={branch} ids={ids} />
}

function BranchRowRecentActionsInner({
  repo,
  branch,
  ids,
}: {
  repo: BranchActionRepo
  branch: RepoBranchState
  ids: RepeatableActionId[]
}) {
  const actions = useBranchActionItems(repo, branch)
  const itemMap = useMemo(() => new Map(actions.mainItems.map((item) => [item.id, item])), [actions.mainItems])

  return (
    <div className="flex items-center gap-0.5">
      {ids
        .map((id) => itemMap.get(id))
        .filter((item): item is BranchActionItem => item !== undefined)
        .map((item) => (
          <Tip key={item.id} label={item.title ?? item.label}>
            <span className="inline-flex">
              <AsyncButton
                variant="ghost"
                size="icon-sm"
                loading={item.busy}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  return item.onSelect()
                }}
                aria-label={item.ariaLabel ?? item.label}
              >
                {() => item.icon}
              </AsyncButton>
            </span>
          </Tip>
        ))}
    </div>
  )
}

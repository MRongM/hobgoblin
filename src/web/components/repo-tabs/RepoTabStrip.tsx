import { type ReactNode, type Ref, useCallback, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, FolderOpen, Plus, Server, Trash2 } from 'lucide-react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Button } from '#/web/components/ui/button.tsx'
import { ScrollArea } from '#/web/components/ui/scroll-area.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { cn } from '#/web/lib/cn.ts'
import { ToolbarTabStrip, ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { createRestrictToTabStripBounds } from '#/web/components/tab-strip/drag-bounds.ts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '#/web/components/ui/dropdown-menu.tsx'
import { useIsSmallScreen } from '#/web/hooks/useIsSmallScreen.ts'
import { RepoTab } from '#/web/components/repo-tabs/RepoTab.tsx'
import { RepoTabTooltipLayer } from '#/web/components/repo-tabs/RepoTabTooltipLayer.tsx'
import { useFocusRegistry, type FocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import type { RepoTabStripLabels, RepoTabSummary } from '#/web/components/repo-tabs/types.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { GroupedRepoTabs } from '#/web/components/repo-tabs/GroupedRepoTabs.tsx'
import { CreateGroupDialog } from '#/web/components/repo-tabs/CreateGroupDialog.tsx'
import type { RepoGroupColor } from '#/web/stores/repos/types.ts'
import { ALL_GROUP_COLORS, getGroupColorClasses } from '#/web/components/repo-tabs/group-colors.ts'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '#/web/components/ui/context-menu.tsx'
import { FolderPlus, FolderMinus, Pencil, Palette, X } from 'lucide-react'

function shouldShowInactiveSeparator({
  leftId,
  rightId,
  activeId,
  hoveredId,
}: {
  leftId: string
  rightId: string | undefined
  activeId: string | null
  hoveredId: string | null
}): boolean {
  return !!rightId && leftId !== activeId && rightId !== activeId && leftId !== hoveredId && rightId !== hoveredId
}

function navigatedRepoTabId(
  repos: RepoTabSummary[],
  currentId: string,
  direction: 'prev' | 'next' | 'first' | 'last',
): string | null {
  if (repos.length === 0) return null
  const current = repos.findIndex((repo) => repo.id === currentId)
  const index =
    direction === 'first'
      ? 0
      : direction === 'last'
        ? repos.length - 1
        : current === -1
          ? 0
          : direction === 'next'
            ? (current + 1) % repos.length
            : (current - 1 + repos.length) % repos.length
  return repos[index]?.id ?? null
}

interface RepoTabStripProps {
  repos: RepoTabSummary[]
  activeId: string | null
  labels: RepoTabStripLabels
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
  onOpenLocal: () => void
  onOpenRemote: () => void
  onClone: () => void
}

interface RepoTabsContentProps {
  repos: RepoTabSummary[]
  activeId: string | null
  hoveredId: string | null
  labels: RepoTabStripLabels
  focusRegistry: FocusRegistry<string, HTMLButtonElement>
  onHoverChange: (id: string | null) => void
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onKeyboardNavigate: (id: string, direction: 'prev' | 'next' | 'first' | 'last') => void
}

function RepoTabEdgeAction({
  children,
  showSeparator = false,
  actionRef,
}: {
  children: ReactNode
  showSeparator?: boolean
  actionRef?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={actionRef} className="relative flex h-8 shrink-0 items-center pl-1">
      {showSeparator && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 h-4 -translate-y-1/2 border-l border-topbar-border"
        />
      )}
      {children}
    </div>
  )
}

function OpenRepoMenuItems({
  labels,
  onOpenLocal,
  onOpenRemote,
  onClone,
}: Pick<RepoTabStripProps, 'labels' | 'onOpenLocal' | 'onOpenRemote' | 'onClone'>) {
  const handleClearCache = () => {
    try {
      localStorage.clear()
      sessionStorage.clear()
      window.location.reload()
    } catch (err) {
      console.error('[gbl] failed to clear cache', err)
    }
  }

  return (
    <>
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onOpenLocal}>
        <FolderOpen />
        {labels.openLocal}
        {labels.openLocalShortcut && <DropdownMenuShortcut>{labels.openLocalShortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onOpenRemote}>
        <Server />
        {labels.openRemote}
        {labels.openRemoteShortcut && <DropdownMenuShortcut>{labels.openRemoteShortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
      <DropdownMenuItem className="whitespace-nowrap" onSelect={onClone}>
        <Download />
        {labels.clone}
        {labels.cloneShortcut && <DropdownMenuShortcut>{labels.cloneShortcut}</DropdownMenuShortcut>}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="whitespace-nowrap" onSelect={handleClearCache}>
        <Trash2 />
        {labels.clearCache}
      </DropdownMenuItem>
    </>
  )
}

function CompactRepoTabs({
  repos,
  activeId,
  hoveredId,
  labels,
  onHoverChange,
  onActivate,
  onClose,
  onKeyboardNavigate,
  focusRegistry,
  moreMenu,
}: RepoTabsContentProps & { moreMenu: ReactNode }) {
  const lastVisibleRepo = repos[repos.length - 1]
  const showMoreSeparator = !!lastVisibleRepo && lastVisibleRepo.id !== activeId && lastVisibleRepo.id !== hoveredId

  return (
    <ToolbarTabStripBody>
      <RepoTabTooltipLayer repos={repos} role="tablist" className="gap-0.5">
        {repos.map((repo, index) => (
          <RepoTab
            key={repo.id}
            repo={repo}
            isActive={repo.id === activeId}
            index={index}
            total={repos.length}
            showSeparator={false}
            focusRegistry={focusRegistry}
            onHoverChange={onHoverChange}
            onActivate={onActivate}
            onClose={onClose}
            onKeyboardNavigate={onKeyboardNavigate}
            closeLabel={labels.closeWithName}
            unavailableLabel={labels.unavailable}
          />
        ))}
      </RepoTabTooltipLayer>
      <RepoTabEdgeAction showSeparator={showMoreSeparator}>{moreMenu}</RepoTabEdgeAction>
    </ToolbarTabStripBody>
  )
}

function ScrollableRepoTabs({
  repos,
  activeId,
  hoveredId,
  labels,
  onHoverChange,
  onActivate,
  onClose,
  onKeyboardNavigate,
  focusRegistry,
  sensors,
  onDragEnd,
  restrictToVisibleTabStrip,
  openMenu,
}: RepoTabsContentProps & {
  sensors: ReturnType<typeof useSensors>
  onDragEnd: (event: DragEndEvent) => void
  restrictToVisibleTabStrip: ReturnType<typeof createRestrictToTabStripBounds>
  openMenu: ReactNode
}) {
  const ids = repos.map((repo) => repo.id)

  return (
    <ToolbarTabStripBody scroll>
      <RepoTabTooltipLayer repos={repos} role="tablist" className="gap-0.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVisibleTabStrip]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {repos.map((repo, index) => {
              const next = repos[index + 1]
              return (
                <RepoTab
                  key={repo.id}
                  repo={repo}
                  isActive={repo.id === activeId}
                  index={index}
                  total={repos.length}
                  focusRegistry={focusRegistry}
                  showSeparator={shouldShowInactiveSeparator({
                    leftId: repo.id,
                    rightId: next?.id,
                    activeId,
                    hoveredId,
                  })}
                  onHoverChange={onHoverChange}
                  onActivate={onActivate}
                  onClose={onClose}
                  onKeyboardNavigate={onKeyboardNavigate}
                  closeLabel={labels.closeWithName}
                  unavailableLabel={labels.unavailable}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </RepoTabTooltipLayer>
      {openMenu}
    </ToolbarTabStripBody>
  )
}

export function RepoTabStrip({
  repos,
  activeId,
  labels,
  onActivate,
  onClose,
  onReorder,
  onOpenLocal,
  onOpenRemote,
  onClone,
}: RepoTabStripProps) {
  const isSmallScreen = useIsSmallScreen()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Grouping state
  const repoGroups = useReposStore((s) => s.repoGroups)
  const groupOf = useReposStore((s) => s.groupOf)
  const toggleGroupCollapsed = useReposStore((s) => s.toggleGroupCollapsed)
  const createRepoGroup = useReposStore((s) => s.createRepoGroup)
  const updateRepoGroup = useReposStore((s) => s.updateRepoGroup)
  const deleteRepoGroup = useReposStore((s) => s.deleteRepoGroup)
  const addRepoToGroup = useReposStore((s) => s.addRepoToGroup)
  const removeRepoFromGroup = useReposStore((s) => s.removeRepoFromGroup)
  const moveTabDrag = useReposStore((s) => s.moveTabDrag)
  const hasAnyGroups = Object.keys(repoGroups).length > 0

  // Dialog state for creating a new group
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false)
  const [pendingRepoForGroup, setPendingRepoForGroup] = useState<string | null>(null)

  const openCreateGroupDialog = useCallback((repoId: string) => {
    setPendingRepoForGroup(repoId)
    setCreateGroupDialogOpen(true)
  }, [])

  const handleCreateGroupConfirm = useCallback(
    (name: string, color: RepoGroupColor) => {
      if (pendingRepoForGroup) {
        createRepoGroup(name, color, [pendingRepoForGroup])
      }
      setPendingRepoForGroup(null)
      setCreateGroupDialogOpen(false)
    },
    [pendingRepoForGroup, createRepoGroup],
  )

  const handleAddToExistingGroup = useCallback(
    (repoId: string, groupId: string) => {
      addRepoToGroup(repoId, groupId)
    },
    [addRepoToGroup],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const focusRegistry = useFocusRegistry<string, HTMLButtonElement>()
  const openMenuRef = useRef<HTMLDivElement>(null)
  const restrictToVisibleTabStrip = useMemo(() => createRestrictToTabStripBounds({ rightBoundaryRef: openMenuRef }), [])

  const handleClose = useCallback(
    (id: string) => {
      const isActive = id === activeId
      const idx = repos.findIndex((r) => r.id === id)
      const nextId = repos[idx + 1]?.id ?? repos[idx - 1]?.id ?? null
      onClose(id)
      if (isActive && nextId) {
        focusRegistry.focus(nextId)
      }
    },
    [repos, activeId, onClose, focusRegistry],
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromId = String(active.id)
    const toId = String(over.id)
    // When groups exist, route through moveTabDrag which preserves the same-group-adjacency invariant.
    if (hasAnyGroups || fromId.startsWith('group:') || toId.startsWith('group:')) {
      moveTabDrag(fromId, toId)
      return
    }
    onReorder(fromId, toId)
  }

  const handleKeyboardNavigate = (id: string, direction: 'prev' | 'next' | 'first' | 'last') => {
    const nextId = navigatedRepoTabId(repos, id, direction)
    if (!nextId) return
    onActivate(nextId)
    focusRegistry.focus(nextId)
  }

  const ids = repos.map((repo) => repo.id)
  const lastRepo = repos[repos.length - 1]
  const showOpenSeparator = !!lastRepo && lastRepo.id !== activeId && lastRepo.id !== hoveredId

  const activeRepo = repos.find((r) => r.id === activeId)
  const visibleRepos = isSmallScreen ? (activeRepo ? [activeRepo] : repos.slice(0, 1)) : repos
  const dropdownRepos = isSmallScreen ? repos : []

  const openMenu = (
    <RepoTabEdgeAction actionRef={openMenuRef} showSeparator={showOpenSeparator}>
      <DropdownMenu>
        <Tip label={labels.open}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={labels.open}>
              <Plus />
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent side="bottom" align="start" className="w-max">
          <OpenRepoMenuItems labels={labels} onOpenLocal={onOpenLocal} onOpenRemote={onOpenRemote} onClone={onClone} />
        </DropdownMenuContent>
      </DropdownMenu>
    </RepoTabEdgeAction>
  )

  // Tracks which repo/group the user right-clicked; drives the context menu content
  const [contextTarget, setContextTarget] = useState<
    { kind: 'repo'; repoId: string } | { kind: 'group'; groupId: string } | null
  >(null)

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    const repoTab = target?.closest<HTMLElement>('[data-repo-tab-id]')
    const groupChip = target?.closest<HTMLElement>('[data-group-id]')
    if (repoTab) {
      const repoId = repoTab.getAttribute('data-repo-tab-id')
      if (repoId) setContextTarget({ kind: 'repo', repoId })
      return
    }
    if (groupChip) {
      const groupId = groupChip.getAttribute('data-group-id')
      if (groupId) setContextTarget({ kind: 'group', groupId })
      return
    }
    setContextTarget(null)
  }

  const groupList = Object.values(repoGroups)
  const targetRepoGroupId = contextTarget?.kind === 'repo' ? groupOf[contextTarget.repoId] : undefined
  const targetGroup =
    contextTarget?.kind === 'group' ? repoGroups[contextTarget.groupId] : undefined

  return (
    <nav className="flex h-full min-w-0 flex-1 items-center" aria-label={labels.repositories}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex h-full min-w-0 flex-1 items-center" onContextMenu={handleContextMenu}>
      {repos.length === 0 ? (
        openMenu
      ) : (
        <ToolbarTabStrip
          compact={isSmallScreen}
          compactContent={
            <CompactRepoTabs
              repos={visibleRepos}
              activeId={activeId}
              hoveredId={hoveredId}
              labels={labels}
              focusRegistry={focusRegistry}
              onHoverChange={setHoveredId}
              onActivate={onActivate}
              onClose={handleClose}
              onKeyboardNavigate={handleKeyboardNavigate}
              moreMenu={
                <DropdownMenu>
                  <Tip label={labels.more}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={labels.more}>
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                  </Tip>
                  <DropdownMenuContent side="bottom" align="start" className="flex w-max flex-col !overflow-hidden">
                    <ScrollArea className="max-h-[200px]" scrollbarMode="compact">
                      {dropdownRepos.map((repo) => (
                        <DropdownMenuItem
                          key={repo.id}
                          className={cn(
                            'whitespace-nowrap',
                            repo.id === activeId && 'bg-list-row-selected text-list-row-selected-foreground',
                          )}
                          onSelect={() => onActivate(repo.id)}
                          aria-current={repo.id === activeId ? 'true' : undefined}
                        >
                          <span className="truncate">{repo.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </ScrollArea>
                    {dropdownRepos.length > 0 && <DropdownMenuSeparator />}
                    <OpenRepoMenuItems
                      labels={labels}
                      onOpenLocal={onOpenLocal}
                      onOpenRemote={onOpenRemote}
                      onClone={onClone}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          }
          scrollContent={
            // Use grouped tabs if any groups exist and not on small screen
            hasAnyGroups && !isSmallScreen ? (
              <GroupedRepoTabs
                repos={repos}
                repoGroups={repoGroups}
                groupOf={groupOf}
                activeId={activeId}
                hoveredId={hoveredId}
                focusRegistry={focusRegistry}
                sensors={sensors}
                restrictToVisibleTabStrip={restrictToVisibleTabStrip}
                onHoverChange={setHoveredId}
                onActivate={onActivate}
                onClose={handleClose}
                onKeyboardNavigate={handleKeyboardNavigate}
                onDragEnd={handleDragEnd}
                onToggleGroupCollapsed={toggleGroupCollapsed}
                openMenu={openMenu}
                closeLabel={labels.closeWithName}
                unavailableLabel={labels.unavailable}
              />
            ) : (
              <ScrollableRepoTabs
                repos={repos}
                activeId={activeId}
                hoveredId={hoveredId}
                labels={labels}
                focusRegistry={focusRegistry}
                onHoverChange={setHoveredId}
                onActivate={onActivate}
                onClose={handleClose}
                onKeyboardNavigate={handleKeyboardNavigate}
                sensors={sensors}
                onDragEnd={handleDragEnd}
                restrictToVisibleTabStrip={restrictToVisibleTabStrip}
                openMenu={openMenu}
              />
            )
          }
        />
      )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {contextTarget?.kind === 'repo' && (
            <>
              <ContextMenuItem onSelect={() => openCreateGroupDialog(contextTarget.repoId)}>
                <FolderPlus />
                Add to new group…
              </ContextMenuItem>
              {groupList.length > 0 && (
                <>
                  <ContextMenuSeparator />
                  {groupList.map((g) => {
                    const isCurrent = targetRepoGroupId === g.id
                    if (isCurrent) return null
                    const colorClasses = getGroupColorClasses(g.color)
                    return (
                      <ContextMenuItem
                        key={g.id}
                        onSelect={() => handleAddToExistingGroup(contextTarget.repoId, g.id)}
                      >
                        <span className={cn('inline-block size-2 rounded-full', colorClasses.dot)} aria-hidden />
                        <span className="truncate">Add to “{g.name}”</span>
                      </ContextMenuItem>
                    )
                  })}
                </>
              )}
              {targetRepoGroupId && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => removeRepoFromGroup(contextTarget.repoId)}>
                    <FolderMinus />
                    Remove from group
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
          {contextTarget?.kind === 'group' && targetGroup && (
            <>
              <ContextMenuItem
                onSelect={() => {
                  const next = window.prompt('Rename group', targetGroup.name)
                  if (next && next.trim()) updateRepoGroup(targetGroup.id, { name: next.trim() })
                }}
              >
                <Pencil />
                Rename…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <div className="px-2 py-1 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-1">
                  <Palette className="size-3" />
                  Color
                </div>
                <div className="flex flex-wrap gap-1">
                  {ALL_GROUP_COLORS.map((c) => {
                    const cc = getGroupColorClasses(c)
                    const selected = targetGroup.color === c
                    return (
                      <button
                        key={c}
                        type="button"
                        className={cn(
                          'size-5 rounded border',
                          cc.bg,
                          selected ? 'border-foreground' : 'border-transparent hover:border-muted-foreground/40',
                        )}
                        onClick={() => updateRepoGroup(targetGroup.id, { color: c })}
                        aria-label={c}
                      >
                        <span className={cn('m-auto block size-2 rounded-full', cc.dot)} />
                      </button>
                    )
                  })}
                </div>
              </div>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => deleteRepoGroup(targetGroup.id)}>
                <X />
                Ungroup
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => {
                  // Close all repos in this group
                  const memberIds = repos.filter((r) => groupOf[r.id] === targetGroup.id).map((r) => r.id)
                  for (const id of memberIds) onClose(id)
                }}
              >
                <X />
                Close all in group
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <CreateGroupDialog
        open={createGroupDialogOpen}
        onClose={() => {
          setCreateGroupDialogOpen(false)
          setPendingRepoForGroup(null)
        }}
        onCreate={handleCreateGroupConfirm}
        labels={{
          title: 'Create group',
          nameLabel: 'Group name',
          namePlaceholder: 'e.g. Frontend',
          colorLabel: 'Color',
          cancel: 'Cancel',
          create: 'Create',
        }}
      />
    </nav>
  )
}

import { type ReactNode } from 'react'
import { DndContext, type DragEndEvent, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import type { RepoTabSummary } from '#/web/components/repo-tabs/types.ts'
import type { FocusRegistry } from '#/web/components/tab-strip/useFocusRegistry.ts'
import { ToolbarTabStripBody } from '#/web/components/tab-strip/ToolbarTabStrip.tsx'
import { RepoTabTooltipLayer } from '#/web/components/repo-tabs/RepoTabTooltipLayer.tsx'
import { RepoTab } from '#/web/components/repo-tabs/RepoTab.tsx'
import { GroupChip } from '#/web/components/repo-tabs/GroupChip.tsx'
import { buildTabStripItems } from '#/web/components/repo-tabs/group-helpers.ts'
import type { RepoGroupMeta } from '#/web/stores/repos/types.ts'

interface GroupedRepoTabsProps {
  repos: RepoTabSummary[]
  repoGroups: Record<string, RepoGroupMeta>
  groupOf: Record<string, string>
  activeId: string | null
  hoveredId: string | null
  focusRegistry: FocusRegistry<string, HTMLButtonElement>
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>
  restrictToVisibleTabStrip: ReturnType<typeof import('#/web/components/tab-strip/drag-bounds.ts').createRestrictToTabStripBounds>
  onHoverChange: (id: string | null) => void
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onKeyboardNavigate: (id: string, direction: 'prev' | 'next' | 'first' | 'last') => void
  onDragEnd: (event: DragEndEvent) => void
  onToggleGroupCollapsed: (groupId: string) => void
  openMenu: ReactNode
  closeLabel: (name: string) => string
  unavailableLabel: string
}

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

export function GroupedRepoTabs({
  repos,
  repoGroups,
  groupOf,
  activeId,
  hoveredId,
  focusRegistry,
  sensors,
  restrictToVisibleTabStrip,
  onHoverChange,
  onActivate,
  onClose,
  onKeyboardNavigate,
  onDragEnd,
  onToggleGroupCollapsed,
  openMenu,
  closeLabel,
  unavailableLabel,
}: GroupedRepoTabsProps) {
  const items = buildTabStripItems(repos, repoGroups, groupOf)

  // Build sortable IDs - include both repo IDs and group IDs
  const sortableIds: string[] = []
  for (const item of items) {
    if (item.type === 'group') {
      sortableIds.push(`group:${item.group.id}`)
      // Add repo IDs only if group is expanded
      if (!item.group.collapsed) {
        sortableIds.push(...item.repos.map(r => r.id))
      }
    } else {
      sortableIds.push(item.repo.id)
    }
  }

  return (
    <ToolbarTabStripBody scroll>
      <RepoTabTooltipLayer repos={repos} role="tablist" className="gap-0.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVisibleTabStrip]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            {items.map((item, itemIndex) => {
              if (item.type === 'group') {
                const hasActive = item.repos.some(r => r.id === activeId)

                return (
                  <div key={`group-${item.group.id}`} className="flex items-center gap-0.5">
                    <GroupChip
                      group={item.group}
                      hasActiveRepo={hasActive && item.group.collapsed}
                      onClick={() => onToggleGroupCollapsed(item.group.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        // TODO: Show group context menu
                      }}
                    />

                    {/* Show member tabs if expanded */}
                    {!item.group.collapsed && item.repos.map((repo, repoIndex) => {
                      const allRepos = repos
                      const repoIndexInAll = allRepos.findIndex(r => r.id === repo.id)
                      const next = allRepos[repoIndexInAll + 1]

                      return (
                        <RepoTab
                          key={repo.id}
                          repo={repo}
                          isActive={repo.id === activeId}
                          index={repoIndexInAll}
                          total={allRepos.length}
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
                          closeLabel={closeLabel}
                          unavailableLabel={unavailableLabel}
                        />
                      )
                    })}
                  </div>
                )
              }

              // Ungrouped repo
              const allRepos = repos
              const repoIndex = allRepos.findIndex(r => r.id === item.repo.id)
              const next = allRepos[repoIndex + 1]

              return (
                <RepoTab
                  key={item.repo.id}
                  repo={item.repo}
                  isActive={item.repo.id === activeId}
                  index={repoIndex}
                  total={allRepos.length}
                  focusRegistry={focusRegistry}
                  showSeparator={shouldShowInactiveSeparator({
                    leftId: item.repo.id,
                    rightId: next?.id,
                    activeId,
                    hoveredId,
                  })}
                  onHoverChange={onHoverChange}
                  onActivate={onActivate}
                  onClose={onClose}
                  onKeyboardNavigate={onKeyboardNavigate}
                  closeLabel={closeLabel}
                  unavailableLabel={unavailableLabel}
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

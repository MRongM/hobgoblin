// Temporary demo component to show grouping concept
// This will be integrated into RepoTabStrip.tsx properly later

import { useState } from 'react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { buildTabStripItems } from '#/web/components/repo-tabs/group-helpers.ts'
import { GroupChip } from '#/web/components/repo-tabs/GroupChip.tsx'
import { CreateGroupDialog } from '#/web/components/repo-tabs/CreateGroupDialog.tsx'
import type { RepoTabSummary } from '#/web/components/repo-tabs/types.ts'

interface GroupingDemoProps {
  repos: RepoTabSummary[]
  activeId: string | null
}

export function GroupingDemo({ repos, activeId }: GroupingDemoProps) {
  const repoGroups = useReposStore((s) => s.repoGroups)
  const groupOf = useReposStore((s) => s.groupOf)
  const { createRepoGroup, toggleGroupCollapsed, deleteRepoGroup } = useReposStore()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedRepoForGroup, setSelectedRepoForGroup] = useState<string | null>(null)

  const items = buildTabStripItems(repos, repoGroups, groupOf)

  const handleCreateGroup = (name: string, color: any) => {
    if (selectedRepoForGroup) {
      createRepoGroup(name, color, [selectedRepoForGroup])
      setSelectedRepoForGroup(null)
    }
  }

  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <div className="text-sm font-medium">Grouping Demo:</div>

      {items.map((item, idx) => {
        if (item.type === 'group') {
          const hasActive = item.repos.some((r) => r.id === activeId)
          return (
            <GroupChip
              key={`group-${item.group.id}`}
              group={item.group}
              hasActiveRepo={hasActive && item.group.collapsed}
              onClick={() => toggleGroupCollapsed(item.group.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (confirm(`Delete group "${item.group.name}"?`)) {
                  deleteRepoGroup(item.group.id)
                }
              }}
            />
          )
        }

        return (
          <button
            key={`repo-${item.repo.id}`}
            className="px-3 py-1 text-sm border rounded hover:bg-accent"
            onClick={() => {
              setSelectedRepoForGroup(item.repo.id)
              setCreateDialogOpen(true)
            }}
          >
            {item.repo.name}
          </button>
        )
      })}

      <CreateGroupDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false)
          setSelectedRepoForGroup(null)
        }}
        onCreate={handleCreateGroup}
        labels={{
          title: 'Create Group',
          nameLabel: 'Group name',
          namePlaceholder: 'Enter group name',
          colorLabel: 'Color',
          cancel: 'Cancel',
          create: 'Create',
        }}
      />
    </div>
  )
}

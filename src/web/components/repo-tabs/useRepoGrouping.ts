import { useCallback, useState } from 'react'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { RepoGroupColor } from '#/web/stores/repos/types.ts'

export function useRepoGrouping() {
  const repoGroups = useReposStore((s) => s.repoGroups)
  const groupOf = useReposStore((s) => s.groupOf)
  const {
    createRepoGroup,
    updateRepoGroup,
    deleteRepoGroup,
    addRepoToGroup,
    removeRepoFromGroup,
    toggleGroupCollapsed,
  } = useReposStore()

  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false)
  const [pendingRepoForGroup, setPendingRepoForGroup] = useState<string | null>(null)

  const handleCreateGroup = useCallback(
    (name: string, color: RepoGroupColor, repoIds: string[]) => {
      createRepoGroup(name, color, repoIds)
    },
    [createRepoGroup],
  )

  const openCreateGroupDialog = useCallback((repoId: string) => {
    setPendingRepoForGroup(repoId)
    setCreateGroupDialogOpen(true)
  }, [])

  const closeCreateGroupDialog = useCallback(() => {
    setCreateGroupDialogOpen(false)
    setPendingRepoForGroup(null)
  }, [])

  const confirmCreateGroup = useCallback(
    (name: string, color: RepoGroupColor) => {
      if (pendingRepoForGroup) {
        handleCreateGroup(name, color, [pendingRepoForGroup])
      }
      closeCreateGroupDialog()
    },
    [pendingRepoForGroup, handleCreateGroup, closeCreateGroupDialog],
  )

  return {
    // State
    repoGroups,
    groupOf,
    createGroupDialogOpen,
    pendingRepoForGroup,

    // Actions
    createRepoGroup: handleCreateGroup,
    updateRepoGroup,
    deleteRepoGroup,
    addRepoToGroup,
    removeRepoFromGroup,
    toggleGroupCollapsed,

    // Dialog helpers
    openCreateGroupDialog,
    closeCreateGroupDialog,
    confirmCreateGroup,
  }
}

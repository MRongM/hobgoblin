import type { ReposGet, ReposSet } from '#/web/stores/repos/types.ts'
import type { RepoGroupMeta, RepoGroupColor, RestorableWorkspaceActions } from '#/web/stores/repos/types.ts'

export function createGroupActions(
  set: ReposSet,
  get: ReposGet,
): Pick<
  RestorableWorkspaceActions,
  | 'createRepoGroup'
  | 'updateRepoGroup'
  | 'deleteRepoGroup'
  | 'addRepoToGroup'
  | 'removeRepoFromGroup'
  | 'toggleGroupCollapsed'
> {
  return {
    createRepoGroup(name: string, color: RepoGroupColor, repoIds: string[]): string {
      const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      set((s) => {
        const repoGroups = { ...s.repoGroups, [groupId]: { id: groupId, name, color, collapsed: false } }
        const groupOf = { ...s.groupOf }
        for (const repoId of repoIds) {
          if (s.order.includes(repoId)) {
            groupOf[repoId] = groupId
          }
        }
        return { repoGroups, groupOf }
      })
      return groupId
    },

    updateRepoGroup(groupId: string, updates: Partial<Pick<RepoGroupMeta, 'name' | 'color' | 'collapsed'>>): void {
      set((s) => {
        const existing = s.repoGroups[groupId]
        if (!existing) return s
        const repoGroups = {
          ...s.repoGroups,
          [groupId]: { ...existing, ...updates },
        }
        return { repoGroups }
      })
    },

    deleteRepoGroup(groupId: string): void {
      set((s) => {
        const { [groupId]: _deleted, ...repoGroups } = s.repoGroups
        const groupOf = { ...s.groupOf }
        for (const [repoId, gid] of Object.entries(groupOf)) {
          if (gid === groupId) {
            delete groupOf[repoId]
          }
        }
        return { repoGroups, groupOf }
      })
    },

    addRepoToGroup(repoId: string, groupId: string): void {
      set((s) => {
        if (!s.repoGroups[groupId] || !s.order.includes(repoId)) return s
        const groupOf = { ...s.groupOf, [repoId]: groupId }
        return { groupOf }
      })
    },

    removeRepoFromGroup(repoId: string): void {
      set((s) => {
        const groupId = s.groupOf[repoId]
        if (!groupId) return s
        const { [repoId]: _removed, ...groupOf } = s.groupOf

        // Check if group is now empty
        const hasMembers = s.order.some((id) => groupOf[id] === groupId)
        if (!hasMembers) {
          const { [groupId]: _deleted, ...repoGroups } = s.repoGroups
          return { repoGroups, groupOf }
        }

        return { groupOf }
      })
    },

    toggleGroupCollapsed(groupId: string): void {
      set((s) => {
        const group = s.repoGroups[groupId]
        if (!group) return s
        const repoGroups = {
          ...s.repoGroups,
          [groupId]: { ...group, collapsed: !group.collapsed },
        }
        return { repoGroups }
      })
    },
  }
}

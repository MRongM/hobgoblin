import { arrayMove } from '@dnd-kit/sortable'
import type { ReposGet, ReposSet } from '#/web/stores/repos/types.ts'
import type { RepoGroupMeta, RepoGroupColor, RestorableWorkspaceActions } from '#/web/stores/repos/types.ts'

const GROUP_ID_PREFIX = 'group:'
function unwrapGroupId(id: string): string | null {
  return id.startsWith(GROUP_ID_PREFIX) ? id.slice(GROUP_ID_PREFIX.length) : null
}

/** Reorders `order` so that repos sharing a group are always adjacent.
 *  Groups keep their first-occurrence position; members within a group keep their relative order. */
function normalizeOrderForGroups(
  order: string[],
  groupOf: Record<string, string>,
): string[] {
  const seenGroups = new Set<string>()
  const result: string[] = []
  const groupMembers: Record<string, string[]> = {}
  // Collect members grouped by group id, preserving relative order
  for (const id of order) {
    const gid = groupOf[id]
    if (gid) {
      if (!groupMembers[gid]) groupMembers[gid] = []
      groupMembers[gid].push(id)
    }
  }
  for (const id of order) {
    const gid = groupOf[id]
    if (!gid) {
      result.push(id)
      continue
    }
    if (seenGroups.has(gid)) continue
    seenGroups.add(gid)
    result.push(...groupMembers[gid])
  }
  return result
}

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
  | 'moveTabDrag'
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

    moveTabDrag(fromId: string, toId: string): void {
      if (fromId === toId) return
      set((s) => {
        const fromGroupId = unwrapGroupId(fromId)
        const toGroupId = unwrapGroupId(toId)

        // Case 1: dragging a group
        if (fromGroupId) {
          const group = s.repoGroups[fromGroupId]
          if (!group) return s

          // Find member repos in order
          const members = s.order.filter((id) => s.groupOf[id] === fromGroupId)
          if (members.length === 0) return s

          // Compute target index: either at target group's head, or at target repo's position
          let targetIndex: number
          if (toGroupId) {
            const targetHead = s.order.find((id) => s.groupOf[id] === toGroupId)
            if (!targetHead) return s
            targetIndex = s.order.indexOf(targetHead)
          } else {
            targetIndex = s.order.indexOf(toId)
            if (targetIndex === -1) return s
          }

          // Remove members from order, then insert at target
          const withoutMembers = s.order.filter((id) => !members.includes(id))
          // Recompute target index after removal
          const targetIdAfterRemoval = toGroupId
            ? s.order.filter((id) => !members.includes(id)).find((id) => s.groupOf[id] === toGroupId)
            : toId
          let insertAt = targetIdAfterRemoval ? withoutMembers.indexOf(targetIdAfterRemoval) : withoutMembers.length
          if (insertAt === -1) insertAt = withoutMembers.length
          const nextOrder = [...withoutMembers.slice(0, insertAt), ...members, ...withoutMembers.slice(insertAt)]
          return { order: normalizeOrderForGroups(nextOrder, s.groupOf) }
        }

        // Case 2: dragging a repo
        const fromIdx = s.order.indexOf(fromId)
        if (fromIdx === -1) return s

        // Determine which group this repo should belong to after drop
        let nextRepoGroup: string | undefined
        let insertBeforeId: string | null = null

        if (toGroupId) {
          // Dropping onto a group chip: join that group at the head
          if (!s.repoGroups[toGroupId]) return s
          nextRepoGroup = toGroupId
          const head = s.order.find((id) => id !== fromId && s.groupOf[id] === toGroupId)
          insertBeforeId = head ?? null
        } else {
          // Dropping onto a repo tab
          const toIdx = s.order.indexOf(toId)
          if (toIdx === -1) return s
          nextRepoGroup = s.groupOf[toId]
          insertBeforeId = toId
        }

        // Build a new order: remove from, then insert at target position
        const withoutFrom = s.order.filter((id) => id !== fromId)
        let insertAt = insertBeforeId ? withoutFrom.indexOf(insertBeforeId) : withoutFrom.length
        if (insertAt === -1) insertAt = withoutFrom.length
        // If we're joining the target's group but the target is already before the "from",
        // we might want to insert after target when direction is downward. Use arrayMove semantics:
        // simplest: use the target's index in original order and let arrayMove handle it.
        // Use arrayMove for cleaner reorder semantics when staying in same group:
        const targetIdxOrig = insertBeforeId ? s.order.indexOf(insertBeforeId) : s.order.length
        const nextOrder = arrayMove(s.order, fromIdx, targetIdxOrig)

        // Update groupOf
        const prevGroup = s.groupOf[fromId]
        const groupOf = { ...s.groupOf }
        if (nextRepoGroup) {
          groupOf[fromId] = nextRepoGroup
        } else {
          delete groupOf[fromId]
        }

        // Check if the previous group became empty
        let repoGroups = s.repoGroups
        if (prevGroup && prevGroup !== nextRepoGroup) {
          const stillHasMembers = nextOrder.some((id) => groupOf[id] === prevGroup)
          if (!stillHasMembers) {
            const { [prevGroup]: _deleted, ...restGroups } = s.repoGroups
            repoGroups = restGroups
          }
        }

        return {
          order: normalizeOrderForGroups(nextOrder, groupOf),
          groupOf,
          repoGroups,
        }
      })
    },
  }
}

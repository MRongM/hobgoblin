import { beforeEach, describe, expect, test } from 'vitest'
import { useReposStore } from '#/web/stores/repos/store.ts'

// Seed the store with a bare-minimum repos map for the given ids.
// We only care about order/groupOf/repoGroups for these tests.
function seedOrder(ids: string[]) {
  const repos: Record<string, any> = {}
  for (const id of ids) {
    repos[id] = { id, name: id, instanceToken: 1 }
  }
  useReposStore.setState({
    repos,
    order: ids,
    groupOf: {},
    repoGroups: {},
  } as any)
}

describe('group actions', () => {
  beforeEach(() => {
    useReposStore.setState({
      repos: {},
      order: [],
      activeId: null,
      groupOf: {},
      repoGroups: {},
    } as any)
  })

  test('createRepoGroup adds group metadata and maps repos', () => {
    seedOrder(['a', 'b', 'c'])
    const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['a', 'b'])
    const state = useReposStore.getState()
    expect(state.repoGroups[gid]).toMatchObject({ name: 'G1', color: 'blue', collapsed: false })
    expect(state.groupOf).toEqual({ a: gid, b: gid })
  })

  test('addRepoToGroup / removeRepoFromGroup update mapping and delete empty groups', () => {
    seedOrder(['a', 'b'])
    const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['a'])
    useReposStore.getState().addRepoToGroup('b', gid)
    expect(useReposStore.getState().groupOf).toEqual({ a: gid, b: gid })

    useReposStore.getState().removeRepoFromGroup('a')
    useReposStore.getState().removeRepoFromGroup('b')
    // Group should be gone
    expect(useReposStore.getState().repoGroups[gid]).toBeUndefined()
    expect(useReposStore.getState().groupOf).toEqual({})
  })

  test('toggleGroupCollapsed flips the collapsed flag', () => {
    seedOrder(['a'])
    const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['a'])
    expect(useReposStore.getState().repoGroups[gid].collapsed).toBe(false)
    useReposStore.getState().toggleGroupCollapsed(gid)
    expect(useReposStore.getState().repoGroups[gid].collapsed).toBe(true)
  })

  describe('moveTabDrag', () => {
    test('reorders ungrouped repos', () => {
      seedOrder(['a', 'b', 'c'])
      useReposStore.getState().moveTabDrag('a', 'c')
      expect(useReposStore.getState().order).toEqual(['b', 'c', 'a'])
    })

    test('joining an existing group updates groupOf and preserves contiguity', () => {
      seedOrder(['a', 'b', 'c', 'd'])
      const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['b', 'c'])
      // Drag 'a' onto 'c' (which is inside group)
      useReposStore.getState().moveTabDrag('a', 'c')
      const s = useReposStore.getState()
      expect(s.groupOf.a).toBe(gid)
      // Adjacency invariant: all group members must be contiguous in order
      const groupIndices = s.order
        .map((id, i) => (s.groupOf[id] === gid ? i : -1))
        .filter((i) => i !== -1)
      expect(groupIndices[groupIndices.length - 1] - groupIndices[0]).toBe(groupIndices.length - 1)
    })

    test('leaving a group removes membership and deletes if empty', () => {
      seedOrder(['a', 'b', 'c'])
      const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['b'])
      // Drag 'b' onto 'a' — 'a' is ungrouped, so 'b' leaves the group
      useReposStore.getState().moveTabDrag('b', 'a')
      const s = useReposStore.getState()
      expect(s.groupOf.b).toBeUndefined()
      // Group had only 'b', so it should be deleted
      expect(s.repoGroups[gid]).toBeUndefined()
    })

    test('dropping repo onto a group chip joins that group at the head', () => {
      seedOrder(['a', 'b', 'c'])
      const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['b', 'c'])
      // Drop 'a' onto the group chip
      useReposStore.getState().moveTabDrag('a', `group:${gid}`)
      const s = useReposStore.getState()
      expect(s.groupOf.a).toBe(gid)
      // All three should now be in the group and contiguous
      const inGroup = s.order.filter((id) => s.groupOf[id] === gid)
      expect(inGroup.length).toBe(3)
    })

    test('dragging a whole group repositions all members while preserving relative order', () => {
      seedOrder(['a', 'b', 'c', 'd'])
      const gid = useReposStore.getState().createRepoGroup('G1', 'blue', ['a', 'b'])
      // Drag group to 'd'
      useReposStore.getState().moveTabDrag(`group:${gid}`, 'd')
      const s = useReposStore.getState()
      // a and b should still be adjacent and in original order
      const idxA = s.order.indexOf('a')
      const idxB = s.order.indexOf('b')
      expect(idxB - idxA).toBe(1)
      // Group members should still map to gid
      expect(s.groupOf.a).toBe(gid)
      expect(s.groupOf.b).toBe(gid)
    })

    test('no-op when fromId === toId', () => {
      seedOrder(['a', 'b'])
      const before = useReposStore.getState().order
      useReposStore.getState().moveTabDrag('a', 'a')
      expect(useReposStore.getState().order).toBe(before)
    })
  })
})

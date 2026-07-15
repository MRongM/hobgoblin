import { describe, test, expect } from 'vitest'
import { buildTabStripItems } from '#/web/components/repo-tabs/group-helpers.ts'
import type { RepoTabSummary } from '#/web/components/repo-tabs/types.ts'
import type { RepoGroupMeta } from '#/web/stores/repos/types.ts'

function createRepo(id: string, name: string): RepoTabSummary {
  return {
    id,
    name,
    remoteDetails: [],
  }
}

describe('buildTabStripItems', () => {
  test('returns ungrouped repos as individual items', () => {
    const repos = [createRepo('/tmp/a', 'a'), createRepo('/tmp/b', 'b')]
    const items = buildTabStripItems(repos, {}, {})

    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ type: 'repo', repo: repos[0] })
    expect(items[1]).toEqual({ type: 'repo', repo: repos[1] })
  })

  test('groups consecutive repos with same groupId', () => {
    const repos = [createRepo('/tmp/a', 'a'), createRepo('/tmp/b', 'b'), createRepo('/tmp/c', 'c')]
    const repoGroups: Record<string, RepoGroupMeta> = {
      'g1': { id: 'g1', name: 'Group 1', color: 'blue', collapsed: false },
    }
    const groupOf = { '/tmp/a': 'g1', '/tmp/b': 'g1' }

    const items = buildTabStripItems(repos, repoGroups, groupOf)

    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      type: 'group',
      group: repoGroups['g1'],
      repos: [repos[0], repos[1]],
    })
    expect(items[1]).toEqual({ type: 'repo', repo: repos[2] })
  })

  test('treats repos with missing group metadata as ungrouped', () => {
    const repos = [createRepo('/tmp/a', 'a')]
    const groupOf = { '/tmp/a': 'nonexistent' }

    const items = buildTabStripItems(repos, {}, groupOf)

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ type: 'repo', repo: repos[0] })
  })

  test('handles multiple groups in order', () => {
    const repos = [
      createRepo('/tmp/a', 'a'),
      createRepo('/tmp/b', 'b'),
      createRepo('/tmp/c', 'c'),
      createRepo('/tmp/d', 'd'),
    ]
    const repoGroups: Record<string, RepoGroupMeta> = {
      'g1': { id: 'g1', name: 'Group 1', color: 'blue', collapsed: false },
      'g2': { id: 'g2', name: 'Group 2', color: 'red', collapsed: true },
    }
    const groupOf = {
      '/tmp/a': 'g1',
      '/tmp/b': 'g1',
      '/tmp/c': 'g2',
    }

    const items = buildTabStripItems(repos, repoGroups, groupOf)

    expect(items).toHaveLength(3)
    expect(items[0].type).toBe('group')
    expect(items[1].type).toBe('group')
    expect(items[2].type).toBe('repo')
  })
})

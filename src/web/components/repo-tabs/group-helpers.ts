import type { RepoTabSummary } from '#/web/components/repo-tabs/types.ts'
import type { RepoGroupMeta } from '#/web/stores/repos/types.ts'

export interface GroupedRepoItem {
  type: 'group'
  group: RepoGroupMeta
  repos: RepoTabSummary[]
}

export interface UngroupedRepoItem {
  type: 'repo'
  repo: RepoTabSummary
}

export type TabStripItem = GroupedRepoItem | UngroupedRepoItem

/**
 * Transforms flat order + groupOf into a renderable tab strip structure.
 * Groups repos by groupOf, respecting order. Collapsed groups are represented
 * as a single GroupedRepoItem with their member repos hidden.
 */
export function buildTabStripItems(
  repos: RepoTabSummary[],
  repoGroups: Record<string, RepoGroupMeta>,
  groupOf: Record<string, string>,
): TabStripItem[] {
  const items: TabStripItem[] = []
  const processedRepos = new Set<string>()

  for (const repo of repos) {
    if (processedRepos.has(repo.id)) continue

    const groupId = groupOf[repo.id]
    if (!groupId) {
      // Ungrouped repo
      items.push({ type: 'repo', repo })
      processedRepos.add(repo.id)
      continue
    }

    const group = repoGroups[groupId]
    if (!group) {
      // Group metadata missing, treat as ungrouped
      items.push({ type: 'repo', repo })
      processedRepos.add(repo.id)
      continue
    }

    // Collect all consecutive repos in this group
    const groupRepos: RepoTabSummary[] = []
    for (let i = repos.indexOf(repo); i < repos.length; i++) {
      const r = repos[i]
      if (groupOf[r.id] === groupId) {
        groupRepos.push(r)
        processedRepos.add(r.id)
      } else {
        break
      }
    }

    items.push({ type: 'group', group, repos: groupRepos })
  }

  return items
}

/**
 * Check if the active repo is inside a collapsed group
 */
export function isActiveRepoInCollapsedGroup(
  activeId: string | null,
  groupOf: Record<string, string>,
  repoGroups: Record<string, RepoGroupMeta>,
): boolean {
  if (!activeId) return false
  const groupId = groupOf[activeId]
  if (!groupId) return false
  const group = repoGroups[groupId]
  return group?.collapsed ?? false
}

/**
 * Get the group that contains the active repo (if any)
 */
export function getActiveRepoGroup(
  activeId: string | null,
  groupOf: Record<string, string>,
  repoGroups: Record<string, RepoGroupMeta>,
): RepoGroupMeta | null {
  if (!activeId) return null
  const groupId = groupOf[activeId]
  if (!groupId) return null
  return repoGroups[groupId] ?? null
}

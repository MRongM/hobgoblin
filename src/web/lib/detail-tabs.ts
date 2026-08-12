import type { DetailTab } from '#/web/stores/repos/types.ts'

export function detailTabForWorktree(tab: DetailTab, hasWorktree: boolean): DetailTab {
  if (tab === 'terminal') return hasWorktree ? tab : 'status'
  return 'status'
}

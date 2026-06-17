import type { StatusEntry } from '#/shared/git-types.ts'

const UNMERGED_STATUS_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

export function isUnmergedStatusEntry(entry: Pick<StatusEntry, 'x' | 'y'>): boolean {
  return UNMERGED_STATUS_CODES.has(`${entry.x}${entry.y}`)
}

export function hasUnmergedStatusEntries(entries: Array<Pick<StatusEntry, 'x' | 'y'>>): boolean {
  return entries.some(isUnmergedStatusEntry)
}

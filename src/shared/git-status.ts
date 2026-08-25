import type { StatusEntry } from '#/shared/git-types.ts'

export function statusEntryPaths(entries: readonly StatusEntry[]): string[] {
  const paths = new Set<string>()
  for (const entry of entries) {
    if (entry.originalPath) paths.add(entry.originalPath)
    paths.add(entry.path)
  }
  return [...paths]
}

import {
  fileTreeSearchRank,
  sortRepoFileSearchMatches,
  type RepoFileSearchEntryKind,
  type RepoFileSearchMatch,
} from '#/shared/file-tree.ts'

export interface FileTreeSearchNode {
  id: string
  name: string
  relativePath: string
  kind: RepoFileSearchEntryKind
}

export type FileTreeSearchMatch =
  | {
      source: 'loaded'
      id: string
      relativePath: string
      kind: RepoFileSearchEntryKind
    }
  | {
      source: 'fallback'
      relativePath: string
      kind: RepoFileSearchEntryKind
    }

export function searchLoadedFileTreeNodes(query: string, nodes: FileTreeSearchNode[]): FileTreeSearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  return sortRepoFileSearchMatches(
    trimmed,
    nodes
      .filter(
        (node) => fileTreeSearchRank(trimmed, node.relativePath) !== null || fileTreeSearchRank(trimmed, node.name) !== null,
      )
      .map((node) => ({
        source: 'loaded' as const,
        id: node.id,
        relativePath: node.relativePath,
        kind: node.kind,
      })),
  )
}

export function mergeFileTreeSearchMatches(
  query: string,
  loaded: FileTreeSearchMatch[],
  fallback: RepoFileSearchMatch[],
): FileTreeSearchMatch[] {
  const seen = new Set(loaded.map((match) => match.relativePath))
  const fallbackOnly: FileTreeSearchMatch[] = fallback
    .filter((match) => {
      if (seen.has(match.relativePath)) return false
      seen.add(match.relativePath)
      return true
    })
    .map((match) => ({
      source: 'fallback' as const,
      relativePath: match.relativePath,
      kind: match.kind,
    }))
  return sortRepoFileSearchMatches(query, [...loaded, ...fallbackOnly])
}

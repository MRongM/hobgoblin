export const GOBLIN_FILE_PATHS_MIME = 'application/x-goblin-file-paths+json'

export const FILE_TREE_MAX_ENTRIES = 5000
export const FILE_TREE_SEARCH_LIMIT_DEFAULT = 100
export const FILE_TREE_SEARCH_LIMIT_MAX = 200
export const FILE_TRANSFER_MAX_FILE_BYTES = 100 * 1024 * 1024
export const FILE_TRANSFER_MAX_TOTAL_BYTES = 500 * 1024 * 1024

export type RepoFileTreeEntryKind = 'file' | 'directory' | 'symlink'
export type RepoFileTreeTargetKind = 'file' | 'directory' | 'other' | 'missing'
export type RepoFileSearchEntryKind = RepoFileTreeEntryKind | 'other'
export type RepoFileTransferEntryKind = 'file' | 'directory' | 'symlink'

export interface RepoFileTreeEntry {
  name: string
  absolutePath: string
  relativePath: string
  kind: RepoFileTreeEntryKind
  targetKind?: RepoFileTreeTargetKind
}

export type RepoFileTreeResult =
  | {
      ok: true
      worktreePath: string
      dirPath: string
      entries: RepoFileTreeEntry[]
    }
  | {
      ok: false
      message: string
    }

export interface RepoFileSearchMatch {
  relativePath: string
  kind: RepoFileSearchEntryKind
}

export interface RepoFileSearchRequest {
  repoId: string
  worktreePath: string
  query: string
  limit?: number
}

export type RepoFileSearchResult =
  | {
      ok: true
      matches: RepoFileSearchMatch[]
      truncated: boolean
      limit: number
    }
  | {
      ok: false
      message: string
    }

export interface GoblinFilePathDragPayload {
  paths: string[]
}

export function serializeGoblinFilePathDragPayload(paths: string[]): string {
  return JSON.stringify({ paths: paths.filter((path) => path.length > 0) } satisfies GoblinFilePathDragPayload)
}

export function parseGoblinFilePathDragPayload(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as Partial<GoblinFilePathDragPayload>
    if (!Array.isArray(parsed.paths)) return []
    return parsed.paths.filter((path): path is string => typeof path === 'string' && path.length > 0)
  } catch {
    return []
  }
}

export interface RepoFileTransferFileTreeSource {
  kind: 'fileTreePaths'
  repoId: string
  worktreePath: string
  paths: string[]
}

export interface RepoFileTransferLocalPathItem {
  path: string
  destinationName?: string
}

export interface RepoFileTransferLocalPathsSource {
  kind: 'localPaths'
  items: RepoFileTransferLocalPathItem[]
}

export interface RepoFileTransferUploadedItem {
  name: string
  mimeType?: string
  bytesBase64: string
  byteLength: number
}

export interface RepoFileTransferUploadedItemsSource {
  kind: 'uploadedItems'
  items: RepoFileTransferUploadedItem[]
}

export type RepoFileTransferSource =
  | RepoFileTransferFileTreeSource
  | RepoFileTransferLocalPathsSource
  | RepoFileTransferUploadedItemsSource

export interface RepoFileTransferRequest {
  repoId: string
  worktreePath: string
  targetDirPath: string
  source: RepoFileTransferSource
}

export interface RepoFileMoveRequest {
  repoId: string
  worktreePath: string
  paths: string[]
  targetDirPath: string
}

export interface RepoFileTransferCopiedEntry {
  sourcePath?: string
  destinationPath: string
  kind: RepoFileTransferEntryKind
}

export interface RepoFileTransferRenamedEntry {
  requestedName: string
  destinationName: string
  destinationPath: string
}

export interface RepoFileTransferFailedEntry {
  sourcePath?: string
  name?: string
  message: string
}

export type RepoFileTransferResult =
  | {
      ok: true
      copied: RepoFileTransferCopiedEntry[]
      renamed: RepoFileTransferRenamedEntry[]
      failed: RepoFileTransferFailedEntry[]
    }
  | {
      ok: false
      message: string
    }

export function isRepoFileTransferRequest(value: unknown): value is RepoFileTransferRequest {
  if (!isRecord(value)) return false
  if (
    typeof value.repoId !== 'string' ||
    typeof value.worktreePath !== 'string' ||
    typeof value.targetDirPath !== 'string' ||
    !isRecord(value.source)
  ) {
    return false
  }
  const source = value.source
  if (source.kind === 'fileTreePaths') {
    return (
      typeof source.repoId === 'string' &&
      typeof source.worktreePath === 'string' &&
      isStringArray(source.paths)
    )
  }
  if (source.kind === 'localPaths') return Array.isArray(source.items) && source.items.every(isRepoFileTransferLocalPathItem)
  if (source.kind === 'uploadedItems') {
    return Array.isArray(source.items) && source.items.every(isRepoFileTransferUploadedItem)
  }
  return false
}

export function isRepoFileMoveRequest(value: unknown): value is RepoFileMoveRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    isStringArray(value.paths) &&
    value.paths.length > 0 &&
    typeof value.targetDirPath === 'string'
  )
}

export function normalizeFileTreeSearchLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(parsed)) return FILE_TREE_SEARCH_LIMIT_DEFAULT
  return Math.max(1, Math.min(FILE_TREE_SEARCH_LIMIT_MAX, parsed))
}

export function isRepoFileSearchRequest(value: unknown): value is RepoFileSearchRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    value.repoId.length > 0 &&
    typeof value.worktreePath === 'string' &&
    value.worktreePath.length > 0 &&
    typeof value.query === 'string' &&
    value.query.trim().length > 0 &&
    (value.limit === undefined || typeof value.limit === 'number')
  )
}

function fileTreeSearchBasename(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? relativePath : relativePath.slice(slash + 1)
}

export function fileTreeSearchRank(query: string, relativePath: string): number | null {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return null
  const pathValue = relativePath.toLocaleLowerCase()
  const nameValue = fileTreeSearchBasename(relativePath).toLocaleLowerCase()
  if (nameValue.startsWith(needle)) return 0
  if (nameValue.includes(needle)) return 1
  if (pathValue.startsWith(needle)) return 2
  if (pathValue.includes(needle)) return 3
  return null
}

export function sortRepoFileSearchMatches<T extends RepoFileSearchMatch>(query: string, matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const rankA = fileTreeSearchRank(query, a.relativePath) ?? Number.MAX_SAFE_INTEGER
    const rankB = fileTreeSearchRank(query, b.relativePath) ?? Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    return a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function isValidFileTransferDestinationName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    !value.includes('/') &&
    !value.includes('\\')
  )
}

function isRepoFileTransferLocalPathItem(value: unknown): value is RepoFileTransferLocalPathItem {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    (value.destinationName === undefined || isValidFileTransferDestinationName(value.destinationName))
  )
}

function isRepoFileTransferUploadedItem(value: unknown): value is RepoFileTransferUploadedItem {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.bytesBase64 === 'string' &&
    typeof value.byteLength === 'number' &&
    (value.mimeType === undefined || typeof value.mimeType === 'string')
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

import type { RepoFileTransferEntryKind } from '#/shared/file-tree.ts'

export interface RepoFileExportRequest {
  repoId: string
  worktreePath: string
  targetDirPath: string
  paths: string[]
}

export interface RepoFileExportCopiedEntry {
  sourcePath: string
  destinationPath: string
  kind: RepoFileTransferEntryKind
}

export interface RepoFileExportRenamedEntry {
  requestedName: string
  destinationName: string
  destinationPath: string
}

export interface RepoFileExportFailedEntry {
  sourcePath: string
  message: string
}

export type RepoFileExportResult =
  | {
      ok: true
      copied: RepoFileExportCopiedEntry[]
      renamed: RepoFileExportRenamedEntry[]
      failed: RepoFileExportFailedEntry[]
    }
  | {
      ok: false
      message: string
    }

export function isRepoFileExportRequest(value: unknown): value is RepoFileExportRequest {
  return (
    isRecord(value) &&
    typeof value.repoId === 'string' &&
    typeof value.worktreePath === 'string' &&
    typeof value.targetDirPath === 'string' &&
    isStringArray(value.paths) &&
    value.paths.length > 0
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

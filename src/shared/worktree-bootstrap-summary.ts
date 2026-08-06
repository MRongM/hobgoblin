import { MAX_IPC_PATH_LENGTH } from '#/shared/input-validation.ts'

export interface WorktreeBootstrapPathSummary {
  count: number
  paths: string[]
}

export interface WorktreeBootstrapSummary {
  copy: WorktreeBootstrapPathSummary
  symlink: WorktreeBootstrapPathSummary
  hardlink: WorktreeBootstrapPathSummary
  skippedMissing: WorktreeBootstrapPathSummary
  setup?: {
    command: string
  }
}

export type WorktreeBootstrapDecision =
  | { kind: 'skip' }
  | {
      kind: 'materialize'
      selections: WorktreeBootstrapSelection[]
      /** Existing worktree whose selected entries should be materialized. */
      sourceWorktreePath: string
    }

export type WorktreeBootstrapSelectionMode = 'copy' | 'symlink'
export type WorktreeBootstrapMaterializationMode = WorktreeBootstrapSelectionMode | 'hardlink'

export type WorktreeBootstrapTargetDecision =
  | { kind: 'skip' }
  | { kind: 'materialize'; selections: WorktreeBootstrapSelection[] }

export interface WorktreeBootstrapTargetEntry {
  path: string
  mode: WorktreeBootstrapMaterializationMode
}

export interface WorktreeBootstrapTargetPreflight {
  pending: WorktreeBootstrapTargetEntry[]
  satisfied: WorktreeBootstrapTargetEntry[]
  conflicts: WorktreeBootstrapTargetEntry[]
  hasSetup: boolean
}

export type WorktreeBootstrapTargetPreflightResult =
  | { ok: true; preflight: WorktreeBootstrapTargetPreflight }
  | { ok: false; message: string }

export interface WorktreeBootstrapSelection {
  path: string
  mode: WorktreeBootstrapSelectionMode
}

export const WORKTREE_BOOTSTRAP_SUMMARY_PATH_LIMIT = 8

export function normalizeWorktreeBootstrapSourcePath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_IPC_PATH_LENGTH ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    return null
  }
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) ? value : null
}

export function isWorktreeBootstrapRootEntryPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_IPC_PATH_LENGTH &&
    value !== '.' &&
    value !== '..' &&
    value !== '.git' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !/[\0-\x1f\x7f]/.test(value)
  )
}

export function normalizeWorktreeDependencyPath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_IPC_PATH_LENGTH ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    value.includes('\\') ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    return null
  }

  const rawSegments = value.split('/')
  if (rawSegments.some((segment) => segment === '..' || segment === '.git')) return null
  const normalized = rawSegments.filter((segment) => segment.length > 0 && segment !== '.').join('/')
  return normalized.length > 0 && normalized.length <= MAX_IPC_PATH_LENGTH ? normalized : null
}

export function normalizeWorktreeBootstrapSelections(value: unknown): WorktreeBootstrapSelection[] {
  if (!Array.isArray(value)) return []
  const result: WorktreeBootstrapSelection[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const normalizedPath = normalizeWorktreeDependencyPath(raw.path)
    if (!normalizedPath || (raw.mode !== 'copy' && raw.mode !== 'symlink')) continue
    if (
      result.some(
        (selection) =>
          selection.path === normalizedPath || normalizedPath.startsWith(`${selection.path}/`),
      )
    ) {
      continue
    }
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (result[index]!.path.startsWith(`${normalizedPath}/`)) result.splice(index, 1)
    }
    result.push({ path: normalizedPath, mode: raw.mode })
  }
  return result
}

export function compactWorktreeBootstrapPaths(paths: readonly string[]): WorktreeBootstrapPathSummary {
  return {
    count: paths.length,
    paths: paths.slice(0, WORKTREE_BOOTSTRAP_SUMMARY_PATH_LIMIT),
  }
}

export function hasWorktreeBootstrapSummaryDetails(summary: WorktreeBootstrapSummary | undefined): boolean {
  if (!summary) return false
  return (
    summary.copy.count > 0 ||
    summary.symlink.count > 0 ||
    summary.hardlink.count > 0 ||
    summary.skippedMissing.count > 0 ||
    !!summary.setup
  )
}

export function formatWorktreeBootstrapSummary(summary: WorktreeBootstrapSummary | undefined): string {
  if (!summary || !hasWorktreeBootstrapSummaryDetails(summary)) return ''
  return [
    formatPathSummary('Copied', summary.copy),
    formatPathSummary('Symlinked', summary.symlink),
    formatPathSummary('Hardlinked', summary.hardlink),
    formatPathSummary('Skipped missing', summary.skippedMissing),
    summary.setup ? `Ran setup: ${summary.setup.command}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatPathSummary(label: string, summary: WorktreeBootstrapPathSummary): string {
  if (summary.count === 0) return ''
  const noun = summary.count === 1 ? 'path' : 'paths'
  const suffix = summary.count > summary.paths.length ? `, and ${summary.count - summary.paths.length} more` : ''
  return `${label} ${summary.count} ${noun}: ${summary.paths.join(', ')}${suffix}`
}

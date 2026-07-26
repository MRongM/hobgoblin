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
      kind: 'run'
      configHash: string
      /** Desired trust state for this exact config hash after a successful bootstrap run. */
      configTrusted: boolean
      /** Worktree whose files and goblin.toml produced this decision. */
      sourceWorktreePath?: string
    }
  | {
      kind: 'materialize'
      selections: WorktreeBootstrapSelection[]
      candidateScope?: WorktreeBootstrapCandidateScope
      /** Worktree whose untracked files produced these selections. */
      sourceWorktreePath?: string
    }

export type WorktreeBootstrapCandidateKind = 'file' | 'directory'
export type WorktreeBootstrapCandidateScope = 'all-untracked' | 'ignored-only'
export type WorktreeBootstrapSelectionMode = 'copy' | 'symlink'
export type WorktreeBootstrapMaterializationMode = WorktreeBootstrapSelectionMode | 'hardlink'

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

export interface WorktreeBootstrapCandidate {
  path: string
  kind: WorktreeBootstrapCandidateKind
}

export interface WorktreeBootstrapSelection {
  path: string
  mode: WorktreeBootstrapSelectionMode
}

export interface WorktreeBootstrapPreview {
  hasConfig: boolean
  hasOperations: boolean
  configHash: string | null
  copyCount: number
  symlinkCount: number
  hardlinkCount: number
  excludeCount: number
  setup?: {
    command: string
  }
}

export type WorktreeBootstrapPreviewResult =
  | { ok: true; preview: WorktreeBootstrapPreview }
  | { ok: false; message: string }

export type WorktreeBootstrapPreflight =
  | { kind: 'configured'; preview: WorktreeBootstrapPreview }
  | { kind: 'candidates'; candidates: WorktreeBootstrapCandidate[] }

export type WorktreeBootstrapPreflightResult =
  | { ok: true; preflight: WorktreeBootstrapPreflight }
  | { ok: false; message: string }

interface WorktreeBootstrapConfigLike {
  copy: readonly string[]
  symlink: readonly string[]
  hardlink: readonly string[]
  exclude: readonly string[]
  setup?: string
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

export function isWorktreeBootstrapCandidatePath(value: unknown): value is string {
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

export function normalizeWorktreeBootstrapSelections(value: unknown): WorktreeBootstrapSelection[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const result: WorktreeBootstrapSelection[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const raw = item as Record<string, unknown>
    if (!isWorktreeBootstrapCandidatePath(raw.path)) return null
    if (raw.mode !== 'copy' && raw.mode !== 'symlink') return null
    if (seen.has(raw.path)) return null
    seen.add(raw.path)
    result.push({ path: raw.path, mode: raw.mode })
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

export function worktreeBootstrapPreviewFromConfig(
  config: WorktreeBootstrapConfigLike | undefined,
  configHash?: string,
): WorktreeBootstrapPreview {
  const copyCount = config?.copy.length ?? 0
  const symlinkCount = config?.symlink.length ?? 0
  const hardlinkCount = config?.hardlink.length ?? 0
  const excludeCount = config?.exclude.length ?? 0
  const setup = config?.setup
  return {
    hasConfig: !!config,
    hasOperations: copyCount + symlinkCount + hardlinkCount > 0 || !!setup,
    configHash: config ? (configHash ?? null) : null,
    copyCount,
    symlinkCount,
    hardlinkCount,
    excludeCount,
    ...(setup ? { setup: { command: setup } } : {}),
  }
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

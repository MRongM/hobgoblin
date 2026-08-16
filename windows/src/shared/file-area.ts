import { normalizeRepoSessionEntry, type RepoSessionEntry } from '#/shared/remote-repo.ts'

export const FILE_AREA_TAB_IDS = ['files', 'changes', 'status', 'history', 'local', 'remoteBranches', 'ports'] as const

export type FileAreaTabId = (typeof FILE_AREA_TAB_IDS)[number]

export interface DetachedFileAreaReleasePoint {
  x: number
  y: number
}

interface DetachedFileAreaRequestBase {
  releasePoint?: DetachedFileAreaReleasePoint
}

export interface DetachedGitWorktreeFileAreaRequest extends DetachedFileAreaRequestBase {
  kind: 'git-worktree'
  repo: RepoSessionEntry
  branch: string
  tab: FileAreaTabId
}

export interface DetachedPlainProjectFileAreaRequest extends DetachedFileAreaRequestBase {
  kind: 'plain-project'
  repo: RepoSessionEntry
  tab: 'files'
}

export interface DetachedBranchWorkspaceFileAreaRequest extends DetachedFileAreaRequestBase {
  kind: 'branch-workspace'
  root: RepoSessionEntry
  branchWorkspaceId: string
  tab: Exclude<FileAreaTabId, 'ports'>
}

export type DetachedFileAreaWindowRequest =
  | DetachedGitWorktreeFileAreaRequest
  | DetachedPlainProjectFileAreaRequest
  | DetachedBranchWorkspaceFileAreaRequest

export type RendererSurfaceBootstrap =
  | { kind: 'main' }
  | { kind: 'detached-file-area'; request: DetachedFileAreaWindowRequest }

export type OpenDetachedFileAreaWindowResult = { ok: true; windowKey: string } | { ok: false; message: string }

const MAX_BRANCH_LENGTH = 512
const fileAreaTabIds = new Set<string>(FILE_AREA_TAB_IDS)
const branchWorkspaceTabIds = new Set<string>(FILE_AREA_TAB_IDS.filter((tab) => tab !== 'ports'))

export function normalizeDetachedFileAreaWindowRequest(value: unknown): DetachedFileAreaWindowRequest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const releasePoint = normalizeReleasePoint(input.releasePoint)
  if (input.releasePoint !== undefined && !releasePoint) return null
  if (input.kind === 'plain-project') {
    const repo = normalizeRepoSessionEntry(input.repo)
    if (!repo || input.tab !== 'files') return null
    return { kind: 'plain-project', repo, tab: 'files', ...(releasePoint ? { releasePoint } : {}) }
  }
  if (input.kind === 'branch-workspace') {
    const root = normalizeRepoSessionEntry(input.root)
    const branchWorkspaceId = safeIdentifier(input.branchWorkspaceId)
    if (!root || !branchWorkspaceId || typeof input.tab !== 'string' || !branchWorkspaceTabIds.has(input.tab))
      return null
    return {
      kind: 'branch-workspace',
      root,
      branchWorkspaceId,
      tab: input.tab as Exclude<FileAreaTabId, 'ports'>,
      ...(releasePoint ? { releasePoint } : {}),
    }
  }
  if (input.kind !== 'git-worktree') return null
  const repo = normalizeRepoSessionEntry(input.repo)
  const branch = safeIdentifier(input.branch)
  if (!repo || !branch || typeof input.tab !== 'string' || !fileAreaTabIds.has(input.tab)) return null
  return {
    kind: 'git-worktree',
    repo,
    branch,
    tab: input.tab as FileAreaTabId,
    ...(releasePoint ? { releasePoint } : {}),
  }
}

function safeIdentifier(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized && normalized.length <= MAX_BRANCH_LENGTH && !/[\x00-\x1f\x7f]/.test(normalized) ? normalized : null
}

function normalizeReleasePoint(value: unknown): DetachedFileAreaReleasePoint | null {
  if (value === undefined) return null
  if (!value || typeof value !== 'object') return null
  const point = value as Partial<DetachedFileAreaReleasePoint>
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: Math.round(point.x as number), y: Math.round(point.y as number) }
    : null
}

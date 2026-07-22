import { normalizeRepoSessionEntry, type RepoSessionEntry } from '#/shared/remote-repo.ts'

export const FILE_AREA_TAB_IDS = ['files', 'changes', 'status', 'history', 'local', 'remoteBranches', 'ports'] as const

export type FileAreaTabId = (typeof FILE_AREA_TAB_IDS)[number]

export interface DetachedFileAreaReleasePoint {
  x: number
  y: number
}

export interface DetachedFileAreaWindowRequest {
  repo: RepoSessionEntry
  branch: string
  tab: FileAreaTabId
  releasePoint?: DetachedFileAreaReleasePoint
}

export type RendererSurfaceBootstrap =
  | { kind: 'main' }
  | { kind: 'detached-file-area'; request: DetachedFileAreaWindowRequest }

export type OpenDetachedFileAreaWindowResult = { ok: true; windowKey: string } | { ok: false; message: string }

const MAX_BRANCH_LENGTH = 512
const fileAreaTabIds = new Set<string>(FILE_AREA_TAB_IDS)

export function normalizeDetachedFileAreaWindowRequest(value: unknown): DetachedFileAreaWindowRequest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<DetachedFileAreaWindowRequest>
  const repo = normalizeRepoSessionEntry(input.repo)
  const branch = typeof input.branch === 'string' ? input.branch.trim() : ''
  if (!repo || !branch || branch.length > MAX_BRANCH_LENGTH || /[\x00-\x1f\x7f]/.test(branch)) return null
  if (typeof input.tab !== 'string' || !fileAreaTabIds.has(input.tab)) return null
  const releasePoint = normalizeReleasePoint(input.releasePoint)
  if (input.releasePoint !== undefined && !releasePoint) return null
  return {
    repo,
    branch,
    tab: input.tab as FileAreaTabId,
    ...(releasePoint ? { releasePoint } : {}),
  }
}

function normalizeReleasePoint(value: unknown): DetachedFileAreaReleasePoint | null {
  if (value === undefined) return null
  if (!value || typeof value !== 'object') return null
  const point = value as Partial<DetachedFileAreaReleasePoint>
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: Math.round(point.x as number), y: Math.round(point.y as number) }
    : null
}

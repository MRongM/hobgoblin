import type { WorktreeInfo, WorktreeStatus } from '#/shared/git-types.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

export const REPO_RPC_UNAVAILABLE = 'error.remote-rpc-unavailable'
export const REPO_RPC_VERSION = 2
export const REPO_RPC_HEALTH_PATH = '/v1/health'
export const REPO_RPC_REPOSITORY_PATH = '/v1/repository'
export const REPO_RPC_MAX_RESPONSE_BYTES = 8 * 1024 * 1024
export const REPO_RPC_SESSION_IDLE_MS = 5 * 60_000

export const REPO_RPC_FAILURES = [
  'authentication',
  'directory',
  'queue-full',
  'queue-timeout',
  'scan-timeout',
  'scan',
  'response-too-large',
  'protocol',
  'tls',
  'connection',
  'request-timeout',
  'cancelled',
  'settings',
] as const
export type RepoRpcFailure = (typeof REPO_RPC_FAILURES)[number]
export type RepoRpcReadScope = 'snapshot' | 'combined' | 'status' | 'worktrees'

export class RepoRpcError extends Error {
  readonly reason: RepoRpcFailure

  constructor(reason: RepoRpcFailure = 'connection') {
    super(REPO_RPC_UNAVAILABLE)
    this.reason = reason
  }
}

export interface RepoRefreshStatus {
  status: WorktreeStatus[]
  stalePaths?: string[]
}

export type RepoRpcSettings = { alias: string; mode: 'ssh' | 'rpc'; endpoint: string; ca: string; revision: number }
export type RepoRpcSettingsInput =
  | { alias: string; mode: 'ssh'; revision: number }
  | ({ mode: 'rpc'; token: string } & Omit<RepoRpcSettings, 'mode'>)

export interface RepoRpcSnapshot extends Partial<RepoRefreshStatus> {
  snapshot?: RepoSnapshot
  worktrees: WorktreeInfo[]
}

export function isRepoRpcAlias(alias: unknown): alias is string {
  return (
    typeof alias === 'string' && /^[^!\s\u0000-\u001f\u007f*?/#\\][^\s\u0000-\u001f\u007f*?/#\\]{0,254}$/u.test(alias)
  )
}

export function isRepoRpcToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{32,256}$/u.test(value)
}

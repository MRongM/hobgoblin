import { getRepositorySnapshot, getRepositoryStatus, probeRepository } from '#/server/modules/repo-read-paths.ts'
import { getRepoRpcConnection } from '#/server/modules/remote-repo-rpc-settings-source.ts'
import { serverLogger } from '#/server/logger.ts'
import type { WorktreeStatus } from '#/shared/git-types.ts'
import { normalizeRemoteRepoRef, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { RepoRpcError, type RepoRefreshStatus, type RepoRpcReadScope } from '#/shared/remote-repo-rpc.ts'
import type { ProbeResult, RepoSnapshot } from '#/shared/rpc.ts'
import { readRepoRpcSnapshot } from '#/system/remote/repo-rpc-client.ts'

const logger = serverLogger.child({ module: 'repo-refresh' })

// Only UI refreshes use the selected transport. Write-side reads stay on the repository backend.
async function readRefresh<T>(
  cwd: string,
  scope: RepoRpcReadScope,
  signal: AbortSignal,
  readSshOrLocal: () => Promise<T>,
  projectRpc: (
    snapshot: Awaited<ReturnType<typeof readRepoRpcSnapshot>>,
    ref: NonNullable<ReturnType<typeof parseRemoteRepoId>>,
  ) => T,
): Promise<T> {
  const ref = parseRemoteRepoId(cwd)
  if (!ref || ref.transport === 'wsl') return await readSshOrLocal()

  const startedAt = performance.now()
  const duration = () => Math.round(performance.now() - startedAt)
  let protocol: 'ssh' | 'rpc' = 'rpc'
  try {
    const connection = await getRepoRpcConnection(ref.alias).catch(() => {
      throw new RepoRpcError('settings')
    })
    if (!connection) {
      protocol = 'ssh'
      const result = await readSshOrLocal()
      const unavailable =
        result === null || (typeof result === 'object' && result !== null && 'ok' in result && result.ok === false)
      const outcome = signal.aborted
        ? 'cancelled'
        : unavailable
          ? 'unavailable'
          : Array.isArray(result) && !result.length
            ? 'empty'
            : 'ok'
      logger.debug(
        { protocol, scope: scope === 'combined' ? 'snapshot' : scope, durationMs: duration(), outcome },
        'repository refresh read',
      )
      return result
    }
    const result = await readRepoRpcSnapshot(connection, ref.remotePath, scope, signal)
    const staleWorktrees = result.stalePaths?.length ?? 0
    logger.debug(
      { protocol, scope, durationMs: duration(), outcome: staleWorktrees ? 'partial' : 'ok', staleWorktrees },
      'repository refresh read',
    )
    return projectRpc(result, ref)
  } catch (error) {
    const reason = signal.aborted ? 'cancelled' : error instanceof RepoRpcError ? error.reason : 'read'
    logger[reason === 'cancelled' ? 'debug' : 'warn'](
      { protocol, scope, durationMs: duration(), outcome: reason },
      'repository refresh read',
    )
    throw error
  }
}

export async function getRefreshRepositorySnapshot(
  cwd: string,
  includeStatus: boolean,
  signal: AbortSignal,
): Promise<RepoSnapshot | null> {
  return await readRefresh(
    cwd,
    includeStatus ? 'combined' : 'snapshot',
    signal,
    () => getRepositorySnapshot(cwd, signal),
    (rpc) =>
      rpc.snapshot
        ? { ...rpc.snapshot, ...(rpc.status ? { status: rpc.status, stalePaths: rpc.stalePaths } : {}) }
        : null,
  )
}

export async function getRefreshRepositoryStatus(
  cwd: string,
  signal: AbortSignal,
): Promise<WorktreeStatus[] | RepoRefreshStatus> {
  return await readRefresh<WorktreeStatus[] | RepoRefreshStatus>(
    cwd,
    'status',
    signal,
    () => getRepositoryStatus(cwd, signal),
    (rpc) => ({ status: rpc.status ?? [], stalePaths: rpc.stalePaths }),
  )
}

export async function probeRefreshRepository(cwd: string, signal: AbortSignal): Promise<ProbeResult> {
  return await readRefresh(
    cwd,
    'worktrees',
    signal,
    () => probeRepository(cwd),
    (_rpc, ref) => ({ ok: true, root: cwd, name: normalizeRemoteRepoRef(ref)?.displayName, isGitRepo: true }),
  )
}

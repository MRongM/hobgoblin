import { persistRestorableRepoSnapshot } from '#/web/stores/repos/persistence.ts'
import { terminalBridge } from '#/web/terminal.ts'
import type { ReposGet, ReposSet } from '#/web/stores/repos/types.ts'

export async function runSnapshotSuccessWorkflow(
  set: ReposSet,
  get: ReposGet,
  options: {
    id: string
    token: number
    isSnapshotCurrent: () => boolean
  },
): Promise<void> {
  if (!options.isSnapshotCurrent()) return
  persistRestorableRepoSnapshot(set, get().repos[options.id], options.token)
  void terminalBridge.pruneTerminals(options.id).catch((err) => {
    console.warn('[terminal] failed to prune repo sessions', err)
  })
}

export async function runCoreDataRefreshWorkflow(get: ReposGet, options: { id: string; token: number }): Promise<void> {
  await get().refreshSnapshot(options.id, { token: options.token })
  const after = get().repos[options.id]
  if (!after || after.instanceToken !== options.token) return
  if (after.availability.phase === 'unavailable') return
  await get().refreshStatus(options.id, { token: options.token })
}

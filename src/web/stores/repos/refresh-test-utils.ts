import type { BranchSnapshotInfo } from '#/web/types.ts'
import {
  createBranchSnapshot,
  installGoblinTestBridge,
  resetReposStore,
  seedRepoState,
  type RpcTestHandler,
} from '#/web/stores/repos/test-utils.ts'
export const REPO_ID = '/tmp/gbl-test-repo'
export const rpcHandlers: Record<string, RpcTestHandler> = {}

export function branch(
  name: string,
  options: Partial<BranchSnapshotInfo> | undefined = {},
  legacyOptions: Partial<BranchSnapshotInfo> = {},
): BranchSnapshotInfo {
  return createBranchSnapshot(name, { ...options, ...legacyOptions })
}

export function seedRepo(branches: BranchSnapshotInfo[], instanceToken = 1): number {
  return seedRepoState({
    id: REPO_ID,
    branchSnapshots: branches,
    instanceToken,
    remote: {
      remotes: ['origin'],
      hasRemotes: true,
      hasBrowserRemote: true,
      browserRemoteProvider: 'github',
      remoteProviders: { origin: 'github' },
      hasGitHubRemote: true,
    },
  }).instanceToken
}

export function resetRefreshTest(): void {
  for (const key of Object.keys(rpcHandlers)) delete rpcHandlers[key]
  resetReposStore()
  installGoblinTestBridge(rpcHandlers)
  rpcHandlers['repo.abort'] = async () => false
  rpcHandlers['repo.probe'] = async ({ cwd }: { cwd: string }) => ({
    ok: true,
    root: cwd,
    name: cwd.split('/').at(-1) ?? cwd,
    isGitRepo: true,
  })
  rpcHandlers['remote.resolveTarget'] = async ({ alias, remotePath }: { alias: string; remotePath: string }) => ({
    target: {
      id: `ssh-config://${encodeURIComponent(alias)}${remotePath}`,
      alias,
      host: `${alias}.example.com`,
      user: 'tester',
      port: 22,
      remotePath,
      displayName: `${alias}:${remotePath.split('/').at(-1) || '/'}`,
    },
  })
  rpcHandlers['repo.fetch'] = async () => ({ ok: true, message: 'ok' })
  rpcHandlers['repo.snapshot'] = async () => ({ branches: [], current: '' })
  rpcHandlers['repo.status'] = async () => []
  rpcHandlers['terminal.create'] = async (input: { kind?: string }) => ({
    ok: true,
    action: input?.kind === 'primary' ? 'reused' : 'created',
    key: input?.kind === 'primary' ? 'repo\0worktree\0terminal-1' : 'repo\0worktree\0terminal-2',
    sessions: [],
  })
  rpcHandlers['terminal.prune'] = async () => ({ pruned: 0, remaining: 0 })
}

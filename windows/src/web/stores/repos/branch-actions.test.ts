import { beforeEach, describe, expect, test } from 'vitest'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { markRepoOperationTargets, nextRepoOperationId, repoOperation } from '#/web/stores/repos/runtime.ts'
import { repoBranchActionReason } from '#/web/stores/repos/branch-actions.ts'
import { replaceRepo } from '#/web/stores/repos/helpers.ts'
import { getBranchActionCapabilities } from '#/web/hooks/useBranchActions.tsx'
import { repositoryBrowserRemoteProvider } from '#/web/hooks/useBranchActionItems.tsx'
import {
  createBranchSnapshot,
  createRepoBranch,
  installGoblinTestBridge,
  resetReposStore,
  seedRepoState,
} from '#/web/stores/repos/test-utils.ts'
import type { RepoBranchAction } from '#/web/stores/repos/branch-action-types.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
const REPO_ID = '/tmp/gbl-branch-actions-test-repo'

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  resetReposStore()
  seedRepoState({
    id: REPO_ID,
    instanceToken: 1,
    branches: [createRepoBranch('feature/a'), createRepoBranch('feature/b')],
  })
})

function updateRepoForTest(
  mutator: (repo: NonNullable<ReturnType<typeof useReposStore.getState>['repos'][string]>) => void,
) {
  useReposStore.setState((s) => {
    const repo = s.repos[REPO_ID]
    if (!repo) return s
    return { repos: { ...s.repos, [REPO_ID]: replaceRepo(repo, mutator) } }
  })
}

function setSelectionForTest(selectedBranch: string) {
  updateRepoForTest((repo) => {
    repo.ui.selectedBranch = selectedBranch
  })
}

function installSuccessfulCreateWorktreeBridge(options?: { onSnapshot?: () => void }) {
  installGoblinTestBridge({
    'repo.createWorktree': async () => ({ ok: true, message: 'ok' }),
    'repo.snapshot': async () => {
      options?.onSnapshot?.()
      return {
        branches: [
          createBranchSnapshot('feature/a'),
          createBranchSnapshot('feature/b'),
          createBranchSnapshot('feature/new', { worktree: { path: '/tmp/gbl-branch-actions-test-worktree' } }),
        ],
        current: 'feature/a',
      }
    },
    'repo.status': async () => [],
  })
}

function createNewBranchWorktreeAction(
  options: {
    worktreePath?: string
    newBranch?: string
    baseRef?: string
  } = {},
): RepoBranchAction {
  return {
    kind: 'createWorktree',
    input: {
      worktreePath: options.worktreePath ?? '/tmp/gbl-branch-actions-test-worktree',
      mode: {
        kind: 'newBranch',
        newBranch: options.newBranch ?? 'feature/new',
        creationBase: { kind: 'localBranch', branch: options.baseRef ?? 'feature/a' },
      },
      syncBeforeCreate: false,
    },
    worktreeBootstrap: { kind: 'skip' },
  }
}

describe('branch action capabilities', () => {
  test('gates remote-only actions when a repo transitions to local-only', () => {
    const branch = createRepoBranch('feature/local', { worktree: { path: '/tmp/gbl-branch-actions-test-worktree' } })
    seedRepoState({
      id: REPO_ID,
      branches: [branch],
      remote: {
        remotes: ['origin'],
        hasRemotes: true,
        hasBrowserRemote: true,
        browserRemoteProvider: 'github',
        remoteProviders: { origin: 'github' },
        hasGitHubRemote: true,
      },
    })
    let repo = useReposStore.getState().repos[REPO_ID]!

    expect(getBranchActionCapabilities(repo, branch)).toMatchObject({
      canPush: true,
      canOpenRemote: true,
      canOpenTerminal: true,
      canOpenEditor: true,
    })

    updateRepoForTest((repo) => {
      repo.remote.remotes = []
      repo.remote.hasRemotes = false
      repo.remote.hasBrowserRemote = false
      repo.remote.browserRemoteProvider = undefined
      repo.remote.remoteProviders = {}
      repo.remote.hasGitHubRemote = false
    })
    repo = useReposStore.getState().repos[REPO_ID]!

    expect(getBranchActionCapabilities(repo, branch)).toMatchObject({
      canPush: false,
      canOpenRemote: false,
      canOpenTerminal: true,
      canOpenEditor: true,
    })
  })

  test('uses canonical worktree state to gate primary worktree removal', () => {
    const branch = createRepoBranch('feature/main-worktree', { worktree: { path: REPO_ID } })
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [branch],
      currentBranch: 'main',
      worktreesByPath: {
        [REPO_ID]: {
          path: REPO_ID,
          branch: 'feature/main-worktree',
          isMain: true,
        },
      },
    })

    expect(branch.worktree).toEqual({ path: REPO_ID })
    expect(getBranchActionCapabilities(repo, branch)).toMatchObject({
      checkedOutInAnotherWorktree: true,
      canRemoveWorktree: false,
    })
  })

  test('keeps removal but enables separate cleanup for a prunable linked worktree', () => {
    const worktreePath = '/tmp/gbl-branch-actions-stale-worktree'
    const branch = createRepoBranch('feature/stale', { worktree: { path: worktreePath } })
    const repo = seedRepoState({
      id: REPO_ID,
      branches: [branch],
      currentBranch: 'main',
      worktreesByPath: {
        [worktreePath]: {
          path: worktreePath,
          branch: branch.name,
          isMain: false,
          isLocked: false,
          isPrunable: true,
        },
      },
    })

    expect(getBranchActionCapabilities(repo, branch)).toMatchObject({
      checkedOutInAnotherWorktree: true,
      canRemoveWorktree: false,
      canCleanupWorktree: true,
    })
  })

  test('allows browser actions for non-GitHub web remotes', () => {
    const branch = createRepoBranch('feature/gitlab')
    seedRepoState({
      id: REPO_ID,
      branches: [branch],
      remote: {
        remotes: ['origin'],
        hasRemotes: true,
        hasBrowserRemote: true,
        browserRemoteProvider: 'gitlab',
        remoteProviders: { origin: 'gitlab' },
        hasGitHubRemote: false,
      },
    })

    expect(getBranchActionCapabilities(useReposStore.getState().repos[REPO_ID]!, branch)).toMatchObject({
      canPush: true,
      canOpenRemote: true,
    })
  })

  test('allows terminal and editor actions for remote worktrees', () => {
    const branch = createRepoBranch('feature/remote', { worktree: { path: '/srv/repo-feature' } })
    const target = normalizeRemoteTarget({
      alias: 'example',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
    })
    expect(target).not.toBeNull()
    seedRepoState({
      id: target!.id,
      branches: [branch],
      remote: {
        target: target!,
        remotes: ['origin'],
        hasRemotes: true,
        hasBrowserRemote: true,
        browserRemoteProvider: 'github',
        remoteProviders: { origin: 'github' },
        hasGitHubRemote: true,
      },
    })

    expect(getBranchActionCapabilities(useReposStore.getState().repos[target!.id]!, branch)).toMatchObject({
      canOpenTerminal: true,
      canOpenEditor: true,
    })
  })

  test('uses the repository browser provider for repository remote actions', () => {
    const branch = createRepoBranch('feature/provider', { tracking: 'gitlab-upstream/feature/provider' })
    seedRepoState({
      id: REPO_ID,
      branches: [branch],
      remote: {
        remotes: ['origin', 'gitlab-upstream'],
        hasRemotes: true,
        hasBrowserRemote: true,
        browserRemoteProvider: 'github',
        remoteProviders: { origin: 'github', 'gitlab-upstream': 'gitlab' },
        hasGitHubRemote: true,
      },
    })

    expect(repositoryBrowserRemoteProvider(useReposStore.getState().repos[REPO_ID]!)).toBe('github')
  })
})

describe('runBranchAction', () => {
  test('assigns invalid worktree cleanup its own serialized operation reason', () => {
    expect(repoBranchActionReason('cleanupWorktree' as RepoBranchAction['kind'])).toBe('branch:cleanupWorktree')
  })

  test('forwards invalid worktree cleanup through the repository action queue', async () => {
    let cleanupInput: Record<string, unknown> | null = null
    installGoblinTestBridge({
      'repo.cleanupWorktree': async (input: Record<string, unknown>) => {
        cleanupInput = input
        return { ok: true, message: 'pruned' }
      },
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
      'repo.status': async () => [],
    })

    await useReposStore.getState().runBranchAction(REPO_ID, {
      kind: 'cleanupWorktree',
      branch: 'feature/a',
      worktreePath: '/tmp/gbl-branch-actions-test-worktree',
    })

    expect(cleanupInput).toMatchObject({
      cwd: REPO_ID,
      worktreePath: '/tmp/gbl-branch-actions-test-worktree',
      sourceToken: expect.any(String),
    })
  })

  test('forwards worktree force independently from branch force', async () => {
    let removeInput: Record<string, unknown> | null = null
    installGoblinTestBridge({
      'repo.removeWorktree': async (input: Record<string, unknown>) => {
        removeInput = input
        return { ok: true, message: 'ok' }
      },
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
      'repo.status': async () => [],
    })

    await useReposStore.getState().runBranchAction(REPO_ID, {
      kind: 'removeWorktree',
      branch: 'feature/a',
      worktreePath: '/tmp/gbl-branch-actions-test-worktree',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      forceDeleteBranch: false,
    })

    expect(removeInput).toMatchObject({
      cwd: REPO_ID,
      branch: 'feature/a',
      worktreePath: '/tmp/gbl-branch-actions-test-worktree',
      alsoDeleteBranch: false,
      forceRemoveWorktree: true,
      forceDeleteBranch: false,
    })
  })

  test('blocks local branch actions while remote fetch resource is busy', async () => {
    let checkoutCalls = 0
    installGoblinTestBridge({
      'repo.checkout': async () => {
        checkoutCalls += 1
        return { ok: true, message: 'ok' }
      },
    })
    markRepoOperationTargets(REPO_ID, nextRepoOperationId(REPO_ID), [{ key: 'fetch', reason: 'fetch' }], 'running')

    const result = await useReposStore.getState().runBranchAction(REPO_ID, { kind: 'checkout', branch: 'feature/a' })

    expect(result).toEqual({ ok: false, message: 'error.network-op-in-progress' })
    expect(checkoutCalls).toBe(0)
  })

  test('blocks branch actions while a foreground fetch is running', async () => {
    let pullCalls = 0
    let resolveFetch!: (value: { ok: true; message: string }) => void
    updateRepoForTest((repo) => {
      repo.remote.hasRemotes = true
    })
    installGoblinTestBridge({
      'repo.probe': async ({ cwd }: { cwd: string }) => ({ ok: true, root: cwd, name: 'repo', isGitRepo: true }),
      'repo.fetch': () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ ok: true, message: 'ok' })
        }),
      'repo.pull': async () => {
        pullCalls += 1
        return { ok: true, message: 'ok' }
      },
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
      'repo.status': async () => [],
    })

    const syncWork = useReposStore.getState().syncAndRefresh(REPO_ID)
    await flushAsyncWork()
    const result = await useReposStore.getState().runBranchAction(REPO_ID, { kind: 'pull', branch: 'feature/a' })

    expect(result).toEqual({ ok: false, message: 'error.network-op-in-progress' })
    expect(pullCalls).toBe(0)

    resolveFetch({ ok: true, message: 'ok' })
    await syncWork
  })

  test('tracks branch action operation state while the action is running', async () => {
    let release!: () => void
    installGoblinTestBridge({
      'repo.push': () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: false, message: 'cancelled' })
        }),
    })

    const work = useReposStore.getState().runBranchAction(REPO_ID, { kind: 'push', branch: 'feature/a' })
    const running = useReposStore.getState().repos[REPO_ID]

    expect(running?.operations.branchAction).toMatchObject({
      phase: 'running',
      reason: 'branch:push',
      target: 'feature/a',
    })
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('running')
    expect(repoOperation(REPO_ID, 'branchAction').target).toBe('feature/a')

    release()
    await work

    const settled = useReposStore.getState().repos[REPO_ID]
    expect(settled?.operations.branchAction).toMatchObject({
      phase: 'idle',
      target: null,
    })
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('idle')
    expect(repoOperation(REPO_ID, 'branchAction').target).toBeNull()
  })

  test('does not run a queued local branch action after the repo is reopened', async () => {
    let checkoutCalls = 0
    let resolveStatus!: (value: never[]) => void
    installGoblinTestBridge({
      'repo.status': () =>
        new Promise((resolve) => {
          resolveStatus = () => resolve([])
        }),
      'repo.checkout': async () => {
        checkoutCalls += 1
        return { ok: true, message: 'ok' }
      },
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
    })

    const statusWork = useReposStore.getState().refreshStatus(REPO_ID)
    await flushAsyncWork()
    const checkoutWork = useReposStore.getState().runBranchAction(REPO_ID, {
      kind: 'checkout',
      branch: 'feature/a',
    })
    await flushAsyncWork()

    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction).toMatchObject({
      phase: 'queued',
      reason: 'branch:checkout',
      target: 'feature/a',
    })

    seedRepoState({
      id: REPO_ID,
      instanceToken: 2,
      branches: [createRepoBranch('feature/reopened')],
      currentBranch: 'feature/reopened',
    })

    resolveStatus([])
    await Promise.all([statusWork, checkoutWork])

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(checkoutCalls).toBe(0)
    expect(repo?.instanceToken).toBe(2)
    expect(repo?.operations.branchAction).toMatchObject({
      phase: 'idle',
      target: null,
    })
    expect(repo?.data.currentBranch).toBe('feature/reopened')
  })

  test('times out queued branch actions that wait too long for core refreshes', async () => {
    let checkoutCalls = 0
    installGoblinTestBridge({
      'repo.status': () => new Promise(() => {}),
      'repo.checkout': async () => {
        checkoutCalls += 1
        return { ok: true, message: 'ok' }
      },
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
    })

    void useReposStore.getState().refreshStatus(REPO_ID)
    await flushAsyncWork()
    const result = await useReposStore.getState().runBranchAction(
      REPO_ID,
      {
        kind: 'checkout',
        branch: 'feature/a',
      },
      { waitTimeoutMs: 1 },
    )

    expect(result).toEqual({ ok: false, message: 'error.branch-action-wait-timeout' })
    expect(checkoutCalls).toBe(0)
    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: false, message: 'error.branch-action-wait-timeout' },
      action: {
        kind: 'checkout',
        branch: 'feature/a',
      },
    })
    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction).toMatchObject({
      phase: 'idle',
      target: null,
    })
  })

  test('records network-op-in-progress results without triggering branch-action refresh follow-up', async () => {
    let snapshotCalls = 0
    let statusCalls = 0
    installGoblinTestBridge({
      'repo.pull': async () => ({ ok: false, message: 'error.network-op-in-progress' }),
      'repo.snapshot': async () => {
        snapshotCalls += 1
        return { branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }
      },
      'repo.status': async () => {
        statusCalls += 1
        return []
      },
    })

    const result = await useReposStore.getState().runBranchAction(REPO_ID, { kind: 'pull', branch: 'feature/a' })

    expect(result).toEqual({ ok: false, message: 'error.network-op-in-progress' })
    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: false, message: 'error.network-op-in-progress' },
      action: {
        kind: 'pull',
        branch: 'feature/a',
      },
    })
    expect(snapshotCalls).toBe(0)
    expect(statusCalls).toBe(0)
  })

  test('clears operation phase after failed branch network actions', async () => {
    installGoblinTestBridge({
      'repo.pull': async () => ({ ok: false, message: 'boom' }),
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
      'repo.status': async () => [],
    })

    const result = await useReposStore
      .getState()
      .runBranchAction(REPO_ID, { kind: 'pull', branch: 'feature/a' }, { refreshOnError: false })

    expect(result).toEqual({ ok: false, message: 'boom' })
    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction).toMatchObject({
      phase: 'idle',
      target: null,
    })
  })

  test('waits for core refresh reads before running queued branch network actions', async () => {
    let pullCalls = 0
    let statusCalls = 0
    let resolveStatus!: (value: never[]) => void
    let resolvePull!: (value: { ok: true; message: string }) => void
    installGoblinTestBridge({
      'repo.status': () => {
        statusCalls += 1
        if (statusCalls > 1) return []
        return new Promise((resolve) => {
          resolveStatus = () => resolve([])
        })
      },
      'repo.pull': () => {
        pullCalls += 1
        return new Promise((resolve) => {
          resolvePull = () => resolve({ ok: true, message: 'ok' })
        })
      },
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
    })

    const statusWork = useReposStore.getState().refreshStatus(REPO_ID)
    await flushAsyncWork()
    const pullWork = useReposStore.getState().runBranchAction(REPO_ID, { kind: 'pull', branch: 'feature/a' })
    await flushAsyncWork()

    expect(pullCalls).toBe(0)
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('queued')
    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('queued')

    resolveStatus([])
    await flushAsyncWork()

    expect(pullCalls).toBe(1)
    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('running')
    resolvePull({ ok: true, message: 'ok' })
    await Promise.all([statusWork, pullWork])
  })

  test.each([
    ['checkout', { kind: 'checkout', branch: 'feature/a' }, 'repo.checkout'],
    ['createWorktree', createNewBranchWorktreeAction(), 'repo.createWorktree'],
    ['createBranch', { kind: 'createBranch', branch: 'feature/new', baseBranch: 'feature/a' }, 'repo.createBranch'],
    [
      'trackRemoteBranch',
      { kind: 'trackRemoteBranch', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
      'repo.trackRemoteBranch',
    ],
    ['deleteBranch', { kind: 'deleteBranch', branch: 'feature/a' }, 'repo.deleteBranch'],
    [
      'removeWorktree',
      {
        kind: 'removeWorktree',
        branch: 'feature/a',
        worktreePath: '/tmp/gbl-branch-actions-test-worktree',
        alsoDeleteBranch: false,
      },
      'repo.removeWorktree',
    ],
    [
      'cleanupWorktree',
      {
        kind: 'cleanupWorktree',
        branch: 'feature/a',
        worktreePath: '/tmp/gbl-branch-actions-test-worktree',
      },
      'repo.cleanupWorktree',
    ],
  ] satisfies Array<[string, RepoBranchAction, string]>)(
    'waits for core refresh reads before running queued %s actions',
    async (_label, action, rpcPath) => {
      let actionCalls = 0
      let statusCalls = 0
      let resolveStatus!: (value: never[]) => void
      let resolveAction!: (value: { ok: true; message: string }) => void
      installGoblinTestBridge({
        [rpcPath]: () => {
          actionCalls += 1
          return new Promise((resolve) => {
            resolveAction = () => resolve({ ok: true, message: 'ok' })
          })
        },
        'repo.status': () => {
          statusCalls += 1
          if (statusCalls > 1) return []
          return new Promise((resolve) => {
            resolveStatus = () => resolve([])
          })
        },
        'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
      })

      const statusWork = useReposStore.getState().refreshStatus(REPO_ID)
      await flushAsyncWork()
      const actionWork = useReposStore.getState().runBranchAction(REPO_ID, action)
      await flushAsyncWork()

      expect(actionCalls).toBe(0)
      expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('queued')

      resolveStatus([])
      await flushAsyncWork()

      expect(actionCalls).toBe(1)
      expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('running')
      resolveAction({ ok: true, message: 'ok' })
      await Promise.all([statusWork, actionWork])
    },
  )

  test('tracks create worktree operation state while the action is running', async () => {
    let release!: () => void
    installGoblinTestBridge({
      'repo.createWorktree': () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: false, message: 'cancelled' })
        }),
    })

    const work = useReposStore.getState().runBranchAction(REPO_ID, {
      ...createNewBranchWorktreeAction(),
    })
    const running = useReposStore.getState().repos[REPO_ID]

    expect(running?.operations.branchAction).toMatchObject({
      phase: 'running',
      reason: 'branch:createWorktree',
      target: 'feature/new',
    })
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('running')
    expect(repoOperation(REPO_ID, 'branchAction').target).toBe('feature/new')

    release()
    await work

    const settled = useReposStore.getState().repos[REPO_ID]
    expect(settled?.operations.branchAction).toMatchObject({
      phase: 'idle',
      target: null,
    })
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('idle')
    expect(repoOperation(REPO_ID, 'branchAction').target).toBeNull()
  })

  test('tracks create branch operation state while the action is running', async () => {
    let release!: () => void
    installGoblinTestBridge({
      'repo.createBranch': () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, message: 'ok' })
        }),
      'repo.snapshot': async () => ({
        branches: [createBranchSnapshot('feature/a'), createBranchSnapshot('feature/new')],
        current: 'feature/a',
      }),
      'repo.status': async () => [],
    })

    const work = useReposStore
      .getState()
      .runBranchAction(REPO_ID, { kind: 'createBranch', branch: 'feature/new', baseBranch: 'feature/a' })
    const running = useReposStore.getState().repos[REPO_ID]

    expect(running?.operations.branchAction).toMatchObject({
      phase: 'running',
      reason: 'branch:createBranch',
      target: 'feature/new',
    })
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('running')
    expect(repoOperation(REPO_ID, 'branchAction').target).toBe('feature/new')

    release()
    await work

    const settled = useReposStore.getState().repos[REPO_ID]
    expect(settled?.operations.branchAction).toMatchObject({
      phase: 'idle',
      target: null,
    })
    expect(repoOperation(REPO_ID, 'branchAction').phase).toBe('idle')
    expect(repoOperation(REPO_ID, 'branchAction').target).toBeNull()
  })

  test('submitBranchAction starts create worktree without waiting for completion', async () => {
    let release!: () => void
    installGoblinTestBridge({
      'repo.createWorktree': () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, message: 'ok' })
        }),
      'repo.snapshot': async () => ({ branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }),
      'repo.status': async () => [],
    })

    useReposStore.getState().submitBranchAction(REPO_ID, {
      ...createNewBranchWorktreeAction(),
    })

    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction).toMatchObject({
      phase: 'running',
      reason: 'branch:createWorktree',
      target: 'feature/new',
    })

    release()
    await flushAsyncWork()
  })

  test('records branch action metadata on result events', async () => {
    installGoblinTestBridge({
      'repo.createWorktree': async () => ({ ok: false, message: 'error.invalid-path' }),
    })

    await useReposStore.getState().runBranchAction(
      REPO_ID,
      {
        ...createNewBranchWorktreeAction(),
      },
      { token: 1, refreshOnError: false },
    )

    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: false, message: 'error.invalid-path' },
      action: {
        kind: 'createWorktree',
        branch: 'feature/new',
        worktreePath: '/tmp/gbl-branch-actions-test-worktree',
      },
    })
  })

  test('records track remote branch metadata on result events', async () => {
    installGoblinTestBridge({
      'repo.trackRemoteBranch': async () => ({ ok: true, message: 'ok' }),
      'repo.snapshot': async () => ({
        branches: [createBranchSnapshot('feature/a'), createBranchSnapshot('feature/new')],
        current: 'feature/a',
      }),
      'repo.status': async () => [],
    })

    await useReposStore
      .getState()
      .runBranchAction(
        REPO_ID,
        { kind: 'trackRemoteBranch', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
        { token: 1 },
      )

    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: true, message: 'ok' },
      action: {
        kind: 'trackRemoteBranch',
        branch: 'feature/new',
        remoteRef: 'origin/feature/new',
      },
    })
  })

  test.each([
    ['origin/release', 'origin/release'],
    [null, undefined],
  ] as const)('routes branch upstream %s and records the mutation event', async (remoteRef, expectedTracking) => {
    let request: Record<string, unknown> | null = null
    installGoblinTestBridge({
      'repo.setBranchUpstream': async (input) => {
        request = input
        return { ok: true, message: 'ok' }
      },
      'repo.snapshot': async () => ({
        branches: [createBranchSnapshot('feature/a', { tracking: expectedTracking })],
        current: 'feature/a',
      }),
      'repo.status': async () => [],
    })

    await useReposStore.getState().runBranchAction(
      REPO_ID,
      { kind: 'setBranchUpstream', branch: 'feature/a', remoteRef } as unknown as RepoBranchAction,
      { token: 1 },
    )

    expect(request).toMatchObject({ cwd: REPO_ID, branch: 'feature/a', remoteRef })
    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: true, message: 'ok' },
      action: { kind: 'setBranchUpstream', branch: 'feature/a', remoteRef },
    })
    expect(useReposStore.getState().repos[REPO_ID]?.data.branches[0]?.tracking).toBe(expectedTracking)
  })

  test('selects the new worktree branch after creating a worktree', async () => {
    setSelectionForTest('feature/a')
    installSuccessfulCreateWorktreeBridge()

    await useReposStore.getState().runBranchAction(
      REPO_ID,
      {
        ...createNewBranchWorktreeAction(),
      },
      { token: 1 },
    )

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/new')
  })

  test('updates selection to visible worktree branch after refresh', async () => {
    setSelectionForTest('feature/a')
    installSuccessfulCreateWorktreeBridge()

    await useReposStore.getState().runBranchAction(
      REPO_ID,
      {
        ...createNewBranchWorktreeAction(),
      },
      { token: 1 },
    )

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/new')
  })

  test.each([
    ['failed', { ok: false, message: 'error.invalid-path' }],
    ['cancelled', { ok: false, message: 'cancelled' }],
  ])('keeps the current branch selection when create worktree is %s', async (_label, result) => {
    setSelectionForTest('feature/a')
    installGoblinTestBridge({
      'repo.createWorktree': async () => result,
    })

    await useReposStore.getState().runBranchAction(
      REPO_ID,
      {
        ...createNewBranchWorktreeAction(),
      },
      { token: 1, refreshOnError: false },
    )

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/a')
  })

  test('does not let stale create worktree refresh results change selection', async () => {
    setSelectionForTest('feature/a')
    installSuccessfulCreateWorktreeBridge({
      onSnapshot: () => {
        seedRepoState({
          id: REPO_ID,
          instanceToken: 2,
          branches: [createRepoBranch('feature/a'), createRepoBranch('feature/new')],
          selectedBranch: 'feature/a',
        })
        setSelectionForTest('feature/a')
      },
    })

    await useReposStore.getState().runBranchAction(
      REPO_ID,
      {
        ...createNewBranchWorktreeAction(),
      },
      { token: 1 },
    )

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.instanceToken).toBe(2)
    expect(repo?.ui.selectedBranch).toBe('feature/a')
  })

  test('does not let stale branch action refresh results overwrite a reopened repo', async () => {
    let resolveSnapshot!: () => void
    installGoblinTestBridge({
      'repo.pull': async () => ({ ok: true, message: 'ok' }),
      'repo.snapshot': () =>
        new Promise((resolve) => {
          resolveSnapshot = () =>
            resolve({ branches: [createBranchSnapshot('feature/stale')], current: 'feature/stale' })
        }),
      'repo.status': async () => [],
    })

    const work = useReposStore.getState().runBranchAction(REPO_ID, { kind: 'pull', branch: 'feature/a' })
    await flushAsyncWork()
    seedRepoState({
      id: REPO_ID,
      instanceToken: 2,
      branches: [createRepoBranch('feature/new-instance')],
      currentBranch: 'feature/new-instance',
    })

    resolveSnapshot()
    await work

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.instanceToken).toBe(2)
    expect(repo?.data.currentBranch).toBe('feature/new-instance')
    expect(repo?.data.branches.map((branch) => branch.name)).toEqual(['feature/new-instance'])
  })

  test('keeps selection after non-create branch actions refresh', async () => {
    setSelectionForTest('feature/a')
    installGoblinTestBridge({
      'repo.deleteBranch': async () => ({ ok: true, message: 'ok' }),
      'repo.snapshot': async () => ({
        branches: [
          createBranchSnapshot('feature/a', { worktree: { path: '/tmp/gbl-worktree-a' } }),
          createBranchSnapshot('feature/new', { worktree: { path: '/tmp/gbl-branch-actions-test-worktree' } }),
        ],
        current: 'feature/a',
      }),
      'repo.status': async () => [],
    })

    await useReposStore
      .getState()
      .runBranchAction(REPO_ID, { kind: 'deleteBranch', branch: 'feature/b', force: false }, { token: 1 })

    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo?.ui.selectedBranch).toBe('feature/a')
  })

  test.each([
    ['checkout', { kind: 'checkout', branch: 'feature/a' }, 'repo.checkout'],
    ['pull', { kind: 'pull', branch: 'feature/a' }, 'repo.pull'],
    ['push', { kind: 'push', branch: 'feature/a' }, 'repo.push'],
    ['createWorktree', createNewBranchWorktreeAction(), 'repo.createWorktree'],
    ['createBranch', { kind: 'createBranch', branch: 'feature/new', baseBranch: 'feature/a' }, 'repo.createBranch'],
    [
      'trackRemoteBranch',
      { kind: 'trackRemoteBranch', localBranch: 'feature/new', remoteRef: 'origin/feature/new' },
      'repo.trackRemoteBranch',
    ],
    ['deleteBranch', { kind: 'deleteBranch', branch: 'feature/a' }, 'repo.deleteBranch'],
    [
      'removeWorktree',
      {
        kind: 'removeWorktree',
        branch: 'feature/a',
        worktreePath: '/tmp/gbl-branch-actions-test-worktree',
        alsoDeleteBranch: false,
      },
      'repo.removeWorktree',
    ],
    [
      'cleanupWorktree',
      {
        kind: 'cleanupWorktree',
        branch: 'feature/a',
        worktreePath: '/tmp/gbl-branch-actions-test-worktree',
      },
      'repo.cleanupWorktree',
    ],
  ] satisfies Array<[string, RepoBranchAction, string]>)(
    'rejects %s for non-git repositories before rpc scheduling',
    async (_label, action, rpcPath) => {
      let actionCount = 0
      let snapshotCount = 0
      let statusCount = 0
      let fetchCount = 0
      const handlers: Record<string, (input: any) => unknown> = {
        [rpcPath]: async () => {
          actionCount += 1
          return { ok: true, message: 'ok' }
        },
        'repo.fetch': async () => {
          fetchCount += 1
          return { ok: true, message: 'ok' }
        },
        'repo.snapshot': async () => {
          snapshotCount += 1
          return { branches: [createBranchSnapshot('feature/a')], current: 'feature/a' }
        },
        'repo.status': async () => {
          statusCount += 1
          return []
        },
      }
      installGoblinTestBridge(handlers)
      updateRepoForTest((repo) => {
        repo.isGitRepo = false
      })

      const result = await useReposStore.getState().runBranchAction(REPO_ID, action, { token: 1 })

      expect(result).toEqual({ ok: false, message: 'error.not-git-repo' })
      expect(actionCount).toBe(0)
      expect(fetchCount).toBe(0)
      expect(snapshotCount).toBe(0)
      expect(statusCount).toBe(0)
      expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('idle')
      expect(useReposStore.getState().repos[REPO_ID]?.resources.fetch.phase).toBe('idle')
      expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
        kind: 'result',
        result: { ok: false, message: 'error.not-git-repo' },
      })
      expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toHaveProperty('action')
    },
  )

  test('submitBranchAction still routes non-git work through the guarded branch action path', async () => {
    let checkoutCount = 0
    installGoblinTestBridge({
      'repo.checkout': async () => {
        checkoutCount += 1
        return { ok: true, message: 'ok' }
      },
    })
    updateRepoForTest((repo) => {
      repo.isGitRepo = false
    })

    useReposStore.getState().submitBranchAction(REPO_ID, { kind: 'checkout', branch: 'feature/a' }, { token: 1 })
    await flushAsyncWork()

    expect(checkoutCount).toBe(0)
    expect(useReposStore.getState().repos[REPO_ID]?.operations.branchAction.phase).toBe('idle')
    expect(useReposStore.getState().repos[REPO_ID]?.events.at(-1)).toMatchObject({
      kind: 'result',
      result: { ok: false, message: 'error.not-git-repo' },
      action: {
        kind: 'checkout',
        branch: 'feature/a',
      },
    })
  })
})

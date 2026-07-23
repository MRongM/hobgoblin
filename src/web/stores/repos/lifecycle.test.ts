import { beforeEach, describe, expect, test, vi } from 'vitest'
import { normalizeRemoteRepoRef, normalizeRemoteTarget, remoteRepoSessionEntry } from '#/shared/remote-repo.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { BranchSnapshotInfo } from '#/web/types.ts'
import {
  branchSnapshot,
  flushRpc,
  installGoblin,
  REPO_A,
  REPO_B,
  resetLifecycleTest,
} from '#/web/stores/repos/lifecycle-test-utils.ts'

const mocks = vi.hoisted(() => ({
  stopPortForwardSessionsForRepo: vi.fn(async () => ({ ok: true, stopped: [] })),
}))

vi.mock('#/web/port-forwarding-client.ts', () => ({
  stopPortForwardSessionsForRepo: mocks.stopPortForwardSessionsForRepo,
}))

beforeEach(resetLifecycleTest)

describe('repo lifecycle', () => {
  test('uses configured restoration for automatic open and complete discovery for manual rescan', async () => {
    const root = '/tmp/gbl-workspace'
    const restoreCalls: string[] = []
    const discoverCalls: string[] = []
    const workspaceResult = {
      ok: true as const,
      rootId: root,
      repositories: [],
      candidates: [],
      configuration: { kind: 'missing' as const },
      skipped: [],
    }
    installGoblin({
      probe: (cwd: string) => ({ ok: true, root: cwd, name: 'workspace', isGitRepo: false }),
      'workspace.restore': ({ rootPath }: { rootPath: string }) => {
        restoreCalls.push(rootPath)
        return workspaceResult
      },
      'workspace.discover': ({ rootPath }: { rootPath: string }) => {
        discoverCalls.push(rootPath)
        return workspaceResult
      },
    })

    await useReposStore.getState().ensureWorkspaceOpen(root)
    expect(restoreCalls).toEqual([root])
    expect(discoverCalls).toEqual([])

    await useReposStore.getState().rescanWorkspace(root)
    expect(discoverCalls).toEqual([root])
  })

  test('opens a remote plain directory as one workspace with remote child repository targets', async () => {
    const rootTarget = normalizeRemoteTarget({
      alias: 'example',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/workspace',
    })!
    const api = normalizeRemoteRepoRef({ alias: 'example', remotePath: '/srv/workspace/api' })!
    const missing = normalizeRemoteRepoRef({ alias: 'example', remotePath: '/srv/workspace/missing' })!
    const calls = installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd === rootTarget.id ? 'example:workspace' : cwd,
        isGitRepo: cwd !== rootTarget.id,
      }),
      'workspace.discover': ({ rootPath }: { rootPath: string }) => {
        calls.workspace.push(rootPath)
        return {
          ok: true,
          rootId: rootTarget.id,
          repositories: [{ id: api.id, name: 'api', remoteRef: api }],
          candidates: [
            { id: api.id, name: 'api', remoteRef: api, selected: true, available: true },
            { id: missing.id, name: 'missing', remoteRef: missing, selected: true, available: false },
          ],
          configuration: { kind: 'ready', config: { repo: ['api', 'missing'] } },
          skipped: [],
        }
      },
    })

    const result = await useReposStore.getState().ensureWorkspaceOpen(remoteRepoSessionEntry(rootTarget))

    expect(result).toEqual({ ok: true, id: rootTarget.id })
    expect(useReposStore.getState().order).toEqual([rootTarget.id])
    expect(useReposStore.getState().workspaceProjects[rootTarget.id]?.repositoryIds).toEqual([api.id, missing.id])
    expect(useReposStore.getState().repos[api.id]).toMatchObject({
      workspaceRootId: rootTarget.id,
      remote: { target: { ...rootTarget, ...api } },
      availability: { phase: 'available' },
    })
    expect(useReposStore.getState().repos[missing.id]).toMatchObject({
      workspaceRootId: rootTarget.id,
      remote: { target: { ...rootTarget, ...missing } },
      availability: { phase: 'unavailable', reason: 'workspace.repository-unavailable' },
    })
    expect(calls.workspace).toEqual([rootTarget.id])
    expect(calls.snapshot).toEqual([api.id])
  })

  test('opens immediate child repositories as members of one top-level workspace project', async () => {
    const root = '/tmp/gbl-workspace'
    const api = `${root}/api`
    const web = `${root}/web`
    const calls = installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd.split('/').at(-1) ?? cwd,
        isGitRepo: cwd !== root,
      }),
      'workspace.discover': ({ rootPath }: { rootPath: string }) => {
        calls.workspace.push(rootPath)
        return {
          ok: true,
          rootId: root,
          repositories: [
            { id: api, name: 'api' },
            { id: web, name: 'web' },
          ],
          candidates: [
            { id: api, name: 'api', selected: false, available: true },
            { id: web, name: 'web', selected: false, available: true },
          ],
          configuration: { kind: 'missing' },
          skipped: [],
        }
      },
    })

    const result = await useReposStore.getState().ensureWorkspaceOpen(root)

    expect(result).toEqual({ ok: true, id: root })
    expect(useReposStore.getState().order).toEqual([root])
    expect(Object.keys(useReposStore.getState().repos).sort()).toEqual([api, root, web].sort())
    expect(useReposStore.getState().repos[api]?.workspaceRootId).toBe(root)
    expect(useReposStore.getState().repos[web]?.workspaceRootId).toBe(root)
    expect(useReposStore.getState().workspaceProjects[root]).toMatchObject({
      rootId: root,
      repositoryIds: [api, web],
      candidates: [
        { id: api, name: 'api', selected: false, available: true },
        { id: web, name: 'web', selected: false, available: true },
      ],
      configured: false,
      configurationError: null,
      phase: 'ready',
      skipped: [],
      error: null,
    })
    expect(calls.recent).toEqual([{ kind: 'local', id: root }])
    expect(calls.workspace).toEqual([root])
    expect(calls.snapshot).toEqual([api, web])
  })

  test('keeps an already-open repository as a standalone project when its parent workspace opens', async () => {
    const root = '/tmp/gbl-workspace'
    const api = `${root}/api`
    installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd.split('/').at(-1) ?? cwd,
        isGitRepo: cwd !== root,
      }),
      'workspace.discover': () => ({
        ok: true,
        rootId: root,
        repositories: [{ id: api, name: 'api' }],
        candidates: [{ id: api, name: 'api', selected: false, available: true }],
        configuration: { kind: 'missing' },
        skipped: [],
      }),
    })

    await useReposStore.getState().ensureWorkspaceOpen(api)
    await useReposStore.getState().ensureWorkspaceOpen(root)

    expect(useReposStore.getState().order).toEqual([api, root])
    expect(useReposStore.getState().repos[api]?.workspaceRootId).toBe(root)
    expect(useReposStore.getState().workspaceProjects[root]?.repositoryIds).toEqual([api])
  })

  test('adds a workspace member as a standalone project when the same repository is opened directly', async () => {
    const root = '/tmp/gbl-workspace'
    const api = `${root}/api`
    installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd.split('/').at(-1) ?? cwd,
        isGitRepo: cwd !== root,
      }),
      'workspace.discover': () => ({
        ok: true,
        rootId: root,
        repositories: [{ id: api, name: 'api' }],
        candidates: [{ id: api, name: 'api', selected: false, available: true }],
        configuration: { kind: 'missing' },
        skipped: [],
      }),
    })

    await useReposStore.getState().ensureWorkspaceOpen(root)
    await useReposStore.getState().ensureWorkspaceOpen(api)

    expect(useReposStore.getState().order).toEqual([root, api])
    expect(useReposStore.getState().repos[api]?.workspaceRootId).toBe(root)
    expect(useReposStore.getState().workspaceProjects[root]?.repositoryIds).toEqual([api])
  })

  test('does not discover children when the selected root is itself a git repository', async () => {
    const calls = installGoblin()

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)

    expect(calls.workspace).toEqual([])
    expect(useReposStore.getState().workspaceProjects).toEqual({})
  })

  test('rescan adds new members and retains missing members as unavailable', async () => {
    const root = '/tmp/gbl-workspace'
    const api = `${root}/api`
    const web = `${root}/web`
    let scan = 0
    installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd.split('/').at(-1) ?? cwd,
        isGitRepo: cwd !== root,
      }),
      'workspace.discover': () => {
        scan += 1
        return {
          ok: true,
          rootId: root,
          repositories: scan === 1 ? [{ id: api, name: 'api' }] : [{ id: web, name: 'web' }],
          candidates:
            scan === 1
              ? [{ id: api, name: 'api', selected: false, available: true }]
              : [{ id: web, name: 'web', selected: false, available: true }],
          configuration: { kind: 'missing' },
          skipped: [],
        }
      },
    })
    await useReposStore.getState().ensureWorkspaceOpen(root)

    await useReposStore.getState().rescanWorkspace(root)

    expect(useReposStore.getState().order).toEqual([root])
    expect(useReposStore.getState().workspaceProjects[root]?.repositoryIds).toEqual([api, web])
    expect(useReposStore.getState().repos[api]?.availability.phase).toBe('unavailable')
    expect(useReposStore.getState().repos[web]?.workspaceRootId).toBe(root)
  })

  test('rescan refreshes an unchanged logical member after a repository symlink is retargeted', async () => {
    const root = '/tmp/gbl-workspace'
    const linked = `${root}/linked`
    let scan = 0
    const snapshotCalls: string[] = []
    installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd.split('/').at(-1) ?? cwd,
        isGitRepo: cwd !== root,
      }),
      'workspace.discover': () => {
        scan += 1
        return {
          ok: true,
          rootId: root,
          repositories: [{ id: linked, name: 'linked' }],
          candidates: [{ id: linked, name: 'linked', selected: false, available: true }],
          configuration: { kind: 'missing' },
          skipped: [],
        }
      },
      snapshot: (cwd: string) => {
        snapshotCalls.push(cwd)
        return { branches: [branchSnapshot(`target-${scan}`)], current: `target-${scan}` }
      },
    })

    await useReposStore.getState().ensureWorkspaceOpen(root)
    await vi.waitFor(() => {
      expect(useReposStore.getState().repos[linked]?.data.currentBranch).toBe('target-1')
    })

    await useReposStore.getState().rescanWorkspace(root)
    await vi.waitFor(() => {
      expect(useReposStore.getState().repos[linked]?.data.currentBranch).toBe('target-2')
    })
    expect(snapshotCalls).toEqual([linked, linked])
  })

  test('projects configured membership and reconciles the authoritative save result', async () => {
    const root = '/tmp/gbl-workspace'
    const api = `${root}/api`
    const web = `${root}/web`
    const docs = `${root}/docs`
    const configuredApi = {
      ok: true as const,
      rootId: root,
      repositories: [{ id: api, name: 'api' }],
      candidates: [
        { id: api, name: 'api', selected: true, available: true },
        { id: docs, name: 'docs', selected: false, available: true },
        { id: web, name: 'web', selected: false, available: true },
      ],
      configuration: { kind: 'ready' as const, config: { repo: ['api'] } },
      skipped: [],
    }
    const configuredWeb = {
      ...configuredApi,
      repositories: [{ id: web, name: 'web' }],
      candidates: configuredApi.candidates.map((candidate) => ({
        ...candidate,
        selected: candidate.id === web,
      })),
      configuration: { kind: 'ready' as const, config: { repo: ['web'] } },
    }
    const calls = installGoblin({
      probe: (cwd: string) => ({
        ok: true,
        root: cwd,
        name: cwd.split('/').at(-1) ?? cwd,
        isGitRepo: cwd !== root,
      }),
      'workspace.discover': () => configuredApi,
      'workspace.configure': ({ rootPath, config }: { rootPath: string; config: unknown }) => {
        calls.workspaceConfigure.push({ rootPath, config })
        return configuredWeb
      },
    })

    await useReposStore.getState().ensureWorkspaceOpen(root)
    expect(useReposStore.getState().workspaceProjects[root]).toMatchObject({
      repositoryIds: [api],
      configured: true,
      configurationError: null,
    })
    useReposStore.setState({
      activeId: api,
      activeProjectId: root,
      workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: api } },
    })

    await expect(useReposStore.getState().configureWorkspace(root, { repo: ['web'] })).resolves.toEqual({
      ok: true,
    })
    expect(calls.workspaceConfigure).toEqual([{ rootPath: root, config: { repo: ['web'] } }])
    expect(useReposStore.getState().workspaceProjects[root]).toMatchObject({
      repositoryIds: [web],
      configured: true,
    })
    expect(useReposStore.getState().repos[api]).toBeDefined()
    expect(useReposStore.getState().repos[api]?.workspaceRootId).toBeUndefined()
    expect(useReposStore.getState().workspaceProjects[root]?.repositoryIds).not.toContain(api)
    expect(useReposStore.getState().activeId).toBe(web)
  })

  test('keeps Overview usable when workspace discovery fails', async () => {
    const root = '/tmp/gbl-workspace'
    installGoblin({
      probe: (cwd: string) => ({ ok: true, root: cwd, name: 'workspace', isGitRepo: false }),
      'workspace.discover': () => ({ ok: false, message: 'error.path-permission-denied' }),
    })

    await useReposStore.getState().ensureWorkspaceOpen(root)

    expect(useReposStore.getState().order).toEqual([root])
    expect(useReposStore.getState().repos[root]?.isGitRepo).toBe(false)
    expect(useReposStore.getState().workspaceProjects[root]).toMatchObject({
      phase: 'error',
      error: 'error.path-permission-denied',
    })
  })

  test('keeps Overview usable when workspace discovery cannot reach the server', async () => {
    const root = '/tmp/gbl-workspace'
    installGoblin({
      probe: (cwd: string) => ({ ok: true, root: cwd, name: 'workspace', isGitRepo: false }),
      'workspace.discover': () => {
        throw new Error('network unavailable')
      },
    })

    await expect(useReposStore.getState().ensureWorkspaceOpen(root)).resolves.toEqual({ ok: true, id: root })
    expect(useReposStore.getState().workspaceProjects[root]).toMatchObject({
      phase: 'error',
      error: 'error.failed-read-repo',
    })
  })

  test('ensureWorkspaceOpen plus setActive opens the resolved repo, records it as recent, and starts initial local refresh', async () => {
    const calls = installGoblin()

    const result = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (result.ok) useReposStore.getState().setActive(result.id)

    expect(result).toEqual({ ok: true, id: REPO_A })
    expect(useReposStore.getState().order).toEqual([REPO_A])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.recent).toEqual([{ kind: 'local', id: REPO_A }])
    expect(calls.snapshot).toEqual([REPO_A])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A])
    })
  })

  test('ensureWorkspaceOpen adds a repo to the open set without changing the active selection', async () => {
    const calls = installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    const result = await useReposStore.getState().ensureWorkspaceOpen(REPO_B)

    expect(result).toEqual({ ok: true, id: REPO_B })
    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.snapshot).toEqual([REPO_A, REPO_B])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A, REPO_B])
    })
  })

  test('ensureWorkspaceOpen opens without changing the active repo', async () => {
    const calls = installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    await useReposStore.getState().ensureWorkspaceOpen(REPO_B)

    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.snapshot).toEqual([REPO_A, REPO_B])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A, REPO_B])
    })
  })

  test('ensureWorkspaceOpen still ensures the workspace is added to the open set', async () => {
    installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    await useReposStore.getState().ensureWorkspaceOpen(REPO_B)

    expect(Object.keys(useReposStore.getState().repos)).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
  })

  test('ensureWorkspaceOpen plus setActive locally refreshes an already-open repo', async () => {
    const calls = installGoblin()

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    const second = await useReposStore.getState().ensureWorkspaceOpen(REPO_B)
    if (second.ok) useReposStore.getState().setActive(second.id)
    const third = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (third.ok) useReposStore.getState().setActive(third.id)

    expect(useReposStore.getState().order).toEqual([REPO_A, REPO_B])
    expect(useReposStore.getState().activeId).toBe(REPO_A)
    expect(calls.snapshot).toEqual([REPO_A, REPO_B, REPO_A])
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A, REPO_B, REPO_A])
    })
  })

  test('ensureWorkspaceOpen updates an already-open repo when reprobe reports non-git', async () => {
    let probeCount = 0
    const calls = installGoblin({
      probe: (cwd: string) => {
        probeCount += 1
        return {
          ok: true,
          root: cwd,
          name: cwd.split('/').at(-1) ?? cwd,
          isGitRepo: probeCount === 1,
        }
      },
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    expect(useReposStore.getState().repos[REPO_A]?.isGitRepo).toBe(true)
    await vi.waitFor(() => {
      expect(calls.snapshot).toEqual([REPO_A])
    })
    await vi.waitFor(() => {
      expect(calls.status).toEqual([REPO_A])
    })
    useReposStore.setState((s) => {
      const repo = s.repos[REPO_A]
      if (!repo) return s
      return {
        repos: {
          ...s.repos,
          [REPO_A]: replaceRepo(repo, (draft) => {
            draft.data.branches = [branchSnapshot('stale')]
            draft.data.currentBranch = 'stale'
            draft.data.status = [
              { path: REPO_A, branch: 'stale', isMain: true, entries: [{ x: 'M', y: ' ', path: 'README.md' }] },
            ]
            draft.data.statusLoaded = true
            draft.data.worktreesByPath = {
              [REPO_A]: { path: REPO_A, branch: 'stale', isMain: true, isDirty: true, changeCount: 1 },
            }
            draft.ui.selectedBranch = 'stale'
            draft.ui.worktreePathOrder = [REPO_A]
            draft.remote.remotes = ['origin']
            draft.remote.remoteDetails = [
              { name: 'origin', fetchUrl: 'git@example.com:acme/repo.git', pushUrl: 'git@example.com:acme/repo.git' },
            ]
            draft.remote.hasRemotes = true
            draft.remote.hasBrowserRemote = true
            draft.remote.browserRemoteProvider = 'github'
            draft.remote.remoteProviders = { origin: 'github' }
            draft.remote.hasGitHubRemote = true
            draft.remote.fetchFailed = true
            draft.remote.fetchError = 'failed'
          }),
        },
      }
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    await flushRpc()

    const repo = useReposStore.getState().repos[REPO_A]
    expect(repo?.isGitRepo).toBe(false)
    expect(repo?.data).toMatchObject({
      branches: [],
      currentBranch: '',
      status: [],
      statusLoaded: false,
      worktreesByPath: {},
    })
    expect(repo?.ui.selectedBranch).toBeNull()
    expect(repo?.ui.worktreePathOrder).toEqual([])
    expect(repo?.remote).toMatchObject({
      remotes: [],
      remoteDetails: [],
      hasRemotes: false,
      hasBrowserRemote: false,
      browserRemoteProvider: undefined,
      remoteProviders: {},
      hasGitHubRemote: false,
      fetchFailed: false,
      fetchError: null,
    })
    expect(calls.snapshot).toEqual([REPO_A])
    expect(calls.status).toEqual([REPO_A])
  })

  test('capability switches invalidate in-flight git refresh results', async () => {
    let probeCount = 0
    const snapshotResolvers: Array<(value: { branches: BranchSnapshotInfo[]; current: string }) => void> = []
    installGoblin({
      probe: (cwd: string) => {
        probeCount += 1
        return {
          ok: true,
          root: cwd,
          name: cwd.split('/').at(-1) ?? cwd,
          isGitRepo: probeCount === 1,
        }
      },
      snapshot: () =>
        new Promise<{ branches: BranchSnapshotInfo[]; current: string }>((resolve) => {
          snapshotResolvers.push(resolve)
        }),
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    const gitToken = useReposStore.getState().repos[REPO_A]?.instanceToken
    await vi.waitFor(() => {
      expect(snapshotResolvers).toHaveLength(1)
    })

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    const plainRepo = useReposStore.getState().repos[REPO_A]
    expect(plainRepo?.isGitRepo).toBe(false)
    expect(plainRepo?.instanceToken).not.toBe(gitToken)

    snapshotResolvers[0]?.({ branches: [branchSnapshot('stale')], current: 'stale' })
    await flushRpc()

    expect(useReposStore.getState().repos[REPO_A]?.isGitRepo).toBe(false)
    expect(useReposStore.getState().repos[REPO_A]?.data.branches).toEqual([])
    expect(useReposStore.getState().repos[REPO_A]?.data.currentBranch).toBe('')
  })

  test('ensureWorkspaceOpen updates an already-open plain workspace when reprobe reports git', async () => {
    let probeCount = 0
    const calls = installGoblin({
      probe: (cwd: string) => {
        probeCount += 1
        return {
          ok: true,
          root: cwd,
          name: cwd.split('/').at(-1) ?? cwd,
          isGitRepo: probeCount > 1,
        }
      },
    })

    useReposStore.setState({
      restorableRepoCache: {
        [REPO_A]: {
          savedAt: Date.now(),
          name: 'cached',
          data: { branches: [branchSnapshot('cached')], currentBranch: 'cached' },
          ui: { selectedBranch: 'cached', detailTab: 'status', worktreePathOrder: [REPO_A] },
        },
      },
    })
    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    await flushRpc()
    const plainRepo = useReposStore.getState().repos[REPO_A]
    expect(plainRepo?.isGitRepo).toBe(false)
    expect(plainRepo?.data.branches).toEqual([])
    expect(plainRepo?.data.currentBranch).toBe('')
    expect(plainRepo?.ui.selectedBranch).toBeNull()
    expect(plainRepo?.ui.worktreePathOrder).toEqual([])
    expect(calls.snapshot).toEqual([])

    await useReposStore.getState().ensureWorkspaceOpen(REPO_A)

    expect(useReposStore.getState().repos[REPO_A]?.isGitRepo).toBe(true)
    await vi.waitFor(() => {
      expect(calls.snapshot).toEqual([REPO_A])
    })
  })

  test('initial refresh results from a closed repo instance do not overwrite a reopened repo', async () => {
    const snapshotResolvers: Array<(value: { branches: BranchSnapshotInfo[]; current: string }) => void> = []
    installGoblin({
      snapshot: () =>
        new Promise<{ branches: BranchSnapshotInfo[]; current: string }>((resolve) => {
          snapshotResolvers.push(resolve)
        }),
    })

    const first = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (first.ok) useReposStore.getState().setActive(first.id)
    const firstToken = useReposStore.getState().repos[REPO_A]?.instanceToken
    useReposStore.getState().closeRepo(REPO_A)
    const second = await useReposStore.getState().ensureWorkspaceOpen(REPO_A)
    if (second.ok) useReposStore.getState().setActive(second.id)
    const secondToken = useReposStore.getState().repos[REPO_A]?.instanceToken

    snapshotResolvers[1]?.({ branches: [branchSnapshot('fresh')], current: 'fresh' })
    await flushRpc()

    expect(secondToken).not.toBe(firstToken)
    await vi.waitFor(() => {
      expect(useReposStore.getState().repos[REPO_A]?.data.currentBranch).toBe('fresh')
    })

    snapshotResolvers[0]?.({ branches: [branchSnapshot('stale')], current: 'stale' })
    await flushRpc()

    expect(useReposStore.getState().repos[REPO_A]?.data.currentBranch).toBe('fresh')
  })

  test('ensureWorkspaceOpen preserves remote target metadata for recent repos and later actions', async () => {
    const target = normalizeRemoteTarget({
      alias: 'example',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/repo',
    })
    expect(target).not.toBeNull()
    const calls = installGoblin({
      probe: (cwd: string) => ({ ok: true, root: cwd, name: 'repo' }),
    })

    const result = await useReposStore.getState().ensureWorkspaceOpen(remoteRepoSessionEntry(target!))

    expect(result).toEqual({ ok: true, id: target!.id })
    expect(useReposStore.getState().repos[target!.id]?.remote.target).toEqual(target)
    expect(calls.recent).toEqual([remoteRepoSessionEntry(target!)])
  })

  test('closeRepo requests port-forward cleanup for the closed repo', () => {
    const repoId = 'ssh-config://prod/srv/repo'
    useReposStore.setState({
      repos: {
        [repoId]: emptyRepo(repoId, 'prod:repo'),
      },
      order: [repoId],
      activeId: repoId,
    })

    useReposStore.getState().closeRepo(repoId)

    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith(repoId)
  })

  test('closing a workspace project closes its root and every child repository projection', () => {
    const root = '/tmp/gbl-workspace'
    const child = `${root}/api`
    useReposStore.setState({
      repos: {
        [root]: emptyRepo(root, 'workspace'),
        [child]: replaceRepo(emptyRepo(child, 'api'), (repo) => {
          repo.workspaceRootId = root
        }),
      },
      order: [root],
      activeId: child,
      workspaceProjects: {
        [root]: {
          rootId: root,
          repositoryIds: [child],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
      workspaceRepositoryListExpandedByRoot: { [root]: false },
      workspaceRepositoryListHeightByRoot: { [root]: 224 },
    })

    useReposStore.getState().closeRepo(root)

    expect(useReposStore.getState().repos).toEqual({})
    expect(useReposStore.getState().order).toEqual([])
    expect(useReposStore.getState().activeId).toBeNull()
    expect(useReposStore.getState().workspaceProjects).toEqual({})
    expect(useReposStore.getState().workspaceActiveContextByRoot).toEqual({})
    expect(useReposStore.getState().workspaceRepositoryListExpandedByRoot).toEqual({})
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({})
    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith(root)
    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith(child)
  })

  test('closing a standalone project keeps the shared repository projection for its workspace', () => {
    const root = '/tmp/gbl-workspace'
    const child = `${root}/api`
    useReposStore.setState({
      repos: {
        [root]: emptyRepo(root, 'workspace'),
        [child]: replaceRepo(emptyRepo(child, 'api'), (repo) => {
          repo.workspaceRootId = root
        }),
      },
      order: [child, root],
      activeId: child,
      activeProjectId: child,
      workspaceProjects: {
        [root]: {
          rootId: root,
          repositoryIds: [child],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
    })

    useReposStore.getState().closeRepo(child)

    expect(useReposStore.getState().order).toEqual([root])
    expect(useReposStore.getState().repos[child]?.workspaceRootId).toBe(root)
    expect(useReposStore.getState().workspaceProjects[root]?.repositoryIds).toEqual([child])
    expect(mocks.stopPortForwardSessionsForRepo).not.toHaveBeenCalledWith(child)
  })

  test('closing a workspace keeps member repositories that remain open as standalone projects', () => {
    const root = '/tmp/gbl-workspace'
    const child = `${root}/api`
    useReposStore.setState({
      repos: {
        [root]: emptyRepo(root, 'workspace'),
        [child]: replaceRepo(emptyRepo(child, 'api'), (repo) => {
          repo.workspaceRootId = root
        }),
      },
      order: [root, child],
      activeId: child,
      activeProjectId: root,
      workspaceProjects: {
        [root]: {
          rootId: root,
          repositoryIds: [child],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
      workspaceActiveContextByRoot: { [root]: { kind: 'repository', repositoryId: child } },
    })

    useReposStore.getState().closeRepo(root)

    expect(useReposStore.getState().order).toEqual([child])
    expect(useReposStore.getState().repos[root]).toBeUndefined()
    expect(useReposStore.getState().repos[child]).toBeDefined()
    expect(useReposStore.getState().repos[child]?.workspaceRootId).toBeUndefined()
    expect(useReposStore.getState().activeProjectId).toBe(child)
    expect(useReposStore.getState().activeId).toBe(child)
    expect(mocks.stopPortForwardSessionsForRepo).toHaveBeenCalledWith(root)
    expect(mocks.stopPortForwardSessionsForRepo).not.toHaveBeenCalledWith(child)
  })
})

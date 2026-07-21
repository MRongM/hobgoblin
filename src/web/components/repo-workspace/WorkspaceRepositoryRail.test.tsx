// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'
import type { WorkspaceConfig } from '#/shared/workspace.ts'
import type { WorkspacePullResult } from '#/shared/workspace-pull.ts'
import type { TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastMocks.success,
    error: toastMocks.error,
  },
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params?.count === undefined ? key : `${key}:${params.count}`,
}))

const repositoryListState = vi.hoisted(() => ({
  props: null as null | {
    repositories: Array<{
      id: string
      name: string
      branch?: string
      changeCount: number
      terminalWorktreePaths: string[]
      unavailable: boolean
    }>
    currentRepoId: string
    disabled: boolean
    onActivate: (id: string) => void
    onReorder: (fromId: string, toId: string) => void
  },
}))

const workspaceBatchState = vi.hoisted(() => ({
  onSettled: null as null | ((result: WorkspacePullResult) => void | Promise<void>),
}))

const branchWorkspaceState = vi.hoisted(() => ({
  items: [
    {
      id: 'branch-1',
      rootId: '/workspace',
      branch: 'feature/auth',
      directoryName: 'goblin-feature-auth',
      path: '/workspace/goblin-feature-auth',
      lifecycle: 'ready' as const,
      available: true,
      issues: [],
      repositories: [],
      auxiliaryEntries: [],
    },
  ],
  reorder: vi.fn(async () => true),
  cancel: vi.fn(async () => {}),
  refresh: vi.fn(),
  dialogRefresh: null as null | (() => Promise<unknown>),
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceQuery: () => ({
    data: { ok: true, rootId: ROOT, items: branchWorkspaceState.items, auxiliaryCandidates: [] },
    isPending: false,
    refresh: branchWorkspaceState.refresh,
  }),
}))

vi.mock('#/web/hooks/useBranchWorkspaceActions.ts', () => ({
  useBranchWorkspaceActions: () => ({
    plan: null,
    result: null,
    pending: false,
    error: null,
    requestPlan: vi.fn(async () => true),
    confirm: vi.fn(async () => null),
    retry: vi.fn(async () => null),
    cancel: branchWorkspaceState.cancel,
    reorder: branchWorkspaceState.reorder,
    reset: vi.fn(),
  }),
}))

vi.mock('#/web/hooks/useBranchWorkspaceGitActions.ts', () => ({
  useBranchWorkspaceGitActions: () => ({
    plan: null,
    result: null,
    pending: false,
    error: null,
    requestPlan: vi.fn(async () => true),
    executeBatchCommit: vi.fn(async () => null),
    executeMergeBack: vi.fn(async () => null),
    cancel: vi.fn(async () => {}),
    reset: vi.fn(),
  }),
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceList.tsx', () => ({
  BranchWorkspaceList: ({ items, activeId }: { items: Array<{ branch: string }>; activeId: string | null }) => (
    <div data-testid="branch-workspace-list" data-active-id={activeId ?? ''}>
      {items.map((item) => item.branch).join(',')}
    </div>
  ),
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceDialog.tsx', () => ({
  BranchWorkspaceDialog: ({
    onRefreshAuxiliaryCandidates,
  }: {
    onRefreshAuxiliaryCandidates?: () => Promise<unknown>
  }) => {
    branchWorkspaceState.dialogRefresh = onRefreshAuxiliaryCandidates ?? null
    return null
  },
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx', () => ({
  BranchWorkspaceGitActionDialog: () => null,
}))

vi.mock('#/web/hooks/useWorkspacePullActions.ts', () => ({
  useWorkspacePullActions: (
    _rootId: string,
    onSettled: ((result: WorkspacePullResult) => void | Promise<void>) | undefined,
  ) => {
    workspaceBatchState.onSettled = onSettled ?? null
    return {
      plan: null,
      result: null,
      pending: false,
      error: null,
      requestPlan: vi.fn(),
      confirm: vi.fn(),
      retry: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    }
  },
}))

vi.mock('#/web/components/repo-workspace/WorkspaceRepositoryList.tsx', () => ({
  WorkspaceRepositoryList: (props: NonNullable<typeof repositoryListState.props>) => {
    repositoryListState.props = props
    return (
      <div data-testid="workspace-repository-list" data-disabled={props.disabled ? 'true' : 'false'}>
        {props.repositories.map((repository) => (
          <button
            key={repository.id}
            type="button"
            aria-current={repository.id === props.currentRepoId ? 'page' : undefined}
            onClick={() => props.onActivate(repository.id)}
          >
            {repository.name} {repository.branch} {repository.changeCount || ''}{' '}
            {repository.unavailable ? 'workspace.repository-unavailable' : ''}
          </button>
        ))}
      </div>
    )
  },
}))

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'
const originalActions = {
  activateWorkspaceOverview: useReposStore.getState().activateWorkspaceOverview,
  activateWorkspaceRepository: useReposStore.getState().activateWorkspaceRepository,
  rescanWorkspace: useReposStore.getState().rescanWorkspace,
  configureWorkspace: useReposStore.getState().configureWorkspace,
  refreshCoreData: useReposStore.getState().refreshCoreData,
}

let container: HTMLDivElement | null = null
let root: Root | null = null
const activateWorkspaceOverview = vi.fn()
const activateWorkspaceRepository = vi.fn()
const rescanWorkspace = vi.fn(async () => {})
const refreshCoreData = vi.fn(async () => {})
const configureWorkspace = vi.fn(
  async (_rootId: string, _config: WorkspaceConfig): Promise<{ ok: true } | { ok: false; message: string }> => ({
    ok: true,
  }),
)

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  useReposStore.setState(originalActions)
  activateWorkspaceOverview.mockReset()
  activateWorkspaceRepository.mockReset()
  rescanWorkspace.mockReset()
  rescanWorkspace.mockResolvedValue(undefined)
  refreshCoreData.mockReset()
  refreshCoreData.mockResolvedValue(undefined)
  branchWorkspaceState.refresh.mockReset()
  branchWorkspaceState.refresh.mockResolvedValue({
    ok: true,
    rootId: ROOT,
    items: branchWorkspaceState.items,
    auxiliaryCandidates: [],
  })
  branchWorkspaceState.dialogRefresh = null
  configureWorkspace.mockReset()
  configureWorkspace.mockResolvedValue({ ok: true })
  toastMocks.success.mockReset()
  toastMocks.error.mockReset()
  repositoryListState.props = null
  workspaceBatchState.onSettled = null
  const overview = replaceRepo(emptyRepo(ROOT, 'workspace'), (repo) => {
    repo.isGitRepo = false
  })
  const api = replaceRepo(emptyRepo(API, 'api'), (repo) => {
    repo.workspaceRootId = ROOT
    repo.data.currentBranch = 'main'
    repo.data.branches = [createRepoBranch('main', { worktree: { path: API } })]
    repo.data.worktreesByPath = {
      [API]: { path: API, branch: 'main', isMain: true },
      '/worktrees/api-feature': { path: '/worktrees/api-feature', branch: 'feature/api', isMain: false },
    }
    repo.data.status = [
      {
        path: API,
        branch: 'main',
        isMain: true,
        entries: [
          { x: 'M', y: ' ', path: 'README.md' },
          { x: '?', y: '?', path: 'notes.txt' },
        ],
      },
    ]
  })
  const web = replaceRepo(emptyRepo(WEB, 'web'), (repo) => {
    repo.workspaceRootId = ROOT
    repo.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
  })
  useReposStore.setState({
    repos: { [ROOT]: overview, [API]: api, [WEB]: web },
    order: [ROOT],
    activeId: API,
    workspaceProjects: {
      [ROOT]: {
        rootId: ROOT,
        repositoryIds: [API, WEB],
        candidates: [
          { id: API, name: 'api', selected: true, available: true },
          { id: WEB, name: 'web', selected: true, available: true },
        ],
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [{ path: '/workspace/broken', message: 'error.failed-read-repo' }],
        error: null,
      },
    },
    workspaceActiveContextByRoot: { [ROOT]: { kind: 'repository', repositoryId: API } },
    workspaceRepositoryListExpandedByRoot: { [ROOT]: true },
    activateWorkspaceOverview,
    activateWorkspaceRepository,
    rescanWorkspace,
    configureWorkspace,
    refreshCoreData,
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  useReposStore.setState(originalActions)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorkspaceRepositoryRail', () => {
  test('renders Overview and repository state as one depth-one manifest', () => {
    renderRail()

    expect(container?.textContent).toContain('workspace.repositories')
    expect(container?.textContent).toContain('./')
    expect(overviewButton()).not.toBeNull()
    expect(container?.textContent).toContain('api')
    expect(container?.textContent).toContain('main')
    expect(container?.textContent).toContain('2')
    expect(container?.textContent).toContain('web')
    expect(container?.textContent).toContain('workspace.repository-unavailable')
    expect(container?.textContent).toContain('workspace.scan-skipped:1')
    expect(container?.querySelector('button[aria-current="page"]')?.textContent).toContain('api')
    expect(container?.querySelector('button[aria-label="workspace.rescan"]')).not.toBeNull()
    const createWorkspace = container?.querySelector('button[aria-label="workspace.branch-workspace.create"]')
    expect(createWorkspace).not.toBeNull()
    expect(createWorkspace?.querySelector('.lucide-folder-plus')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.batch.remove-action"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.pull-all"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.configure"]')).not.toBeNull()
  })

  test('identifies Overview with the workspace root folder icon and name', () => {
    renderRail()

    const overview = overviewButton()
    expect(overview?.title).toBe('workspace')
    expect(overview?.textContent).toContain('./workspace')
    expect(overview?.textContent).not.toContain('workspace.overview')
    expect(overview?.querySelector('.lucide-folder')).not.toBeNull()
    expect(overview?.querySelector('.lucide-folder-tree')).toBeNull()
  })

  test('shows branch workspaces in the lower Overview slot while repository collapse hides only upper rows', () => {
    useReposStore.setState({
      activeId: ROOT,
      workspaceActiveContextByRoot: { [ROOT]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' } },
    })
    renderRail({ currentRepoId: ROOT })

    expect(container?.querySelector('[data-testid="branch-workspace-list"]')?.textContent).toContain('feature/auth')
    expect(container?.querySelector('[data-testid="branch-workspace-list"]')?.getAttribute('data-active-id')).toBe(
      'branch-1',
    )
    expect(overviewButton()).not.toBeNull()

    act(() => container?.querySelector<HTMLButtonElement>('[aria-label="workspace.repositories.collapse"]')?.click())

    expect(overviewButton()).toBeUndefined()
    expect(container?.querySelector('[data-testid="branch-workspace-list"]')?.textContent).toContain('feature/auth')
  })

  test('does not show terminal status in Overview without an open root terminal', () => {
    renderRail()

    expect(overviewButton()?.querySelector('[data-testid="overview-terminal-count-badge"]')).toBeNull()
  })

  test('shows an idle terminal count in Overview like a worktree row', () => {
    renderRail({ terminalCount: 2 })

    const badge = overviewButton()?.querySelector('[data-testid="overview-terminal-count-badge"]')
    expect(badge?.textContent).toBe('2')
    expect(badge?.getAttribute('aria-label')).toBe('terminal.open-count:2')
    expect(badge?.querySelector('.lucide-terminal')).not.toBeNull()
    expect(badge?.querySelector('[data-terminal-output-activity-indicator="active"]')).toBeNull()
  })

  test('keeps the terminal badge in the left-aligned Overview label group', () => {
    renderRail({ terminalCount: 1 })

    const overview = overviewButton()
    const labelGroup = overview?.querySelector('[class~="flex-1"]')
    const badge = overview?.querySelector('[data-testid="overview-terminal-count-badge"]')
    expect(labelGroup?.contains(badge ?? null)).toBe(true)
  })

  test('animates the Overview terminal icon while a root terminal is producing output', () => {
    renderRail({ terminalCount: 1, outputActive: true })

    const badge = overviewButton()?.querySelector('[data-testid="overview-terminal-count-badge"]')
    expect(badge?.textContent).toBe('1')
    expect(badge?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
  })

  test('shows an unread bell in Overview when a root terminal has rung', () => {
    renderRail({ terminalCount: 1, hasBell: true })

    const bell = overviewButton()?.querySelector('[data-terminal-bell-dot]')
    expect(bell).not.toBeNull()
    expect(bell?.getAttribute('aria-label')).toBe('terminal.bell-unread')
  })

  test('activates Overview and child repositories through one explicit action', () => {
    renderRail()
    const buttons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'))
    const overview = overviewButton()
    const web = buttons.find((button) => button.textContent?.includes('web'))

    act(() => overview?.click())
    act(() => web?.click())

    expect(activateWorkspaceOverview).toHaveBeenCalledWith(ROOT)
    expect(activateWorkspaceRepository).toHaveBeenCalledWith(ROOT, WEB)
  })

  test('rescans without changing the current repository selection', () => {
    renderRail()

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.rescan"]')?.click())

    expect(rescanWorkspace).toHaveBeenCalledWith(ROOT)
    expect(activateWorkspaceRepository).not.toHaveBeenCalled()
  })

  test('passes the query-owned auxiliary candidate refresh action to the branch workspace dialog', async () => {
    renderRail()

    await act(async () => await branchWorkspaceState.dialogRefresh?.())

    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
  })

  test('refreshes configured members after a batch operation without rediscovering workspace directories', async () => {
    renderRail()

    await act(async () =>
      workspaceBatchState.onSettled?.({
        ok: true,
        planToken: 'sha256:plan',
        members: [],
      }),
    )

    expect(refreshCoreData).toHaveBeenCalledTimes(2)
    expect(refreshCoreData).toHaveBeenNthCalledWith(1, API)
    expect(refreshCoreData).toHaveBeenNthCalledWith(2, WEB)
    expect(rescanWorkspace).not.toHaveBeenCalled()
  })

  test('shows a success toast when pulling all repositories completes', async () => {
    renderRail()
    const result = {
      ok: true,
      planToken: 'sha256:plan',
      members: [],
    } satisfies WorkspacePullResult

    await act(async () => await workspaceBatchState.onSettled?.(result))

    expect(toastMocks.success).toHaveBeenCalledWith('workspace.pull-all-success')
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  test('shows an error toast when a batch does not complete every repository', async () => {
    renderRail()
    const result = {
      ok: false,
      planToken: 'sha256:plan',
      members: [{ repoId: API, phase: 'failed', message: 'busy' }],
      message: 'workspace.pull.execute-failed',
    } satisfies WorkspacePullResult

    await act(async () => await workspaceBatchState.onSettled?.(result))

    expect(toastMocks.error).toHaveBeenCalledWith('workspace.pull-all-incomplete', {
      description: 'workspace.pull.execute-failed',
    })
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  test('rescans before opening configuration and saves through the workspace action', async () => {
    let resolveRescan: (() => void) | undefined
    const rescanPromise = new Promise<void>((resolve) => {
      resolveRescan = resolve
    })
    rescanWorkspace.mockImplementationOnce(() => rescanPromise)
    renderRail()

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.configure"]')?.click())
    expect(rescanWorkspace).toHaveBeenCalledWith(ROOT)
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')).toBeNull()

    await act(async () => {
      resolveRescan?.()
      await rescanPromise
    })
    await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click())

    expect(configureWorkspace).toHaveBeenCalledWith(ROOT, { repo: ['api', 'web'] })
  })

  test('optimistically reorders configured repositories and persists their names', async () => {
    const web = useReposStore.getState().repos[WEB]!
    useReposStore.setState({
      repos: { ...useReposStore.getState().repos, [WEB]: { ...web, availability: { phase: 'available' } } },
    })
    let resolveSave: ((value: { ok: true }) => void) | undefined
    configureWorkspace.mockImplementation(() => new Promise<{ ok: true }>((resolve) => (resolveSave = resolve)))
    renderRail()

    act(() => repositoryListState.props?.onReorder(WEB, API))

    expect(repositoryListState.props?.repositories.map((repository) => repository.id)).toEqual([WEB, API])
    expect(repositoryListState.props?.disabled).toBe(true)
    expect(container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.configure"]')?.disabled).toBe(true)
    expect(configureWorkspace).toHaveBeenCalledWith(ROOT, { repo: ['web', 'api'] })
    act(() => repositoryListState.props?.onReorder(API, WEB))
    expect(configureWorkspace).toHaveBeenCalledTimes(1)

    await act(async () => {
      useReposStore.setState((state) => ({
        workspaceProjects: {
          ...state.workspaceProjects,
          [ROOT]: { ...state.workspaceProjects[ROOT]!, repositoryIds: [WEB, API] },
        },
      }))
      resolveSave?.({ ok: true })
      await Promise.resolve()
    })

    expect(repositoryListState.props?.repositories.map((repository) => repository.id)).toEqual([WEB, API])
    expect(repositoryListState.props?.disabled).toBe(false)
  })

  test('rolls back an unsuccessful reorder and reports the configuration error', async () => {
    const web = useReposStore.getState().repos[WEB]!
    useReposStore.setState({
      repos: { ...useReposStore.getState().repos, [WEB]: { ...web, availability: { phase: 'available' } } },
    })
    configureWorkspace.mockResolvedValue({ ok: false, message: 'workspace.config.write-failed' })
    renderRail()

    await act(async () => repositoryListState.props?.onReorder(WEB, API))

    expect(repositoryListState.props?.repositories.map((repository) => repository.id)).toEqual([API, WEB])
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('workspace.config.write-failed')
  })

  test('keeps Overview outside the sortable repository membership', () => {
    renderRail()

    expect(repositoryListState.props?.repositories.map((repository) => repository.id)).toEqual([API, WEB])
    expect(repositoryListState.props?.repositories.some((repository) => repository.id === ROOT)).toBe(false)
    expect(overviewButton()).not.toBeNull()
  })

  test('projects every repository worktree path into repository items for terminal aggregation', () => {
    renderRail()

    const api = repositoryListState.props?.repositories.find((repository) => repository.id === API)
    expect(api?.terminalWorktreePaths).toEqual([API, '/worktrees/api-feature'])
  })
})

function overviewButton(): HTMLButtonElement | null | undefined {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
    button.textContent?.includes('./'),
  )
}

function renderRail({
  terminalCount = 0,
  outputActive = false,
  hasBell = false,
  currentRepoId = API,
}: {
  terminalCount?: number
  outputActive?: boolean
  hasBell?: boolean
  currentRepoId?: string
} = {}) {
  const rootTerminalKey = `${ROOT}\0${ROOT}`
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const count = worktreeTerminalKey === rootTerminalKey ? terminalCount : 0
      return {
        worktreeTerminalKey,
        selectedDescriptor: null,
        sessions:
          count > 0
            ? [
                {
                  key: `${worktreeTerminalKey}\0terminal-1`,
                  worktreeTerminalKey,
                  terminalId: 'terminal-1',
                  index: 1,
                  title: 'terminal',
                  phase: 'open',
                  selected: true,
                  hasBell,
                  isOutputActive: outputActive,
                },
              ]
            : [],
        count,
      }
    },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
  act(() => {
    root!.render(
      <TerminalSessionReadContext.Provider value={readContext}>
        <WorkspaceRepositoryRail workspaceRootId={ROOT} currentRepoId={currentRepoId} />
      </TerminalSessionReadContext.Provider>,
    )
  })
}

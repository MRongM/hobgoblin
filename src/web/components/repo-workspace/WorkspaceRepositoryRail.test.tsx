// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
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
import type {
  BranchWorkspacePlan,
  BranchWorkspaceReadResult,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import type { BranchWorkspaceGitActionKind } from '#/shared/branch-workspace-git-actions.ts'

let compactUi = false

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

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => compactUi,
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
      state: { kind: 'ready' as const },
      available: true,
      issues: [],
      repositories: [
        {
          repositoryName: 'api',
          targetBranch: 'feature/auth',
          baseBranch: 'main',
          branchOrigin: 'created' as const,
          worktreePath: '/workspace/goblin-feature-auth/api',
          progress: 'complete' as const,
          ready: true,
        },
        {
          repositoryName: 'web',
          targetBranch: 'feature/auth',
          baseBranch: 'main',
          branchOrigin: 'created' as const,
          worktreePath: '/workspace/goblin-feature-auth/web',
          progress: 'complete' as const,
          ready: true,
        },
      ],
      auxiliaryEntries: [],
    },
    {
      id: 'branch-2',
      rootId: '/workspace',
      branch: 'feature/search',
      directoryName: 'goblin-feature-search',
      path: '/workspace/goblin-feature-search',
      state: { kind: 'ready' as const },
      available: true,
      issues: [],
      repositories: [],
      auxiliaryEntries: [],
    },
  ] as BranchWorkspaceSnapshot[],
  queryResult: null as BranchWorkspaceReadResult | null,
  reorder: vi.fn(async () => true),
  cancel: vi.fn(async () => {}),
  requestPlan: vi.fn(async () => true),
  plan: null as BranchWorkspacePlan | null,
  pending: false,
  refresh: vi.fn(),
  dialogRefresh: null as null | (() => Promise<unknown>),
  dialogProps: null as null | {
    open: boolean
    mode: string
    repositories: Array<{ id: string; primaryWorktreePath?: string }>
    workspace: BranchWorkspaceSnapshot | null
    progressWorkspace: BranchWorkspaceSnapshot | null
    fixedReduceRepositoryName?: string | null
  },
}))

const branchWorkspaceCleanupState = vi.hoisted(() => ({
  cleanup: vi.fn(),
}))

const branchGitActionState = vi.hoisted(() => ({
  plan: null,
  result: null,
  pending: false,
  error: null as string | null,
  requestPlan: vi.fn(async () => true),
  executeBatchCommit: vi.fn(async () => null),
  executeBatchMergeIn: vi.fn(async () => null),
  executeBatchMergeOut: vi.fn(async () => null),
  executeSync: vi.fn(async () => null),
  cancel: vi.fn(async () => {}),
  reset: vi.fn(),
}))

const branchGitPanelState = vi.hoisted(() => ({
  props: null as null | {
    open: boolean
    kind: BranchWorkspaceGitActionKind
    activeOperation: BranchWorkspaceSnapshot['activeOperation'] | null
    onOpenChange: (open: boolean) => void
  },
}))

const branchDependencyState = vi.hoisted(() => ({
  candidates: [],
  plan: null,
  result: null,
  pending: false,
  error: null as string | null,
  read: vi.fn(async () => ({ ok: true, candidates: [] })),
  requestPlan: vi.fn(async () => true),
  confirm: vi.fn(async () => null),
  cancel: vi.fn(async () => undefined),
  reset: vi.fn(),
}))

const branchDependencyDialogState = vi.hoisted(() => ({
  props: null as null | {
    open: boolean
    mode: 'add' | 'remove'
    branchWorkspaceId: string
  },
}))

const branchWorkspaceListState = vi.hoisted(() => ({
  props: null as null | {
    items: BranchWorkspaceSnapshot[]
    activeId: string | null
    activeMemberRepositoryName?: string | null
    onToggleFileArea?: (item: BranchWorkspaceSnapshot) => void
    changeCountById?: Readonly<Record<string, number>>
    getMemberPresentation?: (
      item: BranchWorkspaceSnapshot,
      member: BranchWorkspaceSnapshot['repositories'][number],
    ) => {
      dirty: boolean
      changeCount: number | null
      navigable: boolean
      repositoryId?: string
      worktreePath?: string
      reason?: string
      warning?: string
      actionTarget?: unknown
    }
    onOpenRepositoryMember?: (
      item: BranchWorkspaceSnapshot,
      member: BranchWorkspaceSnapshot['repositories'][number],
    ) => void
    onOpenRepositoryMemberTerminal?: (
      item: BranchWorkspaceSnapshot,
      member: BranchWorkspaceSnapshot['repositories'][number],
    ) => void
    gitActionsDisabled?: boolean
    onGitAction?: (item: BranchWorkspaceSnapshot, kind: BranchWorkspaceGitActionKind) => void
    gitActionPanel?: { itemId: string; content: ReactNode } | null
    onCancel?: (item: BranchWorkspaceSnapshot) => void | Promise<void>
    onExtend?: (item: BranchWorkspaceSnapshot) => void
    onReduce?: (item: BranchWorkspaceSnapshot, resume?: boolean) => void
    onReduceMember?: (item: BranchWorkspaceSnapshot, member: BranchWorkspaceSnapshot['repositories'][number]) => void
    onRemove?: (item: BranchWorkspaceSnapshot) => void
    onAddDependencies?: (item: BranchWorkspaceSnapshot) => void
    onRemoveDependencies?: (item: BranchWorkspaceSnapshot) => void
  },
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceQuery: () => ({
    data: branchWorkspaceState.queryResult ?? {
      ok: true,
      rootId: ROOT,
      items: branchWorkspaceState.items,
      auxiliaryCandidates: [],
    },
    isPending: false,
    refresh: branchWorkspaceState.refresh,
  }),
}))

vi.mock('#/web/workspace-client.ts', () => ({
  cleanupBranchWorkspaceRegistry: branchWorkspaceCleanupState.cleanup,
}))

vi.mock('#/web/hooks/useBranchWorkspaceActions.ts', () => ({
  useBranchWorkspaceActions: () => ({
    plan: branchWorkspaceState.plan,
    result: null,
    pending: branchWorkspaceState.pending,
    error: null,
    requestPlan: branchWorkspaceState.requestPlan,
    confirm: vi.fn(async () => null),
    retry: vi.fn(async () => null),
    cancel: branchWorkspaceState.cancel,
    reorder: branchWorkspaceState.reorder,
    reset: vi.fn(),
  }),
}))

vi.mock('#/web/hooks/useBranchWorkspaceGitActions.ts', () => ({
  useBranchWorkspaceGitActions: () => branchGitActionState,
}))

vi.mock('#/web/hooks/useBranchWorkspaceDependencyActions.ts', () => ({
  useBranchWorkspaceDependencyActions: () => branchDependencyState,
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx', () => ({
  BranchWorkspaceGitActionPanel: (props: NonNullable<typeof branchGitPanelState.props>) => {
    branchGitPanelState.props = props
    return (
      <div data-testid="mock-branch-git-action-panel" data-kind={props.kind}>
        panel
      </div>
    )
  },
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceList.tsx', () => ({
  BranchWorkspaceList: (props: NonNullable<typeof branchWorkspaceListState.props>) => {
    branchWorkspaceListState.props = props
    return (
      <div data-testid="branch-workspace-list" data-active-id={props.activeId ?? ''}>
        {props.items.map((item) => item.branch).join(',')}
        {props.gitActionPanel?.content}
      </div>
    )
  },
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceDialog.tsx', () => ({
  BranchWorkspaceDialog: ({
    open,
    mode,
    repositories,
    workspace,
    progressWorkspace,
    fixedReduceRepositoryName,
    onRefreshAuxiliaryCandidates,
  }: {
    open: boolean
    mode: string
    repositories: Array<{ id: string; primaryWorktreePath?: string }>
    workspace: BranchWorkspaceSnapshot | null
    progressWorkspace: BranchWorkspaceSnapshot | null
    fixedReduceRepositoryName?: string | null
    onRefreshAuxiliaryCandidates?: () => Promise<unknown>
  }) => {
    branchWorkspaceState.dialogProps = {
      open,
      mode,
      repositories,
      workspace,
      progressWorkspace,
      fixedReduceRepositoryName,
    }
    branchWorkspaceState.dialogRefresh = onRefreshAuxiliaryCandidates ?? null
    return null
  },
}))

vi.mock('#/web/components/repo-workspace/BranchWorkspaceDependencyDialog.tsx', () => ({
  BranchWorkspaceDependencyDialog: (props: NonNullable<typeof branchDependencyDialogState.props>) => {
    branchDependencyDialogState.props = props
    return null
  },
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
  activateBranchWorkspace: useReposStore.getState().activateBranchWorkspace,
  selectBranch: useReposStore.getState().selectBranch,
  setDetailTab: useReposStore.getState().setDetailTab,
  rescanWorkspace: useReposStore.getState().rescanWorkspace,
  configureWorkspace: useReposStore.getState().configureWorkspace,
  refreshCoreData: useReposStore.getState().refreshCoreData,
}

let container: HTMLDivElement | null = null
let root: Root | null = null
const activateWorkspaceOverview = vi.fn()
const activateWorkspaceRepository = vi.fn()
const activateBranchWorkspace = vi.fn()
const selectBranch = vi.fn()
const setDetailTab = vi.fn()
const rescanWorkspace = vi.fn(async () => {})
const refreshCoreData = vi.fn(async () => {})
const configureWorkspace = vi.fn(
  async (_rootId: string, _config: WorkspaceConfig): Promise<{ ok: true } | { ok: false; message: string }> => ({
    ok: true,
  }),
)

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  compactUi = false
  resetReposStore()
  useReposStore.setState(originalActions)
  activateWorkspaceOverview.mockReset()
  activateWorkspaceRepository.mockReset()
  activateBranchWorkspace.mockReset()
  selectBranch.mockReset()
  setDetailTab.mockReset()
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
  branchWorkspaceState.queryResult = null
  branchWorkspaceCleanupState.cleanup.mockReset()
  branchWorkspaceState.cancel.mockReset()
  branchWorkspaceState.cancel.mockResolvedValue(undefined)
  branchWorkspaceState.requestPlan.mockReset()
  branchWorkspaceState.requestPlan.mockResolvedValue(true)
  branchWorkspaceState.plan = null
  branchWorkspaceState.pending = false
  branchWorkspaceState.dialogProps = null
  branchGitActionState.requestPlan.mockReset()
  branchGitActionState.requestPlan.mockResolvedValue(true)
  branchGitActionState.executeBatchCommit.mockReset()
  branchGitActionState.executeBatchMergeIn.mockReset()
  branchGitActionState.executeBatchMergeOut.mockReset()
  branchGitActionState.executeSync.mockReset()
  branchGitActionState.cancel.mockReset()
  branchGitActionState.cancel.mockResolvedValue(undefined)
  branchGitActionState.reset.mockReset()
  branchGitActionState.pending = false
  branchGitActionState.error = null
  branchGitPanelState.props = null
  branchDependencyState.read.mockReset()
  branchDependencyState.read.mockResolvedValue({ ok: true, candidates: [] })
  branchDependencyState.requestPlan.mockReset()
  branchDependencyState.requestPlan.mockResolvedValue(true)
  branchDependencyState.confirm.mockReset()
  branchDependencyState.cancel.mockReset()
  branchDependencyState.cancel.mockResolvedValue(undefined)
  branchDependencyState.reset.mockReset()
  branchDependencyState.pending = false
  branchDependencyState.error = null
  branchDependencyDialogState.props = null
  branchWorkspaceListState.props = null
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
    activateBranchWorkspace,
    selectBranch,
    setDetailTab,
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
  test('renders the desktop repository list as a resizable region with the default height', () => {
    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    const resizeHandle = container?.querySelector<HTMLElement>(
      '[data-testid="workspace-repository-list-resize-handle"]',
    )

    expect(upperList?.style.height).toBe('160px')
    expect(resizeHandle?.getAttribute('role')).toBe('separator')
    expect(resizeHandle?.getAttribute('aria-orientation')).toBe('horizontal')
  })

  test('restores the desktop repository list height for the workspace root', () => {
    useReposStore.setState({ workspaceRepositoryListHeightByRoot: { [ROOT]: 224 } })

    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    expect(upperList?.style.height).toBe('224px')
  })

  test('clamps a restored height to the available navigation area', () => {
    vi.spyOn(container!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 300,
      width: 320,
      height: 300,
      toJSON: () => ({}),
    })
    useReposStore.setState({ workspaceRepositoryListHeightByRoot: { [ROOT]: 400 } })

    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    expect(upperList?.style.height).toBe('172px')
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({ [ROOT]: 172 })
  })

  test('clamps pointer resizing between the minimum and the available navigation height', () => {
    vi.spyOn(container!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 400,
      width: 320,
      height: 400,
      toJSON: () => ({}),
    })
    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    const resizeHandle = container?.querySelector<HTMLElement>(
      '[data-testid="workspace-repository-list-resize-handle"]',
    )
    if (!upperList || !resizeHandle) throw new Error('missing resizable repository list')

    act(() => {
      resizeHandle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100 }))
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 500 }))
      window.dispatchEvent(new MouseEvent('pointerup'))
    })
    expect(upperList.style.height).toBe('272px')
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({ [ROOT]: 272 })

    act(() => {
      resizeHandle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100 }))
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: -500 }))
      window.dispatchEvent(new MouseEvent('pointerup'))
    })
    expect(upperList.style.height).toBe('96px')
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({ [ROOT]: 96 })
  })

  test('keeps the compact repository list fixed without a resize handle', () => {
    compactUi = true
    useReposStore.setState({ workspaceRepositoryListHeightByRoot: { [ROOT]: 224 } })
    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')

    expect(upperList?.style.height).toBe('')
    expect(upperList?.className).toContain('max-h-40')
    expect(container?.querySelector('[data-testid="workspace-repository-list-resize-handle"]')).toBeNull()
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({ [ROOT]: 224 })
  })

  test('supports keyboard resizing through the focused separator', () => {
    vi.spyOn(container!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 400,
      width: 320,
      height: 400,
      toJSON: () => ({}),
    })
    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    const resizeHandle = container?.querySelector<HTMLElement>(
      '[data-testid="workspace-repository-list-resize-handle"]',
    )
    if (!upperList || !resizeHandle) throw new Error('missing resizable repository list')

    act(() => resizeHandle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })))
    expect(upperList.style.height).toBe('176px')
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({ [ROOT]: 176 })

    act(() => resizeHandle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' })))
    expect(upperList.style.height).toBe('96px')

    act(() => resizeHandle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' })))
    expect(upperList.style.height).toBe('272px')
  })

  test('caps the keyboard maximum at the persisted height limit', () => {
    vi.spyOn(container!, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 5000,
      width: 320,
      height: 5000,
      toJSON: () => ({}),
    })
    renderRail()

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    const resizeHandle = container?.querySelector<HTMLElement>(
      '[data-testid="workspace-repository-list-resize-handle"]',
    )
    if (!upperList || !resizeHandle) throw new Error('missing resizable repository list')

    act(() => resizeHandle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' })))

    expect(upperList.style.height).toBe('4096px')
    expect(resizeHandle.getAttribute('aria-valuemax')).toBe('4096')
    expect(useReposStore.getState().workspaceRepositoryListHeightByRoot).toEqual({ [ROOT]: 4096 })
  })

  test('manually reloads the branch workspace list and guards duplicate requests', async () => {
    let finishRefresh: (() => void) | undefined
    branchWorkspaceState.refresh.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRefresh = resolve
      }),
    )
    renderRail({ currentRepoId: ROOT })

    const refresh = container?.querySelector<HTMLButtonElement>(
      'section[aria-label="workspace.branch-workspace.list"] [aria-label="workspace.branch-workspace.reload"]',
    )
    expect(refresh).not.toBeNull()

    act(() => {
      refresh?.click()
      refresh?.click()
    })
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
    expect(rescanWorkspace).not.toHaveBeenCalled()
    expect(refresh?.disabled).toBe(true)

    await act(async () => finishRefresh?.())
    expect(refresh?.disabled).toBe(false)
  })

  test('reloads branch workspaces after a remote read failure without offering registry cleanup', async () => {
    let finishRefresh: (() => void) | undefined
    branchWorkspaceState.queryResult = {
      ok: false,
      message: 'workspace.branch-workspace.remote-operation-failed',
    }
    branchWorkspaceState.refresh.mockReturnValue(
      new Promise((resolve) => {
        finishRefresh = () =>
          resolve({
            ok: true,
            rootId: ROOT,
            items: branchWorkspaceState.items,
            auxiliaryCandidates: [],
          })
      }),
    )
    renderRail({ currentRepoId: ROOT })

    const branchSection = container?.querySelector('section[aria-label="workspace.branch-workspace.list"]')
    const headerReload = branchSection?.firstElementChild?.querySelector<HTMLButtonElement>(
      'button[aria-label="workspace.branch-workspace.reload"]',
    )
    const errorReload = branchSection?.querySelector<HTMLButtonElement>(
      '[role="alert"] button[aria-label="workspace.branch-workspace.reload"]',
    )
    expect(headerReload).not.toBeNull()
    expect(errorReload).not.toBeNull()
    expect(container?.textContent).toContain('workspace.branch-workspace.remote-operation-failed')
    expect(
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.branch-workspace.cleanup"]'),
    ).toBeNull()

    act(() => {
      headerReload?.click()
      errorReload?.click()
    })
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
    expect(headerReload?.disabled).toBe(true)
    expect(errorReload?.disabled).toBe(true)

    await act(async () => {
      finishRefresh?.()
      await Promise.resolve()
    })
    expect(headerReload?.disabled).toBe(false)
    expect(errorReload?.disabled).toBe(false)
  })

  test('keeps the remote read failure retryable when reloading rejects', async () => {
    branchWorkspaceState.queryResult = {
      ok: false,
      message: 'workspace.branch-workspace.remote-operation-failed',
    }
    branchWorkspaceState.refresh.mockRejectedValue(new Error('temporary network failure'))
    renderRail({ currentRepoId: ROOT })

    const reload = container?.querySelector<HTMLButtonElement>(
      '[role="alert"] button[aria-label="workspace.branch-workspace.reload"]',
    )
    await act(async () => {
      reload?.click()
      await Promise.resolve()
    })

    expect(reload?.disabled).toBe(false)
    expect(container?.textContent).toContain('workspace.branch-workspace.remote-operation-failed')
  })

  test('refreshes a newly drifted branch workspace once per drift episode', async () => {
    const originalItems = branchWorkspaceState.items
    const drifted = {
      ...originalItems[0]!,
      state: { kind: 'needs-action' as const, action: 'repair' as const, reason: 'drift' as const },
    }
    try {
      branchWorkspaceState.items = [drifted, ...originalItems.slice(1)]
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)

      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)

      branchWorkspaceState.items = originalItems
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())

      branchWorkspaceState.items = [drifted, ...originalItems.slice(1)]
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(2)
    } finally {
      branchWorkspaceState.items = originalItems
    }
  })

  test('coalesces new drift and ignores other repair lifecycle states', async () => {
    const originalItems = branchWorkspaceState.items
    try {
      branchWorkspaceState.items = originalItems.map((item) => ({
        ...item,
        state: { kind: 'needs-action' as const, action: 'repair' as const, reason: 'drift' as const },
      }))
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)

      branchWorkspaceState.refresh.mockClear()
      branchWorkspaceState.items = [
        {
          ...originalItems[0]!,
          state: {
            kind: 'needs-action' as const,
            action: 'repair' as const,
            reason: 'creation-interrupted' as const,
          },
        },
        { ...originalItems[1]!, state: { kind: 'needs-action' as const, action: 'continue-delete' as const } },
      ]
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      expect(branchWorkspaceState.refresh).not.toHaveBeenCalled()
    } finally {
      branchWorkspaceState.items = originalItems
    }
  })

  test('does not loop when automatic drift refresh rejects', async () => {
    const originalItems = branchWorkspaceState.items
    branchWorkspaceState.refresh.mockRejectedValue(new Error('temporary read failure'))
    try {
      branchWorkspaceState.items = [
        {
          ...originalItems[0]!,
          state: { kind: 'needs-action' as const, action: 'repair' as const, reason: 'drift' as const },
        },
        ...originalItems.slice(1),
      ]
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      renderRail({ currentRepoId: ROOT })
      await act(async () => Promise.resolve())
      expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
    } finally {
      branchWorkspaceState.items = originalItems
    }
  })

  test('confirms and runs registry cleanup only for the branch workspace read failure', async () => {
    branchWorkspaceState.queryResult = { ok: false, message: 'workspace.branch-workspace.read-failed' }
    branchWorkspaceCleanupState.cleanup.mockResolvedValue({ ok: true, outcome: 'repaired', removedRecords: 2 })
    renderRail({ currentRepoId: ROOT })

    const cleanup = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="workspace.branch-workspace.cleanup"]',
    )
    expect(cleanup).not.toBeNull()
    act(() => cleanup?.click())
    const dialog = document.body.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain('workspace.branch-workspace.cleanup-description')
    const confirm = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent === 'workspace.branch-workspace.cleanup-confirm',
    )

    await act(async () => confirm?.click())

    expect(branchWorkspaceCleanupState.cleanup).toHaveBeenCalledWith(ROOT)
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
    expect(toastMocks.success).toHaveBeenCalledWith('workspace.branch-workspace.cleanup-success.repaired')
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })

  test('keeps the read failure visible and reports registry cleanup failure', async () => {
    branchWorkspaceState.queryResult = { ok: false, message: 'workspace.branch-workspace.read-failed' }
    branchWorkspaceCleanupState.cleanup.mockResolvedValue({
      ok: false,
      message: 'workspace.branch-workspace.cleanup-failed',
    })
    renderRail({ currentRepoId: ROOT })

    act(() =>
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.branch-workspace.cleanup"]')?.click(),
    )
    const confirm = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')).find(
      (button) => button.textContent === 'workspace.branch-workspace.cleanup-confirm',
    )
    await act(async () => confirm?.click())

    expect(container?.textContent).toContain('workspace.branch-workspace.read-failed')
    expect(toastMocks.error).toHaveBeenCalledWith('workspace.branch-workspace.cleanup-failed')
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
  })

  test('does not offer registry cleanup for a different branch workspace read error', () => {
    branchWorkspaceState.queryResult = { ok: false, message: 'workspace.config.missing' }
    renderRail({ currentRepoId: ROOT })

    expect(
      container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.branch-workspace.cleanup"]'),
    ).toBeNull()
  })

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

  test('uses the workspace member name when shared repository state keeps a remote project prefix', () => {
    const state = useReposStore.getState()
    useReposStore.setState({
      repos: {
        ...state.repos,
        [API]: replaceRepo(state.repos[API]!, (repo) => {
          repo.name = 'prod:api'
        }),
      },
    })

    renderRail()

    expect(repositoryListState.props?.repositories.find((repository) => repository.id === API)?.name).toBe('api')
  })

  test('renders navigation sections without decorative separators', () => {
    useReposStore.setState({
      activeId: ROOT,
      workspaceActiveContextByRoot: { [ROOT]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' } },
    })
    renderRail({ currentRepoId: ROOT })

    const upperList = container?.querySelector<HTMLElement>('[data-testid="workspace-repository-upper-list"]')
    const railRoot = upperList?.parentElement?.parentElement
    const branchSection = container?.querySelector<HTMLElement>('section[aria-label="workspace.branch-workspace.list"]')
    const status = container?.querySelector<HTMLElement>('[role="status"]')

    expect(branchSection).not.toBeNull()
    expect(status).not.toBeNull()
    expect(railRoot?.className).not.toContain('border-b')
    expect(railRoot?.className).not.toContain('border-separator')
    expect(upperList?.querySelector('.bg-separator')).toBeNull()
    expect(branchSection?.className).not.toContain('border-t')
    expect(branchSection?.className).not.toContain('border-separator')
    expect(status?.className).not.toContain('border-t')
    expect(status?.className).not.toContain('border-separator')
  })

  test('identifies Overview with the workspace root folder icon and name', () => {
    renderRail()

    const overview = overviewButton()
    expect(overview?.title).toBe('workspace')
    expect(overview?.textContent).toContain('./workspace')
    expect(overview?.textContent).not.toContain('workspace.overview')
    expect(overview?.querySelector('.lucide-folder')).not.toBeNull()
    expect(overview?.querySelector('.lucide-folder-tree')).toBeNull()
    expect(overview?.className).toContain('text-[13px]')
  })

  test('merges branch workspace actions into the status bar when the repository section is hidden', () => {
    useReposStore.setState({
      activeId: ROOT,
      workspaceActiveContextByRoot: { [ROOT]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1' } },
    })
    const statusBarActionHost = document.createElement('div')
    statusBarActionHost.dataset.testid = 'statusbar-workspace-actions'
    container?.append(statusBarActionHost)
    renderRail({ currentRepoId: ROOT, statusBarActionHost })

    const repositorySection = container?.querySelector('section[aria-label="workspace.repositories"]')
    const branchWorkspaceSection = container?.querySelector('section[aria-label="workspace.branch-workspace.list"]')
    expect(repositorySection).not.toBeNull()
    expect(branchWorkspaceSection).not.toBeNull()
    expect(repositorySection?.querySelector('[aria-label="workspace.repositories.collapse"]')).toBeNull()
    expect(repositorySection?.querySelector('[aria-label="workspace.repositories.expand"]')).toBeNull()
    const hide = repositorySection?.querySelector<HTMLButtonElement>('[aria-label="workspace.repositories.hide"]')
    expect(hide?.querySelector('.lucide-eye-off')).not.toBeNull()
    for (const label of [
      'workspace.branch-workspace.create',
      'workspace.pull-all',
      'workspace.configure',
      'workspace.rescan',
    ]) {
      expect(repositorySection?.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
      expect(branchWorkspaceSection?.querySelector(`[aria-label="${label}"]`)).toBeNull()
    }

    act(() => hide?.click())

    expect(container?.querySelector('section[aria-label="workspace.repositories"]')).toBeNull()
    const migratedSection = container?.querySelector('section[aria-label="workspace.branch-workspace.list"]')
    expect(container?.querySelector('[data-testid="branch-workspace-list"]')?.textContent).toContain('feature/auth')
    expect(container?.querySelector('[data-testid="branch-workspace-list"]')?.getAttribute('data-active-id')).toBe(
      'branch-1',
    )
    expect(migratedSection?.querySelector('[aria-label="workspace.branch-workspace.reload"]')).not.toBeNull()
    for (const label of [
      'workspace.branch-workspace.create',
      'workspace.pull-all',
      'workspace.configure',
      'workspace.rescan',
    ]) {
      expect(migratedSection?.querySelector(`[aria-label="${label}"]`)).toBeNull()
    }
    for (const label of ['workspace.branch-workspace.create', 'workspace.pull-all', 'workspace.repositories.show']) {
      expect(statusBarActionHost.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    }
    expect(statusBarActionHost.querySelector('[aria-label="workspace.repositories.show"] .lucide-eye')).not.toBeNull()
    expect(statusBarActionHost.querySelector('[aria-label="workspace.configure"]')).toBeNull()
    expect(statusBarActionHost.querySelector('[aria-label="workspace.rescan"]')).toBeNull()

    act(() =>
      statusBarActionHost
        .querySelector<HTMLButtonElement>('[aria-label="workspace.repositories.show"]')
        ?.click(),
    )

    const restoredRepositorySection = container?.querySelector('section[aria-label="workspace.repositories"]')
    expect(restoredRepositorySection).not.toBeNull()
    for (const label of [
      'workspace.branch-workspace.create',
      'workspace.pull-all',
      'workspace.configure',
      'workspace.rescan',
    ]) {
      expect(restoredRepositorySection?.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    }
    expect(statusBarActionHost.childElementCount).toBe(0)
  })

  test('shows the branch workspace recovery header while repositories are hidden from a member repository', () => {
    renderRail({ currentRepoId: API })

    expect(container?.querySelector('section[aria-label="workspace.branch-workspace.list"]')).toBeNull()
    act(() =>
      container
        ?.querySelector<HTMLButtonElement>(
          'section[aria-label="workspace.repositories"] [aria-label="workspace.repositories.hide"]',
        )
        ?.click(),
    )

    const branchWorkspaceSection = container?.querySelector('section[aria-label="workspace.branch-workspace.list"]')
    expect(container?.querySelector('section[aria-label="workspace.repositories"]')).toBeNull()
    expect(branchWorkspaceSection).not.toBeNull()

    act(() =>
      branchWorkspaceSection?.querySelector<HTMLButtonElement>('[aria-label="workspace.repositories.show"]')?.click(),
    )

    expect(container?.querySelector('section[aria-label="workspace.repositories"]')).not.toBeNull()
    expect(container?.querySelector('section[aria-label="workspace.branch-workspace.list"]')).toBeNull()
  })

  test('derives exact member dirtiness and opens the member inside its branch workspace', () => {
    const onOpenFileArea = vi.fn()
    const state = useReposStore.getState()
    const api = replaceRepo(state.repos[API]!, (repo) => {
      repo.data.branches = [
        ...repo.data.branches,
        createRepoBranch('feature/auth', { worktree: { path: '/workspace/goblin-feature-auth/api' } }),
      ]
      repo.data.status = [
        ...repo.data.status,
        {
          path: '/workspace/goblin-feature-auth/api',
          branch: 'feature/auth',
          isMain: false,
          entries: [
            { x: 'M', y: ' ', path: 'src/auth.ts' },
            { x: '?', y: '?', path: 'src/session.ts' },
          ],
        },
      ]
    })
    useReposStore.setState({
      repos: { ...state.repos, [API]: api },
      workspaceActiveContextByRoot: {
        [ROOT]: { kind: 'branch-workspace', branchWorkspaceId: 'branch-1', memberRepositoryName: 'api' },
      },
    })
    renderRail({ currentRepoId: ROOT, onOpenFileArea })

    const item = branchWorkspaceState.items[0]!
    const apiMember = item.repositories[0]!
    const webMember = item.repositories[1]!
    const apiPresentation = branchWorkspaceListState.props?.getMemberPresentation?.(item, apiMember)
    expect(apiPresentation).toMatchObject({
      dirty: true,
      changeCount: 2,
      navigable: true,
      repositoryId: API,
      worktreePath: '/workspace/goblin-feature-auth/api',
    })
    expect(apiPresentation?.actionTarget).toEqual({
      repo: api,
      branch: api.data.branches.find((branch) => branch.name === 'feature/auth'),
    })
    expect(branchWorkspaceListState.props?.getMemberPresentation?.(item, webMember)).toEqual({
      dirty: false,
      changeCount: null,
      navigable: false,
      reason: 'workspace.branch-workspace.member-unavailable',
      repositoryId: '/workspace/web',
      worktreePath: '/workspace/goblin-feature-auth/web',
    })
    expect(branchWorkspaceListState.props?.activeMemberRepositoryName).toBe('api')

    act(() => branchWorkspaceListState.props?.onOpenRepositoryMember?.(item, apiMember))
    expect(selectBranch).toHaveBeenCalledWith(API, 'feature/auth')
    expect(activateBranchWorkspace).toHaveBeenCalledWith(ROOT, 'branch-1', 'api')
    expect(activateWorkspaceRepository).not.toHaveBeenCalled()
    expect(onOpenFileArea).toHaveBeenCalledTimes(1)

    selectBranch.mockClear()
    activateWorkspaceRepository.mockClear()
    activateBranchWorkspace.mockClear()
    onOpenFileArea.mockClear()
    act(() => branchWorkspaceListState.props?.onOpenRepositoryMember?.(item, webMember))
    expect(selectBranch).not.toHaveBeenCalled()
    expect(activateWorkspaceRepository).not.toHaveBeenCalled()
    expect(activateBranchWorkspace).not.toHaveBeenCalled()
    expect(onOpenFileArea).not.toHaveBeenCalled()

    useReposStore.setState({ activeId: ROOT })
    selectBranch.mockClear()
    setDetailTab.mockClear()
    activateBranchWorkspace.mockClear()
    act(() => branchWorkspaceListState.props?.onOpenRepositoryMemberTerminal?.(item, apiMember))
    expect(selectBranch).toHaveBeenCalledWith(API, 'feature/auth')
    expect(setDetailTab).toHaveBeenCalledWith(API, 'terminal')
    expect(activateBranchWorkspace).toHaveBeenCalledWith(ROOT, 'branch-1', 'api')
    expect(activateWorkspaceRepository).not.toHaveBeenCalled()
    expect(onOpenFileArea).not.toHaveBeenCalled()
    expect(useReposStore.getState().activeId).toBe(ROOT)
  })

  test('uses the checked-out branch for a repairable drifted member', () => {
    const state = useReposStore.getState()
    const api = replaceRepo(state.repos[API]!, (repo) => {
      repo.data.branches = [
        ...repo.data.branches.filter((branch) => branch.name !== 'release/previous'),
        createRepoBranch('release/previous', { worktree: { path: '/workspace/goblin-feature-auth/api' } }),
      ]
    })
    useReposStore.setState({ repos: { ...state.repos, [API]: api } })
    const item = branchWorkspaceState.items[0]!
    const member = { ...item.repositories[0]!, ready: false }
    renderRail({ currentRepoId: ROOT })

    expect(branchWorkspaceListState.props?.getMemberPresentation?.(item, member)).toMatchObject({
      navigable: true,
      warning: 'workspace.branch-workspace.member-branch-drift',
      actionTarget: {
        repo: api,
        branch: expect.objectContaining({ name: 'release/previous' }),
      },
    })

    act(() => branchWorkspaceListState.props?.onOpenRepositoryMember?.(item, member))
    expect(selectBranch).toHaveBeenCalledWith(API, 'release/previous')
  })

  test('forwards branch workspace item file area toggles to the owning pane', () => {
    const onToggleFileArea = vi.fn()
    renderRail({ currentRepoId: ROOT, onToggleFileArea })

    const item = branchWorkspaceState.items[0]!
    act(() => branchWorkspaceListState.props?.onToggleFileArea?.(item))

    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
  })

  test('plans a Git action for the clicked branch workspace and mounts its panel below that item', async () => {
    renderRail({ currentRepoId: ROOT })
    const item = branchWorkspaceState.items[1]!

    await act(async () => {
      branchWorkspaceListState.props?.onGitAction?.(item, 'push')
      await Promise.resolve()
    })

    expect(branchGitActionState.reset).toHaveBeenCalledTimes(1)
    expect(branchGitActionState.requestPlan).toHaveBeenCalledWith('push', item.id)
    expect(branchWorkspaceListState.props?.gitActionPanel?.itemId).toBe(item.id)
    expect(container?.querySelector('[data-testid="mock-branch-git-action-panel"]')?.getAttribute('data-kind')).toBe(
      'push',
    )
    expect(branchGitPanelState.props?.activeOperation).toBeNull()
  })

  test('opens directional member dialogs and resumes durable reduction intent', async () => {
    renderRail({ currentRepoId: ROOT })
    const item = branchWorkspaceState.items[0]!

    expect(
      branchWorkspaceState.dialogProps?.repositories.find((repository) => repository.id === API)?.primaryWorktreePath,
    ).toBe(API)

    act(() => branchWorkspaceListState.props?.onExtend?.(item))
    expect(branchWorkspaceState.dialogProps).toMatchObject({ open: true, mode: 'extend', workspace: item })

    act(() => branchWorkspaceListState.props?.onReduce?.(item))
    expect(branchWorkspaceState.dialogProps).toMatchObject({ open: true, mode: 'reduce', workspace: item })

    act(() => branchWorkspaceListState.props?.onReduceMember?.(item, item.repositories[0]!))
    expect(branchWorkspaceState.dialogProps).toMatchObject({
      open: true,
      mode: 'reduce',
      workspace: item,
      fixedReduceRepositoryName: 'api',
    })

    const interrupted: BranchWorkspaceSnapshot = {
      ...item,
      state: { kind: 'needs-action', action: 'continue-reduce' },
      repositories: item.repositories.map((member, index) => ({
        ...member,
        progress: index === 0 ? 'removed' : 'failed',
        ready: false,
      })),
    }
    await act(async () => {
      branchWorkspaceListState.props?.onReduce?.(interrupted, true)
      await Promise.resolve()
    })
    expect(branchWorkspaceState.requestPlan).toHaveBeenCalledWith({
      operation: 'reduce',
      branchWorkspaceId: interrupted.id,
      repositories: ['api', 'web'],
    })
  })

  test('opens directional dependency dialogs after reading the clicked branch workspace', async () => {
    renderRail({ currentRepoId: ROOT })
    const item = branchWorkspaceState.items[0]!

    await act(async () => {
      branchWorkspaceListState.props?.onAddDependencies?.(item)
      await Promise.resolve()
    })
    expect(branchDependencyState.reset).toHaveBeenCalledTimes(1)
    expect(branchDependencyState.read).toHaveBeenCalledWith(item.id)
    expect(branchDependencyDialogState.props).toMatchObject({
      open: true,
      mode: 'add',
      branchWorkspaceId: item.id,
    })

    await act(async () => {
      branchWorkspaceListState.props?.onRemoveDependencies?.(item)
      await Promise.resolve()
    })
    expect(branchDependencyState.reset).toHaveBeenCalledTimes(2)
    expect(branchDependencyState.read).toHaveBeenLastCalledWith(item.id)
    expect(branchDependencyDialogState.props).toMatchObject({
      open: true,
      mode: 'remove',
      branchWorkspaceId: item.id,
    })
  })

  test('passes the latest operation snapshot separately from the stable dialog workspace', async () => {
    const originalItems = branchWorkspaceState.items
    const stableWorkspace = originalItems[0]!
    branchWorkspaceState.plan = removalPlan(stableWorkspace)
    branchWorkspaceState.pending = true
    renderRail({ currentRepoId: ROOT })

    act(() => branchWorkspaceListState.props?.onRemove?.(stableWorkspace))

    const liveWorkspace = {
      ...stableWorkspace,
      repositories: stableWorkspace.repositories.map((member, index) =>
        index === 0 ? { ...member, progress: 'removed' as const, ready: false } : member,
      ),
    }
    branchWorkspaceState.items = [liveWorkspace, ...originalItems.slice(1)]
    renderRail({ currentRepoId: ROOT })

    expect(branchWorkspaceState.dialogProps?.workspace).toBe(stableWorkspace)
    expect(branchWorkspaceState.dialogProps?.progressWorkspace).toBe(liveWorkspace)

    branchWorkspaceState.items = originalItems
  })

  test('falls back to the branch workspace root when the selected member is removed', () => {
    const originalItems = branchWorkspaceState.items
    const current = originalItems[0]!
    branchWorkspaceState.items = [
      {
        ...current,
        state: { kind: 'needs-action', action: 'continue-reduce' },
        repositories: current.repositories.map((member) =>
          member.repositoryName === 'api' ? { ...member, progress: 'removed' as const, ready: false } : member,
        ),
      },
    ]
    useReposStore.setState({
      activeId: ROOT,
      workspaceActiveContextByRoot: {
        [ROOT]: { kind: 'branch-workspace', branchWorkspaceId: current.id, memberRepositoryName: 'api' },
      },
    })

    renderRail({ currentRepoId: ROOT })

    branchWorkspaceState.items = originalItems
    expect(activateBranchWorkspace).toHaveBeenCalledWith(ROOT, current.id)
  })

  test('routes active batch Git cancellation to the rail-owned Git action hook', async () => {
    renderRail({ currentRepoId: ROOT })
    const activeItem: BranchWorkspaceSnapshot = {
      ...branchWorkspaceState.items[0]!,
      activeOperation: {
        kind: 'push',
        currentStep: 1,
        completedCount: 0,
        totalCount: 2,
        cancellable: true,
      },
    }

    await act(async () => await branchWorkspaceListState.props?.onCancel?.(activeItem))

    expect(branchGitActionState.cancel).toHaveBeenCalledTimes(1)
    expect(branchWorkspaceState.cancel).not.toHaveBeenCalled()
  })

  test('does not expose per-row change refresh controls to the branch workspace list', () => {
    renderRail({ currentRepoId: ROOT })

    expect(branchWorkspaceListState.props).not.toHaveProperty('onRefreshChanges')
    expect(branchWorkspaceListState.props).not.toHaveProperty('refreshingChangeIds')
  })

  test('sums changes from each branch workspace repository member worktree', () => {
    const state = useReposStore.getState()
    const api = replaceRepo(state.repos[API]!, (repo) => {
      repo.data.status = [
        ...repo.data.status,
        {
          path: '/workspace/goblin-feature-auth/api',
          branch: 'feature/auth',
          isMain: false,
          entries: [
            { x: 'M', y: ' ', path: 'src/auth.ts' },
            { x: '?', y: '?', path: 'src/session.ts' },
          ],
        },
        {
          path: '/worktrees/unrelated',
          branch: 'feature/unrelated',
          isMain: false,
          entries: [{ x: 'M', y: ' ', path: 'ignored.ts' }],
        },
      ]
    })
    const web = replaceRepo(state.repos[WEB]!, (repo) => {
      repo.availability = { phase: 'available' }
      repo.data.status = [
        {
          path: '/workspace/goblin-feature-auth/web',
          branch: 'feature/auth',
          isMain: false,
          entries: [
            { x: 'M', y: ' ', path: 'src/page.tsx' },
            { x: 'M', y: ' ', path: 'src/form.tsx' },
            { x: '?', y: '?', path: 'src/form.test.tsx' },
          ],
        },
      ]
    })
    useReposStore.setState({ repos: { ...state.repos, [API]: api, [WEB]: web } })

    renderRail({ currentRepoId: ROOT })

    expect(branchWorkspaceListState.props?.changeCountById).toEqual({
      'branch-1': 5,
      'branch-2': 0,
    })
  })

  test('excludes stale member status from unavailable repositories', () => {
    const state = useReposStore.getState()
    const web = replaceRepo(state.repos[WEB]!, (repo) => {
      repo.data.status = [
        {
          path: '/workspace/goblin-feature-auth/web',
          branch: 'feature/auth',
          isMain: false,
          entries: [{ x: 'M', y: ' ', path: 'stale.tsx' }],
        },
      ]
    })
    useReposStore.setState({ repos: { ...state.repos, [WEB]: web } })

    renderRail({ currentRepoId: ROOT })

    expect(branchWorkspaceListState.props?.changeCountById?.['branch-1']).toBe(0)
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

  test('aggregates root and child workspace terminal status in Overview', () => {
    renderRail({
      terminalCount: 1,
      terminalStateByPath: {
        '/workspace/goblin-feature-auth': { count: 2, outputActive: true },
        '/workspace/goblin-feature-search': { count: 3, hasBell: true },
      },
    })

    const overview = overviewButton()
    expect(overview?.querySelector('[data-testid="overview-terminal-count-badge"]')?.textContent).toBe('6')
    expect(overview?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(overview?.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
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

function removalPlan(workspace: BranchWorkspaceSnapshot): BranchWorkspacePlan {
  return {
    token: 'sha256:remove-plan',
    rootId: workspace.rootId,
    operation: 'remove',
    branchWorkspaceId: workspace.id,
    branch: workspace.branch,
    directoryName: workspace.directoryName,
    path: workspace.path,
    manifest: {
      id: workspace.id,
      rootId: workspace.rootId,
      branch: workspace.branch,
      directoryName: workspace.directoryName,
      path: workspace.path,
      repositories: workspace.repositories,
      auxiliaryEntries: workspace.auxiliaryEntries,
    },
    repositories: [],
    auxiliaryEntries: [],
    requiredApprovals: [],
    steps: [],
    terminalSessionIds: [],
    removalOptions: { alsoDeleteBranch: false, alsoDeleteUpstream: false },
  }
}

function overviewButton(): HTMLButtonElement | null | undefined {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
    button.textContent?.includes('./'),
  )
}

function renderRail({
  terminalCount = 0,
  outputActive = false,
  hasBell = false,
  terminalStateByPath = {},
  currentRepoId = API,
  onOpenFileArea,
  onToggleFileArea,
  statusBarActionHost,
}: {
  terminalCount?: number
  outputActive?: boolean
  hasBell?: boolean
  terminalStateByPath?: Record<string, { count: number; outputActive?: boolean; hasBell?: boolean }>
  currentRepoId?: string
  onOpenFileArea?: () => void
  onToggleFileArea?: () => void
  statusBarActionHost?: HTMLDivElement | null
} = {}) {
  const rootTerminalKey = `${ROOT}\0${ROOT}`
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const terminalPath = worktreeTerminalKey.slice(worktreeTerminalKey.indexOf('\0') + 1)
      const terminalState =
        terminalStateByPath[terminalPath] ??
        (worktreeTerminalKey === rootTerminalKey ? { count: terminalCount, outputActive, hasBell } : { count: 0 })
      return {
        worktreeTerminalKey,
        selectedDescriptor: null,
        sessions: Array.from({ length: terminalState.count }, (_, index) => ({
          key: `${worktreeTerminalKey}\0terminal-${index + 1}`,
          worktreeTerminalKey,
          terminalId: `terminal-${index + 1}`,
          index: index + 1,
          title: 'terminal',
          phase: 'open',
          selected: index === 0,
          hasBell: index === 0 && !!terminalState.hasBell,
          isOutputActive: index === 0 && !!terminalState.outputActive,
        })),
        count: terminalState.count,
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
        <WorkspaceRepositoryRail
          workspaceRootId={ROOT}
          currentRepoId={currentRepoId}
          onOpenFileArea={onOpenFileArea}
          onToggleFileArea={onToggleFileArea}
          statusBarActionHost={statusBarActionHost}
        />
      </TerminalSessionReadContext.Provider>,
    )
  })
}

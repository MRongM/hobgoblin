// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchList } from '#/web/components/BranchList.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionContextValue, TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import type { BranchWorkspaceReadResult } from '#/shared/branch-workspaces.ts'

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

const REPO_ID = '/tmp/repo'
let container: HTMLDivElement | null = null
let root: Root | null = null
let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
  sensorCount: 0,
}))
const navigationState = vi.hoisted(() => ({
  selectRepoBranch: vi.fn(),
  showRepoDetailTab: vi.fn(),
}))
const branchWorkspaceQueryState = vi.hoisted(() => ({
  data: undefined as BranchWorkspaceReadResult | undefined,
  rootId: '',
}))
const repoClientState = vi.hoisted(() => ({
  discardRepositoryChanges: vi.fn(),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useI18nStore: (selector: (state: { lang: string }) => string) => selector({ lang: 'zh' }),
  useT: () => (key: string, params?: Record<string, string | number>) => {
    if (key === 'branches.reorder-worktree') return '重新排序工作树'
    if (key === 'branches.empty') return '该仓库暂无分支。'
    if (key === 'branches.filter-empty') return '没有匹配当前筛选或搜索的分支。'
    if (key === 'branches.worktree') return '工作树'
    if (key === 'branches.dirty') return '有改动'
    if (key === 'branch-status.worktree-dirty') return `${params?.n ?? 0} 个改动`
    if (key === 'branches.default') return '默认'
    if (key === 'branches.gone') return '已失联'
    if (key === 'branch-status.current') return '当前'
    if (key === 'workspace.branch-workspace.member-badge') return '子工作区'
    return key
  },
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceQuery: (rootId: string) => {
    branchWorkspaceQueryState.rootId = rootId
    return { data: branchWorkspaceQueryState.data }
  },
}))

vi.mock('#/web/repo-client.ts', () => ({
  discardRepositoryChanges: repoClientState.discardRepositoryChanges,
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  useMainWindowNavigation: () => ({
    selectRepoBranch: navigationState.selectRepoBranch,
    showRepoDetailTab: navigationState.showRepoDetailTab,
  }),
}))

vi.mock('#/web/components/ui/scroll-area.tsx', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('#/web/hooks/useBranchActionItems.tsx', () => ({
  useBranchActionItems: () => ({
    patchItems: [],
    mainItems: [],
    externalItems: [],
    destructiveItems: [
      {
        id: 'removeWorktree',
        label: 'action.remove-worktree',
        disabled: false,
        visible: true,
        destructive: true,
        icon: null,
        onSelect: () => {},
      },
    ],
    dialogs: null,
  }),
}))

vi.mock('#/web/components/BranchActionsMenu.tsx', () => ({
  BranchActionsDropdown: ({
    destructiveItems,
  }: {
    destructiveItems: Array<{ id: string; disabled: boolean; visible: boolean }>
  }) =>
    destructiveItems.some((item) => item.id === 'removeWorktree' && item.visible && !item.disabled) ? (
      <button type="button" data-testid="ordinary-remove-worktree" />
    ) : null,
}))

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: TestDragEndEvent) => void }) => {
      dndState.lastDragEnd = onDragEnd
      return <>{children}</>
    },
    PointerSensor: vi.fn(),
    closestCenter: vi.fn(),
    useSensor: (sensor: unknown) => ({ sensor }),
    useSensors: (...sensors: unknown[]) => {
      dndState.sensorCount = sensors.length
      return sensors
    },
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable')
  return {
    ...actual,
    SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-sortable-id': id },
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  dndState.lastDragEnd = null
  dndState.sensorCount = 0
  navigationState.selectRepoBranch.mockReset()
  navigationState.showRepoDetailTab.mockReset()
  branchWorkspaceQueryState.data = undefined
  branchWorkspaceQueryState.rootId = ''
  repoClientState.discardRepositoryChanges.mockReset()
  repoClientState.discardRepositoryChanges.mockResolvedValue({ ok: true, message: '' })
  resetReposStore()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  if (originalScrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

function terminalReadContextWithState(
  bellKeys: ReadonlySet<string>,
  countsByWorktreeKey: ReadonlyMap<string, number>,
  outputActiveKeys: ReadonlySet<string> = new Set(),
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (worktreeTerminalKey) => {
      const hasBell = bellKeys.has(worktreeTerminalKey)
      const isOutputActive = outputActiveKeys.has(worktreeTerminalKey)
      const count = countsByWorktreeKey.get(worktreeTerminalKey) ?? (hasBell || isOutputActive ? 1 : 0)
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
                  isOutputActive,
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
}

function terminalCommandContext(): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    restoreTmuxSessions: vi.fn(async () => 0),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    pageTmux: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    scrollByTouch: vi.fn(),
    beginMobileSelection: vi.fn(() => false),
    extendMobileSelection: vi.fn(),
    finishMobileSelection: vi.fn(),
    cancelMobileSelection: vi.fn(),
    mobileSelectionText: vi.fn(() => ''),
    clearMobileSelection: vi.fn(),
    writeExtraKey: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(),
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
}

function seedWorktreeRepo() {
  seedRepoState({
    id: REPO_ID,
    branches: [
      createRepoBranch('main', { worktree: { path: '/repo' } }),
      createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } }),
      createRepoBranch('feature/plain'),
    ],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
}

function renderList(
  fixture: {
    bellWorktreeKeys?: string[]
    countsByWorktreeKey?: Map<string, number>
    outputActiveWorktreeKeys?: string[]
    onBranchSelected?: () => void
    onWorktreeDoubleClick?: () => void
    showActions?: boolean
  } = {},
) {
  const readContext = terminalReadContextWithState(
    new Set(fixture.bellWorktreeKeys ?? []),
    fixture.countsByWorktreeKey ?? new Map(),
    new Set(fixture.outputActiveWorktreeKeys ?? []),
  )
  act(() => {
    root!.render(
      <TerminalSessionContext.Provider value={terminalCommandContext()}>
        <TerminalSessionReadContext.Provider value={readContext}>
          <BranchList
            repoId={REPO_ID}
            showActions={fixture.showActions ?? false}
            onBranchSelected={fixture.onBranchSelected}
            onWorktreeDoubleClick={fixture.onWorktreeDoubleClick}
          />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
}

const WORKSPACE_ROOT_ID = '/tmp/workspace'
const MEMBER_WORKTREE_PATH = '/tmp/workspace/hobgoblin-feature/member-repo'

function successfulBranchWorkspaceRead(
  progress: 'complete' | 'removed' = 'complete',
): Extract<BranchWorkspaceReadResult, { ok: true }> {
  return {
    ok: true,
    rootId: WORKSPACE_ROOT_ID,
    auxiliaryCandidates: [],
    items: [
      {
        id: 'branch-1',
        rootId: WORKSPACE_ROOT_ID,
        branch: 'feature/member',
        directoryName: 'hobgoblin-feature',
        path: '/tmp/workspace/hobgoblin-feature',
        state: progress === 'removed' ? { kind: 'needs-action', action: 'continue-reduce' } : { kind: 'ready' },
        available: true,
        issues: [],
        repositories: [
          {
            repositoryName: 'member-repo',
            targetBranch: 'feature/member',
            creationBase: { kind: 'localBranch', branch: 'main' },
            syncBeforeCreate: false,
            branchOrigin: 'created',
            worktreePath: MEMBER_WORKTREE_PATH,
            progress,
            ready: progress === 'complete',
          },
        ],
        auxiliaryEntries: [],
      },
    ],
  }
}

function seedWorkspaceMembershipFixture(activeProjectId: string, progress: 'complete' | 'removed' = 'complete') {
  const repo = seedRepoState({
    id: REPO_ID,
    branches: [
      createRepoBranch('feature/member', { worktree: { path: MEMBER_WORKTREE_PATH } }),
      createRepoBranch('feature/other', { worktree: { path: '/tmp/other-worktree' } }),
    ],
    currentBranch: 'main',
    selectedBranch: 'feature/member',
  })
  repo.workspaceRootId = WORKSPACE_ROOT_ID
  useReposStore.setState({
    repos: { [REPO_ID]: repo },
    activeId: REPO_ID,
    activeProjectId,
    workspaceProjects: {
      [WORKSPACE_ROOT_ID]: {
        rootId: WORKSPACE_ROOT_ID,
        repositoryIds: [REPO_ID],
        candidates: [{ id: REPO_ID, name: 'member-repo', selected: true, available: true }],
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
  })
  branchWorkspaceQueryState.data = successfulBranchWorkspaceRead(progress)
}

describe('BranchList worktree drag ordering', () => {
  test('marks only exact current branch workspace member worktrees', () => {
    seedWorkspaceMembershipFixture(WORKSPACE_ROOT_ID)

    renderList()

    const rows = Array.from(container?.querySelectorAll('li') ?? [])
    const memberRow = rows.find((row) => row.textContent?.includes('feature/member'))
    const otherRow = rows.find((row) => row.textContent?.includes('feature/other'))
    expect(branchWorkspaceQueryState.rootId).toBe(WORKSPACE_ROOT_ID)
    const memberBadge = memberRow?.querySelector('[data-testid="branch-workspace-member-badge"]')
    expect(memberBadge?.textContent).toBe('')
    expect(memberBadge?.getAttribute('aria-label')).toBe('子工作区')
    expect(memberBadge?.querySelector('.lucide-folder-kanban')).not.toBeNull()
    expect(otherRow?.querySelector('[data-testid="branch-workspace-member-badge"]')).toBeNull()
  })

  test('does not mark removed branch workspace members', () => {
    seedWorkspaceMembershipFixture(WORKSPACE_ROOT_ID, 'removed')

    renderList()

    expect(branchWorkspaceQueryState.rootId).toBe(WORKSPACE_ROOT_ID)
    expect(container?.querySelector('[data-testid="branch-workspace-member-badge"]')).toBeNull()
  })

  test('does not mark workspace members when the repository is active standalone', () => {
    seedWorkspaceMembershipFixture(REPO_ID)

    renderList()

    expect(branchWorkspaceQueryState.rootId).toBe('')
    expect(container?.querySelector('[data-testid="branch-workspace-member-badge"]')).toBeNull()
  })

  test('renders only the visible repository worktrees with ordinary repository actions', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('trunk', { worktree: { path: REPO_ID } }),
        createRepoBranch('feature/solo', { worktree: { path: '/tmp/web-feature-solo' } }),
      ],
      currentBranch: 'trunk',
      selectedBranch: 'trunk',
      worktreesByPath: {
        [REPO_ID]: { path: REPO_ID, branch: 'trunk', isMain: true },
        '/tmp/web-feature-solo': { path: '/tmp/web-feature-solo', branch: 'feature/solo', isMain: false },
      },
    })
    renderList({ showActions: true })

    const soloRow = Array.from(container?.querySelectorAll('li') ?? []).find((row) =>
      row.textContent?.includes('feature/solo'),
    )
    expect(soloRow).not.toBeUndefined()
    expect(soloRow?.querySelector<HTMLButtonElement>('[aria-label="action.menu"]')).not.toBeNull()
    expect(document.querySelector('button[aria-label="workspace.batch.remove-action"]')).toBeNull()
  })

  test('notifies compact presentation after branch navigation', () => {
    seedWorktreeRepo()
    const onBranchSelected = vi.fn()

    renderList({ onBranchSelected })
    const featureRow = Array.from(container?.querySelectorAll('li') ?? []).find((row) =>
      row.textContent?.includes('feature/a'),
    )
    act(() => featureRow?.querySelector<HTMLButtonElement>('[data-workspace-list-item-main]')?.click())

    expect(navigationState.selectRepoBranch).toHaveBeenCalledWith(REPO_ID, 'feature/a')
    expect(onBranchSelected).toHaveBeenCalledTimes(1)
    expect(navigationState.selectRepoBranch.mock.invocationCallOrder[0]).toBeLessThan(
      onBranchSelected.mock.invocationCallOrder[0]!,
    )
  })

  test('notifies the file area after worktree double clicks without opening status', () => {
    seedWorktreeRepo()
    const onWorktreeDoubleClick = vi.fn()
    renderList({ onWorktreeDoubleClick })
    const featureButton = Array.from(container?.querySelectorAll('li') ?? [])
      .find((row) => row.textContent?.includes('feature/a'))
      ?.querySelector<HTMLButtonElement>('[data-workspace-list-item-main]')

    act(() => {
      featureButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      featureButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }))
      featureButton?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    })

    expect(navigationState.selectRepoBranch).toHaveBeenCalledWith(REPO_ID, 'feature/a')
    expect(onWorktreeDoubleClick).toHaveBeenCalledTimes(1)
    expect(navigationState.showRepoDetailTab).not.toHaveBeenCalled()
  })

  test('renders branch names and exposes worktree directory names in row tooltips', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [
        createRepoBranch('main', { worktree: { path: REPO_ID } }),
        createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } }),
      ],
      currentBranch: 'main',
      selectedBranch: 'feature/a',
    })

    renderList({
      countsByWorktreeKey: new Map([['/tmp/repo\0/tmp/worktree-a', 2]]),
    })

    expect(
      Array.from(container?.querySelectorAll('.text-sm.font-medium') ?? []).map((node) => node.textContent),
    ).toEqual(['main', 'feature/a'])
    expect(container?.querySelector('[data-testid="terminal-count-badge"]')?.textContent).toBe('2')
    expect(container?.querySelector('[title*="worktree-a"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="worktree-a"]')).toBeNull()
    expect(container?.textContent).not.toContain('worktree-a')
    expect(container?.textContent).not.toContain('../worktree-a')
    expect(container?.textContent).not.toContain('/tmp/worktree-a')
  })

  test('shows the changed-file count beside the dirty detached worktree icon', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      worktreesByPath: {
        [REPO_ID]: {
          path: REPO_ID,
          branch: 'main',
          isMain: true,
          isDirty: false,
        },
        '/tmp/detached-worktree': {
          path: '/tmp/detached-worktree',
          head: '1234567890abcdef',
          isDetached: true,
          isMain: false,
          isDirty: true,
          changeCount: 3,
        },
      },
    })

    renderList()

    const dirtyBadge = document.body.querySelector<HTMLElement>('[data-testid="dirty-detached-worktree-badge"]')
    const badgeIcon = dirtyBadge?.querySelector('svg')

    expect(dirtyBadge?.textContent).toBe('3')
    expect(dirtyBadge?.getAttribute('aria-label')).toBe('3 个改动')
    expect(dirtyBadge?.getAttribute('title')).toBe('3 个改动')
    expect(badgeIcon?.classList.contains('lucide-git-compare-arrows')).toBe(true)
    expect(badgeIcon?.classList.contains('lucide-folder-tree')).toBe(false)
  })

  test('discards the exact detected changes from a dirty detached worktree action', async () => {
    const worktreePath = '/tmp/detached-worktree'
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      status: [
        {
          path: worktreePath,
          branch: '',
          head: '1234567890abcdef',
          isMain: false,
          entries: [
            { x: 'R', y: ' ', path: 'src/app.ts', originalPath: 'src/legacy-app.ts' },
            { x: '?', y: '?', path: 'scratch/new.txt' },
          ],
        },
      ],
      worktreesByPath: {
        [REPO_ID]: { path: REPO_ID, branch: 'main', isMain: true, isDirty: false },
        [worktreePath]: {
          path: worktreePath,
          head: '1234567890abcdef',
          isDetached: true,
          isMain: false,
          isDirty: true,
          changeCount: 2,
        },
      },
    })
    renderList({ showActions: true })

    const detachedRow = document.body.querySelector('[data-testid="dirty-detached-worktree-badge"]')?.closest('li')
    const menuTrigger = detachedRow?.querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
    expect(menuTrigger).not.toBeNull()
    await act(async () => {
      menuTrigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })
    const discardItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('action.reset-hard'),
    )
    expect(discardItem?.getAttribute('data-variant')).toBe('destructive')
    await act(async () => {
      discardItem?.click()
      await Promise.resolve()
    })
    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'action.confirm-discard-detached-worktree-body',
    )

    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('action.confirm-reset-hard-confirm'),
    )
    await act(async () => {
      confirm?.click()
      await Promise.resolve()
    })

    expect(repoClientState.discardRepositoryChanges).toHaveBeenCalledWith(REPO_ID, worktreePath, [
      'src/legacy-app.ts',
      'src/app.ts',
      'scratch/new.txt',
    ])
  })

  test('disables detached-worktree discard when exact changed paths are unavailable', async () => {
    const worktreePath = '/tmp/detached-worktree'
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      worktreesByPath: {
        [REPO_ID]: { path: REPO_ID, branch: 'main', isMain: true, isDirty: false },
        [worktreePath]: {
          path: worktreePath,
          head: '1234567890abcdef',
          isDetached: true,
          isMain: false,
          isDirty: true,
        },
      },
    })
    renderList({ showActions: true })

    const detachedRow = document.body.querySelector('[data-testid="dirty-detached-worktree-badge"]')?.closest('li')
    const menuTrigger = detachedRow?.querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
    await act(async () => {
      menuTrigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })
    const discardItem = document.body.querySelector<HTMLElement>('[data-action="discardDetachedWorktreeChanges"]')

    expect(discardItem?.hasAttribute('data-disabled')).toBe(true)
    discardItem?.click()
    expect(repoClientState.discardRepositoryChanges).not.toHaveBeenCalled()
  })

  test('does not offer discard for a clean detached worktree', () => {
    const worktreePath = '/tmp/detached-worktree'
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      worktreesByPath: {
        [REPO_ID]: { path: REPO_ID, branch: 'main', isMain: true, isDirty: false },
        [worktreePath]: {
          path: worktreePath,
          head: '1234567890abcdef',
          isDetached: true,
          isMain: false,
          isDirty: false,
        },
      },
    })
    renderList({ showActions: true })

    const detachedRow = document.body.querySelector('li[title*="branches.detached-worktree"]')
    expect(detachedRow?.querySelector('[aria-label="action.menu"]')).toBeNull()
  })

  test('keeps the detached dirty badge icon-only when the exact count is unavailable', () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: REPO_ID } })],
      currentBranch: 'main',
      selectedBranch: 'main',
      worktreesByPath: {
        [REPO_ID]: {
          path: REPO_ID,
          branch: 'main',
          isMain: true,
          isDirty: false,
        },
        '/tmp/detached-worktree': {
          path: '/tmp/detached-worktree',
          head: '1234567890abcdef',
          isDetached: true,
          isMain: false,
          isDirty: true,
        },
      },
    })

    renderList()

    const dirtyBadge = document.body.querySelector<HTMLElement>('[data-testid="dirty-detached-worktree-badge"]')
    expect(dirtyBadge?.textContent).toBe('')
    expect(dirtyBadge?.getAttribute('aria-label')).toBe('有改动')
  })

  test('binds sortable activators only to dedicated worktree drag handles', () => {
    seedWorktreeRepo()

    renderList()

    const handles = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('[data-workspace-list-item-drag-handle]') ?? [],
    )
    expect(handles.map((handle) => handle.getAttribute('data-sortable-id'))).toEqual(['/repo', '/tmp/worktree-a'])
    expect(handles.every((handle) => handle.querySelector('.lucide-grip-vertical'))).toBe(true)
    expect(container?.querySelectorAll('li[data-sortable-id]')).toHaveLength(0)
    expect(container?.querySelectorAll('[data-workspace-list-item-main][data-sortable-id]')).toHaveLength(0)
  })

  test('uses pointer and keyboard sensors for worktree sorting', () => {
    seedWorktreeRepo()

    renderList()

    expect(dndState.sensorCount).toBe(2)
    expect(container?.querySelectorAll('[data-workspace-list-item-drag-handle]')).toHaveLength(2)
  })

  test('keeps worktree rows and their drag handles visible with stale branch search state', () => {
    seedWorktreeRepo()
    useReposStore.getState().setBranchSearchQuery(REPO_ID, 'feature')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(2)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(2)
    expect(container?.textContent).toContain('main')
    expect(container?.textContent).toContain('feature/a')
  })

  test('reorders worktrees when drag ends over another worktree', () => {
    seedWorktreeRepo()
    renderList()

    act(() => {
      dndState.lastDragEnd?.({ active: { id: '/tmp/worktree-a' }, over: { id: '/repo' } })
    })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.worktreePathOrder).toEqual(['/tmp/worktree-a', '/repo'])
  })
})

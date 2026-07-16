// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchList } from '#/web/components/BranchList.tsx'
import { TerminalSessionReadContext } from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

const REPO_ID = '/tmp/repo'
let container: HTMLDivElement | null = null
let root: Root | null = null
let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
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
    return key
  },
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  useMainWindowNavigation: () => ({
    selectRepoBranch: vi.fn(),
    showRepoDetailTab: vi.fn(),
  }),
}))

vi.mock('#/web/components/ui/scroll-area.tsx', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('#/web/components/BranchActionsMenu.tsx', () => ({
  BranchActionsDropdown: () => null,
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
    useSensor: () => ({}),
    useSensors: () => [],
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
        sessions: count > 0
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
  } = {},
) {
  const readContext = terminalReadContextWithState(
    new Set(fixture.bellWorktreeKeys ?? []),
    fixture.countsByWorktreeKey ?? new Map(),
    new Set(fixture.outputActiveWorktreeKeys ?? []),
  )
  act(() => {
    root!.render(
      <TerminalSessionReadContext.Provider value={readContext}>
        <BranchList repoId={REPO_ID} showActions={false} />
      </TerminalSessionReadContext.Provider>,
    )
  })
}

describe('BranchList worktree drag ordering', () => {
  test('renders branch names first and worktree paths as project directory names', () => {
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

    expect(Array.from(container?.querySelectorAll('.text-sm.font-medium') ?? []).map((node) => node.textContent)).toEqual([
      'main',
      'feature/a',
    ])
    expect(container?.querySelector('[data-testid="terminal-count-badge"]')?.textContent).toBe('2')
    expect(container?.textContent).toContain('worktree-a')
    expect(container?.querySelector('[aria-label="worktree-a"]')).not.toBeNull()
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

  test('hides worktree drag icons while keeping worktree rows sortable', () => {
    seedWorktreeRepo()

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(0)

    const sortableRows = Array.from(container?.querySelectorAll<HTMLLIElement>('li[data-sortable-id]') ?? [])
    expect(sortableRows.map((row) => row.getAttribute('data-sortable-id'))).toEqual(['/repo', '/tmp/worktree-a'])
    expect(sortableRows.every((row) => !row.className.includes('1.75rem'))).toBe(true)
  })

  test('marks worktree branch rows as sortable', () => {
    seedWorktreeRepo()

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(0)
    expect(container?.querySelectorAll('li[data-sortable-id]')).not.toHaveLength(0)
  })

  test('keeps worktree rows visible with stale branch search state without showing drag icons', () => {
    seedWorktreeRepo()
    useReposStore.getState().setBranchSearchQuery(REPO_ID, 'feature')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(0)
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

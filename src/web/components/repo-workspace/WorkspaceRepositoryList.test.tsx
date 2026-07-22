// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  WorkspaceRepositoryList,
  type WorkspaceRepositoryListItem,
} from '#/web/components/repo-workspace/WorkspaceRepositoryList.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }
type CloseTerminalMock = ReturnType<typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>>

const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
  contextSensors: null as unknown[] | null,
  sortableItems: null as string[] | null,
  sortableStrategy: null as unknown,
  sortableOptions: new Map<string, { disabled?: boolean }>(),
  sortableOnKeyDown: vi.fn(),
  useSensor: vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })),
  pointerSensor: {},
  keyboardSensor: {},
  verticalStrategy: {},
}))

const projectActionState = vi.hoisted(() => ({
  editorOnSelect: vi.fn(),
  externalTerminalOnSelect: vi.fn(),
  internalTerminalOnSelect: vi.fn(),
  editorDisabled: false,
  externalTerminalDisabled: false,
  internalTerminalDisabled: false,
}))

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      sensors,
    }: {
      children: ReactNode
      onDragEnd: (event: TestDragEndEvent) => void
      sensors: unknown[]
    }) => {
      dndState.lastDragEnd = onDragEnd
      dndState.contextSensors = sensors
      return <>{children}</>
    },
    PointerSensor: dndState.pointerSensor,
    KeyboardSensor: dndState.keyboardSensor,
    closestCenter: vi.fn(),
    useSensor: dndState.useSensor,
    useSensors: (...sensors: unknown[]) => sensors,
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable')
  return {
    ...actual,
    SortableContext: ({ children, items, strategy }: { children: ReactNode; items: string[]; strategy: unknown }) => {
      dndState.sortableItems = items
      dndState.sortableStrategy = strategy
      return <>{children}</>
    },
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: dndState.verticalStrategy,
    useSortable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
      dndState.sortableOptions.set(id, { disabled })
      return {
        attributes: { 'data-sortable-id': id, 'aria-roledescription': 'sortable' },
        listeners: { onKeyDown: dndState.sortableOnKeyDown },
        setNodeRef: (node: HTMLElement | null) => node?.setAttribute('data-sortable-node-id', id),
        setActivatorNodeRef: (node: HTMLElement | null) => node?.setAttribute('data-sortable-activator-id', id),
        transform: null,
        transition: undefined,
        isDragging: false,
      }
    },
  }
})

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/hooks/useProjectExternalOpenActions.ts', () => ({
  useProjectExternalOpenActions: (projectId: string) => ({
    visible: true,
    editor: {
      disabled: projectActionState.editorDisabled,
      busy: false,
      iconPref: 'cursor',
      onSelect: () => projectActionState.editorOnSelect(projectId),
    },
    externalTerminal: {
      disabled: projectActionState.externalTerminalDisabled,
      busy: false,
      iconPref: 'ghostty',
      onSelect: () => projectActionState.externalTerminalOnSelect(projectId),
    },
  }),
}))

vi.mock('#/web/hooks/useProjectInternalTerminalAction.ts', () => ({
  useProjectInternalTerminalAction: (projectId: string) => ({
    disabled: projectActionState.internalTerminalDisabled,
    busy: false,
    onSelect: () => projectActionState.internalTerminalOnSelect(projectId),
  }),
}))

vi.mock('#/web/components/ExternalAppIcon/index.tsx', () => ({
  EditorAppIcon: () => <span data-testid="mock-editor-app-icon" />,
  TerminalAppIcon: () => <span data-testid="mock-terminal-app-icon" />,
}))

const repositories: WorkspaceRepositoryListItem[] = [
  {
    id: '/workspace/api',
    name: 'api',
    branch: 'main',
    changeCount: 2,
    terminalWorktreePaths: ['/workspace/api', '/worktrees/api-feature'],
    unavailable: false,
  },
  {
    id: '/workspace/web',
    name: 'web',
    changeCount: 0,
    terminalWorktreePaths: ['/workspace/web'],
    unavailable: true,
  },
]

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  dndState.lastDragEnd = null
  dndState.contextSensors = null
  dndState.sortableItems = null
  dndState.sortableStrategy = null
  dndState.sortableOptions.clear()
  dndState.sortableOnKeyDown.mockClear()
  dndState.useSensor.mockClear()
  projectActionState.editorOnSelect.mockReset()
  projectActionState.externalTerminalOnSelect.mockReset()
  projectActionState.internalTerminalOnSelect.mockReset()
  projectActionState.editorDisabled = false
  projectActionState.externalTerminalDisabled = false
  projectActionState.internalTerminalDisabled = false
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

function renderList(
  disabled = false,
  readContext: TerminalSessionReadContextValue = terminalReadContext(new Map()),
  closeTerminal: CloseTerminalMock = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>(),
) {
  const onActivate = vi.fn()
  const onReorder = vi.fn()
  act(() => {
    root!.render(
      <TerminalSessionContext.Provider value={terminalCommandContext(closeTerminal)}>
        <TerminalSessionReadContext.Provider value={readContext}>
          <WorkspaceRepositoryList
            repositories={repositories}
            currentRepoId="/workspace/api"
            disabled={disabled}
            onActivate={onActivate}
            onReorder={onReorder}
          />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
  return { onActivate, onReorder, closeTerminal }
}

describe('WorkspaceRepositoryList', () => {
  test('registers ordered repository ids with dedicated grip activators', () => {
    renderList()

    expect(dndState.sortableItems).toEqual(['/workspace/api', '/workspace/web'])
    expect(dndState.sortableStrategy).toBe(dndState.verticalStrategy)
    expect(
      Array.from(container!.querySelectorAll('[data-sortable-activator-id]'), (node) =>
        node.getAttribute('data-sortable-activator-id'),
      ),
    ).toEqual(['/workspace/api', '/workspace/web'])
    expect(container!.querySelectorAll('[data-workspace-list-item-main][data-sortable-id]')).toHaveLength(0)
  })

  test('uses project-list pointer and keyboard drag sensors', () => {
    renderList()

    expect(dndState.useSensor).toHaveBeenCalledWith(dndState.pointerSensor, {
      activationConstraint: { distance: 6 },
    })
    expect(dndState.useSensor).toHaveBeenCalledWith(
      dndState.keyboardSensor,
      expect.objectContaining({ coordinateGetter: expect.any(Function) }),
    )
  })

  test('keeps native touch scrolling and accessible keyboard listeners on the grip', () => {
    renderList()
    const row = container!.querySelector('[data-sortable-activator-id="/workspace/api"]')

    expect(row?.className).not.toContain('touch-none')
    expect(row?.getAttribute('aria-roledescription')).toBe('sortable')
    act(() => row?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(dndState.sortableOnKeyDown).toHaveBeenCalledTimes(1)
  })

  test('renders current repository metadata and activates from a click', () => {
    const { onActivate } = renderList()
    const item = repositoryItem('/workspace/api')
    const row = item.querySelector('[data-workspace-list-item-main]')

    expect(row?.textContent).toContain('api')
    expect(row?.textContent).toContain('main')
    expect(row?.textContent).toContain('2')
    expect(row?.getAttribute('aria-current')).toBe('page')
    expect(item.getAttribute('data-selected')).toBe('true')
    expect(row?.className).toContain('text-sm')
    act(() => row?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onActivate).toHaveBeenCalledWith('/workspace/api')
  })

  test('shows aggregate terminal count, output activity, changes, and unread bell on a repository row', () => {
    const mainKey = '/workspace/api\0/workspace/api'
    const featureKey = '/workspace/api\0/worktrees/api-feature'
    renderList(
      false,
      terminalReadContext(
        new Map([
          [mainKey, worktreeSnapshot(mainKey, terminalSession(mainKey, { hasBell: true }))],
          [featureKey, worktreeSnapshot(featureKey, terminalSession(featureKey, { isOutputActive: true }))],
        ]),
      ),
    )
    const row = repositoryItem('/workspace/api')
    const terminalRow = repositoryItem('/workspace/web')
    const terminalBadge = row?.querySelector('[data-testid="workspace-repository-terminal-count-badge"]')
    const changeBadge = row?.querySelector('[data-testid="workspace-repository-change-count-badge"]')

    expect(terminalBadge?.textContent).toBe('2')
    expect(terminalBadge?.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(changeBadge?.textContent).toBe('2')
    expect(changeBadge?.querySelector('.lucide-git-compare-arrows')).not.toBeNull()
    expect(row?.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
    expect(terminalRow.querySelector('span[aria-hidden="true"].absolute.bottom-0')).toBeNull()
  })

  test('keeps terminal, change, and unread bell badges in the left-aligned primary content group', () => {
    const mainKey = '/workspace/api\0/workspace/api'
    renderList(
      false,
      terminalReadContext(new Map([[mainKey, worktreeSnapshot(mainKey, terminalSession(mainKey, { hasBell: true }))]])),
    )
    const row = repositoryItem('/workspace/api')
    const primaryContent = row?.querySelector('[data-testid="workspace-repository-primary-content"]')
    const statusBadges = row?.querySelector('[data-testid="workspace-repository-status-badges"]')
    const terminalBadge = row?.querySelector('[data-testid="workspace-repository-terminal-count-badge"]')
    const changeBadge = row?.querySelector('[data-testid="workspace-repository-change-count-badge"]')
    const bell = row?.querySelector('[data-terminal-bell-dot]')

    expect(primaryContent?.contains(statusBadges ?? null)).toBe(true)
    expect(statusBadges?.contains(terminalBadge ?? null)).toBe(true)
    expect(statusBadges?.contains(changeBadge ?? null)).toBe(true)
    expect(statusBadges?.contains(bell ?? null)).toBe(true)
  })

  test('omits repository status badges when terminal, change, and bell state are all empty', () => {
    renderList()
    const row = repositoryItem('/workspace/web')

    expect(row?.querySelector('[data-testid="workspace-repository-status-badges"]')).toBeNull()
  })

  test('closes terminals across every listed worktree through the repository row context menu', async () => {
    const mainKey = '/workspace/api\0/workspace/api'
    const featureKey = '/workspace/api\0/worktrees/api-feature'
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
    renderList(
      false,
      terminalReadContext(
        new Map([
          [mainKey, worktreeSnapshot(mainKey, terminalSession(mainKey))],
          [featureKey, worktreeSnapshot(featureKey, terminalSession(featureKey))],
        ]),
      ),
      closeTerminal,
    )
    const row = container!.querySelector('[data-sortable-node-id="/workspace/api"]')
    if (!(row instanceof HTMLElement)) throw new Error('missing workspace repository row')

    await requestCloseAllFromContextMenu(row)

    expect(closeTerminal).not.toHaveBeenCalled()
    await confirmCloseAll()
    expect(closeTerminal.mock.calls).toEqual([
      [`${mainKey}\0terminal-1`, { repoRoot: '/workspace/api', worktreePath: '/workspace/api' }],
      [`${featureKey}\0terminal-1`, { repoRoot: '/workspace/api', worktreePath: '/worktrees/api-feature' }],
    ])
  })

  test('offers the four scoped repository actions from the row context menu', async () => {
    renderList()
    const row = container!.querySelector('[data-sortable-node-id="/workspace/api"]')
    if (!(row instanceof HTMLElement)) throw new Error('missing workspace repository row')

    expect((await openContextMenu(row)).map((item) => item.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'terminal.external',
      'terminal.internal',
      'terminal.close-all',
    ])

    await clickContextMenuItem(row, 'worktrees.open-in-editor-label')
    await clickContextMenuItem(row, 'terminal.external')
    await clickContextMenuItem(row, 'terminal.internal')

    expect(projectActionState.editorOnSelect).toHaveBeenCalledWith('/workspace/api')
    expect(projectActionState.externalTerminalOnSelect).toHaveBeenCalledWith('/workspace/api')
    expect(projectActionState.internalTerminalOnSelect).toHaveBeenCalledWith('/workspace/api')
  })

  test('uses the shared frame and action dock without activating from row actions', async () => {
    const { onActivate } = renderList()
    const item = repositoryItem('/workspace/api')
    const dock = item.querySelector('[data-workspace-list-item-action-dock]')
    const editor = item.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')
    const internalTerminal = item.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')

    expect(item.getAttribute('data-size')).toBe('primary')
    expect(dock?.children).toHaveLength(3)
    expect(item.querySelector('[data-workspace-list-item-drag-handle]')).not.toBeNull()
    act(() => {
      editor?.click()
      internalTerminal?.click()
    })
    const externalTerminal = (await openRepositoryMenu('/workspace/api')).find((entry) =>
      entry.textContent?.includes('terminal.external'),
    )
    await act(async () => {
      externalTerminal?.click()
      await Promise.resolve()
    })

    expect(projectActionState.editorOnSelect).toHaveBeenCalledWith('/workspace/api')
    expect(projectActionState.internalTerminalOnSelect).toHaveBeenCalledWith('/workspace/api')
    expect(projectActionState.externalTerminalOnSelect).toHaveBeenCalledWith('/workspace/api')
    expect(onActivate).not.toHaveBeenCalled()
  })

  test('keeps disabled repository actions visible in their stable positions', async () => {
    projectActionState.editorDisabled = true
    projectActionState.internalTerminalDisabled = true
    projectActionState.externalTerminalDisabled = true
    renderList()

    const item = repositoryItem('/workspace/api')
    expect(item.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')?.disabled).toBe(true)
    expect(item.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.disabled).toBe(true)
    const menuItems = await openRepositoryMenu('/workspace/api')
    expect(menuItems.map((entry) => entry.textContent?.trim())).toEqual(['terminal.external'])
    expect(menuItems[0]?.hasAttribute('data-disabled')).toBe(true)
  })

  test('shows unavailable repository state', () => {
    renderList()
    const item = repositoryItem('/workspace/web')
    const row = item.querySelector('[data-workspace-list-item-main]')

    expect(row?.textContent).toContain('workspace.repository-unavailable')
    expect(row?.className).toContain('opacity-60')
  })

  test('reorders only when dropped over a different repository', () => {
    const { onReorder } = renderList()

    act(() => dndState.lastDragEnd?.({ active: { id: '/workspace/web' }, over: { id: '/workspace/api' } }))
    act(() => dndState.lastDragEnd?.({ active: { id: '/workspace/api' }, over: { id: '/workspace/api' } }))
    act(() => dndState.lastDragEnd?.({ active: { id: '/workspace/api' }, over: null }))

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith('/workspace/web', '/workspace/api')
  })

  test('disables every sortable row while persistence is pending', () => {
    renderList(true)

    expect(dndState.sortableOptions.get('/workspace/api')).toEqual({ disabled: true })
    expect(dndState.sortableOptions.get('/workspace/web')).toEqual({ disabled: true })
    expect(container!.querySelector('[data-sortable-activator-id="/workspace/api"]')?.className).not.toContain(
      'cursor-grab',
    )
  })
})

function repositoryItem(repositoryId: string): HTMLLIElement {
  const item = container!.querySelector(`[data-sortable-node-id="${repositoryId}"]`)
  if (!(item instanceof HTMLLIElement)) throw new Error(`missing repository item: ${repositoryId}`)
  return item
}

async function openRepositoryMenu(repositoryId: string): Promise<HTMLElement[]> {
  const trigger = repositoryItem(repositoryId).querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

function terminalReadContext(
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot>,
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (key) =>
      snapshots.get(key) ?? { worktreeTerminalKey: key, selectedDescriptor: null, sessions: [], count: 0 },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function terminalCommandContext(closeTerminal: CloseTerminalMock): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: closeTerminal,
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

function worktreeSnapshot(key: string, session: TerminalSessionSummary): WorktreeTerminalSnapshot {
  return {
    worktreeTerminalKey: key,
    selectedDescriptor: null,
    sessions: [session],
    count: 1,
  }
}

function terminalSession(
  worktreeTerminalKey: string,
  overrides: Partial<Pick<TerminalSessionSummary, 'hasBell' | 'isOutputActive'>> = {},
): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-1`,
    worktreeTerminalKey,
    terminalId: 'terminal-1',
    index: 1,
    title: 'terminal',
    phase: 'open',
    selected: true,
    hasBell: false,
    ...overrides,
  }
}

async function requestCloseAllFromContextMenu(row: HTMLElement): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes('terminal.close-all'))
  if (!item) throw new Error('missing close all terminals context menu item')
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function openContextMenu(row: HTMLElement): Promise<HTMLElement[]> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function clickContextMenuItem(row: HTMLElement, label: string): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes(label))
  if (!item) throw new Error(`missing context menu item: ${label}`)
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function confirmCloseAll(): Promise<void> {
  const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes('terminal.close-all-confirm-confirm'),
  )
  if (!confirm) throw new Error('missing close all terminals confirmation')
  await act(async () => {
    confirm.click()
    await Promise.resolve()
  })
}

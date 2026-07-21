// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SidebarProjectList } from '#/web/components/repo-workspace/SidebarProjectList.tsx'
import type { ProjectSummary } from '#/web/components/repo-workspace/project-switcher-model.tsx'
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
  sortableOnKeyDown: vi.fn(),
  useSensor: vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })),
  pointerSensor: {},
  keyboardSensor: {},
  verticalStrategy: {},
}))

const projectExternalActionState = vi.hoisted(() => ({
  requestedProjectIds: [] as string[],
  editorOnSelect: vi.fn(),
  terminalOnSelect: vi.fn(),
  editorDisabled: false,
  editorBusy: false,
  terminalDisabled: false,
  terminalBusy: false,
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
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-sortable-id': id, 'aria-roledescription': 'sortable' },
      listeners: { onKeyDown: dndState.sortableOnKeyDown },
      setNodeRef: (node: HTMLElement | null) => node?.setAttribute('data-sortable-node-id', id),
      setActivatorNodeRef: (node: HTMLElement | null) => node?.setAttribute('data-sortable-activator-id', id),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string>) =>
    key === 'repo-tabs.close-named' ? `Close ${params?.name}` : key,
}))

vi.mock('#/web/hooks/useProjectExternalOpenActions.ts', () => ({
  useProjectExternalOpenActions: (projectId: string) => {
    projectExternalActionState.requestedProjectIds.push(projectId)
    return {
      visible: true,
      editor: {
        disabled: projectExternalActionState.editorDisabled,
        busy: projectExternalActionState.editorBusy,
        iconPref: 'cursor',
        onSelect: () => projectExternalActionState.editorOnSelect(projectId),
      },
      externalTerminal: {
        disabled: projectExternalActionState.terminalDisabled,
        busy: projectExternalActionState.terminalBusy,
        iconPref: 'ghostty',
        onSelect: () => projectExternalActionState.terminalOnSelect(projectId),
      },
    }
  },
}))

vi.mock('#/web/components/ExternalAppIcon/index.tsx', () => ({
  EditorAppIcon: ({ pref }: { pref: string }) => <span data-testid="mock-editor-app-icon" data-pref={pref} />,
  TerminalAppIcon: ({ pref }: { pref: string }) => <span data-testid="mock-terminal-app-icon" data-pref={pref} />,
}))

vi.mock('#/web/components/repo-workspace/project-switcher-model.tsx', async () => {
  const actual = await vi.importActual<typeof import('#/web/components/repo-workspace/project-switcher-model.tsx')>(
    '#/web/components/repo-workspace/project-switcher-model.tsx',
  )
  return { ...actual, ProjectTerminalStatus: () => null }
})

const projects: ProjectSummary[] = [
  { id: '/repo-a', name: 'Repo A', unavailable: false, isGitRepo: true, terminalWorktreeKeys: [] },
  { id: '/repo-b', name: 'Repo B', unavailable: false, isGitRepo: false, terminalWorktreeKeys: [] },
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
  dndState.sortableOnKeyDown.mockClear()
  dndState.useSensor.mockClear()
  projectExternalActionState.requestedProjectIds = []
  projectExternalActionState.editorOnSelect.mockReset()
  projectExternalActionState.terminalOnSelect.mockReset()
  projectExternalActionState.editorDisabled = false
  projectExternalActionState.editorBusy = false
  projectExternalActionState.terminalDisabled = false
  projectExternalActionState.terminalBusy = false
  container = document.createElement('div')
  document.body.appendChild(container)
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
  fixture: {
    projects?: ProjectSummary[]
    snapshots?: ReadonlyMap<string, WorktreeTerminalSnapshot>
    closeTerminal?: CloseTerminalMock
  } = {},
) {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  const onReorder = vi.fn()
  const closeTerminal =
    fixture.closeTerminal ?? vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
  act(() => {
    root!.render(
      <TerminalSessionContext.Provider value={terminalCommandContext(closeTerminal)}>
        <TerminalSessionReadContext.Provider value={terminalReadContext(fixture.snapshots ?? new Map())}>
          <SidebarProjectList
            id="project-list"
            projects={fixture.projects ?? projects}
            activeRepoId="/repo-a"
            onActivate={onActivate}
            onClose={onClose}
            onReorder={onReorder}
          />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
  return { onActivate, onClose, onReorder, closeTerminal }
}

describe('SidebarProjectList', () => {
  test('registers each full project row as a sortable item', () => {
    renderList()

    expect(
      Array.from(container!.querySelectorAll('[data-sortable-node-id]'), (node) =>
        node.getAttribute('data-sortable-node-id'),
      ),
    ).toEqual(['/repo-a', '/repo-b'])
    expect(
      Array.from(container!.querySelectorAll('[data-sortable-activator-id]'), (node) =>
        node.getAttribute('data-sortable-activator-id'),
      ),
    ).toEqual(['/repo-a', '/repo-b'])
  })

  test('uses the shared pointer threshold and keyboard coordinates', () => {
    renderList()

    expect(dndState.useSensor).toHaveBeenCalledWith(dndState.pointerSensor, {
      activationConstraint: { distance: 6 },
    })
    expect(dndState.useSensor).toHaveBeenCalledWith(
      dndState.keyboardSensor,
      expect.objectContaining({ coordinateGetter: expect.any(Function) }),
    )
    expect(dndState.contextSensors).toEqual([
      { sensor: dndState.pointerSensor, options: { activationConstraint: { distance: 6 } } },
      { sensor: dndState.keyboardSensor, options: { coordinateGetter: expect.any(Function) } },
    ])
  })

  test('passes the ordered ids and vertical strategy to the sortable context', () => {
    renderList()

    expect(dndState.sortableItems).toEqual(['/repo-a', '/repo-b'])
    expect(dndState.sortableStrategy).toBe(dndState.verticalStrategy)
  })

  test('attaches sortable accessibility attributes and listeners to the project button', () => {
    renderList()
    const firstRow = container!.querySelector('[data-sortable-activator-id="/repo-a"]')

    expect(firstRow?.getAttribute('data-sortable-id')).toBe('/repo-a')
    expect(firstRow?.getAttribute('aria-roledescription')).toBe('sortable')
    act(() => firstRow?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(dndState.sortableOnKeyDown).toHaveBeenCalledTimes(1)
  })

  test('keeps native touch scrolling enabled on project rows', () => {
    renderList()
    const firstRow = container!.querySelector('[data-sortable-activator-id="/repo-a"]')

    expect(firstRow?.className).not.toContain('touch-none')
  })

  test('gives project names enough line height for letter descenders', () => {
    renderList()
    const projectName = Array.from(container!.querySelectorAll('span')).find(
      (element) => element.textContent === 'Repo A' && element.children.length === 0,
    )

    expect(projectName?.className).toContain('leading-4')
    expect(projectName?.className).not.toContain('leading-none')
  })

  test('uses a folder icon for plain projects and a Git folder icon for repositories', () => {
    renderList()
    const gitProject = container!.querySelector('[data-sortable-activator-id="/repo-a"]')
    const plainProject = container!.querySelector('[data-sortable-activator-id="/repo-b"]')

    expect(gitProject?.getAttribute('data-project-kind')).toBe('git')
    expect(gitProject?.querySelector('svg.lucide-folder-git-2')).not.toBeNull()
    expect(plainProject?.getAttribute('data-project-kind')).toBe('plain')
    expect(plainProject?.querySelector('svg.lucide-folder')).not.toBeNull()
    expect(plainProject?.querySelector('svg.lucide-folder-git-2')).toBeNull()
  })

  test('activates a project from its row', () => {
    const { onActivate } = renderList()
    const firstRow = container!.querySelector('[data-sortable-activator-id="/repo-a"]')

    act(() => firstRow?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(onActivate).toHaveBeenCalledWith('/repo-a')
  })

  test('closes a project without activating it', () => {
    const { onActivate, onClose } = renderList()
    const close = container!.querySelector('[aria-label="Close Repo A"]')

    act(() => close?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(onClose).toHaveBeenCalledWith('/repo-a')
    expect(onActivate).not.toHaveBeenCalled()
  })

  test('renders project actions at the right side immediately before Close', () => {
    renderList()

    expect(projectExternalActionState.requestedProjectIds).toEqual(['/repo-a', '/repo-b'])
    for (const project of projects) {
      const row = projectRow(project.id)
      const actions = row.querySelector<HTMLElement>('[data-testid="project-row-external-actions"]')
      const close = row.querySelector<HTMLButtonElement>(`[aria-label="Close ${project.name}"]`)
      const projectButton = row.querySelector<HTMLElement>('[data-sortable-activator-id]')
      const editor = actions?.querySelector('[data-testid="project-editor-btn"]')
      const terminal = actions?.querySelector('[data-testid="project-external-terminal-btn"]')

      expect(actions?.nextElementSibling).toBe(close)
      expect(actions?.className).toContain('right-8')
      expect(actions?.className).toContain('group-hover:opacity-100')
      expect(actions?.className).toContain('focus-within:opacity-100')
      expect(projectButton?.className).toContain('pr-20')
      expect(close?.className).toContain('right-2')
      expect(close?.className).toContain('focus-visible:opacity-100')
      expect(editor?.getAttribute('aria-label')).toBe(`worktrees.open-in-editor-label ${project.name}`)
      expect(terminal?.getAttribute('aria-label')).toBe(`terminal.external ${project.name}`)
      expect(editor?.querySelector('[data-testid="mock-editor-app-icon"]')?.getAttribute('data-pref')).toBe('cursor')
      expect(terminal?.querySelector('[data-testid="mock-terminal-app-icon"]')?.getAttribute('data-pref')).toBe(
        'ghostty',
      )
    }
  })

  test('opens item external apps without activating or closing the project', () => {
    const { onActivate, onClose } = renderList()
    const row = projectRow('/repo-a')
    const editor = row.querySelector<HTMLButtonElement>('[data-testid="project-editor-btn"]')
    const terminal = row.querySelector<HTMLButtonElement>('[data-testid="project-external-terminal-btn"]')

    act(() => {
      editor?.click()
      terminal?.click()
    })

    expect(projectExternalActionState.editorOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(projectExternalActionState.terminalOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('forwards disabled and busy state to item external actions', () => {
    projectExternalActionState.editorDisabled = true
    projectExternalActionState.terminalDisabled = true
    projectExternalActionState.terminalBusy = true
    renderList()

    const row = projectRow('/repo-a')
    const editor = row.querySelector<HTMLButtonElement>('[data-testid="project-editor-btn"]')
    const terminal = row.querySelector<HTMLButtonElement>('[data-testid="project-external-terminal-btn"]')
    expect(editor?.disabled).toBe(true)
    expect(terminal?.disabled).toBe(true)
    expect(terminal?.getAttribute('aria-busy')).toBe('true')
  })

  test('closes terminals from the project root and member repositories through the row context menu', async () => {
    const rootKey = '/repo-a\0/repo-a'
    const memberKey = '/repo-a/api\0/repo-a/api'
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
    renderList({
      projects: [{ ...projects[0]!, terminalWorktreeKeys: [rootKey, memberKey] }, projects[1]!],
      snapshots: new Map([
        [rootKey, worktreeSnapshot(rootKey, [terminalSession(rootKey, 1)])],
        [memberKey, worktreeSnapshot(memberKey, [terminalSession(memberKey, 1)])],
      ]),
      closeTerminal,
    })

    await requestCloseAllFromContextMenu(projectRow('/repo-a'))

    expect(closeTerminal).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('terminal.close-all-confirm-body')
    await confirmCloseAll()
    expect(closeTerminal.mock.calls).toEqual([
      [`${rootKey}\0terminal-1`, { repoRoot: '/repo-a', worktreePath: '/repo-a' }],
      [`${memberKey}\0terminal-1`, { repoRoot: '/repo-a/api', worktreePath: '/repo-a/api' }],
    ])
  })

  test('reorders when dropped over a different project', () => {
    const { onReorder } = renderList()

    act(() => dndState.lastDragEnd?.({ active: { id: '/repo-b' }, over: { id: '/repo-a' } }))

    expect(onReorder).toHaveBeenCalledWith('/repo-b', '/repo-a')
  })

  test('ignores same-project and missing-target drops', () => {
    const { onReorder } = renderList()

    act(() => dndState.lastDragEnd?.({ active: { id: '/repo-a' }, over: { id: '/repo-a' } }))
    act(() => dndState.lastDragEnd?.({ active: { id: '/repo-a' }, over: null }))

    expect(onReorder).not.toHaveBeenCalled()
  })
})

function projectRow(projectId: string): HTMLLIElement {
  const row = container!.querySelector(`[data-sortable-node-id="${projectId}"]`)
  if (!(row instanceof HTMLLIElement)) throw new Error(`missing project row: ${projectId}`)
  return row
}

async function requestCloseAllFromContextMenu(row: HTMLElement): Promise<void> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
    candidate.textContent?.includes('terminal.close-all'),
  )
  if (!item) throw new Error('missing close all terminals context menu item')
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

function worktreeSnapshot(worktreeTerminalKey: string, sessions: TerminalSessionSummary[]): WorktreeTerminalSnapshot {
  return { worktreeTerminalKey, selectedDescriptor: null, sessions, count: sessions.length }
}

function terminalSession(worktreeTerminalKey: string, index: number): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-${index}`,
    worktreeTerminalKey,
    terminalId: `terminal-${index}`,
    index,
    title: `terminal ${index}`,
    phase: 'open',
    selected: index === 1,
    hasBell: false,
  }
}

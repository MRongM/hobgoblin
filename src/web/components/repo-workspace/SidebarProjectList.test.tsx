// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SidebarProjectList } from '#/web/components/repo-workspace/SidebarProjectList.tsx'
import type { ProjectSummary } from '#/web/components/repo-workspace/project-switcher-model.tsx'

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

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

function renderList() {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  const onReorder = vi.fn()
  act(() => {
    root!.render(
      <SidebarProjectList
        id="project-list"
        projects={projects}
        activeRepoId="/repo-a"
        onActivate={onActivate}
        onClose={onClose}
        onReorder={onReorder}
      />,
    )
  })
  return { onActivate, onClose, onReorder }
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

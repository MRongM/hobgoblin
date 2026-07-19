// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  WorkspaceRepositoryList,
  type WorkspaceRepositoryListItem,
} from '#/web/components/repo-workspace/WorkspaceRepositoryList.tsx'

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

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

const repositories: WorkspaceRepositoryListItem[] = [
  { id: '/workspace/api', name: 'api', branch: 'main', changeCount: 2, unavailable: false },
  { id: '/workspace/web', name: 'web', changeCount: 0, unavailable: true },
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

function renderList(disabled = false) {
  const onActivate = vi.fn()
  const onReorder = vi.fn()
  act(() => {
    root!.render(
      <WorkspaceRepositoryList
        repositories={repositories}
        currentRepoId="/workspace/api"
        disabled={disabled}
        onActivate={onActivate}
        onReorder={onReorder}
      />,
    )
  })
  return { onActivate, onReorder }
}

describe('WorkspaceRepositoryList', () => {
  test('registers ordered repository ids as full-row sortable activators', () => {
    renderList()

    expect(dndState.sortableItems).toEqual(['/workspace/api', '/workspace/web'])
    expect(dndState.sortableStrategy).toBe(dndState.verticalStrategy)
    expect(
      Array.from(container!.querySelectorAll('[data-sortable-activator-id]'), (node) =>
        node.getAttribute('data-sortable-activator-id'),
      ),
    ).toEqual(['/workspace/api', '/workspace/web'])
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

  test('keeps native touch scrolling and accessible keyboard listeners on the row', () => {
    renderList()
    const row = container!.querySelector('[data-sortable-activator-id="/workspace/api"]')

    expect(row?.className).not.toContain('touch-none')
    expect(row?.getAttribute('aria-roledescription')).toBe('sortable')
    act(() => row?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(dndState.sortableOnKeyDown).toHaveBeenCalledTimes(1)
  })

  test('renders current repository metadata and activates from a click', () => {
    const { onActivate } = renderList()
    const row = container!.querySelector('[data-sortable-activator-id="/workspace/api"]')

    expect(row?.textContent).toContain('api')
    expect(row?.textContent).toContain('main')
    expect(row?.textContent).toContain('2')
    expect(row?.getAttribute('aria-current')).toBe('page')
    expect(row?.querySelector('span')?.classList.contains('bg-selected')).toBe(true)
    act(() => row?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onActivate).toHaveBeenCalledWith('/workspace/api')
  })

  test('shows unavailable repository state', () => {
    renderList()
    const row = container!.querySelector('[data-sortable-activator-id="/workspace/web"]')

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

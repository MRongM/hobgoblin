// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SplitPane } from '#/web/components/SplitPane.tsx'

const resizable = vi.hoisted(() => ({
  collapse: vi.fn(),
  resize: vi.fn(),
  setLayout: vi.fn(),
  onLayoutChanged: null as ((layout: Record<string, number>) => void) | null,
}))

vi.mock('react-resizable-panels', () => ({
  useGroupRef: () => ({ current: { setLayout: resizable.setLayout } }),
  usePanelRef: () => ({
    current: {
      collapse: resizable.collapse,
      expand: vi.fn(),
      getSize: vi.fn(),
      isCollapsed: vi.fn(),
      resize: resizable.resize,
    },
  }),
}))

vi.mock('#/web/components/ui/resizable.tsx', () => ({
  ResizablePanelGroup: ({
    children,
    onLayoutChanged,
  }: {
    children: ReactNode
    onLayoutChanged?: (layout: Record<string, number>) => void
  }) => {
    resizable.onLayoutChanged = onLayoutChanged ?? null
    return <div data-testid="resizable-group">{children}</div>
  },
  ResizableHandle: ({ className, disabled }: { className?: string; disabled?: boolean }) => (
    <div data-testid="resizable-handle" data-disabled={String(!!disabled)} className={className} />
  ),
  ResizablePanel: ({ children, id, className }: { children: ReactNode; id: string; className?: string }) => (
    <div data-testid={`resizable-panel-${id}`} className={className}>
      {children}
    </div>
  ),
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resizable.collapse.mockClear()
  resizable.resize.mockClear()
  resizable.setLayout.mockClear()
  resizable.onLayoutChanged = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SplitPane controlled trailing panel', () => {
  test('restores the requested size only after a collapsed panel expands', () => {
    const onAfterSizeChange = vi.fn()
    renderSplitPane(false, onAfterSizeChange)

    expect(resizable.resize).not.toHaveBeenCalled()
    expect(container?.querySelector('[data-testid="after-content"]')).not.toBeNull()

    renderSplitPane(true, onAfterSizeChange)

    expect(resizable.collapse).toHaveBeenCalledTimes(1)
    expect(container?.querySelector('[data-testid="after-content"]')?.parentElement?.className).toContain('hidden')
    expect(container?.querySelector('[data-testid="resizable-handle"]')?.className).toContain('hidden')
    expect(container?.querySelector('[data-testid="resizable-handle"]')?.getAttribute('data-disabled')).toBe('true')

    act(() => resizable.onLayoutChanged?.({ before: 100, after: 0 }))
    expect(onAfterSizeChange).not.toHaveBeenCalled()

    renderSplitPane(false, onAfterSizeChange)

    expect(resizable.resize).toHaveBeenCalledTimes(1)
    expect(resizable.resize).toHaveBeenLastCalledWith(35)
    expect(container?.querySelector('[data-testid="after-content"]')?.parentElement?.className).not.toContain('hidden')
  })
})

function renderSplitPane(afterCollapsed: boolean, onAfterSizeChange: (size: number) => void) {
  act(() => {
    root!.render(
      <SplitPane
        before={<div data-testid="before-content" />}
        after={<div data-testid="after-content" />}
        afterSize={35}
        afterCollapsed={afterCollapsed}
        onAfterSizeChange={onAfterSizeChange}
      />,
    )
  })
}

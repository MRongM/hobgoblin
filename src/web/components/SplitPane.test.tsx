// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SplitPane } from '#/web/components/SplitPane.tsx'

const resizable = vi.hoisted(() => ({
  setLayout: vi.fn(),
  onLayoutChanged: null as ((layout: Record<string, number>) => void) | null,
}))

vi.mock('react-resizable-panels', () => ({
  useGroupRef: () => ({ current: { setLayout: resizable.setLayout } }),
}))

vi.mock('#/web/components/ui/resizable.tsx', () => ({
  ResizablePanelGroup: ({
    children,
    className,
    onLayoutChanged,
  }: {
    children: ReactNode
    className?: string
    onLayoutChanged?: (layout: Record<string, number>) => void
  }) => {
    resizable.onLayoutChanged = onLayoutChanged ?? null
    return (
      <div data-testid="resizable-group" className={className}>
        {children}
      </div>
    )
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
  test('hides the trailing panel while collapsed and restores the layout on expand', () => {
    const onAfterSizeChange = vi.fn()
    renderSplitPane(false, onAfterSizeChange)

    expect(group()?.className).not.toContain('[&>[data-panel]:last-child]:!hidden')
    expect(resizable.setLayout).toHaveBeenLastCalledWith({ before: 65, after: 35 })

    renderSplitPane(true, onAfterSizeChange)

    // Collapse is CSS-only: the trailing panel and handle are display:none
    // (via a group-level rule — Panel does not forward className), the
    // layout is left untouched, and no size writes reach the store.
    expect(group()?.className).toContain('[&>[data-panel]:last-child]:!hidden')
    expect(handle()?.className).toContain('!hidden')
    expect(handle()?.getAttribute('data-disabled')).toBe('true')
    resizable.setLayout.mockClear()

    act(() => resizable.onLayoutChanged?.({ before: 100, after: 0 }))
    expect(onAfterSizeChange).not.toHaveBeenCalled()
    expect(resizable.setLayout).not.toHaveBeenCalled()

    renderSplitPane(false, onAfterSizeChange)

    // Expand re-applies the controlled percentage layout.
    expect(resizable.setLayout).toHaveBeenLastCalledWith({ before: 65, after: 35 })
    expect(group()?.className).not.toContain('[&>[data-panel]:last-child]:!hidden')
    expect(handle()?.className ?? '').not.toContain('!hidden')
    expect(handle()?.getAttribute('data-disabled')).toBe('false')
  })

  test('ignores zero-size layout notifications while expanded', () => {
    const onAfterSizeChange = vi.fn()
    renderSplitPane(false, onAfterSizeChange)

    act(() => resizable.onLayoutChanged?.({ before: 100, after: 0 }))
    expect(onAfterSizeChange).not.toHaveBeenCalled()

    act(() => resizable.onLayoutChanged?.({ before: 60, after: 40 }))
    expect(onAfterSizeChange).toHaveBeenLastCalledWith(40)
  })
})

function group() {
  return container?.querySelector('[data-testid="resizable-group"]')
}

function handle() {
  return container?.querySelector('[data-testid="resizable-handle"]')
}

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

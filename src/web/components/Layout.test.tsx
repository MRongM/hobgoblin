// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoWorkspace, Toolbar } from '#/web/components/Layout.tsx'

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
}))

vi.mock('react-resizable-panels', () => ({
  useGroupRef: () => ({ current: { setLayout: vi.fn() } }),
}))

vi.mock('#/web/components/ui/resizable.tsx', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div data-panel-group>{children}</div>,
  ResizableHandle: () => <div data-resizable-handle />,
  ResizablePanel: ({ children }: { children: ReactNode }) => <div data-resizable-panel>{children}</div>,
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('Layout chrome', () => {
  test('uses the runtime app toolbar height for Toolbar', () => {
    render(
      <Toolbar data-testid="toolbar">
        <span>Toolbar content</span>
      </Toolbar>,
    )

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="toolbar"]')
    expect(toolbar?.style.height).toBe('41px')
    expect(toolbar?.className).not.toContain('h-9')
  })

  test('uses topbar chrome tokens and height together', () => {
    render(
      <Toolbar data-testid="toolbar" chrome="topbar">
        <span>Terminal topbar</span>
      </Toolbar>,
    )

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="toolbar"]')
    expect(toolbar?.style.height).toBe('39px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('border-topbar-border')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).toContain('text-topbar-foreground')
    expect(toolbar?.className).not.toContain('border-toolbar-border')
    expect(toolbar?.className).not.toContain('bg-toolbar')
  })

  test('keeps the fixed left-right split even when legacy collapsed state is supplied', () => {
    render(
      <RepoWorkspace
        mode="collapsed"
        branchPane={<div data-testid="branch-pane" />}
        detailPane={<div data-testid="detail-pane" />}
      />,
    )

    expect(container!.querySelector('[data-panel-group]')).not.toBeNull()
    expect(container!.querySelector('[data-testid="branch-pane"]')).not.toBeNull()
    expect(container!.querySelector('[data-testid="detail-pane"]')).not.toBeNull()
  })
})

function render(element: ReactNode) {
  act(() => {
    root!.render(element)
  })
}

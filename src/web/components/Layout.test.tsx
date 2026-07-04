// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoWorkspace, Toolbar } from '#/web/components/Layout.tsx'

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
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

  test('uses the runtime app toolbar height for collapsed top-bottom detail row', () => {
    render(
      <RepoWorkspace
        layout="top-bottom"
        mode="collapsed"
        branchPane={<div data-testid="branch-pane" />}
        detailPane={<div data-testid="detail-pane" />}
      />,
    )

    const workspace = container!.firstElementChild as HTMLElement
    expect(workspace.style.gridTemplateRows).toBe('minmax(0, 1fr) 1px 41px')
    expect(workspace.className).not.toContain('2.25rem')
  })
})

function render(element: ReactNode) {
  act(() => {
    root!.render(element)
  })
}

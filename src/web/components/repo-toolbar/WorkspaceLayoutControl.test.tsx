// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceLayoutControl } from '#/web/components/repo-toolbar/WorkspaceLayoutControl.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

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

describe('WorkspaceLayoutControl', () => {
  test('renders one button and switches left-right layout to top-bottom', () => {
    const onChange = vi.fn()
    render(<WorkspaceLayoutControl value="left-right" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="workspace.layout-tooltip.top-bottom"]',
    )
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('top-bottom')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('renders one button and switches top-bottom layout to left-right', () => {
    const onChange = vi.fn()
    render(<WorkspaceLayoutControl value="top-bottom" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="workspace.layout-tooltip.left-right"]',
    )
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('left-right')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
}

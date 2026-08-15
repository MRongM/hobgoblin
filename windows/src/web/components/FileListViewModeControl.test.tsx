// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FileListViewModeControl } from '#/web/components/FileListViewModeControl.tsx'

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

describe('FileListViewModeControl', () => {
  test('renders one button and switches tree view to list view', () => {
    const onChange = vi.fn()
    render(<FileListViewModeControl value="tree" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('list')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('renders one button and switches list view to tree view', () => {
    const onChange = vi.fn()
    render(<FileListViewModeControl value="list" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('tree')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
}

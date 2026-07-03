// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchViewModeControl } from '#/web/components/repo-toolbar/BranchViewModeControl.tsx'

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

describe('BranchViewModeControl', () => {
  test('renders one button and switches all branches to worktrees', () => {
    const onChange = vi.fn()
    render(<BranchViewModeControl value="all" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="branches.filter-tooltip.worktrees"]',
    )
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('worktrees')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('renders one button and switches worktrees to all branches', () => {
    const onChange = vi.fn()
    render(<BranchViewModeControl value="worktrees" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="branches.filter-tooltip.all"]')
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('all')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('does not call onChange while disabled', () => {
    const onChange = vi.fn()
    render(<BranchViewModeControl value="all" disabled onChange={onChange} />)

    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="branches.filter-tooltip.worktrees"]',
    )
    expect(button).toBeInstanceOf(HTMLButtonElement)
    expect(button!.disabled).toBe(true)

    act(() => {
      button!.click()
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
}

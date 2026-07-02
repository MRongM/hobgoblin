// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchActionsDropdown, type BranchActionItem } from '#/web/components/BranchActionsMenu.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => {
    if (key === 'action.menu') return 'Actions'
    return key
  },
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  document.body.innerHTML = ''
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

function item(
  id: BranchActionItem['id'],
  label: string,
  onSelect = vi.fn(),
  overrides: Partial<BranchActionItem> = {},
): BranchActionItem {
  return {
    id,
    label,
    title: label,
    ariaLabel: label,
    disabled: false,
    visible: true,
    icon: <span data-testid={`${id}-icon`} />,
    onSelect,
    ...overrides,
  }
}

function renderDropdown({
  repoId = '/repo',
  branchName = 'feature/a',
  open = true,
  editor = item('editor', 'Edit'),
  terminal = item('terminal', 'Terminal'),
  destructive = item('deleteBranch', 'Delete branch', vi.fn(), { destructive: true }),
}: {
  repoId?: string
  branchName?: string
  open?: boolean
  editor?: BranchActionItem
  terminal?: BranchActionItem
  destructive?: BranchActionItem
} = {}) {
  act(() => {
    root!.render(
      <BranchActionsDropdown
        repoId={repoId}
        branchName={branchName}
        patchItems={[]}
        externalItems={[editor, terminal]}
        mainItems={[]}
        destructiveItems={[destructive]}
        open={open}
      />,
    )
  })
}

function button(label: string): HTMLButtonElement {
  const node = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(node).not.toBeNull()
  return node!
}

function menuItem(label: string): HTMLElement {
  const node = Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]')).find(
    (itemNode) => itemNode.textContent?.includes(label),
  )
  expect(node).not.toBeNull()
  return node!
}

describe('BranchActionsDropdown split button', () => {
  test('renders edit as the default quick action and runs it from the left button', () => {
    const onEdit = vi.fn()

    renderDropdown({ repoId: '/repo/default', branchName: 'feature/default', editor: item('editor', 'Edit', onEdit) })

    expect(button('Edit').textContent).toContain('Edit')

    act(() => {
      button('Edit').click()
    })

    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  test('remembers a non-destructive menu action per repo and branch', () => {
    const terminalA = item('terminal', 'Terminal A')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/a',
      terminal: terminalA,
    })

    act(() => {
      menuItem('Terminal A').click()
    })

    expect(button('Terminal A').textContent).toContain('Terminal A')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/b',
      terminal: item('terminal', 'Terminal B'),
    })

    expect(button('Edit').textContent).toContain('Edit')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/a',
      terminal: terminalA,
    })

    expect(button('Terminal A').textContent).toContain('Terminal A')
  })

  test('does not remember destructive menu actions', () => {
    const onDelete = vi.fn()

    renderDropdown({
      repoId: '/repo/destructive',
      branchName: 'feature/destructive',
      destructive: item('deleteBranch', 'Delete branch', onDelete, { destructive: true }),
    })

    act(() => {
      menuItem('Delete branch').click()
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(button('Edit').textContent).toContain('Edit')
  })

  test('falls back to edit when the remembered action becomes disabled', () => {
    renderDropdown({
      repoId: '/repo/fallback',
      branchName: 'feature/fallback',
      terminal: item('terminal', 'Terminal'),
    })

    act(() => {
      menuItem('Terminal').click()
    })

    renderDropdown({
      repoId: '/repo/fallback',
      branchName: 'feature/fallback',
      terminal: item('terminal', 'Terminal', vi.fn(), { disabled: true }),
    })

    expect(button('Edit').textContent).toContain('Edit')
  })

  test('disables the edit quick action when edit is unavailable', () => {
    renderDropdown({
      repoId: '/repo/disabled-edit',
      branchName: 'feature/disabled-edit',
      editor: item('editor', 'Edit', vi.fn(), { disabled: true }),
    })

    expect(button('Edit').disabled).toBe(true)
  })
})

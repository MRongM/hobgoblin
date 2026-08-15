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
  hideQuickAction = false,
  commit = item('commit', 'Commit'),
  editor = item('editor', 'Edit'),
  terminal = item('terminal', 'Terminal'),
  destructive = item('deleteBranch', 'Delete branch', vi.fn(), { destructive: true }),
}: {
  repoId?: string
  branchName?: string
  open?: boolean
  hideQuickAction?: boolean
  commit?: BranchActionItem
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
        mainItems={[commit]}
        destructiveItems={[destructive]}
        open={open}
        hideQuickAction={hideQuickAction}
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
  test('weights the split button hit targets toward the dropdown trigger', () => {
    renderDropdown()

    expect(button('Commit').className).toContain('px-1.5')
    expect(button('Actions').className).toContain('w-7')
    expect(button('Actions').className).toContain('px-1.5')
  })

  test('hideQuickAction renders only the menu trigger with the full items list', () => {
    renderDropdown({ hideQuickAction: true })

    expect(document.body.querySelector('button[aria-label="Edit"]')).toBeNull()
    const trigger = button('Actions')
    expect(trigger.className).not.toContain('rounded-l-none')
    menuItem('Edit')
    menuItem('Terminal')
    menuItem('Delete branch')
  })

  test('renders commit as the default quick action and runs it from the left button', () => {
    const onCommit = vi.fn()

    renderDropdown({
      repoId: '/repo/default',
      branchName: 'feature/default',
      commit: item('commit', 'Commit', onCommit),
    })

    act(() => {
      button('Commit').click()
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  test('remembers a non-destructive menu action per repo and branch', () => {
    const editorA = item('editor', 'Edit A')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/a',
      editor: editorA,
    })

    act(() => {
      menuItem('Edit A').click()
    })

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/b',
    })

    expect(button('Commit')).toBeTruthy()

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/a',
      editor: editorA,
    })

    expect(button('Edit A')).toBeTruthy()
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
    expect(button('Commit')).toBeTruthy()
  })

  test('falls back to commit when the remembered action becomes disabled', () => {
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

    expect(button('Commit')).toBeTruthy()
  })

  test('disables the commit quick action when commit is unavailable', () => {
    renderDropdown({
      repoId: '/repo/disabled-commit',
      branchName: 'feature/disabled-commit',
      commit: item('commit', 'Commit', vi.fn(), { disabled: true }),
    })

    expect(button('Commit').disabled).toBe(true)
  })
})

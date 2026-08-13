// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceMemberSwitcher } from '#/web/components/repo-workspace/BranchWorkspaceMemberSwitcher.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/components/ui/dropdown-menu.tsx', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactElement }) => children,
  DropdownMenuContent: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, ...props }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect} {...props}>
      {children}
    </button>
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceMemberSwitcher', () => {
  test('shows the selected member and keeps every option in manifest order', () => {
    act(() =>
      root.render(
        <BranchWorkspaceMemberSwitcher
          members={[
            { repositoryName: 'api', available: true, changeCount: 2 },
            { repositoryName: 'web', available: false, changeCount: 0 },
          ]}
          selectedRepositoryName="api"
          onSelect={vi.fn()}
        />,
      ),
    )

    expect(container.querySelector('[aria-label="workspace.repositories"]')?.textContent).toContain('api')
    const options = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid="branch-workspace-member-options"] button'),
    )
    expect(options.map((option) => option.textContent)).toEqual(['api2', 'webworkspace.repository-unavailable'])
    expect(options[0]?.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('[data-testid="branch-workspace-selected-member-change-count"]')?.textContent).toBe(
      '2',
    )
    expect(options[0]?.querySelector('[data-testid="branch-workspace-member-change-count"]')?.textContent).toBe('2')
    expect(options[1]?.querySelector('[data-testid="branch-workspace-member-change-count"]')).toBeNull()
  })

  test('selects another member without changing workspace navigation', () => {
    const onSelect = vi.fn()
    act(() =>
      root.render(
        <BranchWorkspaceMemberSwitcher
          members={[
            { repositoryName: 'api', available: true, changeCount: 0 },
            { repositoryName: 'web', available: true, changeCount: 3 },
          ]}
          selectedRepositoryName="api"
          onSelect={onSelect}
        />,
      ),
    )

    const web = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid="branch-workspace-member-options"] button'),
    ).find((option) => option.textContent?.includes('web'))
    act(() => web?.click())

    expect(onSelect).toHaveBeenCalledWith('web')
  })
})

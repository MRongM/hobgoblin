// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { WorkspaceActionMenuItems } from '#/web/components/repo-workspace/WorkspaceActionMenuItems.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/web/components/ui/dropdown-menu.tsx'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '#/web/components/ui/context-menu.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

test.each([false, true])('folder refresh is the first direct action (context=%s)', async (context) => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  environment.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const onRefresh = vi.fn()
  const refresh: WorkspaceListItemAction = {
    id: 'workspace.branch-workspace.refresh-folder',
    label: 'Refresh folder',
    icon: null,
    disabled: false,
    onSelect: onRefresh,
  }
  const groups = [[{ ...refresh, id: 'editor', label: 'Open editor', onSelect: vi.fn() }, refresh]]
  const menu = (busy = false) => {
    const items = (
      <WorkspaceActionMenuItems context={context} groups={[[...groups[0]!.slice(0, 1), { ...refresh, busy }]]} />
    )
    return context ? (
      <ContextMenu>
        <ContextMenuTrigger>
          <div data-testid="trigger">Target</div>
        </ContextMenuTrigger>
        <ContextMenuContent>{items}</ContextMenuContent>
      </ContextMenu>
    ) : (
      <DropdownMenu open>
        <DropdownMenuTrigger>Target</DropdownMenuTrigger>
        <DropdownMenuContent>{items}</DropdownMenuContent>
      </DropdownMenu>
    )
  }
  try {
    await act(async () => root.render(menu()))
    if (context)
      await act(async () => {
        container
          .querySelector('[data-testid="trigger"]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
      })
    const firstItem = document.body.querySelector<HTMLElement>('[role="menu"] > [role="menuitem"]')
    expect(firstItem?.textContent).toBe('Refresh folder')
    expect(firstItem?.hasAttribute('aria-haspopup')).toBe(false)
    await act(async () => firstItem!.click())
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await act(async () => root.render(menu(true)))
    if (context)
      await act(async () => {
        container
          .querySelector('[data-testid="trigger"]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
      })
    expect(
      document.body
        .querySelector('[data-action="workspace.branch-workspace.refresh-folder"]')
        ?.hasAttribute('data-disabled'),
    ).toBe(true)
  } finally {
    act(() => root.unmount())
    container.remove()
    environment.IS_REACT_ACT_ENVIRONMENT = false
  }
})

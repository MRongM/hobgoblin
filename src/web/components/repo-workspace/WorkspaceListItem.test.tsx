// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FolderGit2, Terminal } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  WorkspaceListItemActionDock,
  WorkspaceListItemFrame,
  WorkspaceListItemMenu,
  type WorkspaceListItemAction,
} from '#/web/components/repo-workspace/WorkspaceListItem.tsx'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

function action(id: string, overrides: Partial<WorkspaceListItemAction> = {}): WorkspaceListItemAction {
  return {
    id,
    label: id,
    disabled: false,
    icon: <Terminal />,
    onSelect: vi.fn(),
    ...overrides,
  }
}

describe('WorkspaceListItem', () => {
  test('renders member rows at 28px while preserving the three-slot action dock', () => {
    act(() => {
      root.render(
        <ul>
          <WorkspaceListItemFrame
            size="member"
            buttonProps={{ 'aria-label': 'Member repository' }}
            actions={
              <WorkspaceListItemActionDock
                editor={action('editor')}
                internalTerminal={action('terminal')}
                moreMenu={<WorkspaceListItemMenu label="Actions" groups={[[action('external')]]} />}
              />
            }
          >
            <span>Member repository</span>
          </WorkspaceListItemFrame>
        </ul>,
      )
    })

    const row = container.querySelector('[data-workspace-list-item]')
    const main = container.querySelector('[data-workspace-list-item-main]')
    const dock = container.querySelector('[data-workspace-list-item-action-dock]')
    expect(row?.getAttribute('data-size')).toBe('member')
    expect(main?.className).toContain('h-7')
    expect(dock?.children).toHaveLength(3)
  })

  test('keeps navigation, drag, auxiliary controls, and three action slots separate', () => {
    const onActivate = vi.fn()
    const onDragPointerDown = vi.fn()
    const onExpand = vi.fn()
    act(() => {
      root.render(
        <ul>
          <WorkspaceListItemFrame
            size="project"
            selected
            leadingIcon={<FolderGit2 />}
            dragHandle={{
              label: 'Reorder project',
              props: { onPointerDown: onDragPointerDown },
            }}
            buttonProps={{ onClick: onActivate, 'aria-label': 'Project A' }}
            auxiliaryActions={
              <button type="button" aria-label="Expand project" onClick={onExpand}>
                expand
              </button>
            }
            actions={
              <WorkspaceListItemActionDock
                editor={action('editor')}
                internalTerminal={action('terminal')}
                moreMenu={<WorkspaceListItemMenu label="Actions" groups={[[action('external')]]} />}
              />
            }
          >
            <span>Project A</span>
          </WorkspaceListItemFrame>
        </ul>,
      )
    })

    const row = container.querySelector('[data-workspace-list-item]')
    const main = container.querySelector<HTMLButtonElement>('[data-workspace-list-item-main]')
    const grip = container.querySelector<HTMLButtonElement>('[data-workspace-list-item-drag-handle]')
    const dock = container.querySelector('[data-workspace-list-item-action-dock]')
    expect(row?.getAttribute('data-size')).toBe('project')
    expect(row?.getAttribute('data-selected')).toBe('true')
    expect(row?.getAttribute('data-has-drag-handle')).toBe('true')
    expect(main?.className).toContain('h-9')
    expect(main?.className).toContain('pr-[4.25rem]')
    expect(grip?.getAttribute('aria-label')).toBe('Reorder project')
    expect(dock?.children).toHaveLength(3)

    act(() => main?.click())
    expect(onActivate).toHaveBeenCalledTimes(1)
    act(() => grip?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(onDragPointerDown).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledTimes(1)
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Expand project"]')?.click())
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  test('keeps disabled menu actions visible in their original groups', async () => {
    act(() => {
      root.render(
        <ul>
          <WorkspaceListItemFrame
            leadingIcon={<FolderGit2 />}
            buttonProps={{ 'aria-label': 'Worktree A' }}
            actions={
              <WorkspaceListItemActionDock
                internalTerminal={action('terminal')}
                moreMenu={
                  <WorkspaceListItemMenu
                    label="Actions"
                    groups={[
                      [action('pull', { disabled: true }), action('push')],
                      [action('remove', { destructive: true })],
                    ]}
                  />
                }
              />
            }
          >
            <span>Worktree A</span>
          </WorkspaceListItemFrame>
        </ul>,
      )
    })

    const items = await openMenu('Actions')
    expect(items.map((item) => item.textContent?.trim())).toEqual(['pull', 'push', 'remove'])
    expect(items[0]?.getAttribute('data-disabled')).not.toBeNull()
    expect(items[2]?.getAttribute('data-variant')).toBe('destructive')
    expect(document.body.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(1)
  })

  test('hides the compact editor shortcut while keeping the internal terminal directly clickable', async () => {
    const onEditor = vi.fn()
    const onTerminal = vi.fn()
    act(() => {
      root.render(
        <WorkspaceListItemActionDock
          editor={action('editor', { onSelect: onEditor })}
          internalTerminal={action('terminal', { onSelect: onTerminal })}
        />,
      )
    })

    const editorSlot = container.querySelector('.workspace-list-item-action-editor')
    const terminalButton = container.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')

    expect(editorSlot?.classList.contains('hidden')).toBe(true)
    expect(editorSlot?.classList.contains('sm:inline-flex')).toBe(true)
    expect(terminalButton).not.toBeNull()

    await act(async () => {
      terminalButton?.click()
      await Promise.resolve()
    })

    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(onEditor).not.toHaveBeenCalled()
  })

  test('hides only structurally inapplicable menu actions and isolates quick-action clicks', async () => {
    const onActivate = vi.fn()
    const onTerminal = vi.fn()
    const onHidden = vi.fn()
    act(() => {
      root.render(
        <ul>
          <WorkspaceListItemFrame
            leadingIcon={<FolderGit2 />}
            buttonProps={{ onClick: onActivate, 'aria-label': 'Repository A' }}
            actions={
              <WorkspaceListItemActionDock
                internalTerminal={action('terminal', { onSelect: onTerminal })}
                moreMenu={
                  <WorkspaceListItemMenu
                    label="Actions"
                    groups={[[action('hidden', { visible: false, onSelect: onHidden }), action('external')]]}
                  />
                }
              />
            }
          >
            <span>Repository A</span>
          </WorkspaceListItemFrame>
        </ul>,
      )
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.click()
      await Promise.resolve()
    })
    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()

    const items = await openMenu('Actions')
    expect(items.map((item) => item.textContent?.trim())).toEqual(['external'])
    expect(onHidden).not.toHaveBeenCalled()
    expect(onActivate).not.toHaveBeenCalled()
  })
})

async function openMenu(label: string): Promise<HTMLElement[]> {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

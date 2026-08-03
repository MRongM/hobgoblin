// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  BranchWorkspaceList,
  branchWorkspaceFolderContext,
} from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import type { BranchWorkspaceRepositorySnapshot, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'

const terminalState = vi.hoisted(() => ({ outputActive: true, count: 2 }))
const folderActionState = vi.hoisted(() => ({
  editorOnSelect: vi.fn(),
  externalTerminalOnSelect: vi.fn(),
  editorDisabled: false,
  externalTerminalDisabled: false,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) => {
    const value = params?.count ?? params?.n
    return value === undefined ? key : `${key}:${String(value)}`
  },
}))

vi.mock('#/web/hooks/useFolderExternalOpenActions.ts', () => ({
  useFolderExternalOpenActions: () => ({
    editor: {
      disabled: folderActionState.editorDisabled,
      busy: false,
      iconPref: 'auto',
      onSelect: folderActionState.editorOnSelect,
    },
    externalTerminal: {
      disabled: folderActionState.externalTerminalDisabled,
      busy: false,
      iconPref: 'ghostty',
      onSelect: folderActionState.externalTerminalOnSelect,
    },
  }),
}))

vi.mock('#/web/components/ExternalAppIcon/index.tsx', () => ({
  EditorAppIcon: ({ pref }: { pref: string }) => <span data-testid="mock-editor-app-icon" data-pref={pref} />,
  TerminalAppIcon: ({ pref }: { pref: string }) => <span data-testid="mock-terminal-app-icon" data-pref={pref} />,
}))

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalCount: () => 2,
  useWorktreeTerminalHasBell: () => true,
  useWorktreeTerminalHasOutputActivity: () => terminalState.outputActive,
  useTerminalAggregateCount: () => terminalState.count,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  terminalState.outputActive = true
  terminalState.count = 2
  folderActionState.editorOnSelect.mockReset()
  folderActionState.externalTerminalOnSelect.mockReset()
  folderActionState.editorDisabled = false
  folderActionState.externalTerminalDisabled = false
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

describe('BranchWorkspaceList', () => {
  test('protects only member worktree roots in the branch workspace folder context', () => {
    const item = workspace('ready')
    item.repositories = [repositoryMember()]
    item.auxiliaryEntries = [
      {
        name: 'README.md',
        mode: 'copy',
        sourcePath: '/workspace/README.md',
        targetPath: '/workspace/goblin-feature-auth/README.md',
        progress: 'complete',
        ready: true,
      },
    ]

    expect(branchWorkspaceFolderContext('/workspace', item).managedRootNames).toEqual(['api'])
  })

  test('separates root selection, expansion, reordering, and more actions', async () => {
    const onActivate = vi.fn()
    const onGitAction = vi.fn()
    const onExtend = vi.fn()
    const onReduce = vi.fn()
    const onAddDependencies = vi.fn()
    const onRemoveDependencies = vi.fn()
    const item = { ...workspace('ready'), repositories: [repositoryMember()] }
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId="branch-1"
            onActivate={onActivate}
            onGitAction={onGitAction}
            onExtend={onExtend}
            onReduce={onReduce}
            onAddDependencies={onAddDependencies}
            onRemoveDependencies={onRemoveDependencies}
            gitActionPanel={{ itemId: item.id, content: <div data-testid="mock-branch-git-panel" /> }}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    expect(container.textContent).toContain('feature/auth')
    expect(container.textContent).not.toContain('goblin-feature-auth')
    const branchWorkspaceRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="branch-workspace-root-branch-1"]',
    )
    const branchWorkspaceItem = container.querySelector('[data-branch-workspace-id="branch-1"]')
    expect(branchWorkspaceRow?.className).toContain('text-sm')
    expect(branchWorkspaceRow?.getAttribute('aria-current')).toBe('page')
    expect(branchWorkspaceRow?.getAttribute('aria-expanded')).toBeNull()
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.expand"]')
    const handle = container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.reorder"]')
    const more = container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.more"]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
    expect(handle).not.toBeNull()
    expect(more).not.toBeNull()
    expect(branchWorkspaceItem?.matches('[data-workspace-list-item]')).toBe(true)
    expect(branchWorkspaceItem?.querySelector('[data-workspace-list-item-action-dock]')?.children).toHaveLength(3)
    expect(branchWorkspaceItem?.querySelector('[data-workspace-list-item-action="editor"]')).not.toBeNull()
    expect(branchWorkspaceItem?.querySelector('[data-workspace-list-item-action="terminal"]')).not.toBeNull()
    expect(branchWorkspaceItem?.querySelector('[data-workspace-list-item-drag-handle]')).not.toBeNull()
    expect(branchWorkspaceRow?.hasAttribute('aria-roledescription')).toBe(false)
    expect(branchWorkspaceRow?.querySelector('.workspace-list-item-leading-icon .lucide-folder-kanban')).not.toBeNull()
    expect(branchWorkspaceRow?.querySelector('.lucide-folder-tree')).toBeNull()
    const menuItems = await openMenuItems(branchWorkspaceItem)
    expect(menuItems.map((entry) => entry.textContent?.trim())).toEqual([
      'terminal.new-with-tmux',
      'terminal.restore-directory-tmux',
      'terminal.external',
      'workspace.branch-workspace.add-members',
      'workspace.branch-workspace.remove-members',
      'workspace.branch-workspace.dependency.add.action',
      'workspace.branch-workspace.dependency.remove.action',
      'workspace.branch-workspace.git-action.batch-commit',
      'workspace.branch-workspace.git-action.pull',
      'workspace.branch-workspace.git-action.push',
      'workspace.branch-workspace.git-action.batch-merge-in',
      'workspace.branch-workspace.git-action.batch-merge-out',
      'workspace.branch-workspace.delete',
      'tmux.cleanup.action',
    ])
    const addMembersItem = menuItems.find(
      (entry) => entry.textContent?.trim() === 'workspace.branch-workspace.add-members',
    )
    await act(async () => {
      addMembersItem?.click()
      await Promise.resolve()
    })
    expect(onExtend).toHaveBeenCalledWith(item)
    const reduceMembersItem = (await openMenuItems(branchWorkspaceItem)).find(
      (entry) => entry.textContent?.trim() === 'workspace.branch-workspace.remove-members',
    )
    expect(reduceMembersItem?.getAttribute('data-variant')).toBe('destructive')
    await act(async () => {
      reduceMembersItem?.click()
      await Promise.resolve()
    })
    expect(onReduce).toHaveBeenCalledWith(item)
    const addDependenciesItem = (await openMenuItems(branchWorkspaceItem)).find(
      (entry) => entry.textContent?.trim() === 'workspace.branch-workspace.dependency.add.action',
    )
    await act(async () => {
      addDependenciesItem?.click()
      await Promise.resolve()
    })
    expect(onAddDependencies).toHaveBeenCalledWith(item)
    const removeDependenciesItem = (await openMenuItems(branchWorkspaceItem)).find(
      (entry) => entry.textContent?.trim() === 'workspace.branch-workspace.dependency.remove.action',
    )
    expect(removeDependenciesItem?.getAttribute('data-variant')).toBe('destructive')
    await act(async () => {
      removeDependenciesItem?.click()
      await Promise.resolve()
    })
    expect(onRemoveDependencies).toHaveBeenCalledWith(item)
    const reopenedMenuItems = await openMenuItems(branchWorkspaceItem)
    const batchCommitItem = reopenedMenuItems.find(
      (entry) => entry.textContent?.trim() === 'workspace.branch-workspace.git-action.batch-commit',
    )
    await act(async () => {
      batchCommitItem?.click()
      await Promise.resolve()
    })
    expect(onGitAction).toHaveBeenCalledWith(item, 'batch-commit')
    expect(container.querySelector('[data-testid="branch-workspace-terminal-count-badge"]')?.textContent).toBe('2')
    expect(container.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
    expect(container.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="mock-branch-git-panel"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="workspace.branch-workspace.open-editor"]')).toBeNull()
    act(() => toggle?.click())
    const memberRow = container.querySelector('[data-testid="branch-workspace-member-api"]')
    const memberItem = memberRow?.closest('[data-workspace-list-item]')
    expect(memberItem?.getAttribute('data-size')).toBe('member')
    expect(memberRow?.querySelector('.workspace-list-item-leading-icon .lucide-folder-tree')).not.toBeNull()
    expect(memberRow?.querySelector('.lucide-folder-kanban')).toBeNull()
    expect(memberItem?.querySelector('[data-workspace-list-item-action-dock]')?.children).toHaveLength(3)
    expect(memberItem?.querySelector('[data-workspace-list-item-drag-handle]')).toBeNull()

    act(() => branchWorkspaceRow?.click())
    expect(onActivate).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).not.toBeNull()

    act(() => toggle?.click())
    expect(onActivate).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()

    act(() => toggle?.click())
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).not.toBeNull()
  })

  test('selects an inactive workspace without expanding it when the active state updates', () => {
    const item = { ...workspace('ready'), repositories: [repositoryMember()] }
    const onActivate = vi.fn()
    const renderList = (activeId: string | null) =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId={activeId}
            onActivate={onActivate}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      )

    act(() => renderList(null))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-root-branch-1"]')?.click())

    expect(onActivate).toHaveBeenCalledWith(item.id)
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()

    act(() => renderList(item.id))
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
  })

  test('keeps a restored repository member collapsed when returning to the workspace root', () => {
    const item = { ...workspace('ready'), repositories: [repositoryMember()] }
    const onActivate = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId={item.id}
            activeMemberRepositoryName="api"
            onActivate={onActivate}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    const branchWorkspaceRow = container.querySelector<HTMLButtonElement>(
      '[data-testid="branch-workspace-root-branch-1"]',
    )
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
    act(() => branchWorkspaceRow?.click())

    expect(onActivate).toHaveBeenCalledWith(item.id)
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
  })

  test('renders an inline Git action panel only below its target item', () => {
    const first = { ...workspace('ready'), repositories: [repositoryMember()] }
    const second = {
      ...workspace('ready'),
      id: 'branch-2',
      branch: 'feature/payments',
      path: '/workspace/goblin-feature-payments',
    }
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[first, second]}
            activeId={first.id}
            gitActionPanel={{ itemId: second.id, content: <div data-testid="mock-branch-git-panel" /> }}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    expect(
      container.querySelector('[data-branch-workspace-id="branch-1"] [data-testid="mock-branch-git-panel"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-branch-workspace-id="branch-2"] [data-testid="mock-branch-git-panel"]'),
    ).not.toBeNull()
  })

  test('expands an inactive workspace without selecting it', () => {
    const first = workspace('ready')
    const second = {
      ...workspace('ready'),
      id: 'branch-2',
      branch: 'feature/payments',
      directoryName: 'goblin-feature-payments',
      path: '/workspace/goblin-feature-payments',
      repositories: [{ ...repositoryMember(), repositoryName: 'web' }],
    }
    const onActivate = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[first, second]}
            activeId={null}
            onActivate={onActivate}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-branch-workspace-id="branch-2"] [aria-label="workspace.branch-workspace.expand"]',
    )
    act(() => toggle?.click())

    expect(onActivate).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-branch-workspace-id="branch-2"] [data-testid="branch-workspace-member-list"]'),
    ).not.toBeNull()
  })

  test('uses the worktree terminal icon in the idle terminal count badge', () => {
    terminalState.outputActive = false
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[workspace('ready')]}
            activeId={null}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    const badge = container.querySelector('[data-testid="branch-workspace-terminal-count-badge"]')
    expect(badge?.textContent).toBe('2')
    expect(badge?.className).toContain('font-semibold')
    expect(badge?.querySelector('.lucide-terminal')).not.toBeNull()
    expect(badge?.querySelector('.lucide-square-terminal')).toBeNull()
  })

  test('renders the summed repository member change count', () => {
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[workspace('ready')]}
            activeId={null}
            changeCountById={{ 'branch-1': 5 }}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    const badge = container.querySelector('[data-testid="branch-workspace-change-count-badge"]')
    expect(badge?.textContent).toBe('5')
    expect(badge?.getAttribute('aria-label')).toBe('branch-status.worktree-dirty:5')
    expect(badge?.getAttribute('title')).toBe('branch-status.worktree-dirty:5')
    expect(badge?.querySelector('.lucide-git-compare-arrows')).not.toBeNull()
  })

  test('hides the repository member change badge for a zero total', () => {
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[workspace('ready')]}
            activeId={null}
            changeCountById={{ 'branch-1': 0 }}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    expect(container.querySelector('[data-testid="branch-workspace-change-count-badge"]')).toBeNull()
  })

  test('renders only the active repository member list with a dirty badge and opens a ready member', () => {
    const member = repositoryMember()
    const activeWorkspace = { ...workspace('ready'), repositories: [member] }
    const inactiveWorkspace = {
      ...workspace('ready'),
      id: 'branch-2',
      branch: 'feature/payments',
      path: '/workspace/goblin-feature-payments',
      repositories: [{ ...member, repositoryName: 'web' }],
    }
    const onOpenRepositoryMember = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[activeWorkspace, inactiveWorkspace]}
            activeId={activeWorkspace.id}
            activeMemberRepositoryName="api"
            getMemberPresentation={() => ({
              dirty: true,
              changeCount: 3,
              navigable: true,
              repositoryId: '/workspace/api',
              worktreePath: member.worktreePath,
            })}
            onOpenRepositoryMember={onOpenRepositoryMember}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          `[data-branch-workspace-id="${activeWorkspace.id}"] [aria-label="workspace.branch-workspace.expand"]`,
        )
        ?.click(),
    )
    const lists = container.querySelectorAll('[data-testid="branch-workspace-member-list"]')
    expect(lists).toHaveLength(1)
    expect(lists[0]?.className).not.toContain('border-l')
    expect(lists[0]?.className).not.toContain('border-brand-border')
    expect(lists[0]?.textContent).toContain('api')
    expect(lists[0]?.textContent).not.toContain('web')
    expect(container.querySelector('[data-testid="branch-workspace-member-hash"]')).toBeNull()
    const badge = container.querySelector('[data-testid="branch-workspace-member-change-count-badge"]')
    expect(badge?.textContent).toBe('3')
    expect(badge?.querySelector('.lucide-git-compare-arrows')).not.toBeNull()

    const memberButton = container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-member-api"]')
    if (!memberButton) throw new Error('missing repository member button')
    expect(memberButton.getAttribute('aria-current')).toBe('page')
    expect(
      container.querySelector('[data-testid="branch-workspace-root-branch-1"]')?.getAttribute('aria-current'),
    ).toBeNull()
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(container.querySelector('[data-testid="branch-workspace-member-terminal-count-badge"]')?.textContent).toBe(
      '2',
    )
    expect(
      container.querySelector('[data-testid="branch-workspace-member-terminal-count-badge"]')?.className,
    ).toContain('font-semibold')
    act(() => memberButton.click())
    expect(onOpenRepositoryMember).toHaveBeenCalledWith(activeWorkspace, member)
    expect(onOpenRepositoryMember).toHaveBeenCalledTimes(1)
  })

  test('left-aligns repository member terminal and dirty badges beside its name', () => {
    const activeWorkspace = { ...workspace('ready'), repositories: [repositoryMember()] }
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[activeWorkspace]}
            activeId={activeWorkspace.id}
            getMemberPresentation={() => ({ dirty: true, changeCount: 3, navigable: true })}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.expand"]')?.click())
    const summary = container.querySelector('[data-branch-workspace-member-summary]')
    const terminalBadge = container.querySelector('[data-testid="branch-workspace-member-terminal-count-badge"]')
    const dirtyBadge = container.querySelector('[data-testid="branch-workspace-member-change-count-badge"]')
    expect(summary?.querySelector('[data-testid="branch-workspace-member-terminal-count-badge"]')).toBe(terminalBadge)
    expect(terminalBadge?.previousElementSibling?.textContent).toBe('api')
    expect(dirtyBadge?.previousElementSibling).toBe(terminalBadge)
  })

  test('starts the active repository member list collapsed and toggles it without reactivating the workspace', () => {
    const activeWorkspace = { ...workspace('ready'), repositories: [repositoryMember()] }
    const onActivate = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[activeWorkspace]}
            activeId={activeWorkspace.id}
            getMemberPresentation={() => ({ dirty: false, changeCount: null, navigable: true })}
            onActivate={onActivate}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.expand"]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()

    act(() => toggle?.click())

    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).not.toBeNull()
    expect(onActivate).not.toHaveBeenCalled()

    act(() => toggle?.click())

    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
    expect(onActivate).not.toHaveBeenCalled()
  })

  test('requests a file area toggle without expanding members when the branch workspace item is double-clicked', () => {
    const activeWorkspace = { ...workspace('ready'), repositories: [repositoryMember()] }
    const onActivate = vi.fn()
    const onToggleFileArea = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[activeWorkspace]}
            activeId={activeWorkspace.id}
            onActivate={onActivate}
            onToggleFileArea={onToggleFileArea}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    const itemButton = container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-root-branch-1"]')
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()

    act(() => itemButton?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
    expect(onToggleFileArea).toHaveBeenCalledWith(activeWorkspace)
    expect(onActivate).not.toHaveBeenCalled()

    act(() => itemButton?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
    expect(onToggleFileArea).toHaveBeenCalledTimes(2)
    expect(onActivate).not.toHaveBeenCalled()
  })

  test('selects an inactive item and requests its file area through the double-click sequence', () => {
    const item = { ...workspace('ready'), repositories: [repositoryMember()] }
    const onActivate = vi.fn()
    const onToggleFileArea = vi.fn()
    const renderList = (activeId: string | null) =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId={activeId}
            onActivate={onActivate}
            onToggleFileArea={onToggleFileArea}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      )

    act(() => renderList(null))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-root-branch-1"]')?.click())
    expect(onActivate).toHaveBeenCalledWith(item.id)

    act(() => renderList(item.id))
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="branch-workspace-root-branch-1"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })),
    )
    expect(container.querySelector('[data-testid="branch-workspace-member-list"]')).toBeNull()
    expect(onToggleFileArea).toHaveBeenCalledWith(item)
  })

  test('keeps a non-navigable repository member disabled while retaining tmux cleanup', async () => {
    const member = repositoryMember({ ready: false })
    const otherMember = repositoryMember({
      repositoryName: 'web',
      worktreePath: '/workspace/goblin-feature-auth/web',
    })
    const item = { ...workspace('needs-repair'), repositories: [member, otherMember] }
    const onReduceMember = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId="branch-1"
            getMemberPresentation={(_item, candidate) =>
              candidate.repositoryName === member.repositoryName
                ? {
                    dirty: false,
                    changeCount: null,
                    navigable: false,
                    repositoryId: '/workspace/api',
                    worktreePath: member.worktreePath,
                  }
                : { dirty: false, changeCount: null, navigable: true }
            }
            onOpenRepositoryMember={() => {}}
            onReduceMember={onReduceMember}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.expand"]')?.click())
    expect(container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-member-api"]')?.disabled).toBe(
      true,
    )
    const memberRow = container
      .querySelector('[data-testid="branch-workspace-member-api"]')
      ?.closest<HTMLElement>('[data-workspace-list-item]')
    if (!memberRow) throw new Error('missing unavailable member row')
    const removeMemberItem = (await openMemberMenu(memberRow)).find(
      (entry) => entry.textContent?.trim() === 'workspace.branch-workspace.remove-members',
    )
    expect(removeMemberItem?.hasAttribute('data-disabled')).toBe(false)
    await act(async () => {
      removeMemberItem?.click()
      await Promise.resolve()
    })
    expect(onReduceMember).toHaveBeenCalledWith(item, member)
    const cleanupItem = (await openContextMenu(memberRow)).find(
      (entry) => entry.textContent?.trim() === 'tmux.cleanup.action',
    )
    expect(cleanupItem?.hasAttribute('data-disabled')).toBe(false)
  })

  test('does not expose member removal for the final member', async () => {
    const member = repositoryMember({ ready: false })
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[{ ...workspace('needs-repair'), repositories: [member] }]}
            activeId="branch-1"
            getMemberPresentation={() => ({ dirty: false, changeCount: null, navigable: false })}
            onReduceMember={() => {}}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.expand"]')?.click())
    const memberRow = container
      .querySelector('[data-testid="branch-workspace-member-api"]')
      ?.closest<HTMLElement>('[data-workspace-list-item]')
    if (!memberRow) throw new Error('missing unavailable member row')
    expect((await openMemberMenu(memberRow)).map((entry) => entry.textContent?.trim())).not.toContain(
      'workspace.branch-workspace.remove-members',
    )
  })

  test.each([
    ['active', ['workspace.branch-workspace.cancel'], ['tmux.cleanup.action']],
    [
      'creation-interrupted',
      ['workspace.branch-workspace.retry'],
      ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.delete', 'tmux.cleanup.action'],
    ],
    [
      'reduce-incomplete',
      ['workspace.branch-workspace.continue-reduce'],
      ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.delete', 'tmux.cleanup.action'],
    ],
    [
      'needs-repair',
      ['workspace.branch-workspace.repair'],
      [
        'terminal.new-with-tmux',
        'terminal.restore-directory-tmux',
        'terminal.external',
        'workspace.branch-workspace.inspect',
        'workspace.branch-workspace.delete',
        'tmux.cleanup.action',
      ],
    ],
    [
      'delete-incomplete',
      ['workspace.branch-workspace.continue-delete'],
      ['workspace.branch-workspace.inspect', 'tmux.cleanup.action'],
    ],
  ] as const)('exposes the exact %s state actions', async (stateName, directLabels, menuLabels) => {
    const onRemove = vi.fn()
    const onReduce = vi.fn()
    const item = workspace(stateName)
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId={null}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={onRemove}
            onReduce={onReduce}
            onCancel={() => {}}
          />,
        ),
      ),
    )
    const row = container.querySelector(`[data-branch-workspace-state="${stateName}"]`)
    const possibleDirectLabels = [
      'workspace.branch-workspace.cancel',
      'workspace.branch-workspace.retry',
      'workspace.branch-workspace.repair',
      'workspace.branch-workspace.continue-reduce',
      'workspace.branch-workspace.continue-delete',
    ]
    expect(possibleDirectLabels.filter((label) => row?.querySelector(`[aria-label="${label}"]`))).toEqual(directLabels)
    expect(await openMenuLabels(row)).toEqual(menuLabels)
    if (stateName === 'active') {
      const cleanupItem = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
        (entry) => entry.textContent?.trim() === 'tmux.cleanup.action',
      )
      expect(cleanupItem?.hasAttribute('data-disabled')).toBe(true)
    }
    if (stateName === 'reduce-incomplete') {
      act(() =>
        row?.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.continue-reduce"]')?.click(),
      )
      expect(onReduce).toHaveBeenCalledWith(item, true)
    }
  })

  test('keeps an available drifted branch workspace usable with a weak repair hint', async () => {
    const item = workspace('needs-repair')
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId={null}
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onExtend={() => {}}
            onReduce={() => {}}
            onAddDependencies={() => {}}
            onRemoveDependencies={() => {}}
            onCancel={() => {}}
            onGitAction={() => {}}
          />,
        ),
      ),
    )

    const row = container.querySelector('[data-branch-workspace-state="needs-repair"]')
    expect(row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')?.disabled).toBe(false)
    expect(row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.disabled).toBe(false)
    expect(row?.querySelector('[data-workspace-list-item-drag-handle]')).not.toBeNull()
    expect(row?.querySelector('[data-testid="branch-workspace-state-summary"]')?.className).toContain(
      'text-muted-foreground',
    )
    expect(await openMenuLabels(row)).toEqual([
      'terminal.new-with-tmux',
      'terminal.restore-directory-tmux',
      'terminal.external',
      'workspace.branch-workspace.inspect',
      'workspace.branch-workspace.delete',
      'tmux.cleanup.action',
    ])
    if (!(row instanceof HTMLElement)) throw new Error('missing drifted branch workspace row')
    expect((await openContextMenu(row)).slice(0, 3).every((item) => !item.hasAttribute('data-disabled'))).toBe(true)
  })

  test('keeps disabled ready actions visible in the fixed dock and More menu', async () => {
    folderActionState.editorDisabled = true
    folderActionState.externalTerminalDisabled = true
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[workspace('ready')]}
            activeId={null}
            disabled
            onActivate={() => {}}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
        ),
      ),
    )
    const row = container.querySelector('[data-branch-workspace-state="ready"]')
    expect(row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')?.disabled).toBe(true)
    expect(row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.disabled).toBe(true)

    const menuItems = await openMenuItems(row)
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual([
      'terminal.new-with-tmux',
      'terminal.restore-directory-tmux',
      'terminal.external',
      'workspace.branch-workspace.delete',
      'tmux.cleanup.action',
    ])
    expect(menuItems.every((item) => item.hasAttribute('data-disabled'))).toBe(true)
  })

  test('offers root-scoped actions and creates an internal terminal on every dock click', async () => {
    const item = workspace('ready')
    const terminalKey = `/workspace\0${item.path}`
    const session = terminalSession(terminalKey)
    const onActivate = vi.fn()
    const selectTerminal = vi.fn<TerminalSessionContextValue['selectTerminal']>()
    const createTerminal = vi.fn<TerminalSessionContextValue['createTerminal']>(async () => 'new-terminal')
    const restoreTmuxSessions = vi.fn<TerminalSessionContextValue['restoreTmuxSessions']>(async () => 2)
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
    terminalState.count = 1
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[item]}
            activeId={null}
            onActivate={onActivate}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={() => {}}
            onCancel={() => {}}
          />,
          new Map([[terminalKey, worktreeSnapshot(terminalKey, [session])]]),
          { selectTerminal, createTerminal, restoreTmuxSessions, closeTerminal },
        ),
      ),
    )
    const row = container.querySelector('[data-branch-workspace-state="ready"]')
    if (!(row instanceof HTMLElement)) throw new Error('missing branch workspace row')

    expect((await openContextMenu(row)).map((menuItem) => menuItem.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'terminal.external',
      'terminal.internal',
      'terminal.new-with-tmux',
      'terminal.restore-directory-tmux',
      'terminal.close-all',
      'workspace.branch-workspace.delete',
      'tmux.cleanup.action',
    ])

    await clickContextMenuItem(row, 'worktrees.open-in-editor-label')
    await clickContextMenuItem(row, 'terminal.external')
    const internalTerminalButton = row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')
    if (!internalTerminalButton) throw new Error('missing internal terminal action')
    await act(async () => {
      internalTerminalButton.click()
      await Promise.resolve()
    })
    await act(async () => {
      row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.click()
      await Promise.resolve()
    })

    expect(folderActionState.editorOnSelect).toHaveBeenCalledTimes(1)
    expect(folderActionState.externalTerminalOnSelect).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledTimes(2)
    expect(onActivate).toHaveBeenNthCalledWith(1, item.id)
    expect(onActivate).toHaveBeenNthCalledWith(2, item.id)
    expect(selectTerminal).not.toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledTimes(2)
    expect(createTerminal).toHaveBeenNthCalledWith(1, expect.objectContaining({ worktreePath: item.path }), 'native')
    expect(createTerminal).toHaveBeenNthCalledWith(2, expect.objectContaining({ worktreePath: item.path }), 'native')

    await clickContextMenuItem(row, 'terminal.new-with-tmux')
    expect(createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: item.path }),
      'tmux-if-available',
    )

    await clickContextMenuItem(row, 'terminal.restore-directory-tmux')
    expect(restoreTmuxSessions).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: item.path }))

    await requestCloseAllFromContextMenu(row)
    expect(closeTerminal).not.toHaveBeenCalled()
    await confirmCloseAll()
    expect(closeTerminal).toHaveBeenCalledWith(session.key, {
      repoRoot: '/workspace',
      worktreePath: item.path,
    })
  })

  test.each(['active', 'creation-interrupted', 'reduce-incomplete', 'delete-incomplete'] as const)(
    'keeps folder-open context actions disabled for a %s branch workspace',
    async (stateName) => {
      act(() =>
        root.render(
          withTerminalContexts(
            <BranchWorkspaceList
              rootId="/workspace"
              items={[workspace(stateName)]}
              activeId={null}
              onActivate={() => {}}
              onReorder={() => {}}
              onInspect={() => {}}
              onRepair={() => {}}
              onRemove={() => {}}
              onCancel={() => {}}
            />,
          ),
        ),
      )
      const row = container.querySelector(`[data-branch-workspace-state="${stateName}"]`)
      if (!(row instanceof HTMLElement)) throw new Error('missing branch workspace row')

      const items = await openContextMenu(row)
      expect(items.slice(0, 3).every((item) => item.hasAttribute('data-disabled'))).toBe(true)
    },
  )
})

async function openMenuItems(row: Element | null): Promise<HTMLElement[]> {
  const trigger = row?.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.more"]')
  if (!trigger) return []
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function openMenuLabels(row: Element | null): Promise<string[]> {
  return (await openMenuItems(row)).map((entry) => entry.textContent?.trim() ?? '')
}

async function openMemberMenu(row: Element): Promise<HTMLElement[]> {
  const trigger = row.querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
  if (!trigger) return []
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

function withTerminalContexts(
  children: ReactNode,
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot> = new Map(),
  overrides: {
    selectTerminal?: TerminalSessionContextValue['selectTerminal']
    createTerminal?: TerminalSessionContextValue['createTerminal']
    restoreTmuxSessions?: TerminalSessionContextValue['restoreTmuxSessions']
    closeTerminal?: TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']
  } = {},
): ReactNode {
  return (
    <TerminalSessionContext.Provider value={terminalCommandContext(overrides)}>
      <TerminalSessionReadContext.Provider value={terminalReadContext(snapshots)}>
        {children}
      </TerminalSessionReadContext.Provider>
    </TerminalSessionContext.Provider>
  )
}

function terminalReadContext(
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot>,
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (key) =>
      snapshots.get(key) ?? { worktreeTerminalKey: key, selectedDescriptor: null, sessions: [], count: 0 },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function terminalCommandContext(overrides: {
  selectTerminal?: TerminalSessionContextValue['selectTerminal']
  createTerminal?: TerminalSessionContextValue['createTerminal']
  restoreTmuxSessions?: TerminalSessionContextValue['restoreTmuxSessions']
  closeTerminal?: TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']
}): TerminalSessionContextValue {
  return {
    createTerminal: overrides.createTerminal ?? vi.fn(async () => ''),
    restoreTmuxSessions: overrides.restoreTmuxSessions ?? vi.fn(async () => 0),
    selectTerminal: overrides.selectTerminal ?? vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: overrides.closeTerminal ?? vi.fn(),
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
}

function worktreeSnapshot(worktreeTerminalKey: string, sessions: TerminalSessionSummary[]): WorktreeTerminalSnapshot {
  return { worktreeTerminalKey, selectedDescriptor: null, sessions, count: sessions.length }
}

function terminalSession(worktreeTerminalKey: string): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-1`,
    worktreeTerminalKey,
    terminalId: 'terminal-1',
    index: 1,
    title: 'terminal',
    phase: 'open',
    selected: true,
    hasBell: false,
  }
}

async function openContextMenu(row: HTMLElement): Promise<HTMLElement[]> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function clickContextMenuItem(row: HTMLElement, label: string): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes(label))
  if (!item) throw new Error(`missing context menu item: ${label}`)
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function requestCloseAllFromContextMenu(row: HTMLElement): Promise<void> {
  await clickContextMenuItem(row, 'terminal.close-all')
}

async function confirmCloseAll(): Promise<void> {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes('terminal.close-all-confirm-confirm'),
  )
  if (!button) throw new Error('missing close all terminals confirmation')
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

type WorkspaceFixtureState =
  | 'ready'
  | 'active'
  | 'creation-interrupted'
  | 'needs-repair'
  | 'reduce-incomplete'
  | 'delete-incomplete'

function workspace(stateName: WorkspaceFixtureState): BranchWorkspaceSnapshot {
  const state: BranchWorkspaceSnapshot['state'] =
    stateName === 'creation-interrupted'
      ? { kind: 'needs-action', action: 'repair', reason: 'creation-interrupted' }
      : stateName === 'needs-repair'
        ? { kind: 'needs-action', action: 'repair', reason: 'drift' }
        : stateName === 'reduce-incomplete'
          ? { kind: 'needs-action', action: 'continue-reduce' }
          : stateName === 'delete-incomplete'
            ? { kind: 'needs-action', action: 'continue-delete' }
            : { kind: 'ready' }
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    state,
    available: stateName !== 'delete-incomplete',
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
    ...(stateName === 'active'
      ? { activeOperation: { kind: 'pull', currentStep: 1, completedCount: 0, totalCount: 2, cancellable: true } }
      : {}),
  }
}

function repositoryMember(
  overrides: Partial<BranchWorkspaceRepositorySnapshot> = {},
): BranchWorkspaceRepositorySnapshot {
  return {
    repositoryName: 'api',
    targetBranch: 'feature/auth',
    creationBase: { kind: 'localBranch', branch: 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'created',
    worktreePath: '/workspace/goblin-feature-auth/api',
    progress: 'complete',
    ready: true,
    ...overrides,
  }
}

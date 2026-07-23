// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { BranchWorkspaceRepositorySnapshot, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { BranchWorkspaceMemberRow } from '#/web/components/repo-workspace/BranchWorkspaceMemberRow.tsx'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type { TerminalSessionContextValue, TerminalSessionReadContextValue } from '#/web/components/terminal/types.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch } from '#/web/stores/repos/test-utils.ts'

const actionState = vi.hoisted(() => ({
  editor: vi.fn(),
  terminal: vi.fn(),
  externalTerminal: vi.fn(),
  remote: vi.fn(),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) => {
    const value = params?.count ?? params?.n
    return value === undefined ? key : `${key}:${String(value)}`
  },
}))

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalCount: () => 2,
  useWorktreeTerminalHasBell: () => true,
  useWorktreeTerminalHasOutputActivity: () => false,
  useTerminalAggregateCount: () => 2,
}))

vi.mock('#/web/hooks/useBranchActionItems.tsx', () => ({
  useBranchActionItems: (
    _repo: unknown,
    _branch: unknown,
    options?: { onNavigateToInternalTerminal?: (target: unknown) => void | Promise<void> },
  ) => ({
    externalItems: [
      branchAction('editor', actionState.editor),
      branchAction('terminal', () => {
        actionState.terminal()
        return options?.onNavigateToInternalTerminal?.({
          repoRoot: '/workspace/api',
          branch: 'feature/auth',
          worktreePath: '/workspace/goblin-feature-auth/api',
        })
      }),
      branchAction('externalTerminal', actionState.externalTerminal),
      branchAction('remote', actionState.remote),
    ],
    mainItems: [
      branchAction('checkout'),
      branchAction('pull', undefined, true),
      branchAction('push'),
      branchAction('createWorktree'),
      branchAction('sync'),
      branchAction('createBranch'),
      branchAction('pullRemoteBranch'),
      branchAction('checkoutTo'),
      branchAction('merge'),
      branchAction('commit'),
      branchAction('copyPatch'),
    ],
    patchItems: [branchAction('createTag')],
    destructiveItems: [
      branchAction('closeAllTerminals', undefined, false, { menuOnly: true, destructive: true }),
      branchAction('removeWorktree', undefined, false, { destructive: true }),
      branchAction('deleteBranch', undefined, false, { destructive: true }),
      branchAction('resetHard', undefined, false, { destructive: true }),
    ],
    dialogs: 'member-dialogs',
    inlinePanel: 'member-inline-panel',
  }),
}))

function branchAction(
  id: string,
  onSelect: (() => void | Promise<void>) | undefined = undefined,
  disabled = false,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    label: id,
    disabled,
    visible: true,
    icon: null,
    onSelect: onSelect ?? vi.fn(),
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Object.values(actionState).forEach((mock) => mock.mockReset())
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceMemberRow', () => {
  test('renders a compact actionable member row without independent-worktree lifecycle actions', async () => {
    const item = workspace()
    const member = repositoryMember()
    const branch = createRepoBranch(member.targetBranch, { worktree: { path: member.worktreePath } })
    const repo = emptyRepo('/workspace/api', 'api')
    repo.data.branches = [branch]
    const onOpenRepositoryMember = vi.fn()
    const onOpenInternalTerminal = vi.fn()

    render(
      <BranchWorkspaceMemberRow
        item={item}
        member={member}
        selected
        disabled={false}
        presentation={{
          dirty: true,
          changeCount: 3,
          navigable: true,
          repositoryId: repo.id,
          worktreePath: member.worktreePath,
          actionTarget: { repo, branch },
        }}
        onOpenRepositoryMember={onOpenRepositoryMember}
        onOpenInternalTerminal={onOpenInternalTerminal}
      />,
    )

    const row = container.querySelector('[data-workspace-list-item]')
    const main = container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-member-api"]')
    expect(row?.getAttribute('data-size')).toBe('member')
    expect(main?.className).toContain('h-7')
    expect(main?.getAttribute('aria-current')).toBe('page')
    expect(row?.querySelector('[data-workspace-list-item-drag-handle]')).toBeNull()
    expect(row?.querySelector('[data-workspace-list-item-action-dock]')?.children).toHaveLength(3)
    expect(row?.querySelector('[data-workspace-list-item-action="editor"]')).not.toBeNull()
    expect(row?.querySelector('[data-workspace-list-item-action="terminal"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-member-change-count-badge"]')?.className).toContain(
      'font-semibold',
    )
    expect(
      container.querySelector('[data-testid="branch-workspace-member-terminal-count-badge"]')?.className,
    ).toContain('font-semibold')

    const menuItems = await openMenu()
    expect(menuItems.map((entry) => entry.getAttribute('data-action'))).toEqual([
      'externalTerminal',
      'remote',
      'pull',
      'push',
      'createBranch',
      'pullRemoteBranch',
      'merge',
      'commit',
      'copyPatch',
      'createTag',
      'closeAllTerminals',
      'resetHard',
      'cleanupTmuxSessions',
    ])
    expect(menuItems.find((entry) => entry.getAttribute('data-action') === 'pull')?.hasAttribute('data-disabled')).toBe(
      true,
    )
    expect(container.textContent).toContain('member-inline-panel')
    expect(container.textContent).toContain('member-dialogs')

    await act(async () => {
      row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')?.click()
      await Promise.resolve()
    })
    expect(actionState.editor).toHaveBeenCalledTimes(1)
    expect(onOpenRepositoryMember).not.toHaveBeenCalled()

    await act(async () => {
      row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.click()
      await Promise.resolve()
    })
    expect(actionState.terminal).toHaveBeenCalledTimes(1)
    expect(onOpenInternalTerminal).toHaveBeenCalledWith(item, member)
    expect(onOpenRepositoryMember).not.toHaveBeenCalled()

    act(() => main?.click())
    expect(onOpenRepositoryMember).toHaveBeenCalledWith(item, member)
  })

  test('keeps the stable safe action set visible and disabled when target resolution fails', async () => {
    render(
      <BranchWorkspaceMemberRow
        item={workspace()}
        member={repositoryMember()}
        selected={false}
        disabled={false}
        presentation={{
          dirty: false,
          changeCount: null,
          navigable: false,
          reason: 'workspace.branch-workspace.member-branch-missing',
        }}
        onOpenRepositoryMember={vi.fn()}
        onOpenInternalTerminal={vi.fn()}
      />,
    )

    const main = container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-member-api"]')
    expect(main?.disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')?.disabled).toBe(
      true,
    )
    expect(container.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.disabled).toBe(
      true,
    )
    const menuItems = await openMenu()
    expect(menuItems.map((entry) => entry.getAttribute('data-action'))).toEqual([
      'externalTerminal',
      'remote',
      'pull',
      'push',
      'createBranch',
      'pullRemoteBranch',
      'merge',
      'commit',
      'copyPatch',
      'createTag',
      'closeAllTerminals',
      'resetHard',
    ])
    expect(menuItems.every((entry) => entry.hasAttribute('data-disabled'))).toBe(true)
  })

  test('reuses the member worktree target for scoped context actions', async () => {
    const item = workspace()
    const member = repositoryMember()
    const branch = createRepoBranch(member.targetBranch, { worktree: { path: member.worktreePath } })
    const repo = emptyRepo('/workspace/api', 'api')
    repo.data.branches = [branch]
    const onOpenRepositoryMember = vi.fn()

    render(
      <BranchWorkspaceMemberRow
        item={item}
        member={member}
        selected={false}
        disabled={false}
        presentation={{
          dirty: false,
          changeCount: null,
          navigable: true,
          repositoryId: repo.id,
          worktreePath: member.worktreePath,
          actionTarget: { repo, branch },
        }}
        onOpenRepositoryMember={onOpenRepositoryMember}
        onOpenInternalTerminal={vi.fn()}
      />,
    )

    const itemRow = container.querySelector<HTMLElement>('[data-workspace-list-item]')
    if (!itemRow) throw new Error('missing member row')
    const contextItems = await openContextMenu(itemRow)
    expect(contextItems.map((entry) => entry.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'terminal.external',
      'terminal.internal',
      'terminal.close-all',
      'tmux.cleanup.action',
    ])

    await act(async () => {
      contextItems[0]?.click()
      await Promise.resolve()
    })
    expect(actionState.editor).toHaveBeenCalledTimes(1)
    expect(onOpenRepositoryMember).not.toHaveBeenCalled()
  })
})

function render(children: ReactNode): void {
  act(() => {
    root.render(
      <TerminalSessionContext.Provider value={terminalCommandContext()}>
        <TerminalSessionReadContext.Provider value={terminalReadContext()}>
          <ul>{children}</ul>
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
}

async function openMenu(): Promise<HTMLElement[]> {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function openContextMenu(row: HTMLElement): Promise<HTMLElement[]> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

function terminalReadContext(): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (key) => ({ worktreeTerminalKey: key, selectedDescriptor: null, sessions: [], count: 0 }),
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function terminalCommandContext(): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(),
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

function workspace(): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    state: { kind: 'ready' },
    available: true,
    issues: [],
    repositories: [repositoryMember()],
    auxiliaryEntries: [],
  }
}

function repositoryMember(): BranchWorkspaceRepositorySnapshot {
  return {
    repositoryName: 'api',
    targetBranch: 'feature/auth',
    baseBranch: 'main',
    branchOrigin: 'created',
    worktreePath: '/workspace/goblin-feature-auth/api',
    progress: 'complete',
    ready: true,
  }
}

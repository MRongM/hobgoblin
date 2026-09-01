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
  powershellTerminal: vi.fn(),
  wslTerminal: vi.fn(),
  externalTerminal: vi.fn(),
  tmuxTerminal: vi.fn(),
  restoreTmuxTerminals: vi.fn(),
  remote: vi.fn(),
  createWorktree: vi.fn(),
  sync: vi.fn(),
  tmuxVisible: true,
}))
const platformState = vi.hoisted(() => ({ hostPlatform: 'linux' as NodeJS.Platform }))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: platformState.hostPlatform }),
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
    options?: {
      onNavigateToInternalTerminal?: (target: unknown) => void | Promise<void>
      windowsInternalTerminalShellMenu?: boolean
    },
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
      ...(options?.windowsInternalTerminalShellMenu
        ? [
            branchAction('terminalPowerShell', actionState.powershellTerminal, false, {
              label: 'terminal.internal-powershell',
              menuOnly: true,
            }),
            branchAction('terminalWsl', actionState.wslTerminal, false, {
              label: 'terminal.internal-wsl',
              menuOnly: true,
            }),
          ]
        : []),
      branchAction('terminalTmux', actionState.tmuxTerminal, false, {
        label: 'terminal.new-with-tmux',
        visible: actionState.tmuxVisible,
      }),
      branchAction('restoreTmuxTerminals', actionState.restoreTmuxTerminals, false, {
        label: 'terminal.restore-directory-tmux',
        visible: actionState.tmuxVisible,
      }),
      branchAction('externalTerminal', actionState.externalTerminal),
      branchAction('remote', actionState.remote),
    ],
    mainItems: [
      branchAction('checkout'),
      branchAction('pull', undefined, true),
      branchAction('push'),
      branchAction('createWorktree', actionState.createWorktree),
      branchAction('sync', actionState.sync),
      branchAction('createBranch'),
      branchAction('pullRemoteBranch'),
      branchAction('checkoutTo'),
      branchAction('merge'),
      branchAction('mergeOut'),
      branchAction('commit'),
      branchAction('copyPatch'),
    ],
    patchItems: [branchAction('createTag')],
    destructiveItems: [
      branchAction('closeAllTerminals', undefined, false, { menuOnly: true, destructive: true }),
      branchAction('removeWorktree', undefined, false, { destructive: true }),
      branchAction('deleteBranch', undefined, false, { destructive: true }),
      branchAction('alignRemote', undefined, false, { destructive: true }),
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
  Object.values(actionState).forEach((mock) => {
    if (typeof mock === 'function') mock.mockReset()
  })
  actionState.tmuxVisible = true
  platformState.hostPlatform = 'linux'
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceMemberRow', () => {
  test('shows only a non-empty abbreviated commit hash after the member name', () => {
    const item = workspace()
    const member = repositoryMember()
    const repo = emptyRepo('/workspace/api', 'api')
    const renderHash = (lastCommitHash: string) => {
      const branch = createRepoBranch(member.targetBranch, {
        lastCommitHash,
        worktree: { path: member.worktreePath },
      })
      repo.data.branches = [branch]
      render(
        <BranchWorkspaceMemberRow
          item={item}
          member={member}
          selected
          disabled={false}
          presentation={{
            dirty: false,
            changeCount: null,
            navigable: true,
            repositoryId: repo.id,
            worktreePath: member.worktreePath,
            actionTarget: { repo, branch },
          }}
          onSelectRepositoryMember={vi.fn()}
          onOpenInternalTerminal={vi.fn()}
        />,
      )
    }

    renderHash('abc123456789')
    const hashTag = container.querySelector<HTMLElement>('[data-testid="branch-workspace-member-hash-tag"]')
    expect(hashTag?.textContent).toBe('#abc1234')
    expect(hashTag?.className).toContain('font-mono')
    expect(hashTag?.className).toContain('text-selected-muted-foreground')
    expect(hashTag?.hasAttribute('title')).toBe(false)

    renderHash('  ')
    expect(container.querySelector('[data-testid="branch-workspace-member-hash-tag"]')).toBeNull()
  })

  test('shows each non-zero upstream delta and omits zero directions', () => {
    const item = workspace()
    const member = repositoryMember()
    const repo = emptyRepo('/workspace/api', 'api')
    const renderDeltas = (ahead: number, behind: number) => {
      const branch = createRepoBranch(member.targetBranch, {
        ahead,
        behind,
        worktree: { path: member.worktreePath },
      })
      repo.data.branches = [branch]
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
          onSelectRepositoryMember={vi.fn()}
          onOpenInternalTerminal={vi.fn()}
        />,
      )
    }

    renderDeltas(3, 0)
    const aheadDelta = container.querySelector('[aria-label="branch-status.sync.ahead:3"]')
    expect(aheadDelta).not.toBeNull()
    expect(aheadDelta?.textContent).toContain('3')
    expect(container.querySelector('[aria-label^="branch-status.sync.behind"]')).toBeNull()

    renderDeltas(0, 2)
    expect(container.querySelector('[aria-label^="branch-status.sync.ahead"]')).toBeNull()
    const behindDelta = container.querySelector('[aria-label="branch-status.sync.behind:2"]')
    expect(behindDelta).not.toBeNull()
    expect(behindDelta?.textContent).toContain('2')
  })

  test('renders a compact actionable member row without independent-worktree lifecycle actions', async () => {
    const item = workspace()
    const member = repositoryMember()
    const branch = createRepoBranch(member.targetBranch, { worktree: { path: member.worktreePath } })
    const repo = emptyRepo('/workspace/api', 'api')
    repo.data.branches = [branch]
    const onSelectRepositoryMember = vi.fn()
    const onToggleFileArea = vi.fn()
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
        onSelectRepositoryMember={onSelectRepositoryMember}
        onToggleFileArea={onToggleFileArea}
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
      'terminalTmux',
      'restoreTmuxTerminals',
      'externalTerminal',
      'remote',
      'pull',
      'push',
      'createWorktree',
      'sync',
      'createBranch',
      'pullRemoteBranch',
      'merge',
      'mergeOut',
      'commit',
      'copyPatch',
      'createTag',
      'closeAllTerminals',
      'alignRemote',
      'resetHard',
      'cleanupTmuxSessions',
    ])
    expect(menuItems[0]?.textContent?.trim()).toBe('terminal.new-with-tmux')
    expect(menuItems[1]?.textContent?.trim()).toBe('terminal.restore-directory-tmux')
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
    expect(onSelectRepositoryMember).not.toHaveBeenCalled()

    await act(async () => {
      row?.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')?.click()
      await Promise.resolve()
    })
    expect(actionState.terminal).toHaveBeenCalledTimes(1)
    expect(onOpenInternalTerminal).toHaveBeenCalledWith(item, member)
    expect(onSelectRepositoryMember).not.toHaveBeenCalled()

    act(() => main?.click())
    expect(onSelectRepositoryMember).toHaveBeenCalledWith(item, member)
    expect(onToggleFileArea).not.toHaveBeenCalled()

    onSelectRepositoryMember.mockClear()
    act(() => dispatchMouseDoubleClickSequence(main))
    expect(onSelectRepositoryMember).toHaveBeenCalledTimes(2)
    expect(onSelectRepositoryMember).toHaveBeenLastCalledWith(item, member)
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
  })

  test('offers PowerShell and WSL launches for a Windows local branch-workspace member', async () => {
    platformState.hostPlatform = 'win32'
    actionState.tmuxVisible = false
    const item = workspace()
    const member = repositoryMember()
    const branch = createRepoBranch(member.targetBranch, { worktree: { path: member.worktreePath } })
    const repo = emptyRepo('C:\\workspace\\api', 'api')

    render(
      <BranchWorkspaceMemberRow
        item={item}
        member={member}
        selected
        disabled={false}
        presentation={{
          dirty: false,
          changeCount: null,
          navigable: true,
          repositoryId: repo.id,
          worktreePath: member.worktreePath,
          actionTarget: { repo, branch },
        }}
        onSelectRepositoryMember={vi.fn()}
        onOpenInternalTerminal={vi.fn()}
      />,
    )

    const menuItems = await openMenu()
    const menuActionIds = menuItems.map((entry) => entry.getAttribute('data-action'))
    expect(menuActionIds.slice(0, 2)).toEqual(['terminalPowerShell', 'terminalWsl'])
    expect(menuActionIds).not.toContain('terminalTmux')
    expect(menuActionIds).not.toContain('restoreTmuxTerminals')
    await act(async () => {
      menuItems[0]?.click()
      await Promise.resolve()
    })
    const row = container.querySelector<HTMLElement>('[data-workspace-list-item]')
    if (!row) throw new Error('missing member row')
    const contextLabels = (await openContextMenu(row)).map((entry) => entry.textContent?.trim())
    expect(contextLabels.slice(2, 4)).toEqual(['terminal.internal-powershell', 'terminal.internal-wsl'])
    expect(contextLabels).not.toContain('terminal.new-with-tmux')
    expect(contextLabels).not.toContain('terminal.restore-directory-tmux')

    await clickContextMenuItem(row, 'terminal.internal-wsl')
    expect(actionState.powershellTerminal).toHaveBeenCalledTimes(1)
    expect(actionState.wslTerminal).toHaveBeenCalledTimes(1)
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
        onSelectRepositoryMember={vi.fn()}
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
      'terminalTmux',
      'restoreTmuxTerminals',
      'externalTerminal',
      'remote',
      'pull',
      'push',
      'createWorktree',
      'sync',
      'createBranch',
      'pullRemoteBranch',
      'merge',
      'mergeOut',
      'commit',
      'copyPatch',
      'createTag',
      'closeAllTerminals',
      'alignRemote',
      'resetHard',
    ])
    expect(menuItems.every((entry) => entry.hasAttribute('data-disabled'))).toBe(true)
  })

  test('omits tmux placeholders when a native local Windows member target cannot be resolved', async () => {
    platformState.hostPlatform = 'win32'
    const item = { ...workspace(), rootId: 'C:\\workspace' }
    render(
      <BranchWorkspaceMemberRow
        item={item}
        member={repositoryMember()}
        selected={false}
        disabled={false}
        presentation={{
          dirty: false,
          changeCount: null,
          navigable: false,
          reason: 'workspace.branch-workspace.member-branch-missing',
        }}
      />,
    )

    expect((await openMenu()).map((entry) => entry.getAttribute('data-action'))).not.toEqual(
      expect.arrayContaining(['terminalTmux', 'restoreTmuxTerminals']),
    )
  })

  test('keeps worktree creation and refresh visible but disabled in an unavailable member context menu', async () => {
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
        onSelectRepositoryMember={vi.fn()}
        onOpenInternalTerminal={vi.fn()}
      />,
    )

    const itemRow = container.querySelector<HTMLElement>('[data-workspace-list-item]')
    if (!itemRow) throw new Error('missing unavailable member row')
    const contextItems = await openContextMenu(itemRow)
    const createWorktree = contextItems.find((entry) => entry.textContent?.includes('action.create-worktree'))
    const sync = contextItems.find((entry) => entry.textContent?.includes('action.refresh'))

    expect(createWorktree?.hasAttribute('data-disabled')).toBe(true)
    expect(sync?.hasAttribute('data-disabled')).toBe(true)
  })

  test('keeps a drifted registered worktree actionable with a weak repair hint', async () => {
    const item = workspace()
    const member = { ...repositoryMember(), ready: false }
    const branch = createRepoBranch('release/previous', { worktree: { path: member.worktreePath } })
    const repo = emptyRepo('/workspace/api', 'api')
    repo.data.branches = [branch]

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
          warning: 'workspace.branch-workspace.member-branch-drift',
          repositoryId: repo.id,
          worktreePath: member.worktreePath,
          actionTarget: { repo, branch },
        }}
        onSelectRepositoryMember={vi.fn()}
        onOpenInternalTerminal={vi.fn()}
      />,
    )

    expect(container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-member-api"]')?.disabled).toBe(
      false,
    )
    const hint = container.querySelector('[data-testid="branch-workspace-member-repair-hint"]')
    expect(hint?.textContent).toBe('workspace.branch-workspace.lifecycle.needs-repair')
    expect(hint?.className).toContain('text-muted-foreground')
    expect((await openMenu()).some((entry) => !entry.hasAttribute('data-disabled'))).toBe(true)
  })

  test('reuses the member worktree target for scoped context actions', async () => {
    const item = workspace()
    const member = repositoryMember()
    const branch = createRepoBranch(member.targetBranch, { worktree: { path: member.worktreePath } })
    const repo = emptyRepo('/workspace/api', 'api')
    repo.data.branches = [branch]
    const onSelectRepositoryMember = vi.fn()

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
        onSelectRepositoryMember={onSelectRepositoryMember}
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
      'terminal.new-with-tmux',
      'terminal.restore-directory-tmux',
      'createWorktree',
      'sync',
      'alignRemote',
      'terminal.close-all',
      'tmux.cleanup.action',
    ])

    await act(async () => {
      contextItems[0]?.click()
      await Promise.resolve()
    })
    expect(actionState.editor).toHaveBeenCalledTimes(1)
    expect(onSelectRepositoryMember).not.toHaveBeenCalled()

    const tmuxContextItems = await openContextMenu(itemRow)
    await act(async () => {
      tmuxContextItems[3]?.click()
      await Promise.resolve()
    })
    expect(actionState.tmuxTerminal).toHaveBeenCalledTimes(1)

    const reopenedContextItems = await openContextMenu(itemRow)
    await act(async () => {
      reopenedContextItems[4]?.click()
      await Promise.resolve()
    })
    expect(actionState.restoreTmuxTerminals).toHaveBeenCalledTimes(1)

    await clickContextMenuItem(itemRow, 'createWorktree')
    await clickContextMenuItem(itemRow, 'sync')
    expect(actionState.createWorktree).toHaveBeenCalledTimes(1)
    expect(actionState.sync).toHaveBeenCalledTimes(1)
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

function dispatchMouseDoubleClickSequence(target: HTMLElement | null): void {
  if (!target) throw new Error('missing double-click target')
  for (const detail of [1, 2]) {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail }))
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, detail }))
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail }))
  }
  target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, detail: 2 }))
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
    restoreTmuxSessions: vi.fn(async () => 0),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    pageTmux: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    scrollByTouch: vi.fn(),
    beginMobileSelection: vi.fn(() => false),
    extendMobileSelection: vi.fn(),
    finishMobileSelection: vi.fn(),
    cancelMobileSelection: vi.fn(),
    selectionText: vi.fn(() => ''),
    pasteText: vi.fn(),
    mobileSelectionText: vi.fn(() => ''),
    clearMobileSelection: vi.fn(),
    writeExtraKey: vi.fn(),
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
    creationBase: { kind: 'localBranch', branch: 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'created',
    worktreePath: '/workspace/goblin-feature-auth/api',
    progress: 'complete',
    ready: true,
  }
}

// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceList } from '#/web/components/repo-workspace/BranchWorkspaceList.tsx'
import type { BranchWorkspaceLifecycle, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
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
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params?.count === undefined ? key : `${key}:${String(params.count)}`,
}))

vi.mock('#/web/hooks/useFolderExternalOpenActions.ts', () => ({
  useFolderExternalOpenActions: () => ({
    editor: { disabled: false, busy: false, iconPref: 'auto', onSelect: folderActionState.editorOnSelect },
    externalTerminal: {
      disabled: false,
      busy: false,
      iconPref: 'auto',
      onSelect: folderActionState.externalTerminalOnSelect,
    },
  }),
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
  test('renders one non-expandable folder row with root-scoped terminal badges and ready actions', () => {
    const onActivate = vi.fn()
    const onRemove = vi.fn()
    const onBatchCommit = vi.fn()
    const onMergeBack = vi.fn()
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[workspace('ready')]}
            activeId="branch-1"
            onActivate={onActivate}
            onReorder={() => {}}
            onInspect={() => {}}
            onRepair={() => {}}
            onRemove={onRemove}
            onCancel={() => {}}
            onBatchCommit={onBatchCommit}
            onMergeBack={onMergeBack}
          />,
        ),
      ),
    )

    expect(container.textContent).toContain('feature/auth')
    expect(container.textContent).not.toContain('goblin-feature-auth')
    expect(container.querySelector('[aria-expanded]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-terminal-count-badge"]')?.textContent).toBe('2')
    expect(container.querySelector('[data-terminal-bell-dot]')).not.toBeNull()
    expect(container.querySelector('[data-terminal-output-activity-indicator="active"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="workspace.branch-workspace.open-editor"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="workspace.branch-workspace.open-external-terminal"]')).not.toBeNull()
    const internalTerminal = container.querySelector('[aria-label="workspace.branch-workspace.open-internal-terminal"]')
    expect(internalTerminal).not.toBeNull()
    expect(internalTerminal?.querySelector('.lucide-terminal')).not.toBeNull()
    expect(internalTerminal?.querySelector('.lucide-square-terminal')).toBeNull()
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.git-action.batch-commit"]')
        ?.click(),
    )
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.git-action.merge-back"]')
        ?.click(),
    )
    expect(onBatchCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'branch-1' }))
    expect(onMergeBack).toHaveBeenCalledWith(expect.objectContaining({ id: 'branch-1' }))
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.delete"]')?.click())
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'branch-1', path: '/workspace/goblin-feature-auth' }),
    )
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
    expect(badge?.querySelector('.lucide-terminal')).not.toBeNull()
    expect(badge?.querySelector('.lucide-square-terminal')).toBeNull()
  })

  test.each([
    ['active', ['workspace.branch-workspace.cancel'], ['workspace.branch-workspace.delete']],
    [
      'create-incomplete',
      ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.retry'],
      ['workspace.branch-workspace.delete'],
    ],
    [
      'needs-repair',
      ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.repair'],
      ['workspace.branch-workspace.delete'],
    ],
    [
      'delete-incomplete',
      ['workspace.branch-workspace.inspect', 'workspace.branch-workspace.continue-delete'],
      ['workspace.branch-workspace.open-editor'],
    ],
  ] as const)('exposes the exact %s lifecycle actions', (lifecycle, present, absent) => {
    act(() =>
      root.render(
        withTerminalContexts(
          <BranchWorkspaceList
            rootId="/workspace"
            items={[workspace(lifecycle)]}
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
    for (const label of present) expect(container.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    for (const label of absent) expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull()
  })

  test('offers root-scoped actions and restores an existing internal terminal', async () => {
    const item = workspace('ready')
    const terminalKey = `/workspace\0${item.path}`
    const session = terminalSession(terminalKey)
    const onActivate = vi.fn()
    const selectTerminal = vi.fn<TerminalSessionContextValue['selectTerminal']>()
    const createTerminal = vi.fn<TerminalSessionContextValue['createTerminal']>(async () => 'new-terminal')
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
          { selectTerminal, createTerminal, closeTerminal },
        ),
      ),
    )
    const row = container.querySelector('[data-branch-workspace-lifecycle="ready"]')
    if (!(row instanceof HTMLElement)) throw new Error('missing branch workspace row')

    expect((await openContextMenu(row)).map((menuItem) => menuItem.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'terminal.external',
      'terminal.internal',
      'terminal.close-all',
    ])

    await clickContextMenuItem(row, 'worktrees.open-in-editor-label')
    await clickContextMenuItem(row, 'terminal.external')
    await clickContextMenuItem(row, 'terminal.internal')

    expect(folderActionState.editorOnSelect).toHaveBeenCalledTimes(1)
    expect(folderActionState.externalTerminalOnSelect).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledWith(item.id)
    expect(selectTerminal).toHaveBeenCalledWith(terminalKey, session.key)
    expect(createTerminal).not.toHaveBeenCalled()

    await requestCloseAllFromContextMenu(row)
    expect(closeTerminal).not.toHaveBeenCalled()
    await confirmCloseAll()
    expect(closeTerminal).toHaveBeenCalledWith(session.key, {
      repoRoot: '/workspace',
      worktreePath: item.path,
    })
  })

  test.each(['active', 'create-incomplete', 'needs-repair', 'delete-incomplete'] as const)(
    'keeps folder-open context actions disabled for a %s branch workspace',
    async (lifecycle) => {
      act(() =>
        root.render(
          withTerminalContexts(
            <BranchWorkspaceList
              rootId="/workspace"
              items={[workspace(lifecycle)]}
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
      const row = container.querySelector(`[data-branch-workspace-lifecycle="${lifecycle}"]`)
      if (!(row instanceof HTMLElement)) throw new Error('missing branch workspace row')

      const items = await openContextMenu(row)
      expect(items.slice(0, 3).every((item) => item.hasAttribute('data-disabled'))).toBe(true)
    },
  )
})

function withTerminalContexts(
  children: ReactNode,
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot> = new Map(),
  overrides: {
    selectTerminal?: TerminalSessionContextValue['selectTerminal']
    createTerminal?: TerminalSessionContextValue['createTerminal']
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
  closeTerminal?: TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']
}): TerminalSessionContextValue {
  return {
    createTerminal: overrides.createTerminal ?? vi.fn(async () => ''),
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

function workspace(lifecycle: BranchWorkspaceLifecycle): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    lifecycle,
    available: lifecycle !== 'delete-incomplete',
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
    ...(lifecycle === 'active'
      ? { activeOperation: { kind: 'create', currentStep: 1, completedCount: 0, totalCount: 2, cancellable: true } }
      : {}),
  }
}

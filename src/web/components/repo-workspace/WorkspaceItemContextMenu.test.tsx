// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceItemContextMenu } from '#/web/components/repo-workspace/WorkspaceItemContextMenu.tsx'
import type { WorkspaceListItemAction } from '#/web/components/repo-workspace/WorkspaceListItem.tsx'
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

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    key === 'terminal.close-all-confirm-body' ? `${key}:${params?.count ?? 0}` : key,
}))

let container: HTMLDivElement
let root: Root
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorkspaceItemContextMenu', () => {
  test('renders the fixed action order and dispatches each open action', async () => {
    const editor = vi.fn()
    const externalTerminal = vi.fn()
    const internalTerminal = vi.fn()
    const tmuxTerminal = vi.fn()
    const restoreTmuxTerminals = vi.fn()
    const createWorktree = vi.fn()
    const sync = vi.fn()
    renderMenu({
      editor,
      externalTerminal,
      internalTerminal,
      tmuxTerminal,
      restoreTmuxTerminals,
      actions: [
        contextAction('createWorktree', 'action.create-worktree', createWorktree),
        contextAction('sync', 'action.refresh', sync),
      ],
    })

    expect((await openContextMenu()).map((item) => item.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'terminal.external',
      'terminal.internal',
      'terminal.new-with-tmux',
      'terminal.restore-directory-tmux',
      'action.create-worktree',
      'action.refresh',
      'terminal.close-all',
    ])

    await clickContextMenuItem('worktrees.open-in-editor-label')
    await clickContextMenuItem('terminal.external')
    await clickContextMenuItem('terminal.internal')
    await clickContextMenuItem('terminal.new-with-tmux')
    await clickContextMenuItem('terminal.restore-directory-tmux')
    await clickContextMenuItem('action.create-worktree')
    await clickContextMenuItem('action.refresh')

    expect(editor).toHaveBeenCalledTimes(1)
    expect(externalTerminal).toHaveBeenCalledTimes(1)
    expect(internalTerminal).toHaveBeenCalledTimes(1)
    expect(tmuxTerminal).toHaveBeenCalledTimes(1)
    expect(restoreTmuxTerminals).toHaveBeenCalledTimes(1)
    expect(createWorktree).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  test('keeps unavailable and busy open actions visible but disabled', async () => {
    renderMenu({
      editorDisabled: true,
      externalTerminalBusy: true,
      internalTerminalDisabled: true,
      actions: [
        contextAction('createWorktree', 'action.create-worktree', vi.fn(), { disabled: true }),
        contextAction('sync', 'action.refresh', vi.fn(), { busy: true }),
      ],
    })

    const items = await openContextMenu()

    expect(itemByText(items, 'worktrees.open-in-editor-label').hasAttribute('data-disabled')).toBe(true)
    expect(itemByText(items, 'terminal.external').hasAttribute('data-disabled')).toBe(true)
    expect(itemByText(items, 'terminal.internal').hasAttribute('data-disabled')).toBe(true)
    expect(itemByText(items, 'action.create-worktree').hasAttribute('data-disabled')).toBe(true)
    expect(itemByText(items, 'action.refresh').hasAttribute('data-disabled')).toBe(true)
    expect(itemByText(items, 'terminal.close-all').hasAttribute('data-disabled')).toBe(true)
  })

  test('keeps detached recovery visible but independently disabled', async () => {
    renderMenu({ restoreTmuxDisabled: true })

    const items = await openContextMenu()

    expect(itemByText(items, 'terminal.new-with-tmux').hasAttribute('data-disabled')).toBe(false)
    expect(itemByText(items, 'terminal.restore-directory-tmux').hasAttribute('data-disabled')).toBe(true)
  })

  test('confirms the live aggregate count before closing every current scoped session', async () => {
    const rootKey = '/workspace\0/workspace'
    const memberKey = '/workspace/api\0/worktrees/api-feature'
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
    renderMenu({
      worktreeTerminalKeys: [rootKey, memberKey],
      snapshots: new Map([
        [rootKey, worktreeSnapshot(rootKey, [terminalSession(rootKey, 1)])],
        [memberKey, worktreeSnapshot(memberKey, [terminalSession(memberKey, 1), terminalSession(memberKey, 2)])],
      ]),
      closeTerminal,
    })

    await clickContextMenuItem('terminal.close-all')

    expect(closeTerminal).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('terminal.close-all-confirm-body:3')

    await act(async () => {
      buttonByText('terminal.close-all-confirm-confirm').click()
      await Promise.resolve()
    })

    expect(closeTerminal.mock.calls).toEqual([
      [`${rootKey}\0terminal-1`, { repoRoot: '/workspace', worktreePath: '/workspace' }],
      [`${memberKey}\0terminal-1`, { repoRoot: '/workspace/api', worktreePath: '/worktrees/api-feature' }],
      [`${memberKey}\0terminal-2`, { repoRoot: '/workspace/api', worktreePath: '/worktrees/api-feature' }],
    ])
  })
})

function renderMenu(
  fixture: {
    editor?: () => void
    externalTerminal?: () => void
    internalTerminal?: () => void
    tmuxTerminal?: () => void
    restoreTmuxTerminals?: () => void
    restoreTmuxDisabled?: boolean
    editorDisabled?: boolean
    externalTerminalBusy?: boolean
    internalTerminalDisabled?: boolean
    worktreeTerminalKeys?: string[]
    snapshots?: ReadonlyMap<string, WorktreeTerminalSnapshot>
    closeTerminal?: ReturnType<typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>>
    actions?: WorkspaceListItemAction[]
  } = {},
): void {
  const closeTerminal =
    fixture.closeTerminal ?? vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
  act(() => {
    root.render(
      <TerminalSessionContext.Provider value={terminalCommandContext(closeTerminal)}>
        <TerminalSessionReadContext.Provider value={terminalReadContext(fixture.snapshots ?? new Map())}>
          <WorkspaceItemContextMenu
            editor={{
              disabled: fixture.editorDisabled ?? false,
              icon: <span data-testid="editor-icon" />,
              onSelect: fixture.editor ?? vi.fn(),
            }}
            externalTerminal={{
              disabled: false,
              busy: fixture.externalTerminalBusy,
              icon: <span data-testid="external-terminal-icon" />,
              onSelect: fixture.externalTerminal ?? vi.fn(),
            }}
            internalTerminal={{
              disabled: fixture.internalTerminalDisabled ?? false,
              icon: <span data-testid="internal-terminal-icon" />,
              onSelect: fixture.internalTerminal ?? vi.fn(),
            }}
            tmuxTerminal={{
              disabled: fixture.internalTerminalDisabled ?? false,
              icon: <span data-testid="tmux-terminal-icon" />,
              onSelect: fixture.tmuxTerminal ?? vi.fn(),
            }}
            restoreTmuxTerminals={{
              disabled: fixture.restoreTmuxDisabled ?? false,
              icon: <span data-testid="restore-tmux-terminals-icon" />,
              onSelect: fixture.restoreTmuxTerminals ?? vi.fn(),
            }}
            actions={fixture.actions}
            worktreeTerminalKeys={fixture.worktreeTerminalKeys ?? []}
          >
            <button type="button">item trigger</button>
          </WorkspaceItemContextMenu>
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
}

function contextAction(
  id: string,
  label: string,
  onSelect: () => void,
  state: Partial<Pick<WorkspaceListItemAction, 'disabled' | 'busy'>> = {},
): WorkspaceListItemAction {
  return {
    id,
    label,
    icon: <span data-testid={`${id}-icon`} />,
    disabled: state.disabled ?? false,
    busy: state.busy,
    visible: true,
    onSelect,
  }
}

async function openContextMenu(): Promise<HTMLElement[]> {
  await act(async () => {
    buttonByText('item trigger').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }),
    )
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function clickContextMenuItem(text: string): Promise<void> {
  const items = await openContextMenu()
  await act(async () => {
    itemByText(items, text).click()
    await Promise.resolve()
  })
}

function itemByText(items: HTMLElement[], text: string): HTMLElement {
  const item = items.find((candidate) => candidate.textContent?.includes(text))
  if (!item) throw new Error(`missing context menu item: ${text}`)
  return item
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(text),
  )
  if (!button) throw new Error(`missing button: ${text}`)
  return button
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

function terminalCommandContext(
  closeTerminal: ReturnType<typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>>,
): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    restoreTmuxSessions: vi.fn(async () => 0),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    scrollByTouch: vi.fn(),
    beginMobileSelection: vi.fn(() => false),
    extendMobileSelection: vi.fn(),
    finishMobileSelection: vi.fn(),
    cancelMobileSelection: vi.fn(),
    mobileSelectionText: vi.fn(() => ''),
    clearMobileSelection: vi.fn(),
    writeExtraKey: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: closeTerminal,
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

function terminalSession(worktreeTerminalKey: string, index: number): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-${index}`,
    worktreeTerminalKey,
    terminalId: `terminal-${index}`,
    index,
    title: `terminal ${index}`,
    phase: 'open',
    selected: index === 1,
    hasBell: false,
  }
}

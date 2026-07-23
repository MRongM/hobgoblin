// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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
import { TerminalScopeContextMenu } from '#/web/components/terminal/TerminalScopeContextMenu.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    key === 'terminal.close-all-confirm-body' ? `${key}:${params?.count ?? 0}` : key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
type CloseTerminalMock = ReturnType<typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>>

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('TerminalScopeContextMenu', () => {
  test('keeps close all terminals visible but disabled for an empty scope', async () => {
    renderMenu([], new Map(), vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>())

    const item = await openContextMenu()

    expect(item.textContent).toContain('terminal.close-all')
    expect(item.hasAttribute('data-disabled')).toBe(true)
  })

  test('confirms the aggregate live count before closing every current scoped session', async () => {
    const rootKey = '/workspace\0/workspace'
    const memberKey = '/workspace/api\0/worktrees/api-feature'
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
    renderMenu(
      [rootKey, memberKey],
      new Map([
        [rootKey, worktreeSnapshot(rootKey, [terminalSession(rootKey, 1)])],
        [memberKey, worktreeSnapshot(memberKey, [terminalSession(memberKey, 1), terminalSession(memberKey, 2)])],
      ]),
      closeTerminal,
    )

    const item = await openContextMenu()
    await act(async () => {
      item.click()
      await Promise.resolve()
    })

    expect(closeTerminal).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('terminal.close-all-confirm-body:3')

    const confirm = buttonByText('terminal.close-all-confirm-confirm')
    await act(async () => {
      confirm.click()
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
  worktreeTerminalKeys: string[],
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot>,
  closeTerminal: CloseTerminalMock,
) {
  const readContext = terminalReadContext(snapshots)
  const commandContext = terminalCommandContext(closeTerminal)
  act(() => {
    root!.render(
      <TerminalSessionContext.Provider value={commandContext}>
        <TerminalSessionReadContext.Provider value={readContext}>
          <TerminalScopeContextMenu worktreeTerminalKeys={worktreeTerminalKeys}>
            <button type="button">scope trigger</button>
          </TerminalScopeContextMenu>
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
}

async function openContextMenu(): Promise<HTMLElement> {
  const trigger = buttonByText('scope trigger')
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
    candidate.textContent?.includes('terminal.close-all'),
  )
  if (!item) throw new Error('missing close all terminals context menu item')
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

function terminalCommandContext(closeTerminal: CloseTerminalMock): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
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

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  BranchWorkspaceTerminalPanel,
  openBranchWorkspaceInternalTerminal,
} from '#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'

const ROOT = '/workspace'
const PATH = '/workspace/goblin-feature'
const WORKTREE_KEY = worktreeTerminalKey(ROOT, PATH)
const createTerminal = vi.fn(async () => `${WORKTREE_KEY}\0terminal-1`)
const selectTerminal = vi.fn()
const closeTerminalAndDismissDetailIfLast = vi.fn()
const reorderSessions = vi.fn(async () => true)
const terminalTabsProps: Array<Record<string, unknown>> = []
let snapshot = { worktreeTerminalKey: WORKTREE_KEY, sessions: [], selectedDescriptor: null, count: 0 } as any
let requestedWorktreeKey: string | null = null

vi.mock('#/web/components/terminal/terminal-session-context.ts', () => ({
  useTerminalSessionContext: () => ({
    createTerminal,
    selectTerminal,
    scrollToBottom: vi.fn(),
    focusTerminal: vi.fn(),
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  }),
}))

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalSnapshot: (key: string) => {
    requestedWorktreeKey = key
    return snapshot
  },
}))

vi.mock('#/web/components/terminal/TerminalTabs.tsx', () => ({
  EMPTY_TERMINAL_TAB_FOCUS_KEY: 'empty',
  TerminalTabs: (props: Record<string, unknown>) => {
    terminalTabsProps.push(props)
    return <div data-testid="terminal-tabs" />
  },
}))

vi.mock('#/web/components/terminal/TerminalSlot.tsx', () => ({
  TerminalSlot: (props: Record<string, unknown>) => (
    <div data-testid="terminal-slot" data-props={JSON.stringify(props)} />
  ),
}))

vi.mock('#/web/components/tab-strip/useFocusRegistry.ts', () => ({
  useFocusRegistry: () => ({ register: vi.fn(), unregister: vi.fn() }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))
vi.mock('#/web/components/repo-workspace/FocusProjectSwitcher.tsx', () => ({
  FocusProjectSwitcher: () => <div data-testid="focus-project-switcher" />,
}))
vi.mock('#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx', () => ({
  WorkspaceRepositorySwitcher: () => <div data-testid="workspace-repository-switcher" />,
}))
vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
}))

let root: Root | null = null
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  createTerminal.mockClear()
  selectTerminal.mockClear()
  closeTerminalAndDismissDetailIfLast.mockClear()
  reorderSessions.mockClear()
  terminalTabsProps.length = 0
  requestedWorktreeKey = null
  snapshot = { worktreeTerminalKey: WORKTREE_KEY, sessions: [], selectedDescriptor: null, count: 0 }
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  root = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceTerminalPanel', () => {
  test('groups the panel by the branch folder and creates an authorized target', async () => {
    await renderPanel()

    expect(requestedWorktreeKey).toBe(WORKTREE_KEY)
    await act(async () => {
      await (terminalTabsProps.at(-1)?.onNew as () => Promise<void>)()
    })
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: ROOT,
        branch: 'feature/auth',
        worktreePath: PATH,
        targetKind: 'branch-workspace',
        branchWorkspaceId: 'branch-1',
      },
      'native',
    )
  })

  test('renders the selected root-scoped session in the shared terminal slot', async () => {
    snapshot = {
      worktreeTerminalKey: WORKTREE_KEY,
      count: 1,
      sessions: [],
      selectedDescriptor: {
        key: `${WORKTREE_KEY}\0terminal-1`,
        worktreeTerminalKey: WORKTREE_KEY,
        terminalId: 'terminal-1',
        index: 1,
        repoRoot: ROOT,
        branch: 'feature/auth',
        worktreePath: PATH,
      },
    }

    await renderPanel()

    const slot = container.querySelector<HTMLElement>('[data-testid="terminal-slot"]')
    expect(JSON.parse(slot?.dataset.props ?? '{}')).toEqual({
      repoRoot: ROOT,
      branch: 'feature/auth',
      worktreePath: PATH,
    })
  })

  test('mounts the terminal slot while the first terminal creation is pending', async () => {
    snapshot = { ...snapshot, creating: true }

    await renderPanel()

    const slot = container.querySelector<HTMLElement>('[data-testid="terminal-slot"]')
    expect(JSON.parse(slot?.dataset.props ?? '{}')).toEqual({
      repoRoot: ROOT,
      branch: 'feature/auth',
      worktreePath: PATH,
    })
  })

  test('leaves the terminal content empty when no session is selected', async () => {
    await renderPanel()

    expect(container.querySelector('[data-testid="terminal-slot"]')).toBeNull()
    expect(container.textContent).not.toContain('terminal.label')
    expect(container.textContent).not.toContain('terminal.new')
  })

  test('does not expose terminal focus from the terminal toolbar', async () => {
    await renderPanel()

    expect(container.querySelector('button[aria-label="terminal.focus"]')).toBeNull()
    expect(createTerminal).not.toHaveBeenCalled()
  })

  test('uses draggable project topbar chrome in the desktop split', async () => {
    await renderPanel()

    const toolbar = container.querySelector<HTMLElement>('[data-testid="branch-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('39px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).not.toContain('bg-toolbar')
    expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
  })

  test('exits terminal focus through the focused toolbar control', async () => {
    const onExitTerminalFocus = vi.fn()
    await renderPanel({ terminalFocusMode: true, onExitTerminalFocus })

    expect(container.querySelector('[data-testid="focus-project-switcher"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="workspace-repository-switcher"]')).not.toBeNull()
    const toolbar = container.querySelector<HTMLElement>('[data-testid="branch-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('39px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).toContain('topbar')
    expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
    expect(terminalTabsProps.at(-1)?.focusMode).toBe(true)

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="terminal.exit-focus"]')?.click())

    expect(onExitTerminalFocus).toHaveBeenCalledTimes(1)
    expect(createTerminal).not.toHaveBeenCalled()
  })
})

describe('openBranchWorkspaceInternalTerminal', () => {
  test('restores the selected root session without creating another terminal', async () => {
    const activate = vi.fn()
    const selectedKey = `${WORKTREE_KEY}\0terminal-2`
    await openBranchWorkspaceInternalTerminal(branchWorkspaceContext(), {
      activate,
      worktreeSnapshot: () => ({
        worktreeTerminalKey: WORKTREE_KEY,
        count: 1,
        sessions: [{ key: selectedKey, selected: true } as any],
        selectedDescriptor: { key: selectedKey } as any,
      }),
      selectTerminal,
      createTerminal,
    })

    expect(activate).toHaveBeenCalledTimes(1)
    expect(selectTerminal).toHaveBeenCalledWith(WORKTREE_KEY, selectedKey)
    expect(createTerminal).not.toHaveBeenCalled()
  })

  test('creates a terminal only when the root-scoped group is empty', async () => {
    const activate = vi.fn()
    await openBranchWorkspaceInternalTerminal(branchWorkspaceContext(), {
      activate,
      worktreeSnapshot: () => ({
        worktreeTerminalKey: WORKTREE_KEY,
        count: 0,
        sessions: [],
        selectedDescriptor: null,
      }),
      selectTerminal,
      createTerminal,
    })

    expect(activate).toHaveBeenCalledTimes(1)
    expect(selectTerminal).not.toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledTimes(1)
  })

  test('explicit tmux launch always creates a new root-scoped terminal', async () => {
    const activate = vi.fn()
    await openBranchWorkspaceInternalTerminal(
      branchWorkspaceContext(),
      {
        activate,
        worktreeSnapshot: () => ({
          worktreeTerminalKey: WORKTREE_KEY,
          count: 1,
          sessions: [{ key: `${WORKTREE_KEY}\0terminal-1`, selected: true } as any],
          selectedDescriptor: { key: `${WORKTREE_KEY}\0terminal-1` } as any,
        }),
        selectTerminal,
        createTerminal,
      },
      'tmux-if-available',
    )

    expect(selectTerminal).not.toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledWith(expect.any(Object), 'tmux-if-available')
  })
})

async function renderPanel(
  props: {
    terminalFocusMode?: boolean
    onExitTerminalFocus?: () => void
  } = {},
) {
  await act(async () => {
    root!.render(<BranchWorkspaceTerminalPanel context={branchWorkspaceContext()} {...props} />)
    await Promise.resolve()
  })
}

function branchWorkspaceContext() {
  return {
    rootId: ROOT,
    id: 'branch-1',
    branch: 'feature/auth',
    path: PATH,
    available: true,
    busy: false,
    managedRootNames: ['api'],
  }
}

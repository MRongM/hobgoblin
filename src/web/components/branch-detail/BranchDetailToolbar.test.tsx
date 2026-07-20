// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchDetailToolbar } from '#/web/components/branch-detail/BranchDetailToolbar.tsx'
import { getSelectedBranchDetailPresentation } from '#/web/components/branch-detail/model.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  TerminalDescriptor,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'
import { MainWindowNavigationProvider, type MainWindowNavigationActions } from '#/web/main-window-navigation.tsx'
import { emptyRendererBridgeBootstrap, setRendererBridgeForTests } from '#/web/renderer-bridge.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { DEFAULT_WORKSPACE_LAYOUT } from '#/shared/workspace-layout.ts'
import type { RendererBridge } from '#/web/renderer-bridge-types.ts'
import type { RepoWorkspaceLayout } from '#/web/stores/repos/types.ts'

let compactUi = false

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => compactUi,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
}))

// Focus-mode branch controls live in their own component with their own
// providers (commit drafts etc.); this suite only exercises the toolbar,
// so the mock is just a placement marker.
vi.mock('#/web/components/topbar/TopbarRepoControls.tsx', () => ({
  TopbarRepoControls: ({
    focusPresentation,
    tone = 'topbar',
  }: {
    focusPresentation?: boolean
    tone?: 'topbar' | 'toolbar'
  }) => (focusPresentation ? <div data-testid="topbar-repo-controls" data-tone={tone} /> : null),
}))

vi.mock('#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx', () => ({
  WorkspaceRepositorySwitcher: ({ compact }: { compact?: boolean }) => (
    <div data-testid="workspace-repository-switcher" data-compact={String(!!compact)} />
  ),
}))

vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
  cb(0)
  return 1
}) as typeof requestAnimationFrame)

const REPO_ID = '/tmp/gbl-branch-detail-toolbar-repo'
const SECOND_REPO_ID = '/tmp/gbl-branch-detail-toolbar-repo-b'
const WORKTREE_PATH = '/tmp/gbl-branch-detail-toolbar-worktree'

let container: HTMLDivElement | null = null
let root: Root | null = null
let queryClient: QueryClient | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  compactUi = false
  resetReposStore()
  setRendererBridgeForTests(null)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  queryClient = null
  setRendererBridgeForTests(null)
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchDetailToolbar', () => {
  test('does not render a status detail tab', async () => {
    const { container: c } = renderToolbar({ terminalCount: 0, navigation: navigationWith({}) })

    expect(c.textContent).not.toContain('tab.status')
    expect(c.querySelector(`[role="tab"][id$="-status-tab"]`)).toBeNull()
  })

  test('renders terminal area without moved status or changes tabs', () => {
    const { container: c } = renderToolbar({ terminalCount: 0, changeCount: 3, navigation: navigationWith({}) })

    expect(c.querySelector('#detail-status-tab')).toBeNull()
    expect(c.querySelector('#detail-changes-tab')).toBeNull()
    // With zero sessions the terminal area renders the icon-only
    // new-terminal button, still addressable as the terminal tab.
    expect(c.querySelector('#detail-terminal-tab')).not.toBeNull()
  })

  test('keeps terminal tabs content-sized beside the flexible detail toolbar blank area', () => {
    const { container: c } = renderToolbar({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({}),
    })

    const terminalTab = c.querySelector<HTMLElement>('[data-terminal-tab-tooltip-id="t1"]')
    const scrollArea = terminalTab?.closest('.relative.overflow-hidden')
    const terminalHost = scrollArea?.parentElement
    const spacer = terminalHost?.nextElementSibling

    expect(terminalHost?.className).not.toContain('flex-1')
    expect(spacer?.className).toContain('min-w-2')
    expect(spacer?.className).toContain('flex-1')
    expect(spacer?.className).not.toContain('shrink-0')
  })

  test('clicking the new-terminal button navigates and creates a terminal', async () => {
    const showRepoDetailTab = vi.fn()
    const { terminalTab, mocks } = renderToolbar({
      terminalCount: 0,
      navigation: navigationWith({ showRepoDetailTab }),
    })

    act(() => {
      terminalTab.click()
    })
    await flush()

    expect(showRepoDetailTab).toHaveBeenCalledWith(REPO_ID, 'terminal')
    expect(mocks.createTerminal).toHaveBeenCalledTimes(1)
  })

  test('clicking a selected session tab when not in terminal panel navigates to terminal', async () => {
    const showRepoDetailTab = vi.fn()
    const { terminalTab, mocks } = renderToolbar({
      terminalCount: 2,
      navigation: navigationWith({ showRepoDetailTab }),
    })

    act(() => {
      terminalTab.click()
    })
    await flush()

    expect(showRepoDetailTab).toHaveBeenCalledWith(REPO_ID, 'terminal')
    expect(mocks.createTerminal).not.toHaveBeenCalled()
    expect(mocks.selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 't1')
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t1')
  })

  test('clicking a selected session tab in terminal panel scrolls to bottom', async () => {
    const showRepoDetailTab = vi.fn()
    const { terminalTab, mocks } = renderToolbar({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({ showRepoDetailTab }),
    })

    act(() => {
      terminalTab.click()
    })
    await flush()

    expect(showRepoDetailTab).not.toHaveBeenCalled()
    expect(mocks.createTerminal).not.toHaveBeenCalled()
    expect(mocks.selectTerminal).not.toHaveBeenCalled()
    expect(mocks.scrollToBottom).toHaveBeenCalledWith('t1')
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t1')
  })

  test('clicking an unselected session tab navigates and selects it', async () => {
    const showRepoDetailTab = vi.fn()
    const { container: c, mocks } = renderToolbar({
      terminalCount: 2,
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const unselectedTab = c.querySelector<HTMLButtonElement>('[data-terminal-tab-tooltip-id="t2"] button[role="tab"]')
    expect(unselectedTab).not.toBeNull()

    act(() => {
      unselectedTab?.click()
    })
    await flush()

    expect(showRepoDetailTab).toHaveBeenCalledWith(REPO_ID, 'terminal')
    expect(mocks.createTerminal).not.toHaveBeenCalled()
    expect(mocks.selectTerminal).toHaveBeenCalledWith(`${REPO_ID}\0${WORKTREE_PATH}`, 't2')
    expect(mocks.focusTerminal).toHaveBeenCalledWith('t2')
  })

  test('does not show branch actions in the detail bar (actions moved to branch rows)', () => {
    const { container: c } = renderToolbar({
      terminalCount: 0,
      navigation: navigationWith({}),
    })

    expect(c.querySelector('button[aria-label="action.menu"]')).toBeNull()
    expect(c.querySelector('[data-testid="branch-detail-toolbar-divider"]')).toBeNull()
  })

  test('renders neither the focus entry nor the collapse control in left-right layout', () => {
    const { container: c } = renderToolbar({
      terminalCount: 1,
      detailTab: 'terminal',
      layout: 'left-right',
      navigation: navigationWith({}),
    })

    // The sidebar collapse control owns focus-mode entry, so the toolbar
    // no longer renders its own maximize toggle.
    const focusButton = c.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.focus"]')
    const collapseButton = c.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.collapse"]')

    expect(focusButton).toBeNull()
    expect(collapseButton).toBeNull()
  })

  test('marks the desktop left-right detail toolbar as a window drag region', () => {
    const { container: c } = renderToolbar({
      terminalCount: 1,
      detailTab: 'terminal',
      layout: 'left-right',
      navigation: navigationWith({}),
    })

    const toolbar = c.firstElementChild
    expect((toolbar as HTMLElement | null)?.style.height).toBe('39px')
    expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('border-topbar-border')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).toContain('text-topbar-foreground')
  })

  test('keeps the compact detail toolbar on the generic toolbar tone', () => {
    compactUi = true
    const { container: c } = renderToolbar({
      terminalCount: 1,
      detailTab: 'terminal',
      layout: 'left-right',
      navigation: navigationWith({}),
    })

    const toolbar = c.firstElementChild as HTMLElement | null
    expect(toolbar?.style.height).toBe('41px')
    expect(toolbar?.className).toContain('bg-toolbar')
    expect(toolbar?.className).not.toContain('topbar-tone')
  })

  test('does not render the removed terminal redraw control', () => {
    const { container: c } = renderToolbar({
      terminalCount: 1,
      detailTab: 'terminal',
      navigation: navigationWith({}),
    })

    const redrawButton = c.querySelector<HTMLButtonElement>('button[aria-label="terminal.redraw"]')
    const focusButton = c.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.focus"]')

    expect(redrawButton).toBeNull()
    expect(focusButton).toBeNull()
  })

  test('does not render browser or LAN QR actions after they move to the status bar', () => {
    const { container: c } = renderToolbar({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({}),
    })

    const qrButton = c.querySelector<HTMLButtonElement>('button[aria-label="terminal.lan-qr"]')
    const browserButton = c.querySelector<HTMLButtonElement>('button[aria-label="terminal.open-in-browser"]')

    expect(qrButton).toBeNull()
    expect(browserButton).toBeNull()
  })

  test('keeps the compact terminal switcher focused when pressing End', async () => {
    compactUi = true
    const showRepoDetailTab = vi.fn()
    const { container: c } = renderToolbar({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const terminalTab = c.querySelector<HTMLButtonElement>('#detail-terminal-tab')
    expect(terminalTab).not.toBeNull()

    act(() => {
      terminalTab?.focus()
      terminalTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    await flush()

    expect(showRepoDetailTab).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('detail-terminal-tab')
    expect(terminalTab?.getAttribute('aria-haspopup')).toBe('menu')
  })

  test('does not render the project switcher outside focus mode', () => {
    const { container: c } = renderToolbar({ terminalCount: 0, navigation: navigationWith({}) })

    expect(c.querySelector('[data-testid="focus-project-switcher"]')).toBeNull()
  })

  test('focus mode shows the project switcher with the active project name', () => {
    const { container: c } = renderToolbar({
      terminalCount: 0,
      detailFocusMode: true,
      navigation: navigationWith({}),
    })

    const trigger = c.querySelector<HTMLButtonElement>('[data-testid="focus-project-switcher"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain('repo')
  })

  test('focus mode places repository and branch controls after the project switcher', () => {
    const { container: c } = renderToolbar({
      terminalCount: 0,
      detailFocusMode: true,
      navigation: navigationWith({}),
    })

    const switcher = c.querySelector('[data-testid="focus-project-switcher"]')
    const repositorySwitcher = c.querySelector('[data-testid="workspace-repository-switcher"]')
    const controls = c.querySelector('[data-testid="topbar-repo-controls"]')
    expect(switcher).not.toBeNull()
    expect(repositorySwitcher).not.toBeNull()
    expect(controls).not.toBeNull()
    expect(switcher?.nextElementSibling).toBe(repositorySwitcher)
    expect(repositorySwitcher?.nextElementSibling).toBe(controls)
  })

  test('does not render the branch controls outside focus mode', () => {
    const { container: c } = renderToolbar({ terminalCount: 0, navigation: navigationWith({}) })

    expect(c.querySelector('[data-testid="topbar-repo-controls"]')).toBeNull()
  })

  test('compact focus presentation shows context controls without persisting focus mode', async () => {
    compactUi = true
    const onShowCompactExplorer = vi.fn()
    const { container: c } = renderToolbar({
      terminalCount: 0,
      detailFocusMode: false,
      compactFocusPresentation: true,
      layout: 'top-bottom',
      onShowCompactExplorer,
      navigation: navigationWith({}),
    })

    const workspaceButton = c.querySelector<HTMLButtonElement>('button[aria-label="mobile.open-workspace"]')
    expect(workspaceButton).not.toBeNull()
    expect(c.querySelector('[data-testid="focus-project-switcher"]')).not.toBeNull()
    expect(c.querySelector('[data-testid="workspace-repository-switcher"]')?.getAttribute('data-compact')).toBe(
      'true',
    )
    expect(c.querySelector('[data-testid="topbar-repo-controls"]')).not.toBeNull()
    expect(c.querySelector('button[aria-label="branch-detail.collapse"]')).toBeNull()

    act(() => {
      workspaceButton?.click()
    })
    await flush()

    expect(onShowCompactExplorer).toHaveBeenCalledTimes(1)
    expect(useReposStore.getState().detailFocusMode).toBe(false)
    expect(useReposStore.getState().detailCollapsed).toBe(false)
  })

  test('compact context rail uses generic toolbar tone', () => {
    compactUi = true
    const { container: c } = renderToolbar({
      terminalCount: 0,
      compactFocusPresentation: true,
      navigation: navigationWith({}),
    })

    const projectSwitcher = c.querySelector<HTMLButtonElement>('[data-testid="focus-project-switcher"]')
    const projectChevron = projectSwitcher?.querySelectorAll('svg').item(1)
    const repoControls = c.querySelector<HTMLElement>('[data-testid="topbar-repo-controls"]')
    expect(projectChevron?.classList.contains('text-muted-foreground')).toBe(true)
    expect(projectChevron?.classList.contains('text-topbar-muted-foreground')).toBe(false)
    expect(repoControls?.dataset.tone).toBe('toolbar')
  })

  test('focus switcher lists open projects and activates the selected one', async () => {
    const activateRepo = vi.fn()
    const { container: c } = renderToolbar({
      terminalCount: 0,
      detailFocusMode: true,
      navigation: navigationWith({ activateRepo }),
    })

    act(() => {
      useReposStore.setState((s) => ({
        repos: { ...s.repos, [SECOND_REPO_ID]: emptyRepo(SECOND_REPO_ID, 'other-repo') },
        order: [...s.order, SECOND_REPO_ID],
      }))
    })

    await act(async () => {
      c.querySelector<HTMLButtonElement>('[data-testid="focus-project-switcher"]')?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      )
      await Promise.resolve()
    })

    const items = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    expect(items).toHaveLength(2)
    expect(items[0]?.getAttribute('aria-current')).toBe('true')
    expect(items[1]?.textContent).toContain('other-repo')

    // Selecting the already-active project is a no-op.
    await act(async () => {
      items[0]?.click()
      await Promise.resolve()
    })
    expect(activateRepo).not.toHaveBeenCalled()

    await act(async () => {
      c.querySelector<HTMLButtonElement>('[data-testid="focus-project-switcher"]')?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      )
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => item.textContent?.includes('other-repo'))
        ?.click()
      await Promise.resolve()
    })

    expect(activateRepo).toHaveBeenCalledWith(SECOND_REPO_ID)
  })

  test('keeps terminal focus when keyboard navigation leaves terminal tabs', async () => {
    const showRepoDetailTab = vi.fn()
    const { container: c } = renderToolbar({
      terminalCount: 2,
      detailTab: 'terminal',
      navigation: navigationWith({ showRepoDetailTab }),
    })

    const terminalTab = c.querySelector<HTMLButtonElement>('#detail-terminal-tab')
    if (!terminalTab) throw new Error('missing terminal tab')

    act(() => {
      terminalTab.focus()
      terminalTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    await flush()
    expect(showRepoDetailTab).not.toHaveBeenCalledWith(REPO_ID, 'status')
    expect(document.activeElement).toBe(terminalTab)
  })
})

function renderToolbar(options: {
  terminalCount: number
  changeCount?: number
  navigation: MainWindowNavigationActions
  detailTab?: 'status' | 'changes' | 'terminal'
  detailFocusMode?: boolean
  compactFocusPresentation?: boolean
  onShowCompactExplorer?: () => void
  collapsed?: boolean
  layout?: RepoWorkspaceLayout
}): {
  container: HTMLDivElement
  terminalTab: HTMLButtonElement
  mocks: {
    createTerminal: ReturnType<typeof vi.fn>
    selectTerminal: ReturnType<typeof vi.fn>
    scrollToBottom: ReturnType<typeof vi.fn>
    focusTerminal: ReturnType<typeof vi.fn>
    showRepoDetailTab: ReturnType<typeof vi.fn>
  }
} {
  const repo = seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('feature/worktree', { worktree: { path: WORKTREE_PATH } })],
    selectedBranch: 'feature/worktree',
    detailTab: options.detailTab ?? 'status',
    status:
      options.changeCount && options.changeCount > 0
        ? [
            {
              path: WORKTREE_PATH,
              branch: 'feature/worktree',
              isMain: false,
              entries: Array.from({ length: options.changeCount }, (_, index) => ({
                x: 'M',
                y: ' ',
                path: `src/file-${index}.ts`,
              })),
            },
          ]
        : [],
    statusLoaded: true,
  })
  const detail = getSelectedBranchDetailPresentation(repo)
  const sessions: TerminalSessionSummary[] = Array.from({ length: options.terminalCount }, (_, index) => ({
    key: `t${index + 1}`,
    worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
    terminalId: `t${index + 1}`,
    index: index + 1,
    title: `term-${index + 1}`,
    fullTitle: `full-term-${index + 1}`,
    phase: 'open' as const,
    selected: index === 0,
    hasBell: false,
  }))
  const selectedDescriptor: TerminalDescriptor | null = sessions[0]
    ? {
        key: sessions[0].key,
        worktreeTerminalKey: sessions[0].worktreeTerminalKey,
        terminalId: sessions[0].terminalId,
        index: sessions[0].index,
        repoRoot: REPO_ID,
        branch: 'feature/worktree',
        worktreePath: WORKTREE_PATH,
      }
    : null
  const worktreeSnapshot: WorktreeTerminalSnapshot = {
    worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
    selectedDescriptor,
    sessions,
    count: options.terminalCount,
  }
  const terminalSnapshot = { phase: 'opening' as const, message: null, processName: 'terminal' }
  const readContext: TerminalSessionReadContextValue = {
    worktreeSnapshot: () => worktreeSnapshot,
    subscribeWorktree: () => () => {},
    repoSyncReady: () => false,
    subscribeRepoSync: () => () => {},
    snapshot: () => terminalSnapshot,
    subscribeSnapshot: () => () => {},
  }
  const createTerminal = vi.fn(async () => 'key')
  const selectTerminal = vi.fn()
  const scrollToBottom = vi.fn()
  const focusTerminal = vi.fn()
  const showRepoDetailTab = vi.fn(options.navigation.showRepoDetailTab)
  const commandContext: TerminalSessionContextValue = {
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    scrollLines: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: vi.fn(() => []),
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

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  queryClient = new QueryClient()
  act(() => {
    root!.render(
      <QueryClientProvider client={queryClient!}>
        <MainWindowNavigationProvider value={options.navigation}>
          <TerminalSessionContext.Provider value={commandContext}>
            <TerminalSessionReadContext.Provider value={readContext}>
              <BranchDetailToolbar
                repo={repo}
                detail={detail}
                detailId="detail"
                contentId="content"
                collapsed={options.collapsed ?? false}
                detailFocusMode={options.detailFocusMode ?? false}
                compactFocusPresentation={options.compactFocusPresentation}
                layout={options.layout ?? DEFAULT_WORKSPACE_LAYOUT}
                onShowCompactExplorer={options.onShowCompactExplorer}
              />
            </TerminalSessionReadContext.Provider>
          </TerminalSessionContext.Provider>
        </MainWindowNavigationProvider>
      </QueryClientProvider>,
    )
  })

  const tab = container.querySelector<HTMLButtonElement>('#detail-terminal-tab')
  if (!tab) throw new Error('missing terminal tab')
  return {
    container,
    terminalTab: tab,
    mocks: {
      createTerminal,
      selectTerminal,
      scrollToBottom,
      focusTerminal,
      showRepoDetailTab,
    },
  }
}

function navigationWith(overrides: Partial<MainWindowNavigationActions>): MainWindowNavigationActions {
  return {
    activateRepo: () => {},
    closeRepo: () => {},
    cycleRepo: () => {},
    selectRepoBranch: () => {},
    showRepoDetailTab: () => {},
    showRepoBranchDetailTab: () => {},
    openSettings: () => {},
    ...overrides,
  }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function flushUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flush()
    if (condition()) return
  }
}

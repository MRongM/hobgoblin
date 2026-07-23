// @vitest-environment jsdom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const createTerminal = vi.fn()
const selectTerminal = vi.fn()
const scrollToBottom = vi.fn()
const focusTerminal = vi.fn()
const closeTerminalAndDismissDetailIfLast = vi.fn()
const reorderSessions = vi.fn()
const terminalTabsProps: Array<Record<string, unknown>> = []
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'
let compactUi = false

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => compactUi,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
}))

vi.mock('#/web/components/terminal/terminal-session-context.ts', () => ({
  useTerminalSessionContext: () => ({
    createTerminal,
    selectTerminal,
    scrollToBottom,
    focusTerminal,
    closeTerminalAndDismissDetailIfLast,
    reorderSessions,
  }),
}))

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalSnapshot: () => ({ sessions: [], selectedDescriptor: null }),
  useRepoTerminalCount: () => 0,
  useRepoTerminalHasBell: () => false,
  useRepoTerminalHasOutputActivity: () => false,
}))

vi.mock('#/web/components/terminal/TerminalTabs.tsx', () => ({
  EMPTY_TERMINAL_TAB_FOCUS_KEY: 'empty',
  TerminalTabs: (props: Record<string, unknown>) => {
    terminalTabsProps.push(props)
    return <div data-testid="terminal-tabs" />
  },
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/branch-workspace-queries.ts', () => ({
  useBranchWorkspaceQuery: () => ({
    data: { ok: true, rootId: '/repo', items: [], auxiliaryCandidates: [] },
    isPending: false,
    refresh: vi.fn(),
  }),
}))

vi.mock('#/web/components/tab-strip/useFocusRegistry.ts', () => ({
  useFocusRegistry: () => ({ register: () => {}, unregister: () => {} }),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  createTerminal.mockClear()
  selectTerminal.mockClear()
  scrollToBottom.mockClear()
  focusTerminal.mockClear()
  closeTerminalAndDismissDetailIfLast.mockClear()
  reorderSessions.mockClear()
  terminalTabsProps.length = 0
  compactUi = false
  resetReposStore()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('PlainWorkspaceTerminalPanel', () => {
  test('does not show an empty-state prompt when no plain-workspace terminal exists', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    expect(container!.textContent).not.toContain('terminal.label')
    expect(container!.textContent).not.toContain('terminal.new')
  })

  test('does not create a terminal when a plain workspace opens or rerenders', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    act(() => {
      root!.render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)
    })

    expect(createTerminal).not.toHaveBeenCalled()
  })

  test('creates a local plain-workspace terminal from the explicit new action', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    act(() => {
      ;(terminalTabsProps.at(-1)?.onNew as (() => void) | undefined)?.()
    })

    expect(createTerminal).toHaveBeenCalledTimes(1)
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: '/repo',
        branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
        worktreePath: '/repo',
      },
      'native',
    )
  })

  test('passes terminal focus command to terminal tabs', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    expect(terminalTabsProps[0]?.onFocusTerminal).toBe(focusTerminal)
  })

  test('keeps terminal tabs content-sized in the plain-workspace toolbar', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    const terminalTabs = container!.querySelector('[data-testid="terminal-tabs"]')
    expect(terminalTabs?.parentElement?.className).not.toContain('flex-1')
  })

  test('uses the project topbar tone for the desktop terminal toolbar', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('39px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('border-topbar-border')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).toContain('text-topbar-foreground')
  })

  test('marks the desktop left-right terminal topbar as a window drag region', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
  })

  test('has no alternate desktop toolbar layout', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.className).toContain('[-webkit-app-region:drag]')
  })

  test('uses the project topbar tone with compact toolbar geometry', () => {
    compactUi = true
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('41px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).not.toContain('bg-toolbar')
  })

  test('collapses the plain-workspace terminal list in compact UI like a Git workspace', () => {
    compactUi = true
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" />)

    expect(terminalTabsProps.at(-1)?.responsiveCompact).toBe(true)
  })

  test('keeps the complete compact terminal topbar in the shared horizontal scroll flow', () => {
    compactUi = true
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" compactFocusPresentation />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    const content = toolbar?.firstElementChild

    expect(toolbar?.classList.contains('mobile-topbar-scroll')).toBe(true)
    expect(content?.classList.contains('mobile-topbar-scroll-content')).toBe(true)
  })

  test('compact focus presentation shows context without mutating desktop focus state', () => {
    const onShowCompactOverview = vi.fn()
    compactUi = true
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        '/repo': {
          rootId: '/repo',
          repositoryIds: [],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })

    render(
      <PlainWorkspaceTerminalPanel
        repoId="/repo"
        layout="left-right"
        compactFocusPresentation
        onShowCompactOverview={onShowCompactOverview}
      />,
    )

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('41px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).not.toContain('bg-toolbar')
    expect(toolbar?.classList.contains('topbar')).toBe(false)
    expect(container!.querySelector('[data-testid="focus-project-switcher"]')).not.toBeNull()
    expect(container!.querySelector('button[aria-label="workspace.repositories"]')).not.toBeNull()
    expect(container!.querySelector('button[aria-label="branch-detail.exit-focus"]')).toBeNull()
    expect(terminalTabsProps.at(-1)?.focusMode).toBe(true)

    act(() => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="mobile.open-workspace"]')?.click()
    })

    expect(onShowCompactOverview).toHaveBeenCalledTimes(1)
  })

  test('renders the desktop terminal-maximize presentation', () => {
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" focusMode />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    const projectSwitcher = container!.querySelector('[data-testid="focus-project-switcher"]')
    expect(toolbar?.classList.contains('topbar')).toBe(true)
    expect(projectSwitcher).not.toBeNull()
    expect(container!.querySelector('button[aria-label="branch-detail.exit-focus"]')).not.toBeNull()
    expect(terminalTabsProps.at(-1)?.focusMode).toBe(true)
  })

  test('keeps repository navigation available in desktop focus for configured workspaces', () => {
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        '/repo': {
          rootId: '/repo',
          repositoryIds: [],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })

    render(<PlainWorkspaceTerminalPanel repoId="/repo" layout="left-right" focusMode />)

    expect(container!.querySelector('button[aria-label="workspace.repositories"]')).not.toBeNull()
  })

  test('exits desktop terminal focus from the toolbar', () => {
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const onExitTerminalFocus = vi.fn()
    render(
      <PlainWorkspaceTerminalPanel
        repoId="/repo"
        layout="left-right"
        focusMode
        onExitTerminalFocus={onExitTerminalFocus}
      />,
    )

    const exitButton = container!.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.exit-focus"]')
    expect(exitButton).not.toBeNull()

    act(() => exitButton?.click())

    expect(onExitTerminalFocus).toHaveBeenCalledTimes(1)
  })

  test('creates a remote plain-workspace terminal from the explicit new action', () => {
    seedRepoState({
      id: REMOTE_REPO_ID,
      isGitRepo: false,
      branches: [],
      selectedBranch: null,
      remote: {
        target: {
          id: REMOTE_REPO_ID,
          alias: 'prod',
          host: 'example.com',
          user: 'alice',
          port: 22,
          remotePath: '/srv/plain',
          displayName: 'prod:plain',
        },
      },
    })

    render(<PlainWorkspaceTerminalPanel repoId={REMOTE_REPO_ID} layout="left-right" />)

    act(() => {
      ;(terminalTabsProps.at(-1)?.onNew as (() => void) | undefined)?.()
    })

    expect(createTerminal).toHaveBeenCalledTimes(1)
    expect(createTerminal).toHaveBeenCalledWith(
      {
        repoRoot: REMOTE_REPO_ID,
        branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
        worktreePath: '/srv/plain',
      },
      'native',
    )
  })
})

function render(element: ReactNode) {
  act(() => {
    root!.render(element)
  })
}

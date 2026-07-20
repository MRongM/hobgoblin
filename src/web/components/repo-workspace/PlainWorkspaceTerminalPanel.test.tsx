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
  test('auto-creates the first session for a plain workspace', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    expect(createTerminal).toHaveBeenCalledTimes(1)
    expect(createTerminal).toHaveBeenCalledWith({
      repoRoot: '/repo',
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: '/repo',
    })
  })

  test('does not create another first session on rerender', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    act(() => {
      root!.render(<PlainWorkspaceTerminalPanel repoId="/repo" />)
    })

    expect(createTerminal).toHaveBeenCalledTimes(1)
  })

  test('passes terminal focus command to terminal tabs', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    expect(terminalTabsProps[0]?.onFocusTerminal).toBe(focusTerminal)
  })

  test('keeps terminal tabs content-sized in the plain-workspace toolbar', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    const terminalTabs = container!.querySelector('[data-testid="terminal-tabs"]')
    expect(terminalTabs?.parentElement?.className).not.toContain('flex-1')
  })

  test('uses the project topbar tone for the desktop terminal toolbar', () => {
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('39px')
    expect(toolbar?.className).toContain('topbar-tone')
    expect(toolbar?.className).toContain('border-topbar-border')
    expect(toolbar?.className).toContain('bg-topbar')
    expect(toolbar?.className).toContain('text-topbar-foreground')
  })

  test('keeps the compact terminal toolbar on the generic toolbar tone', () => {
    compactUi = true
    render(<PlainWorkspaceTerminalPanel repoId="/repo" />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    expect(toolbar?.style.height).toBe('41px')
    expect(toolbar?.className).toContain('bg-toolbar')
    expect(toolbar?.className).not.toContain('topbar-tone')
  })

  test('focus mode shows project context and uses full-width window chrome', () => {
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ detailFocusMode: true })

    render(<PlainWorkspaceTerminalPanel repoId="/repo" focusMode />)

    const toolbar = container!.querySelector<HTMLElement>('[data-testid="plain-workspace-terminal-toolbar"]')
    const projectSwitcher = container!.querySelector('[data-testid="focus-project-switcher"]')
    expect(toolbar?.classList.contains('topbar')).toBe(true)
    expect(projectSwitcher).not.toBeNull()
    expect(projectSwitcher?.querySelector('svg.lucide-folder')).not.toBeNull()
    expect(projectSwitcher?.querySelector('svg.lucide-folder-git-2')).toBeNull()
    expect(container!.querySelector('button[aria-label="branch-detail.exit-focus"]')).not.toBeNull()
    expect(terminalTabsProps.at(-1)?.focusMode).toBe(true)
  })

  test('focus mode keeps configured workspace repository navigation reachable', () => {
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      detailFocusMode: true,
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

    render(<PlainWorkspaceTerminalPanel repoId="/repo" focusMode />)

    expect(container!.querySelector('button[aria-label="workspace.repositories"]')).not.toBeNull()
  })

  test('focus exit control clears the existing focus preference', () => {
    seedRepoState({
      id: '/repo',
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({ detailFocusMode: true })
    render(<PlainWorkspaceTerminalPanel repoId="/repo" focusMode />)

    act(() => {
      container!.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.exit-focus"]')?.click()
    })

    expect(useReposStore.getState().detailFocusMode).toBe(false)
  })

  test('auto-creates remote plain workspace sessions at the remote path', () => {
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

    render(<PlainWorkspaceTerminalPanel repoId={REMOTE_REPO_ID} />)

    expect(createTerminal).toHaveBeenCalledTimes(1)
    expect(createTerminal).toHaveBeenCalledWith({
      repoRoot: REMOTE_REPO_ID,
      branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
      worktreePath: '/srv/plain',
    })
  })
})

function render(element: ReactNode) {
  act(() => {
    root!.render(element)
  })
}

// @vitest-environment jsdom

import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { PlainWorkspaceTerminalPanel } from '#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const createTerminal = vi.fn()
const selectTerminal = vi.fn()
const scrollToBottom = vi.fn()
const focusTerminal = vi.fn()
const closeTerminalAndDismissDetailIfLast = vi.fn()
const reorderSessions = vi.fn()
const terminalTabsProps: Array<Record<string, unknown>> = []
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'

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

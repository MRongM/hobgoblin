// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import type { TerminalSessionSummary } from '#/web/components/terminal/types.ts'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { NON_GIT_WORKSPACE_TERMINAL_BRANCH } from '#/shared/terminal.ts'
import { BranchWorkspaceMemberContext } from '#/web/components/repo-workspace/BranchWorkspaceMemberContext.tsx'

const { openExternalUrlMock } = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(async (_url: string) => ({ ok: true, message: '' })),
}))

const shellOverlayMock = vi.hoisted(() => ({
  state: null as {
    openRepoPathDialog: () => void
    openRemoteRepo: () => void
    openCloneRepo: () => void
    openSettings: () => void
    settingsOpen: boolean
  } | null,
}))

vi.mock('#/web/app-shell-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/web/app-shell-client.ts')>()),
  openExternalUrl: (url: string) => openExternalUrlMock(url),
}))

vi.mock('#/web/settings-queries.ts', () => ({
  useLanInfoQuery: () => ({
    data: { host: '0.0.0.0', port: 32215, lanUrls: ['http://192.0.2.10:32215'], qrCodes: {} },
  }),
}))

let terminalSessions: TerminalSessionSummary[] = []
const terminalSnapshotKeys: Array<string | null> = []

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalSnapshot: (worktreeTerminalKey: string | null) => {
    terminalSnapshotKeys.push(worktreeTerminalKey)
    const sessions = terminalSessions.filter((session) => session.worktreeTerminalKey === worktreeTerminalKey)
    return {
      worktreeTerminalKey,
      selectedDescriptor: null,
      sessions,
      count: sessions.length,
    }
  },
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/shell-overlay-actions.tsx', () => ({
  useShellOverlayActions: () => shellOverlayMock.state,
}))

vi.mock('#/web/components/Tip.tsx', () => ({
  Tip: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('#/web/components/repo-toolbar/ProjectThemeMenu.tsx', () => ({
  ProjectThemeMenuConnected: () => <div data-testid="project-theme" />,
}))

vi.mock('#/web/components/repo-activity/RepoActivityControl.tsx', () => ({
  RepoActivityControl: () => null,
}))

const REPO_ID = '/repo'
const WORKTREE_PATH = '/repo'
const REMOTE_REPO_ID = 'ssh-config://example/srv%2Fplain'
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main', { isCurrent: true, worktree: { path: WORKTREE_PATH } })],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
  terminalSessions = [
    {
      key: 't1',
      worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
      terminalId: 'terminal-1',
      index: 1,
      title: 'term-1',
      phase: 'open',
      selected: true,
      hasBell: false,
    },
  ]
  terminalSnapshotKeys.length = 0
  openExternalUrlMock.mockClear()
  shellOverlayMock.state = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('StatusBar file area control', () => {
  test('keeps the active settings trigger above the dialog scrim and toggles it closed', () => {
    const toggleSettings = vi.fn()
    shellOverlayMock.state = {
      openRepoPathDialog: vi.fn(),
      openRemoteRepo: vi.fn(),
      openCloneRepo: vi.fn(),
      openSettings: toggleSettings,
      settingsOpen: true,
    }

    act(() => root!.render(<StatusBar repoId={REPO_ID} />))

    const settings = container?.querySelector<HTMLButtonElement>('button[aria-label="topbar.settings"]')
    expect(settings?.getAttribute('aria-pressed')).toBe('true')
    expect(settings?.className).toContain('z-[60]')

    act(() => settings?.click())

    expect(toggleSettings).toHaveBeenCalledTimes(1)
  })

  test('switches between collapse and expand actions', () => {
    const onToggleFileArea = vi.fn()
    renderStatusBar(false, onToggleFileArea)

    const collapse = container?.querySelector<HTMLButtonElement>('button[aria-label="file-area.collapse"]')
    expect(collapse?.getAttribute('aria-expanded')).toBe('true')
    act(() => collapse?.click())
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)

    renderStatusBar(true, onToggleFileArea)

    const expand = container?.querySelector<HTMLButtonElement>('button[aria-label="file-area.expand"]')
    expect(expand?.getAttribute('aria-expanded')).toBe('false')
  })

  test('omits the control without a toggle callback', () => {
    act(() => root!.render(<StatusBar repoId={REPO_ID} />))

    expect(container?.querySelector('button[aria-label^="file-area."]')).toBeNull()
  })

  test('hosts browser and LAN QR actions for the selected worktree terminal', async () => {
    act(() => root!.render(<StatusBar repoId={REPO_ID} />))

    const browser = container?.querySelector<HTMLButtonElement>('button[aria-label="terminal.open-in-browser"]')
    const qr = container?.querySelector<HTMLButtonElement>('button[aria-label="terminal.lan-qr"]')
    expect(browser).not.toBeNull()
    expect(qr).not.toBeNull()

    act(() => browser?.click())
    await flush()

    expect(openExternalUrlMock).toHaveBeenCalledWith(
      buildTerminalDeepLinkUrl('http://127.0.0.1:32215', {
        repoId: REPO_ID,
        worktreePath: WORKTREE_PATH,
        branch: 'main',
        terminalId: 'terminal-1',
      }),
    )

    act(() => qr?.click())
    await flush()

    expect(document.body.textContent).toContain('terminal.lan-qr-title')
    expect(document.body.querySelector('[data-testid="terminal-lan-qr-url"]')?.textContent).toBe(
      buildTerminalDeepLinkUrl('http://192.0.2.10:32215', {
        repoId: REPO_ID,
        worktreePath: WORKTREE_PATH,
        branch: 'main',
        terminalId: 'terminal-1',
      }),
    )
  })

  test('adds the active branch workspace member scope to terminal links', async () => {
    act(() =>
      root!.render(
        <BranchWorkspaceMemberContext.Provider
          value={{ workspaceRootId: '/workspace', branchWorkspaceId: 'branch-1', repositoryName: 'api' }}
        >
          <StatusBar repoId={REPO_ID} />
        </BranchWorkspaceMemberContext.Provider>,
      ),
    )

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="terminal.open-in-browser"]')?.click())
    await flush()

    expect(openExternalUrlMock).toHaveBeenCalledWith(
      buildTerminalDeepLinkUrl('http://127.0.0.1:32215', {
        repoId: REPO_ID,
        worktreePath: WORKTREE_PATH,
        branch: 'main',
        terminalId: 'terminal-1',
        branchWorkspaceScope: {
          workspaceRootId: '/workspace',
          branchWorkspaceId: 'branch-1',
        },
      }),
    )
  })

  test('opens a local plain workspace terminal in the browser', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })

    act(() => root!.render(<StatusBar repoId={REPO_ID} />))

    const browser = container?.querySelector<HTMLButtonElement>('button[aria-label="terminal.open-in-browser"]')
    const qr = container?.querySelector<HTMLButtonElement>('button[aria-label="terminal.lan-qr"]')
    expect(browser).not.toBeNull()
    expect(qr).not.toBeNull()

    act(() => browser?.click())
    await flush()

    expect(openExternalUrlMock).toHaveBeenCalledWith(
      buildTerminalDeepLinkUrl('http://127.0.0.1:32215', {
        repoId: REPO_ID,
        worktreePath: REPO_ID,
        branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
        terminalId: 'terminal-1',
      }),
    )
  })

  test('uses the remote path when opening a remote plain workspace in the browser', async () => {
    seedRepoState({
      id: REMOTE_REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
      remote: {
        target: {
          id: REMOTE_REPO_ID,
          alias: 'example',
          host: 'example.com',
          user: 'dev',
          port: 22,
          remotePath: '/srv/plain',
          displayName: 'example:plain',
        },
      },
    })
    terminalSessions = [
      {
        ...terminalSessions[0]!,
        worktreeTerminalKey: `${REMOTE_REPO_ID}\0/srv/plain`,
        terminalId: 'remote-terminal-1',
      },
    ]

    act(() => root!.render(<StatusBar repoId={REMOTE_REPO_ID} />))
    expect(terminalSnapshotKeys).toContain(`${REMOTE_REPO_ID}\0/srv/plain`)
    const browser = container?.querySelector<HTMLButtonElement>('button[aria-label="terminal.open-in-browser"]')

    act(() => browser?.click())
    await flush()

    expect(openExternalUrlMock).toHaveBeenCalledWith(
      buildTerminalDeepLinkUrl('http://127.0.0.1:32215', {
        repoId: REMOTE_REPO_ID,
        worktreePath: '/srv/plain',
        branch: NON_GIT_WORKSPACE_TERMINAL_BRANCH,
        terminalId: 'remote-terminal-1',
      }),
    )
  })
})

function renderStatusBar(fileAreaCollapsed: boolean, onToggleFileArea: () => void) {
  act(() => {
    root!.render(
      <StatusBar repoId={REPO_ID} fileAreaCollapsed={fileAreaCollapsed} onToggleFileArea={onToggleFileArea} />,
    )
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

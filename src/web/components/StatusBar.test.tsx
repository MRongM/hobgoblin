// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { StatusBar } from '#/web/components/StatusBar.tsx'
import type { TerminalSessionSummary } from '#/web/components/terminal/types.ts'
import { buildTerminalDeepLinkUrl } from '#/web/lib/terminal-deep-link.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const { openExternalUrlMock } = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(async (_url: string) => ({ ok: true, message: '' })),
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

vi.mock('#/web/components/terminal/terminal-session-store.ts', () => ({
  useWorktreeTerminalSnapshot: () => ({
    worktreeTerminalKey: `${REPO_ID}\0${WORKTREE_PATH}`,
    selectedDescriptor: null,
    sessions: terminalSessions,
    count: terminalSessions.length,
  }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/shell-overlay-actions.tsx', () => ({
  useShellOverlayActions: () => null,
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
  openExternalUrlMock.mockClear()
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

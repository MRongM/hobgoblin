// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from '#/web/App.tsx'
import type { RepoWorkspaceMode } from '#/web/lib/workspace-layout.ts'
import type { useMainWindowShellState } from '#/web/hooks/useMainWindowShellState.ts'

type MainWindowShellState = ReturnType<typeof useMainWindowShellState>

const shellMock = vi.hoisted(() => ({
  state: null as MainWindowShellState | null,
}))

const bootstrapMock = vi.hoisted(() => ({
  runtimeKind: 'web' as 'web' | 'electron',
}))

const uiModeMock = vi.hoisted(() => ({
  mode: 'default' as 'default' | 'compact',
}))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({
    runtime: { kind: bootstrapMock.runtimeKind, bridgeVersion: 1, capabilities: [] },
    homeDir: bootstrapMock.runtimeKind === 'electron' ? '/Users/test' : '',
    initialI18n: null,
    initialSettings: null,
    initialServer: null,
  }),
}))

vi.mock('#/web/hooks/useMainWindowShellState.ts', () => ({
  useMainWindowShellState: () => shellMock.state as MainWindowShellState,
}))

vi.mock('#/web/hooks/useRepoDrop.ts', () => ({
  useRepoDrop: () => ({
    active: false,
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
  }),
}))

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useResponsiveUiMode: () => uiModeMock.mode,
}))

vi.mock('#/web/hooks/useKeyboard.ts', () => ({ useKeyboard: vi.fn() }))
vi.mock('#/web/hooks/useAppBootstrap.ts', () => ({ useAppBootstrap: vi.fn() }))
vi.mock('#/web/hooks/useBackgroundFetch.ts', () => ({ useBackgroundFetch: vi.fn() }))
vi.mock('#/web/hooks/useHeuristicRepoStatusRefresh.ts', () => ({ useHeuristicRepoStatusRefresh: vi.fn() }))
vi.mock('#/web/hooks/useRendererEffectIntentRouter.ts', () => ({ useRendererEffectIntentRouter: vi.fn() }))
vi.mock('#/web/hooks/useSessionPersistence.ts', () => ({ useSessionPersistence: vi.fn() }))
vi.mock('#/web/hooks/useSettingsWriteErrorToast.ts', () => ({ useSettingsWriteErrorToast: vi.fn() }))
vi.mock('#/web/hooks/useRepoStoreInvalidationRefresh.ts', () => ({ useRepoStoreInvalidationRefresh: vi.fn() }))
vi.mock('#/web/settings-queries.ts', () => ({
  useSettingsQueryInvalidationSync: vi.fn(),
  useSettingsSnapshotQuery: () => ({ data: { repoSettings: [] } }),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/components/ErrorBoundary.tsx', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('#/web/components/terminal/TerminalSessionProvider.tsx', () => ({
  TerminalSessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('#/web/components/terminal/TerminalDeepLinkConsumer.tsx', () => ({
  TerminalDeepLinkConsumer: () => null,
}))

vi.mock('#/web/components/branch-list/InlineCommitDraftProvider.tsx', () => ({
  InlineCommitDraftProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  MainWindowNavigationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useMainWindowNavigation: () => ({
    activateRepo: vi.fn(),
    closeRepo: vi.fn(),
    cycleRepo: vi.fn(),
    selectRepoBranch: vi.fn(),
    showRepoDetailTab: vi.fn(),
    showRepoBranchDetailTab: vi.fn(),
    openSettings: vi.fn(),
  }),
}))

vi.mock('#/web/components/Topbar.tsx', () => ({
  Topbar: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div data-testid="global-topbar">
      <div data-testid="topbar-tabs">{children}</div>
      {actions && <div data-testid="topbar-actions">{actions}</div>}
    </div>
  ),
}))

vi.mock('#/web/components/RepoTabs.tsx', () => ({
  RepoTabs: () => <div data-testid="repo-tabs" />,
}))

vi.mock('#/web/components/topbar/TopbarRepoControls.tsx', () => ({
  TopbarRepoControls: () => <div data-testid="topbar-repo-controls" />,
}))

vi.mock('#/web/components/repo-toolbar/ProjectThemeMenu.tsx', () => ({
  ProjectThemeMenuConnected: () => <div data-testid="project-theme-menu" />,
}))

vi.mock('#/web/components/StatusBar.tsx', () => ({
  StatusBar: () => <footer data-testid="statusbar" />,
}))

vi.mock('#/web/components/RepoView.tsx', () => ({
  RepoView: ({ repoId }: { repoId: string }) => <div data-testid="repo-view">{repoId}</div>,
}))

vi.mock('#/web/components/Skeleton.tsx', () => ({
  RepoWorkspaceSkeleton: () => <div data-testid="repo-workspace-skeleton" />,
}))

vi.mock('#/web/components/SettingsPageScreen.tsx', () => ({
  SettingsPageScreen: () => <div data-testid="settings-screen" />,
}))

vi.mock('#/web/components/RepoOpenDialog.tsx', () => ({
  RepoOpenDialog: () => null,
}))

vi.mock('#/web/components/RepoCloneDialog.tsx', () => ({
  RepoCloneDialog: () => null,
}))

vi.mock('#/web/components/OpenRemoteRepositoryDialog.tsx', () => ({
  OpenRemoteRepositoryDialog: () => null,
}))

vi.mock('#/web/components/ConfirmDialog.tsx', () => ({
  ConfirmDialog: ({
    open,
    title,
    message,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean
    title: string
    message: ReactNode
    confirmLabel: string
    onConfirm: () => void
  }) =>
    open ? (
      <section data-testid="close-repo-confirm">
        <h1>{title}</h1>
        <div>{message}</div>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}))

vi.mock('#/web/components/RepoDropOverlay.tsx', () => ({
  RepoDropOverlay: () => null,
}))

vi.mock('#/web/components/ui/sonner.tsx', () => ({
  Toaster: () => null,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  shellMock.state = null
  bootstrapMock.runtimeKind = 'web'
  uiModeMock.mode = 'default'
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('App shell topbar visibility', () => {
  test('renders no global topbar on desktop while a repo is open', async () => {
    await renderApp({ runtime: 'web', workspaceMode: 'split' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')?.textContent).toBe('/repo')
  })

  test('renders no global topbar on focused desktop workspaces either', async () => {
    await renderApp({ runtime: 'electron', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')?.textContent).toBe('/repo')
  })

  test('shows a plain topbar on desktop when no repo is open', async () => {
    await renderApp({ runtime: 'web', workspaceMode: 'split', visibleRepoId: null })

    expect(container?.querySelector('[data-testid="global-topbar"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-tabs"]')).toBeNull()
  })

  test('keeps the repo tab strip topbar in compact UI', async () => {
    uiModeMock.mode = 'compact'
    await renderApp({ runtime: 'web', workspaceMode: 'split' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-tabs"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="topbar-repo-controls"]')).not.toBeNull()
  })

  test('keeps settings and project theme entries in the compact topbar', async () => {
    // Compact UI never renders the status bar, so the ambient controls it
    // hosts on desktop (settings entry, project theme menu) live in the
    // compact topbar instead.
    uiModeMock.mode = 'compact'
    await renderApp({ runtime: 'web', workspaceMode: 'split' })

    const actions = container?.querySelector('[data-testid="topbar-actions"]')
    expect(actions?.querySelector('[data-testid="project-theme-menu"]')).not.toBeNull()

    const settingsButton = actions?.querySelector<HTMLButtonElement>('button[aria-label="topbar.settings"]')
    expect(settingsButton).not.toBeNull()
    await act(async () => {
      settingsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(shellMock.state?.openSettings).toHaveBeenCalledTimes(1)
  })

  test('keeps the settings entry in the compact empty-state topbar but not on desktop', async () => {
    uiModeMock.mode = 'compact'
    await renderApp({ runtime: 'web', workspaceMode: 'split', visibleRepoId: null })

    expect(container?.querySelector('button[aria-label="topbar.settings"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="project-theme-menu"]')).toBeNull()

    act(() => {
      root?.unmount()
    })
    container?.remove()

    // Desktop keeps its settings entry in the status bar, not the topbar.
    uiModeMock.mode = 'default'
    await renderApp({ runtime: 'web', workspaceMode: 'split', visibleRepoId: null })
    expect(container?.querySelector('button[aria-label="topbar.settings"]')).toBeNull()
  })

  test('keeps a full-width status bar only for the desktop empty state', async () => {
    // Repo open: the status bar lives inside the sidebar (RepoView), not the shell.
    await renderApp({ runtime: 'web', workspaceMode: 'split' })
    expect(container?.querySelector('[data-testid="statusbar"]')).toBeNull()

    act(() => {
      root?.unmount()
    })
    container?.remove()

    await renderApp({ runtime: 'web', workspaceMode: 'split', visibleRepoId: null })
    expect(container?.querySelector('[data-testid="statusbar"]')).not.toBeNull()

    act(() => {
      root?.unmount()
    })
    container?.remove()

    uiModeMock.mode = 'compact'
    await renderApp({ runtime: 'web', workspaceMode: 'split', visibleRepoId: null })
    expect(container?.querySelector('[data-testid="statusbar"]')).toBeNull()
  })

  test('keeps the same focus-mode shell on web as on Electron', async () => {
    await renderApp({ runtime: 'web', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')).not.toBeNull()

    act(() => {
      root?.unmount()
    })
    container?.remove()

    await renderApp({ runtime: 'electron', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')).not.toBeNull()
  })

  test('hides the compact topbar in focus mode on both runtimes', async () => {
    uiModeMock.mode = 'compact'
    await renderApp({ runtime: 'web', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()

    act(() => {
      root?.unmount()
    })
    container?.remove()

    await renderApp({ runtime: 'electron', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()
  })

  test('renders the close project confirmation overlay', async () => {
    const confirmCloseRepo = vi.fn()
    await renderApp({ runtime: 'web', workspaceMode: 'split', closeConfirmOpen: true, confirmCloseRepo })

    expect(container?.querySelector('[data-testid="close-repo-confirm"]')?.textContent).toContain(
      'repo-tabs.close-confirm-title',
    )

    await clickButton('repo-tabs.close-confirm-confirm')

    expect(confirmCloseRepo).toHaveBeenCalledTimes(1)
  })
})

async function renderApp({
  runtime,
  workspaceMode,
  closeConfirmOpen = false,
  confirmCloseRepo = vi.fn(),
  visibleRepoId = '/repo',
}: {
  runtime: 'web' | 'electron'
  workspaceMode: RepoWorkspaceMode
  closeConfirmOpen?: boolean
  confirmCloseRepo?: () => void
  visibleRepoId?: string | null
}) {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  bootstrapMock.runtimeKind = runtime
  shellMock.state = shellStateWith(workspaceMode, { closeConfirmOpen, confirmCloseRepo, visibleRepoId })

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<App />)
    await Promise.resolve()
  })
}

async function clickButton(text: string) {
  const buttons = Array.from(container?.querySelectorAll('button') ?? [])
  const button = buttons.find((candidate) => candidate.textContent === text)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

function shellStateWith(
  workspaceMode: RepoWorkspaceMode,
  options: { closeConfirmOpen?: boolean; confirmCloseRepo?: () => void; visibleRepoId?: string | null } = {},
): MainWindowShellState {
  const overlays = {
    anyOpen: false,
    closeAllOverlays: vi.fn(),
    openRepoPathDialog: vi.fn(),
    openCloneRepo: vi.fn(),
    openRemoteRepo: vi.fn(),
    state: {
      openRepo: { open: false },
      clone: { open: false },
      openRemoteRepo: { open: false },
    },
    setOpenRepoOpen: vi.fn(),
    setCloneOpen: vi.fn(),
    setOpenRemoteRepoOpen: vi.fn(),
  }

  return {
    overlays,
    closeRepoConfirmation: {
      open: options.closeConfirmOpen ?? false,
      repoId: options.closeConfirmOpen ? '/repo' : null,
      repoName: 'repo',
      cancel: vi.fn(),
      confirm: options.confirmCloseRepo ?? vi.fn(),
    },
    sessionReady: true,
    visibleRepoId: options.visibleRepoId === undefined ? '/repo' : options.visibleRepoId,
    workspaceLayout: 'left-right' as const,
    workspaceBehavior: {
      mode: workspaceMode,
      detailCollapsed: false,
      detailCollapseAllowed: true,
      detailFocusAllowed: true,
      detailFocusMode: workspaceMode === 'focus',
      branchListActionsVisible: workspaceMode !== 'focus',
      prTooltipSide: 'bottom' as const,
    },
    settingsOpen: false,
    modalOpen: false,
    workspaceShortcutsSuppressed: false,
    openSettings: vi.fn(),
    showHelp: vi.fn(),
    exitSettings: vi.fn(),
    navigation: {
      activateRepo: vi.fn(),
      closeRepo: vi.fn(),
      cycleRepo: vi.fn(),
      selectRepoBranch: vi.fn(),
      showRepoDetailTab: vi.fn(),
      showRepoBranchDetailTab: vi.fn(),
      openSettings: vi.fn(),
    },
  }
}

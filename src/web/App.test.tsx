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
  useResponsiveUiMode: () => 'default',
}))

vi.mock('#/web/hooks/useKeyboard.ts', () => ({ useKeyboard: vi.fn() }))
vi.mock('#/web/hooks/useAppBootstrap.ts', () => ({ useAppBootstrap: vi.fn() }))
vi.mock('#/web/hooks/useBackgroundFetch.ts', () => ({ useBackgroundFetch: vi.fn() }))
vi.mock('#/web/hooks/useHeuristicRepoStatusRefresh.ts', () => ({ useHeuristicRepoStatusRefresh: vi.fn() }))
vi.mock('#/web/hooks/useRendererEffectIntentRouter.ts', () => ({ useRendererEffectIntentRouter: vi.fn() }))
vi.mock('#/web/hooks/useSessionPersistence.ts', () => ({ useSessionPersistence: vi.fn() }))
vi.mock('#/web/hooks/useSettingsWriteErrorToast.ts', () => ({ useSettingsWriteErrorToast: vi.fn() }))
vi.mock('#/web/hooks/useRepoStoreInvalidationRefresh.ts', () => ({ useRepoStoreInvalidationRefresh: vi.fn() }))
vi.mock('#/web/settings-queries.ts', () => ({ useSettingsQueryInvalidationSync: vi.fn() }))

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
}))

vi.mock('#/web/components/Topbar.tsx', () => ({
  Topbar: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div data-testid="global-topbar">
      <div data-testid="topbar-tabs">{children}</div>
      {actions && <div data-testid="topbar-actions">{actions}</div>}
      <button type="button" aria-label="topbar.settings">
        settings
      </button>
    </div>
  ),
}))

vi.mock('#/web/components/RepoTabs.tsx', () => ({
  RepoTabs: () => <div data-testid="repo-tabs" />,
}))

vi.mock('#/web/components/topbar/TopbarRepoControls.tsx', () => ({
  TopbarRepoControls: () => <div data-testid="topbar-repo-controls" />,
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
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('App shell topbar visibility', () => {
  test('hides the global topbar for focused web workspaces', async () => {
    await renderApp({ runtime: 'web', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')?.textContent).toBe('/repo')
  })

  test('keeps the global topbar for focused Electron workspaces', async () => {
    await renderApp({ runtime: 'electron', workspaceMode: 'focus' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="topbar-repo-controls"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')?.textContent).toBe('/repo')
  })

  test('keeps the global topbar for non-focused web workspaces', async () => {
    await renderApp({ runtime: 'web', workspaceMode: 'split' })

    expect(container?.querySelector('[data-testid="global-topbar"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="topbar-repo-controls"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="repo-view"]')?.textContent).toBe('/repo')
  })
})

async function renderApp({
  runtime,
  workspaceMode,
}: {
  runtime: 'web' | 'electron'
  workspaceMode: RepoWorkspaceMode
}) {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  bootstrapMock.runtimeKind = runtime
  shellMock.state = shellStateWith(workspaceMode)

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<App />)
    await Promise.resolve()
  })
}

function shellStateWith(workspaceMode: RepoWorkspaceMode): MainWindowShellState {
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
    sessionReady: true,
    visibleRepoId: '/repo',
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

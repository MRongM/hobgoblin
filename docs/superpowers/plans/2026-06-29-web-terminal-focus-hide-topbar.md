# Web Terminal Focus Hide Topbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the global application topbar only in browser web runtime while the terminal/detail area is in effective focus mode, without changing Electron desktop behavior.

**Architecture:** Keep the change in the React shell that owns the global `Topbar`. Reuse existing `workspaceBehavior.mode` from `useMainWindowShellState` and existing renderer bootstrap runtime data; do not add terminal state, persisted settings, server routes, IPC channels, or Electron window changes.

**Tech Stack:** React, TypeScript, Vitest/jsdom, Zustand-derived shell state, existing renderer bootstrap runtime model.

---

## File Structure

- Modify: `src/web/App.tsx`
  - Responsibility: decide whether the global `Topbar` should render for the current app shell route/runtime/workspace mode.
  - Add `getInitialBootstrap()` usage.
  - Pass the effective `workspaceBehavior.mode` through the shell viewport props.
  - Omit only the global `Topbar` when runtime is web and workspace mode is focus.
- Create: `src/web/App.test.tsx`
  - Responsibility: focused regression tests for global topbar visibility at the app shell boundary.
  - Mock heavy child components and side-effect hooks so tests verify `App`'s JSX branching without terminal/session/network setup.
- Reference: `docs/superpowers/specs/2026-06-29-web-terminal-focus-hide-topbar-design.md`
  - Responsibility: approved behavior contract and scope limits.

No other source files should change for this feature.

## Scope Check

This plan covers one subsystem: renderer shell chrome visibility. It does not require separate plans for terminal sessions, settings, Electron window chrome, or server behavior.

### Task 1: Shell Topbar Visibility Tests

**Files:**
- Create: `src/web/App.test.tsx`

- [ ] **Step 1: Create failing App shell tests**

Create `src/web/App.test.tsx` with this complete content:

```tsx
// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from '#/web/App.tsx'
import type { RepoWorkspaceMode } from '#/web/lib/workspace-layout.ts'

const shellMock = vi.hoisted(() => ({
  state: null as any,
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
  useMainWindowShellState: () => shellMock.state,
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

function shellStateWith(workspaceMode: RepoWorkspaceMode) {
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun run test src/web/App.test.tsx
```

Expected result before implementation:

```text
FAIL src/web/App.test.tsx
App shell topbar visibility > hides the global topbar for focused web workspaces
AssertionError: expected HTMLElement... to be null
```

The Electron and non-focused web tests may pass before implementation. The important red test is the focused web topbar assertion.

### Task 2: App Shell Runtime Guard

**Files:**
- Modify: `src/web/App.tsx`
- Test: `src/web/App.test.tsx`

- [ ] **Step 1: Add bootstrap runtime and workspace mode plumbing**

Modify `src/web/App.tsx` imports:

```tsx
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import type { RepoWorkspaceMode } from '#/web/lib/workspace-layout.ts'
```

Update `MainWindowViewportProps` and `MainWindowViewportContentProps`:

```tsx
interface MainWindowViewportProps {
  routeSettingsPage: SettingsPage | null
  onRouteSettingsPageChange?: (page: SettingsPage | null) => void
  openSettings: (page?: SettingsPage) => void
  visibleRepoId: string | null
  sessionReady: boolean
  workspaceLayout: 'top-bottom' | 'left-right'
  workspaceMode: RepoWorkspaceMode
  detailCollapsed: boolean
  detailFocusMode: boolean
  overlays: ReturnType<typeof useMainWindowShellState>['overlays']
  repoDrop: ReturnType<typeof useRepoDrop>
}

interface MainWindowViewportContentProps {
  routeSettingsPage: SettingsPage | null
  onRouteSettingsPageChange?: (page: SettingsPage | null) => void
  openSettings: (page?: SettingsPage) => void
  visibleRepoId: string | null
  sessionReady: boolean
  workspaceLayout: 'top-bottom' | 'left-right'
  workspaceMode: RepoWorkspaceMode
  detailCollapsed: boolean
  detailFocusMode: boolean
  overlays: ReturnType<typeof useMainWindowShellState>['overlays']
}
```

Pass the effective mode from `App` into `MainWindowViewport`:

```tsx
<MainWindowViewport
  routeSettingsPage={routeSettingsPage}
  onRouteSettingsPageChange={onRouteSettingsPageChange}
  openSettings={openSettings}
  visibleRepoId={visibleRepoId}
  sessionReady={sessionReady}
  workspaceLayout={workspaceLayout}
  workspaceMode={workspaceBehavior.mode}
  detailCollapsed={workspaceBehavior.detailCollapsed}
  detailFocusMode={workspaceBehavior.detailFocusMode}
  overlays={overlays}
  repoDrop={repoDrop}
/>
```

Pass `workspaceMode` through `MainWindowViewport` into `MainWindowViewportContent`:

```tsx
<MainWindowViewportContent
  routeSettingsPage={routeSettingsPage}
  onRouteSettingsPageChange={onRouteSettingsPageChange}
  openSettings={openSettings}
  visibleRepoId={visibleRepoId}
  sessionReady={sessionReady}
  workspaceLayout={workspaceLayout}
  workspaceMode={workspaceMode}
  detailCollapsed={detailCollapsed}
  detailFocusMode={detailFocusMode}
  overlays={overlays}
/>
```

- [ ] **Step 2: Hide the global Topbar only for focused web runtime**

In `MainWindowViewportContent`, after the settings route early return and before the JSX return for the normal workspace shell, derive the guard:

```tsx
const runtimeKind = getInitialBootstrap().runtime.kind
const hideGlobalTopbar = runtimeKind === 'web' && workspaceMode === 'focus'
```

Wrap only the global `Topbar` with this guard:

```tsx
return (
  <>
    {!hideGlobalTopbar && (
      <Topbar
        onOpenSettings={() => openSettings()}
        actions={visibleRepoId ? <TopbarRepoControls repoId={visibleRepoId} /> : null}
      >
        <RepoTabs
          currentRepoId={visibleRepoId}
          onOpenRepoPathDialog={overlays.openRepoPathDialog}
          onOpenRemote={overlays.openRemoteRepo}
          onClone={overlays.openCloneRepo}
        />
      </Topbar>
    )}
    <main className="flex flex-1 min-h-0 min-w-0">
      <ErrorBoundary resetKey={visibleRepoId}>
        {visibleRepoId ? (
          <RepoView repoId={visibleRepoId} />
        ) : !sessionReady ? (
          <RepoWorkspaceSkeleton
            layout={workspaceLayout}
            detailCollapsed={detailCollapsed}
            detailFocusMode={detailFocusMode}
            compact={uiMode === 'compact'}
          />
        ) : (
          <EmptyState />
        )}
      </ErrorBoundary>
    </main>
  </>
)
```

Do not change `Topbar`, `BranchDetailToolbar`, `TerminalSlot`, `src/main/window.ts`, or shared layout normalization.

- [ ] **Step 3: Run focused tests and verify they pass**

Run:

```bash
bun run test src/web/App.test.tsx
```

Expected result after implementation:

```text
PASS src/web/App.test.tsx
```

- [ ] **Step 4: Run related existing shell and toolbar tests**

Run:

```bash
bun run test src/web/hooks/useMainWindowShellState.test.tsx src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/web/components/Topbar.test.tsx
```

Expected result:

```text
PASS src/web/hooks/useMainWindowShellState.test.tsx src/web/components/branch-detail/BranchDetailToolbar.test.tsx src/web/components/Topbar.test.tsx
```

- [ ] **Step 5: Run full verification**

Run:

```bash
bun run typecheck
bun run test
```

Expected result:

```text
typecheck passes
test suite passes
```

- [ ] **Step 6: Commit after explicit user confirmation**

Before running the commit, ask for confirmation using the repository's required dangerous-operation format. If confirmed, run:

```bash
git add "src/web/App.tsx" "src/web/App.test.tsx"
git commit -m "fix: hide web topbar in terminal focus mode" -- "src/web/App.tsx" "src/web/App.test.tsx"
```

Expected result:

```text
[branch <hash>] fix: hide web topbar in terminal focus mode
 2 files changed
```

## Self-Review

- Spec coverage: Task 1 covers web focus hidden topbar, Electron focus visible topbar, and web non-focus visible topbar. Task 2 implements the runtime-kind and effective-mode guard in the shell boundary. No terminal session, settings, server, IPC, or Electron window changes are included.
- Placeholder scan: The plan contains concrete file paths, code, commands, and expected outcomes for every step.
- Type consistency: `workspaceMode` uses the existing `RepoWorkspaceMode` type. Runtime branching uses `getInitialBootstrap().runtime.kind`, matching the approved design. Existing `detailCollapsed` and `detailFocusMode` props continue to feed skeleton rendering unchanged.

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoExplorerPane } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import { resetExplorerOverflowExpanded } from '#/web/components/repo-workspace/RepoWorktreeExplorer.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const REPO_ID = '/repo'
const REPO_B_ID = '/repo-b'
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'
let compactUi = false
const runtimeFontSettings = vi.hoisted(() => ({
  appFontSize: 15,
  terminalFontSize: 14,
}))
const sectionActionMocks = vi.hoisted(() => ({
  createWorktree: vi.fn(),
  refreshIntent: vi.fn(),
}))
const detachedWindowMocks = vi.hoisted(() => ({
  enabled: false,
  open: vi.fn(async () => ({ ok: true as const, windowKey: 'detached-file-area:test' })),
}))

vi.mock('#/web/app-shell-client.ts', () => ({
  canOpenDetachedFileAreaWindow: () => detachedWindowMocks.enabled,
  openDetachedFileAreaWindow: detachedWindowMocks.open,
}))

vi.mock('#/web/runtime-settings-fonts.ts', () => ({
  useRuntimeFontSettings: () => runtimeFontSettings,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 39, toolbarHeightPx: 41 }),
}))

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => compactUi,
}))

vi.mock('#/web/stores/repos/refresh-coordinator.ts', () => ({
  runRepoRefreshIntent: sectionActionMocks.refreshIntent,
}))

vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useRuntimeExternalAppSettings: () => ({
    terminalApp: 'auto',
    resolvedTerminalApp: null,
    terminalAvailable: true,
    editorApp: 'auto',
    resolvedEditorApp: null,
    editorAvailable: true,
  }),
}))

vi.mock('#/web/hooks/useBranchActionItems.tsx', () => ({
  useBranchActionItems: (_repo: unknown, branch: unknown) => ({
    patchItems: [],
    mainItems: [
      {
        id: 'createWorktree',
        label: 'action.create-worktree',
        title: 'action.create-worktree-title',
        disabled: false,
        busy: false,
        visible: true,
        icon: null,
        onSelect: sectionActionMocks.createWorktree,
      },
    ],
    externalItems: [
      {
        id: 'editor',
        label: 'Open in Editor',
        title: 'Open in Editor',
        disabled: !(branch as { worktree?: { path: string } })?.worktree?.path,
        busy: false,
        visible: true,
        icon: null,
        onSelect: () => {},
      },
      {
        id: 'terminal',
        label: 'Open in Terminal',
        title: 'Open in Terminal',
        disabled: !(branch as { worktree?: { path: string } })?.worktree?.path,
        busy: false,
        visible: true,
        icon: null,
        onSelect: () => {},
      },
    ],
    destructiveItems: [],
    dialogs: null,
  }),
}))

vi.mock('#/web/components/BranchList.tsx', () => ({
  BranchList: ({
    onBranchSelected,
    onWorktreeDoubleClick,
  }: {
    onBranchSelected?: () => void
    onWorktreeDoubleClick?: () => void
  }) => (
    <div data-testid="branch-list">
      {onBranchSelected && (
        <button type="button" data-testid="mock-select-branch" onClick={onBranchSelected}>
          select branch
        </button>
      )}
      <button type="button" data-testid="mock-double-click-worktree" onDoubleClick={onWorktreeDoubleClick}>
        worktree
      </button>
    </div>
  ),
}))

vi.mock('#/web/components/file-tree/ProjectFileTree.tsx', () => ({
  ProjectFileTree: ({
    revealRequest,
    toolbarHeight,
  }: {
    revealRequest?: { relativePath: string } | null
    toolbarHeight?: string
  }) => (
    <div
      data-testid="project-file-tree"
      data-reveal-path={revealRequest?.relativePath ?? ''}
      data-toolbar-height={toolbarHeight ?? ''}
    />
  ),
}))

vi.mock('#/web/components/repo-workspace/ProjectChangesPanel.tsx', () => ({
  ProjectChangesPanel: ({ onRevealPath }: { onRevealPath?: (path: string) => void }) => (
    <button type="button" data-testid="project-changes-panel" onClick={() => onRevealPath?.('src/app.ts')}>
      changes
    </button>
  ),
}))

vi.mock('#/web/components/repo-workspace/ProjectStatusPanel.tsx', () => ({
  ProjectStatusPanel: () => <div data-testid="project-status-panel" />,
}))

vi.mock('#/web/components/repo-workspace/ProjectHistoryPanel.tsx', () => ({
  ProjectHistoryPanel: ({ onRevealPath }: { onRevealPath?: (path: string) => void }) => (
    <button type="button" data-testid="project-history-panel" onClick={() => onRevealPath?.('src/from-history.ts')}>
      history
    </button>
  ),
}))

vi.mock('#/web/components/repo-workspace/ProjectLocalPanel.tsx', () => ({
  ProjectLocalPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="project-local-panel" data-repo-id={repoId} />
  ),
}))

vi.mock('#/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx', () => ({
  ProjectRemoteBranchesPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="project-remote-branches-panel" data-repo-id={repoId} />
  ),
}))

vi.mock('#/web/components/repo-workspace/ProjectPortsPanel.tsx', () => ({
  ProjectPortsPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="project-ports-panel" data-repo-id={repoId} />
  ),
}))

vi.mock('#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx', () => ({
  PlainWorkspaceTerminalPanel: ({ repoId, focusMode }: { repoId: string; focusMode?: boolean }) => (
    <div data-testid="plain-workspace-terminal" data-repo-id={repoId} data-focus-mode={String(!!focusMode)} />
  ),
}))

vi.mock('#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx', () => ({
  WorkspaceRepositoryRail: ({
    workspaceRootId,
    currentRepoId,
    fill,
  }: {
    workspaceRootId: string
    currentRepoId: string
    fill?: boolean
  }) => (
    <div
      data-testid="workspace-repository-rail"
      data-workspace-root-id={workspaceRootId}
      data-current-repo-id={currentRepoId}
      data-fill={String(!!fill)}
    />
  ),
}))

// Sidebar chrome — exercised by their own suites; the status bar pulls in
// react-query (project theme menu) which this harness doesn't provide.
vi.mock('#/web/components/repo-workspace/SidebarProjectHeader.tsx', () => ({
  SidebarProjectHeader: ({
    repoId,
    onShowCompactDetail,
    onShowCompactFiles,
    onMaximizeTerminal,
  }: {
    repoId: string
    onShowCompactDetail?: () => void
    onShowCompactFiles?: () => void
    onMaximizeTerminal?: () => void
  }) => (
    <div data-testid="sidebar-project-header" data-repo-id={repoId}>
      {onShowCompactDetail && (
        <button type="button" data-testid="mock-show-compact-detail" onClick={onShowCompactDetail}>
          show detail
        </button>
      )}
      {onShowCompactFiles && (
        <button type="button" data-testid="mock-show-compact-files" onClick={onShowCompactFiles}>
          show files
        </button>
      )}
      {onMaximizeTerminal && (
        <button type="button" data-testid="mock-maximize-terminal" onClick={onMaximizeTerminal}>
          maximize terminal
        </button>
      )}
    </div>
  ),
}))

vi.mock('#/web/components/StatusBar.tsx', () => ({
  StatusBar: ({
    repoId,
    fileAreaCollapsed,
    onToggleFileArea,
  }: {
    repoId: string | null
    fileAreaCollapsed?: boolean
    onToggleFileArea?: () => void
  }) => (
    <footer
      data-testid="statusbar"
      data-repo-id={repoId}
      data-file-area-collapsed={fileAreaCollapsed === undefined ? 'unset' : String(fileAreaCollapsed)}
    >
      {onToggleFileArea && (
        <button type="button" data-testid="statusbar-file-area-toggle" onClick={onToggleFileArea}>
          toggle files
        </button>
      )}
    </footer>
  ),
}))

vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: ({
    before,
    after,
    orientation,
    afterSize,
    beforeCollapsed,
    afterCollapsed,
    onAfterSizeChange,
  }: {
    before: React.ReactNode
    after: React.ReactNode
    orientation: string
    afterSize: number
    beforeCollapsed?: boolean
    afterCollapsed?: boolean
    onAfterSizeChange?: (size: number) => void
  }) => (
    <div
      data-testid="split-pane"
      data-orientation={orientation}
      data-after-size={String(afterSize)}
      data-before-collapsed={String(!!beforeCollapsed)}
      data-after-collapsed={String(!!afterCollapsed)}
    >
      <button type="button" data-testid="resize-file-tree-pane" onClick={() => onAfterSizeChange?.(44.44)}>
        resize
      </button>
      <div data-testid="split-pane-before">{before}</div>
      <div data-testid="split-pane-after">{after}</div>
    </div>
  ),
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  compactUi = false
  sectionActionMocks.createWorktree.mockReset()
  sectionActionMocks.refreshIntent.mockReset()
  detachedWindowMocks.enabled = false
  detachedWindowMocks.open.mockClear()
  resetReposStore()
  resetExplorerOverflowExpanded()
  seedRepoState({
    id: REPO_ID,
    branches: [createRepoBranch('main')],
    currentBranch: 'main',
    selectedBranch: 'main',
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('RepoExplorerPane', () => {
  test('opens an Electron file area tab in a detached window after an outside drag release', async () => {
    detachedWindowMocks.enabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const filesTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    expect(filesTab?.draggable).toBe(true)
    const dataTransfer = { effectAllowed: '', setData: vi.fn() }
    const dragStart = new Event('dragstart', { bubbles: true })
    Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer })
    const dragEnd = new Event('dragend', { bubbles: true })
    Object.defineProperties(dragEnd, {
      clientX: { value: -1 },
      clientY: { value: 100 },
      screenX: { value: 1200 },
      screenY: { value: 420 },
    })

    await act(async () => {
      filesTab?.dispatchEvent(dragStart)
      filesTab?.dispatchEvent(dragEnd)
    })

    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(detachedWindowMocks.open).toHaveBeenCalledWith({
      repo: { kind: 'local', id: REPO_ID },
      branch: 'main',
      tab: 'files',
      releasePoint: { x: 1200, y: 420 },
    })
    await act(async () => root.unmount())
  })

  test('keeps an Electron file area tab in place after a drag release inside the source window', async () => {
    detachedWindowMocks.enabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const filesTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    const dragEnd = new Event('dragend', { bubbles: true })
    Object.defineProperties(dragEnd, {
      clientX: { value: 100 },
      clientY: { value: 100 },
      screenX: { value: 500 },
      screenY: { value: 300 },
    })
    await act(async () => filesTab?.dispatchEvent(dragEnd))

    expect(detachedWindowMocks.open).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('opens the focused file area tab with Shift+Enter and leaves unavailable renderer tabs unchanged', async () => {
    detachedWindowMocks.enabled = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const filesTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    await act(async () => {
      filesTab?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true }))
    })
    expect(detachedWindowMocks.open).toHaveBeenCalledWith({
      repo: { kind: 'local', id: REPO_ID },
      branch: 'main',
      tab: 'files',
    })

    detachedWindowMocks.enabled = false
    detachedWindowMocks.open.mockClear()
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })
    const webFilesTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    expect(webFilesTab?.draggable).toBe(false)
    await act(async () => {
      webFilesTab?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true }))
    })
    expect(detachedWindowMocks.open).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  test('renders the repository manifest above the root file tree on workspace Overview', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
          repositoryIds: [`${REPO_ID}/api`],
          candidates: [],
          configured: false,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const before = container.querySelector('[data-testid="split-pane-before"]')
    const rail = before?.querySelector('[data-testid="workspace-repository-rail"]')
    expect(rail?.getAttribute('data-workspace-root-id')).toBe(REPO_ID)
    expect(rail?.getAttribute('data-current-repo-id')).toBe(REPO_ID)
    expect(before?.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('renders the repository manifest above worktrees for a workspace child', async () => {
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]
      if (!repo) return state
      repo.workspaceRootId = '/workspace'
      return {
        repos: { ...state.repos, [REPO_ID]: repo },
        activeProjectId: '/workspace',
        workspaceProjects: {
          '/workspace': {
            rootId: '/workspace',
            repositoryIds: [REPO_ID],
            candidates: [{ id: REPO_ID, name: 'repo', selected: true, available: true }],
            configured: true,
            configurationError: null,
            phase: 'ready',
            skipped: [],
            error: null,
          },
        },
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const sidebar = container.querySelector('[data-testid="split-pane-before"]')
    const rail = sidebar?.querySelector('[data-testid="workspace-repository-rail"]')
    expect(rail?.getAttribute('data-workspace-root-id')).toBe('/workspace')
    expect(rail?.getAttribute('data-current-repo-id')).toBe(REPO_ID)
    expect(sidebar?.querySelector('[data-testid="branch-list"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  test('does not render workspace navigation for a shared repository opened as a standalone project', async () => {
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]
      if (!repo) return state
      repo.workspaceRootId = '/workspace'
      return {
        repos: { ...state.repos, [REPO_ID]: repo },
        order: ['/workspace', REPO_ID],
        activeId: REPO_ID,
        activeProjectId: REPO_ID,
        workspaceProjects: {
          '/workspace': {
            rootId: '/workspace',
            repositoryIds: [REPO_ID],
            candidates: [{ id: REPO_ID, name: 'repo', selected: true, available: true }],
            configured: true,
            configurationError: null,
            phase: 'ready',
            skipped: [],
            error: null,
          },
        },
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="workspace-repository-rail"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('renders non-git local workspaces as files and terminal only without a branch pane', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="branch-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-area-toolbar"]')).toBeNull()

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs).toEqual([])
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')?.getAttribute('data-repo-id')).toBe(
      REPO_ID,
    )
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-history-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-tags-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-ports-panel"]')).toBeNull()
    expect(container.textContent).not.toContain('branches.empty')
    await act(async () => root.unmount())
  })

  test('keeps desktop plain workspace chrome in the left pane beside the full-height terminal', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const split = container.querySelector('[data-testid="split-pane"]')
    const before = container.querySelector('[data-testid="split-pane-before"]')
    const after = container.querySelector('[data-testid="split-pane-after"]')
    const plainWorkspaceSidebar = before?.querySelector('[data-testid="sidebar-project-header"]')?.parentElement

    expect(split?.getAttribute('data-orientation')).toBe('horizontal')
    expect(plainWorkspaceSidebar?.className).toContain('project-file-area-tone')
    expect(plainWorkspaceSidebar?.className).toContain('bg-topbar')
    expect(before?.querySelector('[data-testid="sidebar-project-header"]')).toBeTruthy()
    expect(before?.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(before?.querySelector('[data-testid="statusbar"]')).toBeTruthy()
    expect(before?.querySelector('[data-testid="plain-workspace-terminal"]')).toBeNull()
    expect(after?.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()
    expect(after?.querySelector('[data-testid="sidebar-project-header"]')).toBeNull()
    expect(after?.querySelector('[data-testid="statusbar"]')).toBeNull()

    await act(async () => root.unmount())
  })

  test('renders explicit desktop terminal focus for a plain workspace', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions={false}
          terminalFocusMode
          onMaximizeTerminal={() => {}}
          onExitTerminalFocus={() => {}}
        />,
      )
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="sidebar-project-header"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).toBeNull()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')?.getAttribute('data-focus-mode')).toBe(
      'true',
    )
    await act(async () => root.unmount())
  })

  test('keeps compact plain workspaces on files focus independently of desktop focus', async () => {
    compactUi = true
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions={false} compactSurface="files" />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('keeps unavailable plain workspaces split when terminal focus is requested', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]
      if (!repo) return state
      return {
        repos: {
          ...state.repos,
          [REPO_ID]: {
            ...repo,
            availability: { phase: 'unavailable' as const, reason: 'path-missing', checkedAt: 1 },
          },
        },
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions={false}
          plainWorkspaceTerminalPanel={<div data-testid="unavailable-panel" />}
          terminalFocusMode
        />,
      )
    })

    expect(container.querySelector('[data-testid="split-pane"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="sidebar-project-header"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="unavailable-panel"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  test('replaces only the plain workspace terminal panel when an override is provided', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          plainWorkspaceTerminalPanel={<div data-testid="unavailable-panel" />}
        />,
      )
    })

    expect(container.querySelector('[data-testid="sidebar-project-header"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="unavailable-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('renders non-git remote workspaces as files and terminal only without a branch pane', async () => {
    seedRepoState({
      id: REMOTE_REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
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
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REMOTE_REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="branch-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')?.getAttribute('data-repo-id')).toBe(
      REMOTE_REPO_ID,
    )
    expect(container.querySelector('[data-testid="project-tags-panel"]')).toBeNull()

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs).toEqual([])
    await act(async () => root.unmount())
  })

  test('plain workspace external reveal requests are passed to the file tree while terminal stays visible', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          revealRequest={{ id: 1, repoId: REPO_ID, relativePath: 'src/from-terminal.ts' }}
        />,
      )
    })

    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
    await act(async () => root.unmount())
  })

  test('plain workspace file area uses terminal-height file toolbar without rendering git explorer tabs', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-toolbar-height')).toBe(
      'detail',
    )
    expect(container.querySelector('[data-testid="plain-workspace-file-toolbar"]')).toBeNull()
    expect(container.querySelector('[data-testid="repo-explorer-toolbar"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('plain workspace ignores outer detail tab and keeps files with terminal visible', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
      detailTab: 'terminal',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="branch-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')?.getAttribute('data-repo-id')).toBe(
      REPO_ID,
    )
    expect(container.textContent).not.toContain('branches.empty')
    await act(async () => root.unmount())
  })

  test('collapses the desktop workspace Overview bottom file area and keeps its chrome reachable', async () => {
    const onToggleFileArea = vi.fn()
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
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
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions={false}
          fileAreaCollapsed
          onToggleFileArea={onToggleFileArea}
        />,
      )
    })

    const splitPanes = container.querySelectorAll('[data-testid="split-pane"]')
    expect(splitPanes).toHaveLength(2)
    expect(splitPanes[0]?.getAttribute('data-before-collapsed')).toBe('false')
    expect(splitPanes[1]?.getAttribute('data-after-collapsed')).toBe('true')
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    const rail = container.querySelector('[data-testid="workspace-repository-rail"]')
    expect(rail).not.toBeNull()
    expect(rail?.getAttribute('data-fill')).toBe('true')
    expect(rail?.closest('.project-navigation-tone')).not.toBeNull()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-testid="statusbar"]')).toHaveLength(1)
    expect(container.querySelector('[data-testid="statusbar"]')?.getAttribute('data-file-area-collapsed')).toBe('true')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="statusbar-file-area-toggle"]')?.click()
    })
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('keeps a flexible content region above the status bar when a plain workspace without child repositories is collapsed', async () => {
    const onToggleFileArea = vi.fn()
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions={false}
          fileAreaCollapsed
          onToggleFileArea={onToggleFileArea}
        />,
      )
    })

    const statusBar = container.querySelector('[data-testid="statusbar"]')
    expect(container.querySelector('[data-testid="workspace-repository-rail"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(statusBar?.previousElementSibling?.className).toContain('flex-1')
    expect(statusBar?.getAttribute('data-file-area-collapsed')).toBe('true')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="statusbar-file-area-toggle"]')?.click()
    })
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('keeps a compact plain workspace file area expanded', async () => {
    compactUi = true
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions={false}
          compactSurface="files"
          fileAreaCollapsed
          onToggleFileArea={() => {}}
        />,
      )
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  test('renders compact plain workspace overview without mounting its file tree or terminal', async () => {
    const onShowCompactDetail = vi.fn()
    compactUi = true
    seedRepoState({
      id: REPO_ID,
      isGitRepo: false,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    useReposStore.setState({
      workspaceProjects: {
        [REPO_ID]: {
          rootId: REPO_ID,
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
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions={false}
          compactSurface="scope"
          onShowCompactDetail={onShowCompactDetail}
        />,
      )
    })

    expect(container.querySelector('[data-testid="sidebar-project-header"]')).not.toBeNull()
    const rail = container.querySelector('[data-testid="workspace-repository-rail"]')
    expect(rail).not.toBeNull()
    expect(rail?.closest('.project-navigation-tone')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="mock-show-compact-detail"]')?.click()
    })
    expect(onShowCompactDetail).toHaveBeenCalledTimes(1)

    await act(async () => root.unmount())
  })

  test('renders branch list without a branch-area toolbar above it', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main'), createRepoBranch('feature/a')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const branchToolbar = container.querySelector<HTMLElement>('[data-testid="branch-area-toolbar"]')
    const branchList = container.querySelector('[data-testid="branch-list"]')
    expect(branchToolbar).toBeNull()
    expect(branchList).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('places new worktree and sync actions at the right of the worktree section label', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const createWorktree = container.querySelector<HTMLButtonElement>(
      'button[aria-label="action.create-worktree-title"]',
    )
    const sync = container.querySelector<HTMLButtonElement>('button[aria-label="action.refresh"]')

    expect(createWorktree?.querySelector('.lucide-folder-plus')).not.toBeNull()
    expect(sync?.querySelector('.lucide-refresh-cw')).not.toBeNull()
    expect(createWorktree!.compareDocumentPosition(sync!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      createWorktree?.click()
      sync?.click()
    })

    expect(sectionActionMocks.createWorktree).toHaveBeenCalledTimes(1)
    expect(sectionActionMocks.refreshIntent).toHaveBeenCalledWith(useReposStore.getState, {
      kind: 'manual-refresh-requested',
      id: REPO_ID,
      token: useReposStore.getState().repos[REPO_ID]?.instanceToken,
    })
    await act(async () => root.unmount())
  })

  test('keeps new worktree visible but disabled without a selected branch', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [],
      currentBranch: '',
      selectedBranch: null,
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="action.create-worktree-title"]')?.disabled,
    ).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="action.refresh"]')?.disabled).toBe(false)
    await act(async () => root.unmount())
  })

  test('matches file and branch toolbar height while inheriting the global file topbar font size', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const branchToolbar = container.querySelector<HTMLElement>('[data-testid="branch-area-toolbar"]')
    const explorerToolbar = container.querySelector<HTMLElement>('[data-testid="repo-explorer-toolbar"]')
    const repoFileArea = container.querySelector<HTMLElement>('[data-repo-worktree-explorer]')
    const fileTree = container.querySelector<HTMLElement>('[data-testid="project-file-tree"]')
    const firstTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    const tabIcons = Array.from(container.querySelectorAll<SVGElement>('[role="tab"] svg'))
    expect(branchToolbar).toBeNull()
    expect(explorerToolbar?.style.height).toBe('41px')
    expect(explorerToolbar?.className).not.toContain('h-8')
    expect(explorerToolbar?.className).toContain('border-y-0')
    expect(repoFileArea?.className).toContain('project-file-area-tone')
    expect(repoFileArea?.className).not.toContain('border-t')
    expect(repoFileArea?.className).not.toContain('border-separator')
    expect(fileTree?.getAttribute('data-toolbar-height')).toBe('detail')
    expect(explorerToolbar?.style.getPropertyValue('--goblin-file-tree-topbar-font-size')).toBe('')
    expect(firstTab?.className).toContain('text-[length:var(--goblin-file-tree-topbar-font-size)]')
    expect(tabIcons).toHaveLength(3)
    expect(tabIcons.every((icon) => icon.classList.contains('size-3.5'))).toBe(true)
    await act(async () => root.unmount())
  })

  test('uses compact spacing and an input border for the active file area tab', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const activeTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')
    const inactiveTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'false')

    expect(activeTab?.classList.contains('gap-1')).toBe(true)
    expect(activeTab?.classList.contains('px-2')).toBe(true)
    expect(activeTab?.classList.contains('border-input')).toBe(true)
    expect(activeTab?.classList.contains('bg-tab-active')).toBe(true)
    expect(inactiveTab?.classList.contains('border-separator')).toBe(true)

    await act(async () => root.unmount())
  })

  test('uses default file tree pane size when the repo has no project override', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    useReposStore.setState({ fileTreePaneSizes: { 'left-right': 70.5 } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-size')).toBe('70.5')
    await act(async () => root.unmount())
  })

  test('uses project file tree pane size before the default', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
      fileTreePaneSizes: { 'left-right': 64.1 },
    })
    useReposStore.setState({ fileTreePaneSizes: { 'left-right': 70.5 } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-size')).toBe('64.1')
    await act(async () => root.unmount())
  })

  test('resizing writes a project file tree pane size without changing defaults', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    useReposStore.setState({ fileTreePaneSizes: { 'left-right': 70.5 } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="resize-file-tree-pane"]')?.click()
    })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'left-right': 44.4,
    })
    expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'left-right': 70.5 })
    await act(async () => root.unmount())
  })

  test('keeps the desktop branch list above the file tree in the fixed layout', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })
    expect(container.querySelector('[data-file-tree-layout="left-right"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-orientation')).toBe('vertical')
    expect(container.querySelector('[data-testid="branch-list"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('stacks the file tree below branch navigation in left-right workspace layout', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })
    expect(container.querySelector('[data-file-tree-layout="left-right"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-orientation')).toBe('vertical')
    expect(container.querySelector('[data-testid="split-pane-before"] [data-testid="branch-list"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="split-pane-after"] [data-testid="project-file-tree"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  test('collapses the selected repository file area while retaining branches and status controls', async () => {
    const onToggleFileArea = vi.fn()
    useReposStore.setState((state) => {
      const repo = state.repos[REPO_ID]!
      repo.workspaceRootId = '/workspace'
      return {
        repos: { ...state.repos, [REPO_ID]: repo },
        workspaceProjects: {
          '/workspace': {
            rootId: '/workspace',
            repositoryIds: [REPO_ID],
            candidates: [{ id: REPO_ID, name: 'repo', selected: true, available: true }],
            configured: true,
            configurationError: null,
            phase: 'ready',
            skipped: [],
            error: null,
          },
        },
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          fileAreaCollapsed
          onToggleFileArea={onToggleFileArea}
        />,
      )
    })

    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-collapsed')).toBe('true')
    expect(container.querySelector('[data-testid="repo-explorer-toolbar"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    const branchList = container.querySelector('[data-testid="branch-list"]')
    expect(branchList).not.toBeNull()
    expect(branchList?.parentElement?.parentElement?.className).toContain('bg-sidebar')
    expect(branchList?.parentElement?.parentElement?.className).toContain('project-navigation-tone')
    expect(container.querySelector('[data-testid="statusbar"]')?.getAttribute('data-file-area-collapsed')).toBe('true')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="statusbar-file-area-toggle"]')?.click()
    })
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('opens a collapsed worktree file area on the Files tab when its item is double-clicked', async () => {
    const onToggleFileArea = vi.fn()
    useReposStore.getState().setExplorerTab(REPO_ID, 'changes')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          fileAreaCollapsed
          onToggleFileArea={onToggleFileArea}
        />,
      )
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="mock-double-click-worktree"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    })

    expect(explorerTabForRepo(useReposStore.getState().repos[REPO_ID]!)).toBe('files')
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('closes an expanded worktree file area without changing its selected tab on double-click', async () => {
    const onToggleFileArea = vi.fn()
    useReposStore.getState().setExplorerTab(REPO_ID, 'changes')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          fileAreaCollapsed={false}
          onToggleFileArea={onToggleFileArea}
        />,
      )
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="mock-double-click-worktree"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    })

    expect(explorerTabForRepo(useReposStore.getState().repos[REPO_ID]!)).toBe('changes')
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('keeps the file area expanded in compact UI when the desktop preference is collapsed', async () => {
    compactUi = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          compactSurface="files"
          fileAreaCollapsed
          onToggleFileArea={() => {}}
        />,
      )
    })

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).not.toBeNull()
    await act(async () => root.unmount())
  })

  test('renders compact explorer chrome vertically and forwards branch selection to detail navigation', async () => {
    compactUi = true
    const onShowCompactDetail = vi.fn()
    const onShowCompactFiles = vi.fn()
    const onBranchSelected = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="left-right"
          showActions
          compactSurface="scope"
          onShowCompactDetail={onShowCompactDetail}
          onShowCompactFiles={onShowCompactFiles}
          onBranchSelected={onBranchSelected}
        />,
      )
    })

    expect(container.querySelector('[data-testid="sidebar-project-header"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')?.getAttribute('data-file-area-collapsed')).toBe('unset')
    expect(container.querySelector('[data-testid="statusbar-file-area-toggle"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-list"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="mock-select-branch"]')?.click()
      container.querySelector<HTMLButtonElement>('[data-testid="mock-show-compact-detail"]')?.click()
      container.querySelector<HTMLButtonElement>('[data-testid="mock-show-compact-files"]')?.click()
    })

    expect(onBranchSelected).toHaveBeenCalledTimes(1)
    expect(onShowCompactDetail).toHaveBeenCalledTimes(1)
    expect(onShowCompactFiles).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('switches the local explorer area between file, changes, and status tabs', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status'])
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()

    await act(async () => {
      tabs[1]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeTruthy()
    expect(useReposStore.getState().repos[REPO_ID]?.ui.explorerTabByBranch.main).toBe('changes')

    await act(async () => {
      tabs[2]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-ports-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-tags-panel"]')).toBeNull()
    expect(useReposStore.getState().repos[REPO_ID]?.ui.explorerTabByBranch.main).toBe('status')
    await act(async () => root.unmount())
  })

  test('restores each repo explorer tab when the same component position changes repoId', async () => {
    const repoA = seedRepoState({ id: REPO_ID, selectedBranch: 'main', explorerTab: 'history' })
    const repoB = seedRepoState({ id: REPO_B_ID, selectedBranch: 'main', explorerTab: 'changes' })
    useReposStore.setState({
      repos: { [REPO_ID]: repoA, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })
    expect(container.querySelector('[data-testid="project-history-panel"]')).toBeTruthy()

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_B_ID} layout="left-right" showActions />)
    })
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeTruthy()

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })
    expect(container.querySelector('[data-testid="project-history-panel"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('does not replay a file reveal request in another repo', async () => {
    const repoA = useReposStore.getState().repos[REPO_ID]
    const repoB = seedRepoState({ id: REPO_B_ID, selectedBranch: 'main', explorerTab: 'changes' })
    useReposStore.setState(() => ({
      repos: { [REPO_ID]: repoA!, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
    }))
    const revealRequest = { id: 1, repoId: REPO_ID, relativePath: 'src/from-terminal.ts' }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions revealRequest={revealRequest} />)
    })
    const revealRepo = useReposStore.getState().repos[REPO_ID]
    expect(revealRepo).toBeTruthy()
    expect(explorerTabForRepo(revealRepo!)).toBe('files')

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_B_ID} layout="left-right" showActions revealRequest={revealRequest} />)
    })
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeTruthy()
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.explorerTabByBranch.main).toBe('changes')
    await act(async () => root.unmount())
  })

  test('keeps the ports tab available for remote repositories', async () => {
    seedRepoState({
      id: 'ssh-config://prod/srv/repo',
      branches: [createRepoBranch('main', { worktree: { path: '/srv/repo' } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="ssh-config://prod/srv/repo" layout="left-right" showActions />)
    })

    let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(['tab.status', 'file-tree.title', 'tab.changes'])

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'tab.status',
      'file-tree.title',
      'tab.changes',
      'tab.history',
      'tab.local',
      'tab.remote-branches',
      'ports.title',
    ])
    await act(async () => {
      tabs[6]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-tags-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-ports-panel"]')?.getAttribute('data-repo-id')).toBe(
      'ssh-config://prod/srv/repo',
    )
    expect(useReposStore.getState().repos['ssh-config://prod/srv/repo']?.ui.explorerTabByBranch.main).toBe('ports')
    await act(async () => root.unmount())
  })

  test('renders remote branches tab for git repositories', async () => {
    seedRepoState({
      id: REPO_ID,
      isGitRepo: true,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    // remote-branches is in the collapsed overflow area — expand it and click the real tab
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const remoteBranchesTab = tabs.find((tab) => tab.textContent === 'tab.remote-branches')
    expect(remoteBranchesTab).toBeTruthy()

    await act(async () => {
      remoteBranchesTab?.click()
    })

    expect(container.querySelector('[data-testid="project-remote-branches-panel"]')?.getAttribute('data-repo-id')).toBe(
      REPO_ID,
    )
    await act(async () => root.unmount())
  })

  test('uses the shared scroll row contract so all explorer tabs remain reachable', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })

    const tablist = container.querySelector<HTMLElement>('[role="tablist"]')
    expect(tablist?.className).toContain('w-max')
    expect(tablist?.className).toContain('min-w-full')
    expect(tablist?.className).toContain('gap-0.5')
    expect(tablist?.getAttribute('aria-orientation')).toBe('horizontal')
    expect(container.querySelectorAll('[role="tab"]').length).toBe(3)
    await act(async () => root.unmount())
  })

  test('changed file clicks switch back to files with a reveal request', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    await act(async () => {
      tabs[1]?.click()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="project-changes-panel"]')?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
      'src/app.ts',
    )
    const repo = useReposStore.getState().repos[REPO_ID]
    expect(repo && explorerTabForRepo(repo)).toBe('files')
    await act(async () => root.unmount())
  })

  test('history file clicks switch back to files with a reveal request', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    const historyTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (tab) => tab.textContent === 'tab.history',
    )
    await act(async () => {
      historyTab?.click()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="project-history-panel"]')?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-history.ts',
    )
    const repo2 = useReposStore.getState().repos[REPO_ID]
    expect(repo2 && explorerTabForRepo(repo2)).toBe('files')
    await act(async () => root.unmount())
  })

  test('external reveal requests switch to files with the requested path', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    await act(async () => {
      tabs[2]?.click()
    })
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeTruthy()

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId="/repo"
          layout="left-right"
          showActions
          revealRequest={{ id: 1, repoId: REPO_ID, relativePath: 'src/from-terminal.ts' }}
        />,
      )
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
    const repo3 = useReposStore.getState().repos[REPO_ID]
    expect(repo3 && explorerTabForRepo(repo3)).toBe('files')
    await act(async () => root.unmount())
  })

  test('collapses overflow tabs by default behind an expand-right toggle', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status'])
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')
    expect(toggle).toBeTruthy()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.getAttribute('aria-label')).toBe('file-tree.tabs.expand')
    await act(async () => root.unmount())
  })

  test('expands overflow tabs inline to the right and collapses them again', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })

    let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
      'tab.local',
      'tab.remote-branches',
    ])
    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(toggle?.getAttribute('aria-label')).toBe('file-tree.tabs.collapse')

    // expanded overflow tabs are real tabs — clicking one switches the panel
    await act(async () => {
      tabs[4]?.click()
    })
    expect(container.querySelector('[data-testid="project-local-panel"]')).toBeTruthy()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    // collapsed again, but the active overflow tab stays visible beside the toggle
    expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status', 'tab.local'])
    await act(async () => root.unmount())
  })

  test('shows the active history tab inline while overflow is collapsed', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    await act(async () => {
      useReposStore.getState().setExplorerTab(REPO_ID, 'history')
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status', 'tab.history'])
    expect(tabs[3]?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-testid="project-history-panel"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('shows the active overflow tab inline while collapsed', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    await act(async () => {
      useReposStore.getState().setExplorerTab(REPO_ID, 'remoteBranches')
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.remote-branches',
    ])
    expect(tabs[3]?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-testid="project-remote-branches-panel"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('remembers the expanded state across remounts within the session', async () => {
    seedRepoState({ id: REPO_B_ID, selectedBranch: 'main' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    await act(async () => root.unmount())

    const root2 = createRoot(container)
    await act(async () => {
      root2.render(<RepoExplorerPane repoId={REPO_B_ID} layout="left-right" showActions />)
    })
    expect(
      container.querySelector('[data-testid="explorer-tabs-overflow-toggle"]')?.getAttribute('aria-expanded'),
    ).toBe('true')
    expect(Array.from(container.querySelectorAll('[role="tab"]')).length).toBe(6)
    await act(async () => root2.unmount())
  })

  test('branch area no longer renders a toolbar for external app buttons (moved to inline rows)', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main', { worktree: { path: '/repos/main' } })],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="left-right" showActions />)
    })

    // toolbar removed entirely — editor/terminal buttons are on individual branch rows now
    expect(container.querySelector('[data-testid="branch-area-toolbar"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-area-editor-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-area-terminal-btn"]')).toBeNull()

    await act(async () => root.unmount())
  })
})

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoExplorerPane, resetExplorerOverflowExpanded } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { explorerTabForRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const REPO_ID = '/repo'
const REPO_B_ID = '/repo-b'
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'
let compactUi = false
const runtimeFontSettings = vi.hoisted(() => ({
  fileTreeFontSize: 12,
  fileTreeTopbarFontSize: 13,
  terminalFontSize: 14,
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
    mainItems: [],
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
  BranchList: ({ onBranchSelected }: { onBranchSelected?: () => void }) => (
    <div data-testid="branch-list">
      {onBranchSelected && (
        <button type="button" data-testid="mock-select-branch" onClick={onBranchSelected}>
          select branch
        </button>
      )}
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
  PlainWorkspaceTerminalPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="plain-workspace-terminal" data-repo-id={repoId} />
  ),
}))

// Sidebar chrome — exercised by their own suites; the status bar pulls in
// react-query (project theme menu) which this harness doesn't provide.
vi.mock('#/web/components/repo-workspace/SidebarProjectHeader.tsx', () => ({
  SidebarProjectHeader: ({ repoId, onShowCompactDetail }: { repoId: string; onShowCompactDetail?: () => void }) => (
    <div data-testid="sidebar-project-header" data-repo-id={repoId}>
      {onShowCompactDetail && (
        <button type="button" data-testid="mock-show-compact-detail" onClick={onShowCompactDetail}>
          show detail
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
    afterCollapsed,
    onAfterSizeChange,
  }: {
    before: React.ReactNode
    after: React.ReactNode
    orientation: string
    afterSize: number
    afterCollapsed?: boolean
    onAfterSizeChange?: (size: number) => void
  }) => (
    <div
      data-testid="split-pane"
      data-orientation={orientation}
      data-after-size={String(afterSize)}
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
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

    expect(split?.getAttribute('data-orientation')).toBe('horizontal')
    expect(before?.querySelector('[data-testid="sidebar-project-header"]')).toBeTruthy()
    expect(before?.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(before?.querySelector('[data-testid="statusbar"]')).toBeTruthy()
    expect(before?.querySelector('[data-testid="plain-workspace-terminal"]')).toBeNull()
    expect(after?.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()
    expect(after?.querySelector('[data-testid="sidebar-project-header"]')).toBeNull()
    expect(after?.querySelector('[data-testid="statusbar"]')).toBeNull()

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
          layout="top-bottom"
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
      root.render(<RepoExplorerPane repoId={REMOTE_REPO_ID} layout="top-bottom" showActions />)
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="top-bottom"
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const branchToolbar = container.querySelector<HTMLElement>('[data-testid="branch-area-toolbar"]')
    const branchList = container.querySelector('[data-testid="branch-list"]')
    expect(branchToolbar).toBeNull()
    expect(branchList).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('matches file and branch toolbar height while using the configured file topbar font size', async () => {
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const branchToolbar = container.querySelector<HTMLElement>('[data-testid="branch-area-toolbar"]')
    const explorerToolbar = container.querySelector<HTMLElement>('[data-testid="repo-explorer-toolbar"]')
    const fileTree = container.querySelector<HTMLElement>('[data-testid="project-file-tree"]')
    const firstTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    const tabIcons = Array.from(container.querySelectorAll<SVGElement>('[role="tab"] svg'))
    expect(branchToolbar).toBeNull()
    expect(explorerToolbar?.style.height).toBe('41px')
    expect(explorerToolbar?.className).not.toContain('h-8')
    expect(fileTree?.getAttribute('data-toolbar-height')).toBe('detail')
    expect(explorerToolbar?.style.getPropertyValue('--goblin-file-tree-topbar-font-size')).toBe('13px')
    expect(firstTab?.className).toContain('text-[length:var(--goblin-file-tree-topbar-font-size)]')
    expect(tabIcons).toHaveLength(4)
    expect(tabIcons.every((icon) => icon.classList.contains('size-3.5'))).toBe(true)
    await act(async () => root.unmount())
  })

  test('uses default file tree pane size when the repo has no project override', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    useReposStore.setState({ fileTreePaneSizes: { 'top-bottom': 41.5, 'left-right': 70.5 } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-size')).toBe('41.5')
    await act(async () => root.unmount())
  })

  test('uses project file tree pane size before the default', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
      fileTreePaneSizes: { 'top-bottom': 38.2, 'left-right': 64.1 },
    })
    useReposStore.setState({ fileTreePaneSizes: { 'top-bottom': 41.5, 'left-right': 70.5 } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-size')).toBe('38.2')
    await act(async () => root.unmount())
  })

  test('resizing writes a project file tree pane size without changing defaults', async () => {
    seedRepoState({
      id: REPO_ID,
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    useReposStore.setState({ fileTreePaneSizes: { 'top-bottom': 41.5, 'left-right': 70.5 } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="resize-file-tree-pane"]')?.click()
    })

    expect(useReposStore.getState().repos[REPO_ID]?.ui.fileTreePaneSizes).toEqual({
      'top-bottom': 44.4,
      'left-right': 70.5,
    })
    expect(useReposStore.getState().fileTreePaneSizes).toEqual({ 'top-bottom': 41.5, 'left-right': 70.5 })
    await act(async () => root.unmount())
  })

  test('keeps branch list beside file tree in top-bottom workspace layout', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
    })
    expect(container.querySelector('[data-file-tree-layout="top-bottom"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-orientation')).toBe('horizontal')
    expect(container.querySelector('[data-testid="branch-list"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('stacks branch list above file tree in left-right workspace layout', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="left-right" showActions />)
    })
    expect(container.querySelector('[data-file-tree-layout="left-right"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-orientation')).toBe('vertical')
    await act(async () => root.unmount())
  })

  test('forwards controlled file area collapse to the split pane and status bar', async () => {
    const onToggleFileArea = vi.fn()
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
    const branchList = container.querySelector('[data-testid="branch-list"]')
    expect(branchList).not.toBeNull()
    expect(branchList?.parentElement?.parentElement?.className).toContain('bg-sidebar')
    expect(container.querySelector('[data-testid="statusbar"]')?.getAttribute('data-file-area-collapsed')).toBe('true')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="statusbar-file-area-toggle"]')?.click()
    })
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
          layout="top-bottom"
          showActions
          fileAreaCollapsed
          onToggleFileArea={() => {}}
        />,
      )
    })

    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-after-collapsed')).toBe('false')
    expect(container.querySelector('[data-testid="project-file-tree"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('renders compact explorer chrome vertically and forwards branch selection to detail navigation', async () => {
    compactUi = true
    const onShowCompactDetail = vi.fn()
    const onBranchSelected = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <RepoExplorerPane
          repoId={REPO_ID}
          layout="top-bottom"
          showActions
          onShowCompactDetail={onShowCompactDetail}
          onBranchSelected={onBranchSelected}
        />,
      )
    })

    expect(container.querySelector('[data-testid="sidebar-project-header"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="statusbar"]')?.getAttribute('data-file-area-collapsed')).toBe(
      'unset',
    )
    expect(container.querySelector('[data-testid="statusbar-file-area-toggle"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')?.getAttribute('data-orientation')).toBe('vertical')

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="mock-select-branch"]')?.click()
      container.querySelector<HTMLButtonElement>('[data-testid="mock-show-compact-detail"]')?.click()
    })

    expect(onBranchSelected).toHaveBeenCalledTimes(1)
    expect(onShowCompactDetail).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })

  test('switches the local explorer area between file, changes, and status tabs', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
    ])
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })
    expect(container.querySelector('[data-testid="project-history-panel"]')).toBeTruthy()

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_B_ID} layout="top-bottom" showActions />)
    })
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeTruthy()

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })
    expect(container.querySelector('[data-testid="project-history-panel"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('does not replay a file reveal request in another repo', async () => {
    const repoA = useReposStore.getState().repos[REPO_ID]
    const repoB = seedRepoState({ id: REPO_B_ID, selectedBranch: 'main', explorerTab: 'changes' })
    useReposStore.setState((state) => ({
      repos: { [REPO_ID]: repoA!, [REPO_B_ID]: repoB },
      order: [REPO_ID, REPO_B_ID],
    }))
    const revealRequest = { id: 1, repoId: REPO_ID, relativePath: 'src/from-terminal.ts' }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions revealRequest={revealRequest} />)
    })
    const revealRepo = useReposStore.getState().repos[REPO_ID]
    expect(revealRepo).toBeTruthy()
    expect(explorerTabForRepo(revealRepo!)).toBe('files')

    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_B_ID} layout="top-bottom" showActions revealRequest={revealRequest} />)
    })
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeTruthy()
    expect(useReposStore.getState().repos[REPO_B_ID]?.ui.explorerTabByBranch.main).toBe('changes')
    await act(async () => root.unmount())
  })

  test('keeps the ports tab available for remote repositories', async () => {
    seedRepoState({
      id: 'ssh-config://prod/srv/repo',
      branches: [createRepoBranch('main')],
      currentBranch: 'main',
      selectedBranch: 'main',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="ssh-config://prod/srv/repo" layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
    ])

    // ports is in the collapsed overflow area — activate it via the store action
    await act(async () => {
      useReposStore.getState().setExplorerTab('ssh-config://prod/srv/repo', 'ports')
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
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
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
    })

    const tablist = container.querySelector<HTMLElement>('[role="tablist"]')
    expect(tablist?.className).toContain('w-max')
    expect(tablist?.className).toContain('min-w-full')
    expect(tablist?.className).toContain('gap-0.5')
    expect(tablist?.getAttribute('aria-orientation')).toBe('horizontal')
    expect(container.querySelectorAll('[role="tab"]').length).toBe(4)
    await act(async () => root.unmount())
  })

  test('changed file clicks switch back to files with a reveal request', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
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
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    await act(async () => {
      tabs[3]?.click()
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
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
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
          layout="top-bottom"
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
    ])
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
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
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
      'tab.local',
    ])
    await act(async () => root.unmount())
  })

  test('shows the active overflow tab inline while collapsed', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    await act(async () => {
      useReposStore.getState().setExplorerTab(REPO_ID, 'remoteBranches')
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'file-tree.title',
      'tab.changes',
      'tab.status',
      'tab.history',
      'tab.remote-branches',
    ])
    expect(tabs[4]?.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-testid="project-remote-branches-panel"]')).toBeTruthy()
    await act(async () => root.unmount())
  })

  test('remembers the expanded state across remounts within the session', async () => {
    seedRepoState({ id: REPO_B_ID, selectedBranch: 'main' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="explorer-tabs-overflow-toggle"]')?.click()
    })
    await act(async () => root.unmount())

    const root2 = createRoot(container)
    await act(async () => {
      root2.render(<RepoExplorerPane repoId={REPO_B_ID} layout="top-bottom" showActions />)
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
      root.render(<RepoExplorerPane repoId={REPO_ID} layout="top-bottom" showActions />)
    })

    // toolbar removed entirely — editor/terminal buttons are on individual branch rows now
    expect(container.querySelector('[data-testid="branch-area-toolbar"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-area-editor-btn"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-area-terminal-btn"]')).toBeNull()

    await act(async () => root.unmount())
  })
})

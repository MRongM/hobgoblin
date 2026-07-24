// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspacePane } from '#/web/components/repo-workspace/BranchWorkspacePane.tsx'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

let compactUi = false

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({ useIsCompactUi: () => compactUi }))
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
    <div data-testid="header">
      {repoId}
      {onMaximizeTerminal ? (
        <button type="button" data-testid="header-maximize-terminal" onClick={onMaximizeTerminal}>
          focus
        </button>
      ) : null}
      {onShowCompactDetail ? (
        <button type="button" data-testid="header-detail" onClick={onShowCompactDetail}>
          detail
        </button>
      ) : null}
      {onShowCompactFiles ? (
        <button type="button" data-testid="header-files" onClick={onShowCompactFiles}>
          files
        </button>
      ) : null}
    </div>
  ),
}))
vi.mock('#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx', () => ({
  WorkspaceRepositoryRail: ({
    workspaceRootId,
    onOpenFileArea,
    onToggleFileArea,
    onOpenDetailArea,
  }: {
    workspaceRootId: string
    onOpenFileArea?: () => void
    onToggleFileArea?: () => void
    onOpenDetailArea?: () => void
  }) => (
    <div data-testid="rail">
      {workspaceRootId}
      {onOpenFileArea ? (
        <button type="button" data-testid="rail-files" onClick={onOpenFileArea}>
          member files
        </button>
      ) : null}
      {onToggleFileArea ? (
        <button type="button" data-testid="rail-toggle-files" onDoubleClick={onToggleFileArea}>
          toggle files
        </button>
      ) : null}
      {onOpenDetailArea ? (
        <button type="button" data-testid="rail-detail" onClick={onOpenDetailArea}>
          member detail
        </button>
      ) : null}
    </div>
  ),
}))
vi.mock('#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx', () => ({
  BranchWorkspaceFileTree: ({ context, toolbarLeading }: { context: { path: string }; toolbarLeading?: ReactNode }) => (
    <div data-testid="branch-workspace-file-tree">
      {toolbarLeading ? <div data-testid="mock-file-toolbar-leading">{toolbarLeading}</div> : null}
      {context.path}
    </div>
  ),
}))
vi.mock('#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx', () => ({
  BranchWorkspaceTerminalPanel: ({
    context,
    toolbarLeading,
    terminalFocusMode,
    onExitTerminalFocus,
  }: {
    context: { path: string }
    toolbarLeading?: ReactNode
    terminalFocusMode?: boolean
    onExitTerminalFocus?: () => void
  }) => (
    <div data-testid="branch-workspace-terminal-panel" data-terminal-focus={String(!!terminalFocusMode)}>
      {toolbarLeading ? <div data-testid="mock-terminal-toolbar-leading">{toolbarLeading}</div> : null}
      {onExitTerminalFocus ? (
        <button type="button" data-testid="root-exit-focus" onClick={onExitTerminalFocus}>
          exit
        </button>
      ) : null}
      {context.path}
    </div>
  ),
  openBranchWorkspaceInternalTerminal: vi.fn(async () => {}),
}))
vi.mock('#/web/components/repo-workspace/RepoWorktreeExplorer.tsx', () => ({
  RepoWorktreeExplorer: ({ repoId, toolbarLeading }: { repoId: string; toolbarLeading?: ReactNode }) => (
    <div data-testid="repo-worktree-explorer">
      {toolbarLeading ? <div data-testid="mock-file-toolbar-leading">{toolbarLeading}</div> : null}
      {repoId}
    </div>
  ),
}))
vi.mock('#/web/components/BranchDetail.tsx', () => ({
  BranchDetail: ({
    repoId,
    compactFocusPresentation,
    terminalFocusMode,
    onShowCompactExplorer,
    onExitTerminalFocus,
    onRevealPath,
  }: {
    repoId: string
    compactFocusPresentation?: boolean
    terminalFocusMode?: boolean
    onShowCompactExplorer?: () => void
    onExitTerminalFocus?: () => void
    onRevealPath?: (path: string) => void
  }) => (
    <div
      data-testid="branch-detail"
      data-compact-focus={String(!!compactFocusPresentation)}
      data-terminal-focus={String(!!terminalFocusMode)}
    >
      {repoId}
      {onExitTerminalFocus ? (
        <button type="button" data-testid="member-exit-focus" onClick={onExitTerminalFocus}>
          exit
        </button>
      ) : null}
      {onShowCompactExplorer ? (
        <button type="button" data-testid="detail-scope" onClick={onShowCompactExplorer}>
          scope
        </button>
      ) : null}
      {onRevealPath ? (
        <button type="button" data-testid="detail-reveal" onClick={() => onRevealPath('src/app.ts')}>
          reveal
        </button>
      ) : null}
    </div>
  ),
}))
vi.mock('#/web/components/StatusBar.tsx', () => ({
  StatusBar: ({
    fileAreaCollapsed,
    onToggleFileArea,
  }: {
    fileAreaCollapsed?: boolean
    onToggleFileArea?: () => void
  }) => (
    <div
      data-testid="status"
      data-file-area-collapsed={fileAreaCollapsed === undefined ? 'unset' : String(fileAreaCollapsed)}
    >
      {onToggleFileArea ? (
        <button type="button" data-testid="file-area-toggle" onClick={onToggleFileArea}>
          toggle
        </button>
      ) : null}
    </div>
  ),
}))
vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: ({
    before,
    after,
    afterCollapsed,
  }: {
    before: React.ReactNode
    after: React.ReactNode
    afterCollapsed?: boolean
  }) => (
    <div data-testid="split-pane" data-after-collapsed={String(!!afterCollapsed)}>
      {before}
      {after}
    </div>
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  compactUi = false
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  seedRepoState({ id: '/workspace', isGitRepo: false, branches: [], currentBranch: '', selectedBranch: null })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspacePane', () => {
  test('composes the parent rail, explicit folder file tree, and root-scoped terminal panel', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const rail = container.querySelector('[data-testid="rail"]')
    expect(rail?.textContent).toContain('/workspace')
    expect(rail?.closest('.project-navigation-tone')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')?.textContent).toBe(
      '/workspace/goblin-feature-auth',
    )
    expect(container.querySelector('[data-testid="branch-workspace-terminal-panel"]')?.textContent).toContain(
      '/workspace/goblin-feature-auth',
    )
    expect(container.querySelector('[data-testid="branch-workspace-context-bar"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-git-action-panel"]')).toBeNull()
  })

  test('renders the ordinary worktree explorer and branch detail for a selected member', () => {
    seedRepoState({
      id: '/workspace/api',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/goblin-feature-auth/api' } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
      detailTab: 'status',
    })

    act(() =>
      root.render(
        <BranchWorkspacePane
          rootId="/workspace"
          workspace={{ ...workspace(), repositories: [repositoryMember()] }}
          memberTarget={{
            repositoryId: '/workspace/api',
            repositoryName: 'api',
            targetBranch: 'feature/auth',
            worktreePath: '/workspace/goblin-feature-auth/api',
          }}
          layout="left-right"
        />,
      ),
    )

    expect(container.querySelector('[data-testid="rail"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="repo-worktree-explorer"]')?.textContent).toBe('/workspace/api')
    expect(container.querySelector('[data-testid="branch-detail"]')?.textContent).toContain('/workspace/api')
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-terminal-panel"]')).toBeNull()
  })

  test('does not expose branch workspace root focus from the terminal toolbar', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    expect(container.querySelector('[data-testid="root-enter-focus"]')).toBeNull()
    expect(container.querySelector('[data-testid="header-maximize-terminal"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).not.toBeNull()
  })

  test('maximizes the branch workspace root terminal from the desktop header', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="header-maximize-terminal"]')?.click())

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(
      container.querySelector('[data-testid="branch-workspace-terminal-panel"]')?.getAttribute('data-terminal-focus'),
    ).toBe('true')
  })

  test('does not expose branch workspace member focus from the detail toolbar', () => {
    seedRepoState({
      id: '/workspace/api',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/goblin-feature-auth/api' } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
      detailTab: 'status',
    })
    const props = {
      rootId: '/workspace',
      workspace: { ...workspace(), repositories: [repositoryMember()] },
      memberTarget: {
        repositoryId: '/workspace/api',
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        worktreePath: '/workspace/goblin-feature-auth/api',
      },
      layout: 'left-right' as const,
    }
    act(() => root.render(<BranchWorkspacePane {...props} />))

    expect(container.querySelector('[data-testid="member-enter-focus"]')).toBeNull()
    expect(container.querySelector('[data-testid="header-maximize-terminal"]')).not.toBeNull()
    expect(useReposStore.getState().repos['/workspace/api']?.ui.detailTab).toBe('status')
    expect(container.querySelector('[data-testid="split-pane"]')).not.toBeNull()
  })

  test('selects and maximizes a branch workspace member terminal from the desktop header', () => {
    seedRepoState({
      id: '/workspace/api',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/goblin-feature-auth/api' } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
      detailTab: 'status',
    })
    act(() =>
      root.render(
        <BranchWorkspacePane
          rootId="/workspace"
          workspace={{ ...workspace(), repositories: [repositoryMember()] }}
          memberTarget={{
            repositoryId: '/workspace/api',
            repositoryName: 'api',
            targetBranch: 'feature/auth',
            worktreePath: '/workspace/goblin-feature-auth/api',
          }}
          layout="left-right"
        />,
      ),
    )

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="header-maximize-terminal"]')?.click())

    expect(useReposStore.getState().repos['/workspace/api']?.ui.detailTab).toBe('terminal')
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-detail"]')?.getAttribute('data-terminal-focus')).toBe('true')
  })

  test('renders only root terminal detail in compact mode and returns to scope from its toolbar', () => {
    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const back = container.querySelector<HTMLButtonElement>(
      '[data-testid="branch-workspace-terminal-panel"] [data-testid="show-scope"]',
    )
    expect(back?.closest('[data-testid="mock-terminal-toolbar-leading"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="rail"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
    expect(container.querySelector('[data-testid="root-enter-focus"]')).toBeNull()

    act(() => back?.click())

    const rail = container.querySelector('[data-testid="rail"]')
    expect(rail).not.toBeNull()
    expect(rail?.closest('.project-navigation-tone')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-terminal-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('opens a selected member on compact files and routes reveal requests back to files', () => {
    compactUi = true
    seedRepoState({
      id: '/workspace/api',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/goblin-feature-auth/api' } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
    })
    const props = {
      rootId: '/workspace',
      workspace: { ...workspace(), repositories: [repositoryMember()] },
      memberTarget: {
        repositoryId: '/workspace/api',
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        worktreePath: '/workspace/goblin-feature-auth/api',
      },
      layout: 'left-right' as const,
    }

    act(() => root.render(<BranchWorkspacePane {...props} />))

    expect(container.querySelector('[data-testid="repo-worktree-explorer"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-detail"]')?.click())
    expect(container.querySelector('[data-testid="branch-detail"]')?.getAttribute('data-compact-focus')).toBe('true')
    expect(container.querySelector('[data-testid="repo-worktree-explorer"]')).toBeNull()

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="detail-reveal"]')?.click())
    expect(container.querySelector('[data-testid="repo-worktree-explorer"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-detail"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('routes compact scope actions to files or detail without a split pane', () => {
    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-detail"]')?.click())
    expect(container.querySelector('[data-testid="branch-workspace-terminal-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('starts with the desktop file area collapsed and toggles it from the status bar', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const splitPane = fileAreaSplitPane()
    const statusBar = container.querySelector('[data-testid="status"]')
    expect(splitPane?.getAttribute('data-after-collapsed')).toBe('true')
    expect(statusBar?.getAttribute('data-file-area-collapsed')).toBe('true')

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())

    expect(splitPane?.getAttribute('data-after-collapsed')).toBe('false')
    expect(statusBar?.getAttribute('data-file-area-collapsed')).toBe('false')
  })

  test('toggles the desktop file area when a branch workspace item is double-clicked', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="rail-toggle-files"]')
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')

    act(() => toggle?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('false')

    act(() => toggle?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')
  })

  test('resets the desktop file area to collapsed when the active branch workspace changes', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('false')

    const nextWorkspace = workspace()
    nextWorkspace.id = 'branch-2'
    nextWorkspace.branch = 'feature/other'
    nextWorkspace.directoryName = 'goblin-feature-other'
    nextWorkspace.path = '/workspace/goblin-feature-other'
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={nextWorkspace} layout="left-right" />))

    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')
  })

  test('exits terminal focus when the active branch workspace changes', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="header-maximize-terminal"]')?.click())
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

    const nextWorkspace = workspace()
    nextWorkspace.id = 'branch-2'
    nextWorkspace.branch = 'feature/other'
    nextWorkspace.directoryName = 'goblin-feature-other'
    nextWorkspace.path = '/workspace/goblin-feature-other'
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={nextWorkspace} layout="left-right" />))

    expect(container.querySelector('[data-testid="split-pane"]')).not.toBeNull()
  })

  test('returns to the desktop split after a compact responsive transition', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="header-maximize-terminal"]')?.click())
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    compactUi = false
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    expect(container.querySelector('[data-testid="split-pane"]')).not.toBeNull()
  })

  test('keeps compact files as a standalone surface without a collapse control', () => {
    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())

    expect(fileAreaSplitPane()).toBeNull()
    expect(container.querySelector('[data-testid="status"]')?.getAttribute('data-file-area-collapsed')).toBe('unset')
    expect(container.querySelector('[data-testid="file-area-toggle"]')).toBeNull()
  })
})

function fileAreaSplitPane(): Element | null {
  return (
    container.querySelector('[data-testid="branch-workspace-file-tree"]')?.closest('[data-testid="split-pane"]') ?? null
  )
}

function workspace(): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    state: { kind: 'ready' },
    available: true,
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
  }
}

function repositoryMember(): BranchWorkspaceSnapshot['repositories'][number] {
  return {
    repositoryName: 'api',
    targetBranch: 'feature/auth',
    baseBranch: 'main',
    branchOrigin: 'created',
    worktreePath: '/workspace/goblin-feature-auth/api',
    progress: 'complete',
    ready: true,
  }
}

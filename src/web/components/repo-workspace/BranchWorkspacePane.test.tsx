// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspacePane } from '#/web/components/repo-workspace/BranchWorkspacePane.tsx'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

let compactUi = false
const aggregateSelectedRepositoryRenders: Array<string | null | undefined> = []

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({ useIsCompactUi: () => compactUi }))
vi.mock('#/web/components/repo-workspace/SidebarProjectHeader.tsx', () => ({
  SidebarProjectHeader: ({
    repoId,
    onShowCompactDetail,
    onShowCompactFiles,
    onMaximizeTerminal,
    onFileAreaItemDoubleClick,
  }: {
    repoId: string
    onShowCompactDetail?: () => void
    onShowCompactFiles?: () => void
    onMaximizeTerminal?: () => void
    onFileAreaItemDoubleClick?: () => void
  }) => (
    <div data-testid="header">
      {repoId}
      {onFileAreaItemDoubleClick ? (
        <button type="button" data-testid="header-project-item" onDoubleClick={onFileAreaItemDoubleClick}>
          project
        </button>
      ) : null}
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
    onCollapseFileArea,
    onToggleFileArea,
    onOpenDetailArea,
  }: {
    workspaceRootId: string
    onOpenFileArea?: () => void
    onCollapseFileArea?: () => void
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
      {onCollapseFileArea ? (
        <button type="button" data-testid="rail-collapse-files" onClick={onCollapseFileArea}>
          collapse files
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
  BranchWorkspaceFileTree: ({
    context,
    toolbarLeading,
    revealRequest,
  }: {
    context: { path: string }
    toolbarLeading?: ReactNode
    revealRequest?: { relativePath: string } | null
  }) => (
    <div data-testid="branch-workspace-file-tree">
      {toolbarLeading ? <div data-testid="mock-file-toolbar-leading">{toolbarLeading}</div> : null}
      {context.path}
      {revealRequest ? <output data-testid="root-file-reveal">{revealRequest.relativePath}</output> : null}
    </div>
  ),
}))
vi.mock('#/web/components/repo-workspace/BranchWorkspaceAggregatePanel.tsx', () => ({
  BranchWorkspaceAggregatePanel: ({
    kind,
    onRevealPath,
    selectedRepositoryName,
    onSelectedRepositoryNameChange,
  }: {
    kind: 'status' | 'changes' | 'history' | 'local' | 'remoteBranches'
    onRevealPath?: (memberName: string, relativePath: string) => void
    selectedRepositoryName?: string | null
    onSelectedRepositoryNameChange?: (repositoryName: string) => void
  }) => {
    aggregateSelectedRepositoryRenders.push(selectedRepositoryName)
    return (
      <div data-testid={`branch-workspace-${kind}-panel`}>
        <output data-testid="aggregate-selected-repository">{selectedRepositoryName}</output>
        {onSelectedRepositoryNameChange ? (
          <button type="button" data-testid="select-web" onClick={() => onSelectedRepositoryNameChange('web')}>
            select web
          </button>
        ) : null}
        {onRevealPath ? (
          <button type="button" data-testid="aggregate-reveal" onClick={() => onRevealPath('api', 'src/app.ts')}>
            reveal
          </button>
        ) : null}
      </div>
    )
  },
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
  aggregateSelectedRepositoryRenders.length = 0
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
    expect(container.querySelector('[data-branch-workspace-file-area]')?.classList.contains('overflow-hidden')).toBe(
      true,
    )
  })

  test('offers status, files, changes, history, local, and remote for the parent file area', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]'),
    )
    expect(tabs.every((tab) => !tab.draggable)).toBe(true)
    expect(container.querySelector('[data-testid="branch-workspace-file-area-toolbar"]')).not.toBeNull()
    expect(tabs.map((tab) => tab.textContent)).toEqual(['tab.status', 'file-tree.title', 'tab.changes'])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-tabs-overflow-toggle"]')?.click(),
    )
    const expandedTabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]'),
    )
    expect(expandedTabs.map((tab) => tab.textContent)).toEqual([
      'tab.status',
      'file-tree.title',
      'tab.changes',
      'tab.history',
      'tab.local',
      'tab.remote-branches',
    ])

    act(() => tabs[0]?.click())
    expect(container.querySelector('[data-testid="branch-workspace-status-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).toBeNull()

    act(() => expandedTabs[2]?.click())
    expect(container.querySelector('[data-testid="branch-workspace-changes-panel"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="branch-workspace-status-panel"]')).toBeNull()

    act(() => expandedTabs[3]?.click())
    expect(container.querySelector('[data-testid="branch-workspace-history-panel"]')).not.toBeNull()

    act(() => expandedTabs[4]?.click())
    expect(container.querySelector('[data-testid="branch-workspace-local-panel"]')).not.toBeNull()

    act(() => expandedTabs[5]?.click())
    expect(container.querySelector('[data-testid="branch-workspace-remoteBranches-panel"]')).not.toBeNull()
  })

  test('shares the selected member across all Git tabs and resets it for another branch workspace', () => {
    const initialWorkspace = {
      ...workspace(),
      repositories: [repositoryMember('api'), repositoryMember('web')],
    }
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={initialWorkspace} layout="left-right" />))
    const expandOverflow = () => {
      const toggle = container.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-tabs-overflow-toggle"]')
      if (toggle?.getAttribute('aria-expanded') !== 'true') act(() => toggle?.click())
    }
    expandOverflow()

    const tabNamed = (name: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]')).find(
        (tab) => tab.textContent === name,
      )
    const selectedRepository = () =>
      container.querySelector('[data-testid="aggregate-selected-repository"]')?.textContent

    act(() => tabNamed('tab.status')?.click())
    expect(selectedRepository()).toBe('api')
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="select-web"]')?.click())
    expect(selectedRepository()).toBe('web')
    act(() => tabNamed('tab.changes')?.click())
    expect(selectedRepository()).toBe('web')
    act(() => tabNamed('tab.history')?.click())
    expect(selectedRepository()).toBe('web')
    act(() => tabNamed('tab.local')?.click())
    expect(selectedRepository()).toBe('web')
    act(() => tabNamed('tab.remote-branches')?.click())
    expect(selectedRepository()).toBe('web')

    const nextWorkspace = {
      ...workspace(),
      id: 'branch-2',
      branch: 'feature/next',
      repositories: [repositoryMember('docs')],
    }
    aggregateSelectedRepositoryRenders.length = 0
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={nextWorkspace} layout="left-right" />))
    expandOverflow()
    act(() => tabNamed('tab.history')?.click())

    expect(selectedRepository()).toBe('docs')
    expect(aggregateSelectedRepositoryRenders).not.toContain('web')
  })

  test('reopens the parent file area on files after another tab was selected', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const changes = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]'),
    )[2]
    act(() => changes?.click())
    expect(container.querySelector('[data-testid="branch-workspace-changes-panel"]')).not.toBeNull()

    const toggle = container.querySelector<HTMLButtonElement>('[data-testid="rail-toggle-files"]')
    act(() => toggle?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    act(() => toggle?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))

    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).not.toBeNull()
    expect(
      container.querySelector('[data-branch-workspace-file-area] [role="tab"][aria-selected="true"]')?.textContent,
    ).toBe('file-tree.title')
  })

  test('reopens the parent file area on files from the status bar', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())
    const changes = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]'),
    )[2]
    act(() => changes?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())

    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).not.toBeNull()
  })

  test('opens compact parent files on the files tab from scope navigation', () => {
    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())
    const changes = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]'),
    )[2]
    act(() => changes?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())

    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')).not.toBeNull()
  })

  test('reveals a member change through the branch workspace root file tree', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const changes = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-branch-workspace-file-area] [role="tab"]'),
    )[2]
    act(() => changes?.click())
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="aggregate-reveal"]')?.click())

    expect(container.querySelector('[data-testid="root-file-reveal"]')?.textContent).toBe('api/src/app.ts')
    expect(
      container.querySelector('[data-branch-workspace-file-area] [role="tab"][aria-selected="true"]')?.textContent,
    ).toBe('file-tree.title')
  })

  test('keeps workspace actions out of the status bar composition', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    expect(container.querySelector('[data-testid="statusbar-workspace-actions"]')).toBeNull()
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
            checkedOutBranch: 'feature/auth',
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
        checkedOutBranch: 'feature/auth',
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
            checkedOutBranch: 'feature/auth',
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
    expect(back?.getAttribute('data-size')).toBe('icon')
    expect(back?.querySelector('.lucide-panel-left-open')).not.toBeNull()
    expect(back?.querySelector('.lucide-arrow-left')).toBeNull()
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

  test('opens a selected member on compact detail and routes reveal requests to files', () => {
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
        checkedOutBranch: 'feature/auth',
        worktreePath: '/workspace/goblin-feature-auth/api',
      },
      layout: 'left-right' as const,
    }

    act(() => root.render(<BranchWorkspacePane {...props} />))

    expect(container.querySelector('[data-testid="branch-detail"]')?.getAttribute('data-compact-focus')).toBe('true')
    expect(container.querySelector('[data-testid="repo-worktree-explorer"]')).toBeNull()
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

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

  test('does not create a status bar workspace action host when compact scope is reopened', () => {
    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())

    expect(container.querySelector('[data-testid="statusbar-workspace-actions"]')).toBeNull()

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())
    expect(container.querySelector('[data-testid="statusbar-workspace-actions"]')).toBeNull()

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="show-scope"]')?.click())
    expect(container.querySelector('[data-testid="statusbar-workspace-actions"]')).toBeNull()
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

  test('keeps the desktop file area collapsed when a branch workspace member is selected', () => {
    seedRepoState({
      id: '/workspace/api',
      branches: [createRepoBranch('feature/auth', { worktree: { path: '/workspace/goblin-feature-auth/api' } })],
      currentBranch: 'main',
      selectedBranch: 'feature/auth',
    })
    const initialWorkspace = { ...workspace(), repositories: [repositoryMember()] }
    act(() =>
      root.render(<BranchWorkspacePane rootId="/workspace" workspace={initialWorkspace} layout="left-right" />),
    )
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')

    act(() =>
      root.render(
        <BranchWorkspacePane
          rootId="/workspace"
          workspace={initialWorkspace}
          memberTarget={{
            repositoryId: '/workspace/api',
            repositoryName: 'api',
            targetBranch: 'feature/auth',
            checkedOutBranch: 'feature/auth',
            worktreePath: '/workspace/goblin-feature-auth/api',
          }}
          layout="left-right"
        />,
      ),
    )

    expect(
      container
        .querySelector('[data-testid="repo-worktree-explorer"]')
        ?.closest('[data-testid="split-pane"]')
        ?.getAttribute('data-after-collapsed'),
    ).toBe('true')
    expect(container.querySelector('[data-testid="branch-detail"]')).not.toBeNull()
  })

  test('collapses both the local and parent File areas from workspace navigation', () => {
    const onCollapseFileArea = vi.fn()
    act(() =>
      root.render(
        <BranchWorkspacePane
          rootId="/workspace"
          workspace={workspace()}
          layout="left-right"
          onCollapseFileArea={onCollapseFileArea}
        />,
      ),
    )

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-files"]')?.click())
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('false')

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rail-collapse-files"]')?.click())

    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')
    expect(onCollapseFileArea).toHaveBeenCalledTimes(1)
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

  test('toggles the desktop file area when the active project item is double-clicked', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    const projectItem = container.querySelector<HTMLButtonElement>('[data-testid="header-project-item"]')
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')

    act(() => projectItem?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('false')

    act(() => projectItem?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })))
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

  test('keeps global terminal focus when the active branch workspace changes', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="header-maximize-terminal"]')?.click())
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

    const nextWorkspace = workspace()
    nextWorkspace.id = 'branch-2'
    nextWorkspace.branch = 'feature/other'
    nextWorkspace.directoryName = 'goblin-feature-other'
    nextWorkspace.path = '/workspace/goblin-feature-other'
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={nextWorkspace} layout="left-right" />))

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
  })

  test('restores global terminal focus after a compact responsive transition', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="header-maximize-terminal"]')?.click())
    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()

    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))
    compactUi = false
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="left-right" />))

    expect(container.querySelector('[data-testid="split-pane"]')).toBeNull()
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

function repositoryMember(repositoryName = 'api'): BranchWorkspaceSnapshot['repositories'][number] {
  return {
    repositoryName,
    targetBranch: 'feature/auth',
    creationBase: { kind: 'localBranch', branch: 'main' },
    syncBeforeCreate: false,
    branchOrigin: 'created',
    worktreePath: `/workspace/goblin-feature-auth/${repositoryName}`,
    progress: 'complete',
    ready: true,
  }
}

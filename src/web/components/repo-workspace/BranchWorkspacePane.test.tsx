// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspacePane } from '#/web/components/repo-workspace/BranchWorkspacePane.tsx'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

let compactUi = false

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({ useIsCompactUi: () => compactUi }))
vi.mock('#/web/components/repo-workspace/SidebarProjectHeader.tsx', () => ({
  SidebarProjectHeader: ({ repoId }: { repoId: string }) => <div data-testid="header">{repoId}</div>,
}))
vi.mock('#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx', () => ({
  WorkspaceRepositoryRail: ({ workspaceRootId }: { workspaceRootId: string }) => (
    <div data-testid="rail">{workspaceRootId}</div>
  ),
}))
vi.mock('#/web/components/repo-workspace/BranchWorkspaceFileTree.tsx', () => ({
  BranchWorkspaceFileTree: ({ context }: { context: { path: string } }) => (
    <div data-testid="branch-workspace-file-tree">{context.path}</div>
  ),
}))
vi.mock('#/web/components/repo-workspace/BranchWorkspaceTerminalPanel.tsx', () => ({
  BranchWorkspaceTerminalPanel: ({ context }: { context: { path: string } }) => (
    <div data-testid="branch-workspace-terminal-panel">{context.path}</div>
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
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="top-bottom" />))

    expect(container.querySelector('[data-testid="rail"]')?.textContent).toBe('/workspace')
    expect(container.querySelector('[data-testid="branch-workspace-file-tree"]')?.textContent).toBe(
      '/workspace/goblin-feature-auth',
    )
    expect(container.querySelector('[data-testid="branch-workspace-terminal-panel"]')?.textContent).toBe(
      '/workspace/goblin-feature-auth',
    )
  })

  test('starts with the desktop file area collapsed and toggles it from the status bar', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="top-bottom" />))

    const splitPane = fileAreaSplitPane()
    const statusBar = container.querySelector('[data-testid="status"]')
    expect(splitPane?.getAttribute('data-after-collapsed')).toBe('true')
    expect(statusBar?.getAttribute('data-file-area-collapsed')).toBe('true')

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())

    expect(splitPane?.getAttribute('data-after-collapsed')).toBe('false')
    expect(statusBar?.getAttribute('data-file-area-collapsed')).toBe('false')
  })

  test('resets the desktop file area to collapsed when the active branch workspace changes', () => {
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="top-bottom" />))
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="file-area-toggle"]')?.click())
    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('false')

    const nextWorkspace = workspace()
    nextWorkspace.id = 'branch-2'
    nextWorkspace.branch = 'feature/other'
    nextWorkspace.directoryName = 'goblin-feature-other'
    nextWorkspace.path = '/workspace/goblin-feature-other'
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={nextWorkspace} layout="top-bottom" />))

    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('true')
  })

  test('keeps the compact file area expanded without a desktop collapse control', () => {
    compactUi = true
    act(() => root.render(<BranchWorkspacePane rootId="/workspace" workspace={workspace()} layout="top-bottom" />))

    expect(fileAreaSplitPane()?.getAttribute('data-after-collapsed')).toBe('false')
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
    lifecycle: 'ready',
    available: true,
    issues: [],
    repositories: [],
    auxiliaryEntries: [],
  }
}

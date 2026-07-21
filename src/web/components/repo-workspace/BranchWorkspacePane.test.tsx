// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspacePane } from '#/web/components/repo-workspace/BranchWorkspacePane.tsx'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'
import { resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({ useIsCompactUi: () => false }))
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
vi.mock('#/web/components/StatusBar.tsx', () => ({ StatusBar: () => <div data-testid="status" /> }))
vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: ({ before, after }: { before: React.ReactNode; after: React.ReactNode }) => (
    <>{before}{after}</>
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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
})

function workspace(): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1', rootId: '/workspace', branch: 'feature/auth', directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth', lifecycle: 'ready', available: true, issues: [],
    repositories: [], auxiliaryEntries: [],
  }
}

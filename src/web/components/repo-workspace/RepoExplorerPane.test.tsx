// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoExplorerPane } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const REPO_ID = '/repo'

vi.mock('#/web/components/BranchList.tsx', () => ({
  BranchList: () => <div data-testid="branch-list" />,
}))

vi.mock('#/web/components/file-tree/ProjectFileTree.tsx', () => ({
  ProjectFileTree: ({ revealRequest }: { revealRequest?: { relativePath: string } | null }) => (
    <div data-testid="project-file-tree" data-reveal-path={revealRequest?.relativePath ?? ''} />
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

vi.mock('#/web/components/repo-workspace/ProjectPortsPanel.tsx', () => ({
  ProjectPortsPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="project-ports-panel" data-repo-id={repoId} />
  ),
}))

vi.mock('#/web/components/SplitPane.tsx', () => ({
  SplitPane: ({
    before,
    after,
    orientation,
  }: {
    before: React.ReactNode
    after: React.ReactNode
    orientation: string
  }) => (
    <div data-testid="split-pane" data-orientation={orientation}>
      {before}
      {after}
    </div>
  ),
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
})

afterEach(() => {
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('RepoExplorerPane', () => {
  test('places branch controls above the branch list', async () => {
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

    const branchToolbar = container.querySelector('[data-testid="branch-area-toolbar"]')
    const branchList = container.querySelector('[data-testid="branch-list"]')
    expect(branchToolbar).toBeTruthy()
    expect(branchToolbar?.querySelector('[aria-label="branches.filter-label"]')).toBeTruthy()
    expect(branchToolbar?.querySelector('[aria-label="branches.search-label"]')).toBeTruthy()
    expect(branchList).toBeTruthy()
    expect(branchToolbar!.compareDocumentPosition(branchList!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  test('switches the local explorer area between file, changes, and status tabs', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<RepoExplorerPane repoId="/repo" layout="top-bottom" showActions />)
    })

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    expect(tabs.map((tab) => tab.textContent)).toEqual(['file-tree.title', 'tab.changes', 'tab.status', 'tab.history'])
    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeTruthy()

    await act(async () => {
      tabs[1]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeTruthy()

    await act(async () => {
      tabs[2]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-ports-panel"]')).toBeNull()
    await act(async () => root.unmount())
  })

  test('keeps the ports tab available for remote repositories', async () => {
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
      'ports.title',
    ])

    await act(async () => {
      tabs[4]?.click()
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-changes-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-status-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="project-ports-panel"]')?.getAttribute('data-repo-id')).toBe(
      'ssh-config://prod/srv/repo',
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
          revealRequest={{ id: 1, relativePath: 'src/from-terminal.ts' }}
        />,
      )
    })

    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
    await act(async () => root.unmount())
  })
})

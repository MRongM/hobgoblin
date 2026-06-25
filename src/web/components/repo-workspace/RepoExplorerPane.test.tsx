// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RepoExplorerPane } from '#/web/components/repo-workspace/RepoExplorerPane.tsx'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const REPO_ID = '/repo'
const REMOTE_REPO_ID = 'ssh-config://prod/srv/plain'
const runtimeFontSettings = vi.hoisted(() => ({
  fileTreeFontSize: 12,
  fileTreeTopbarFontSize: 13,
  terminalFontSize: 14,
}))

vi.mock('#/web/runtime-settings-fonts.ts', () => ({
  useRuntimeFontSettings: () => runtimeFontSettings,
}))

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

vi.mock('#/web/components/repo-workspace/PlainWorkspaceTerminalPanel.tsx', () => ({
  PlainWorkspaceTerminalPanel: ({ repoId }: { repoId: string }) => (
    <div data-testid="plain-workspace-terminal" data-repo-id={repoId} />
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
    expect(container.querySelector('[data-testid="project-ports-panel"]')).toBeNull()
    expect(container.textContent).not.toContain('branches.empty')
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
          revealRequest={{ id: 1, relativePath: 'src/from-terminal.ts' }}
        />,
      )
    })

    expect(container.querySelector('[data-testid="plain-workspace-terminal"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="project-file-tree"]')?.getAttribute('data-reveal-path')).toBe(
      'src/from-terminal.ts',
    )
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

  test('places branch filters and repo actions above the branch list', async () => {
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
    const filter = branchToolbar?.querySelector('[aria-label="branches.filter-label"]')
    const search = branchToolbar?.querySelector('[aria-label="branches.search-label"]')
    const refresh = branchToolbar?.querySelector('button[aria-label="action.refresh"]')
    const createWorktree = branchToolbar?.querySelector('button[aria-label="action.create-worktree-title"]')
    const allBranchesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.all"]')
    const worktreesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.worktrees"]')
    const noWorktreeFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.no-worktree"]')
    expect(branchToolbar).toBeTruthy()
    expect(branchToolbar?.className).toContain('h-9')
    expect(branchToolbar?.className).not.toContain('h-8')
    expect(filter).toBeTruthy()
    expect(search).toBeTruthy()
    expect(refresh).toBeTruthy()
    expect(createWorktree).toBeTruthy()
    expect(allBranchesFilter).toBeTruthy()
    expect(worktreesFilter).toBeTruthy()
    expect(noWorktreeFilter).toBeNull()
    expect(filter!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(search!.compareDocumentPosition(createWorktree!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(branchList).toBeTruthy()
    expect(branchToolbar!.compareDocumentPosition(branchList!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

    const branchToolbar = container.querySelector('[data-testid="branch-area-toolbar"]')
    const explorerToolbar = container.querySelector<HTMLElement>('[data-testid="repo-explorer-toolbar"]')
    const firstTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
    expect(branchToolbar?.className).toContain('h-9')
    expect(explorerToolbar?.className).toContain('h-9')
    expect(explorerToolbar?.className).not.toContain('h-8')
    expect(explorerToolbar?.style.getPropertyValue('--goblin-file-tree-topbar-font-size')).toBe('13px')
    expect(firstTab?.className).toContain('text-[length:var(--goblin-file-tree-topbar-font-size)]')
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

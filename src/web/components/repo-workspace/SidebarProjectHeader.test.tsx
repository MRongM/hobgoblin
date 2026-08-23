// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SidebarProjectHeader } from '#/web/components/repo-workspace/SidebarProjectHeader.tsx'

const shellOverlayState = vi.hoisted(() => ({
  actions: {
    openRepoPathDialog: vi.fn(),
    openWslRepoPathDialog: vi.fn(),
    openRemoteRepo: vi.fn(),
    openCloneRepo: vi.fn(),
  },
}))

const platformState = vi.hoisted(() => ({ hostPlatform: 'darwin' as NodeJS.Platform }))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: platformState.hostPlatform }),
}))

const navigationState = vi.hoisted(() => ({
  activateRepo: vi.fn(),
  closeRepo: vi.fn(),
  showRepoDetailTab: vi.fn(),
}))

const responsiveState = vi.hoisted(() => ({ compact: false }))
const recentRepoState = vi.hoisted(() => ({
  recentRepos: [{ kind: 'local' as const, id: '/tmp/recent-repo' }],
}))

const repoState = {
  activeId: '/repo-a/api',
  activeProjectId: '/repo-a',
  ensureWorkspaceOpen: vi.fn(),
  reorderRepos: vi.fn(),
  toggleProjectListExpanded: vi.fn(),
  projectListExpanded: false,
  repos: {
    '/repo-a': { name: 'Repo A', isGitRepo: false },
    '/repo-a/api': { name: 'api', isGitRepo: true, workspaceRootId: '/repo-a' },
    '/repo-b': { name: 'Repo B', isGitRepo: false },
    '/repo-git': { name: 'Repo Git', isGitRepo: true },
  } as Record<string, { name: string; isGitRepo: boolean; workspaceRootId?: string }>,
}

vi.mock('#/web/stores/repos/store.ts', () => ({
  useReposStore: (selector: (state: typeof repoState) => unknown) => selector(repoState),
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/main-window-navigation.tsx', () => ({
  useMainWindowNavigation: () => navigationState,
}))

vi.mock('#/web/shell-overlay-actions.tsx', () => ({
  useShellOverlayActions: () => shellOverlayState.actions,
}))

vi.mock('#/web/runtime-settings-chrome.ts', () => ({
  useRuntimeChromeSettings: () => ({ topbarHeightPx: 36 }),
}))

vi.mock('#/web/settings-read-projection.ts', () => ({
  useRuntimeRecentRepos: () => recentRepoState.recentRepos,
}))

vi.mock('#/web/hooks/useResponsiveUiMode.tsx', () => ({
  useIsCompactUi: () => responsiveState.compact,
}))

vi.mock('#/web/components/repo-workspace/project-switcher-model.tsx', () => ({
  ProjectTerminalStatus: () => <span data-testid="mock-project-terminal-status" />,
  useProjectSummaries: () => [
    { id: '/repo-a', name: 'Repo A', unavailable: false, isGitRepo: false, terminalWorktreeKeys: [] },
    { id: '/repo-b', name: 'Repo B', unavailable: false, isGitRepo: false, terminalWorktreeKeys: [] },
    { id: '/repo-git', name: 'Repo Git', unavailable: false, isGitRepo: true, terminalWorktreeKeys: [] },
  ],
}))

vi.mock('#/web/components/repo-workspace/SidebarProjectList.tsx', () => ({
  SidebarProjectList: ({
    id,
    onToggleFileArea,
    onOpenFileArea,
  }: {
    id: string
    onToggleFileArea?: () => void
    onOpenFileArea?: () => void
  }) => (
    <ul id={id}>
      <li>
        <button type="button" data-testid="mock-project-item" onClick={onOpenFileArea} onDoubleClick={onToggleFileArea}>
          project
        </button>
      </li>
    </ul>
  ),
}))

vi.mock('#/web/components/ConfirmDialog.tsx', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx', () => ({
  WorkspaceRepositorySwitcher: ({ repoId, compact }: { repoId: string; compact?: boolean }) => (
    <div data-testid="workspace-repository-switcher" data-repo-id={repoId} data-compact={String(!!compact)} />
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  repoState.activeId = '/repo-a/api'
  repoState.activeProjectId = '/repo-a'
  repoState.projectListExpanded = false
  responsiveState.compact = false
  platformState.hostPlatform = 'darwin'
  navigationState.showRepoDetailTab.mockReset()
  navigationState.activateRepo.mockReset()
  repoState.ensureWorkspaceOpen.mockReset()
  repoState.ensureWorkspaceOpen.mockResolvedValue({ ok: true, id: '/tmp/recent-repo' })
  repoState.toggleProjectListExpanded.mockReset()
  repoState.toggleProjectListExpanded.mockImplementation(() => {
    repoState.projectListExpanded = !repoState.projectListExpanded
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SidebarProjectHeader', () => {
  test('keeps the top-level workspace identity while a child repository is visible', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a/api" />)
    })

    const trigger = container!.querySelector<HTMLButtonElement>('button[aria-label="repo-tabs.repos"]')
    expect(trigger?.title).toBe('Repo A')
    expect(trigger?.textContent).toContain('Repo A')
    expect(trigger?.textContent).not.toContain('api')
  })

  test('points the project switcher at one list element', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })
    const trigger = container!.querySelector('button[aria-label="repo-tabs.repos"]')

    act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => root!.render(<SidebarProjectHeader repoId="/repo-a" />))

    const controlledId = trigger?.getAttribute('aria-controls')
    expect(controlledId).toBeTruthy()
    const targets = container!.querySelectorAll(`[id="${controlledId}"]`)
    expect(targets).toHaveLength(1)
    expect(targets[0]?.tagName).toBe('UL')
  })

  test('renders the project header and expanded list without decorative separators', () => {
    repoState.projectListExpanded = true
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })

    const header = container!.firstElementChild as HTMLElement | null
    const topbar = header?.querySelector<HTMLElement>('.topbar')
    const listWrapper = container!.querySelector('ul')?.parentElement
    expect(header?.className).not.toContain('border-b')
    expect(header?.className).not.toContain('border-topbar-border')
    expect(topbar?.style.height).toBe('36px')
    expect(listWrapper?.className).not.toContain('border-t')
    expect(listWrapper?.className).not.toContain('border-separator')
  })

  test('marks its topbar for sidebar-edge chrome alignment', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })

    expect(container!.querySelector<HTMLElement>('.topbar')?.className).toContain('sidebar-project-topbar')
  })

  test('keeps the global project list expansion state when the active project changes', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })
    const trigger = container!.querySelector<HTMLButtonElement>('button[aria-label="repo-tabs.repos"]')

    act(() => trigger?.click())
    repoState.activeId = '/repo-b'
    repoState.activeProjectId = '/repo-b'
    act(() => root!.render(<SidebarProjectHeader repoId="/repo-b" />))

    const nextTrigger = container!.querySelector<HTMLButtonElement>('button[aria-label="repo-tabs.repos"]')
    expect(repoState.toggleProjectListExpanded).toHaveBeenCalledTimes(1)
    expect(nextTrigger?.getAttribute('aria-expanded')).toBe('true')
    expect(container!.querySelector('ul')).not.toBeNull()
  })

  test('forwards project item double-clicks to the owning file area', () => {
    const onFileAreaItemDoubleClick = vi.fn()
    repoState.projectListExpanded = true
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" onFileAreaItemDoubleClick={onFileAreaItemDoubleClick} />)
    })

    act(() =>
      container!
        .querySelector<HTMLButtonElement>('[data-testid="mock-project-item"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })),
    )

    expect(onFileAreaItemDoubleClick).toHaveBeenCalledTimes(1)
  })

  test('forwards project item idempotent open intents to the owning file area', () => {
    const onOpenFileArea = vi.fn()
    repoState.projectListExpanded = true
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" onOpenFileArea={onOpenFileArea} />)
    })

    act(() => container!.querySelector<HTMLButtonElement>('[data-testid="mock-project-item"]')?.click())

    expect(onOpenFileArea).toHaveBeenCalledTimes(1)
  })

  test('uses a folder icon when the active project is a plain workspace', () => {
    repoState.activeId = '/repo-b'
    repoState.activeProjectId = '/repo-b'
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-b" />)
    })

    const trigger = container!.querySelector<HTMLButtonElement>('button[aria-label="repo-tabs.repos"]')
    expect(trigger?.getAttribute('data-project-kind')).toBe('plain')
    expect(trigger?.querySelector('svg.lucide-folder')).not.toBeNull()
    expect(trigger?.querySelector('svg.lucide-folder-git-2')).toBeNull()
  })

  test('shows project terminal status only while the project list is collapsed', () => {
    repoState.activeId = '/repo-git'
    repoState.activeProjectId = '/repo-git'
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-git" />)
    })
    expect(container!.querySelector('[data-testid="mock-project-terminal-status"]')).not.toBeNull()

    repoState.projectListExpanded = true
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-git" />)
    })
    expect(container!.querySelector('[data-testid="mock-project-terminal-status"]')).toBeNull()

    repoState.projectListExpanded = false
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-git" />)
    })
    expect(container!.querySelector('[data-testid="mock-project-terminal-status"]')).not.toBeNull()
  })

  test('omits editor and external terminal shortcuts from the project topbar', () => {
    repoState.activeId = '/repo-git'
    repoState.activeProjectId = '/repo-git'
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-git" />)
    })

    expect(container!.querySelector('button[aria-label^="worktrees.open-in-editor-label"]')).toBeNull()
    expect(container!.querySelector('button[aria-label^="terminal.external"]')).toBeNull()
  })

  test('returns to the compact terminal without changing the persisted focus preference', () => {
    const onShowCompactDetail = vi.fn()
    responsiveState.compact = true
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" onShowCompactDetail={onShowCompactDetail} />)
    })

    const terminalButton = container!.querySelector<HTMLButtonElement>('button[aria-label="mobile.show-terminal"]')
    expect(terminalButton).not.toBeNull()

    act(() => terminalButton?.click())

    expect(onShowCompactDetail).toHaveBeenCalledTimes(1)
  })

  test('prioritizes compact navigation without overflowing the mobile sidebar topbar', () => {
    responsiveState.compact = true
    act(() => {
      root!.render(
        <SidebarProjectHeader repoId="/repo-a/api" onShowCompactDetail={() => {}} onShowCompactFiles={() => {}} />,
      )
    })

    const topbar = container!.querySelector<HTMLElement>('.topbar')
    const buttons = Array.from(topbar?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const projectButton = container!.querySelector<HTMLButtonElement>('button[aria-label="repo-tabs.repos"]')

    expect(buttons[0]?.getAttribute('aria-label')).toBe('mobile.show-terminal')
    expect(container!.querySelector('button[aria-label="topbar.open"]')).toBeNull()
    expect(container!.querySelector('button[aria-label="file-tree.title"]')).toBeNull()
    expect(topbar?.className).toContain('min-w-0')
    expect(topbar?.className).toContain('overflow-hidden')
    expect(projectButton?.className).toContain('flex-1')
    expect(projectButton?.className).toContain('shrink')
  })

  test('keeps repository import available in the desktop sidebar topbar', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" onMaximizeTerminal={() => {}} />)
    })

    expect(container!.querySelector('button[aria-label="topbar.open"]')).not.toBeNull()
  })

  test('shows the WSL project shortcut in the Windows desktop add-repository menu', async () => {
    platformState.hostPlatform = 'win32'
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })

    const trigger = container!.querySelector<HTMLButtonElement>('button[aria-label="topbar.open"]')
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('repo-tabs.open-wsl')
  })

  test('shows recent repositories in the desktop add-repository menu', async () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })

    const trigger = container!.querySelector<HTMLButtonElement>('button[aria-label="topbar.open"]')
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('menu.file.open-recent')

    const recentTrigger = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) =>
      item.textContent?.includes('menu.file.open-recent'),
    )
    await act(async () => {
      recentTrigger?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
      recentTrigger?.click()
      await Promise.resolve()
    })
    const recentRepo = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) =>
      item.textContent?.includes('/tmp/recent-repo'),
    )
    await act(async () => {
      recentRepo?.click()
      await Promise.resolve()
    })

    expect(repoState.ensureWorkspaceOpen).toHaveBeenCalledWith({ kind: 'local', id: '/tmp/recent-repo' })
    expect(navigationState.activateRepo).toHaveBeenCalledWith('/tmp/recent-repo')
  })

  test('does not expose desktop terminal maximize without an owner callback', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" />)
    })

    const focusButton = container!.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.focus"]')
    expect(focusButton).toBeNull()
  })

  test('uses the owning workspace terminal maximize callback when provided', () => {
    const onMaximizeTerminal = vi.fn()
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a" onMaximizeTerminal={onMaximizeTerminal} />)
    })

    const focusButton = container!.querySelector<HTMLButtonElement>('button[aria-label="branch-detail.focus"]')
    act(() => focusButton?.click())

    expect(onMaximizeTerminal).toHaveBeenCalledTimes(1)
    expect(navigationState.showRepoDetailTab).not.toHaveBeenCalled()
  })

  test('keeps repository navigation available in the compact explorer', () => {
    act(() => {
      root!.render(<SidebarProjectHeader repoId="/repo-a/api" onShowCompactDetail={() => {}} />)
    })

    const switcher = container!.querySelector('[data-testid="workspace-repository-switcher"]')
    expect(switcher?.getAttribute('data-repo-id')).toBe('/repo-a/api')
    expect(switcher?.getAttribute('data-compact')).toBe('true')
  })
})

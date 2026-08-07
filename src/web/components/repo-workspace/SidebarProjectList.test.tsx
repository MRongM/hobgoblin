// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SidebarProjectList } from '#/web/components/repo-workspace/SidebarProjectList.tsx'
import type { ProjectSummary } from '#/web/components/repo-workspace/project-switcher-model.tsx'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import {
  TerminalSessionContext,
  TerminalSessionReadContext,
} from '#/web/components/terminal/terminal-session-context.ts'
import type {
  TerminalSessionContextValue,
  TerminalSessionReadContextValue,
  TerminalSessionSummary,
  WorktreeTerminalSnapshot,
} from '#/web/components/terminal/types.ts'
import { createRepoBranch, resetReposStore, seedRepoState } from '#/web/stores/repos/test-utils.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }
type CloseTerminalMock = ReturnType<typeof vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>>

const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
  contextSensors: null as unknown[] | null,
  sortableItems: null as string[] | null,
  sortableStrategy: null as unknown,
  sortableOnKeyDown: vi.fn(),
  useSensor: vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })),
  pointerSensor: {},
  keyboardSensor: {},
  verticalStrategy: {},
}))

const projectExternalActionState = vi.hoisted(() => ({
  requestedProjectIds: [] as string[],
  editorOnSelect: vi.fn(),
  terminalOnSelect: vi.fn(),
  editorDisabled: false,
  editorBusy: false,
  terminalDisabled: false,
  terminalBusy: false,
  remoteOnSelect: vi.fn(),
  remoteDisabled: false,
  remoteBusy: false,
  internalTerminalOnSelect: vi.fn(),
  internalTerminalDisabled: false,
  internalTerminalBusy: false,
}))

const tmuxCleanupState = vi.hoisted(() => ({
  calls: [] as Array<{ projectRoot?: string; itemPath?: string; disabled?: boolean }>,
  onSelect: vi.fn(),
  visible: true,
}))

const hostTmuxInventoryState = vi.hoisted(() => ({
  calls: [] as Array<{ projectRoot?: string; disabled?: boolean }>,
  onSelect: vi.fn(),
  visible: true,
}))

const workspaceRecoveryState = vi.hoisted(() => ({
  calls: [] as Array<{ rootId: string; workspace: unknown; disabled?: boolean }>,
  onSelect: vi.fn(),
  visible: false,
}))

const repoClientMocks = vi.hoisted(() => ({
  getRepositoryRemoteBranches: vi.fn(),
}))

const rescanWorkspace = vi.fn(async (_rootId: string) => {})

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      sensors,
    }: {
      children: ReactNode
      onDragEnd: (event: TestDragEndEvent) => void
      sensors: unknown[]
    }) => {
      dndState.lastDragEnd = onDragEnd
      dndState.contextSensors = sensors
      return <>{children}</>
    },
    PointerSensor: dndState.pointerSensor,
    KeyboardSensor: dndState.keyboardSensor,
    closestCenter: vi.fn(),
    useSensor: dndState.useSensor,
    useSensors: (...sensors: unknown[]) => sensors,
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable')
  return {
    ...actual,
    SortableContext: ({ children, items, strategy }: { children: ReactNode; items: string[]; strategy: unknown }) => {
      dndState.sortableItems = items
      dndState.sortableStrategy = strategy
      return <>{children}</>
    },
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: dndState.verticalStrategy,
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-sortable-id': id, 'aria-roledescription': 'sortable' },
      listeners: { onKeyDown: dndState.sortableOnKeyDown },
      setNodeRef: (node: HTMLElement | null) => node?.setAttribute('data-sortable-node-id', id),
      setActivatorNodeRef: (node: HTMLElement | null) => node?.setAttribute('data-sortable-activator-id', id),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string>) =>
    key === 'repo-tabs.close-named' ? `Close ${params?.name}` : key,
}))

vi.mock('#/web/hooks/useProjectExternalOpenActions.ts', () => ({
  useProjectExternalOpenActions: (projectId: string) => {
    projectExternalActionState.requestedProjectIds.push(projectId)
    return {
      visible: true,
      editor: {
        disabled: projectExternalActionState.editorDisabled,
        busy: projectExternalActionState.editorBusy,
        iconPref: 'cursor',
        onSelect: () => projectExternalActionState.editorOnSelect(projectId),
      },
      externalTerminal: {
        disabled: projectExternalActionState.terminalDisabled,
        busy: projectExternalActionState.terminalBusy,
        iconPref: 'ghostty',
        onSelect: () => projectExternalActionState.terminalOnSelect(projectId),
      },
      remote: {
        disabled: projectExternalActionState.remoteDisabled,
        busy: projectExternalActionState.remoteBusy,
        onSelect: () => projectExternalActionState.remoteOnSelect(projectId),
      },
    }
  },
}))

vi.mock('#/web/hooks/useProjectInternalTerminalAction.ts', () => ({
  useProjectInternalTerminalAction: (projectId: string) => ({
    disabled: projectExternalActionState.internalTerminalDisabled,
    busy: projectExternalActionState.internalTerminalBusy,
    onSelect: () => projectExternalActionState.internalTerminalOnSelect(projectId),
  }),
}))

vi.mock('#/web/hooks/useAssociatedTmuxCleanup.tsx', () => ({
  useAssociatedTmuxCleanup: (options: { projectRoot?: string; itemPath?: string; disabled?: boolean }) => {
    tmuxCleanupState.calls.push(options)
    return {
      visible: tmuxCleanupState.visible,
      action: {
        id: 'cleanupTmuxSessions',
        label: 'tmux.cleanup.action',
        icon: null,
        disabled: false,
        busy: false,
        destructive: true,
        onSelect: tmuxCleanupState.onSelect,
      },
      contextAction: {
        label: 'tmux.cleanup.action',
        icon: null,
        disabled: false,
        busy: false,
        destructive: true,
        separated: true,
        onSelect: tmuxCleanupState.onSelect,
      },
      dialog: <div data-testid="project-tmux-cleanup-dialog" />,
    }
  },
}))

vi.mock('#/web/hooks/useHostTmuxInventory.tsx', () => ({
  useHostTmuxInventory: (options: { projectRoot?: string; disabled?: boolean }) => {
    hostTmuxInventoryState.calls.push(options)
    return {
      visible: hostTmuxInventoryState.visible,
      contextAction: {
        label: 'tmux.host-inventory.action',
        icon: null,
        disabled: false,
        busy: false,
        destructive: false,
        onSelect: hostTmuxInventoryState.onSelect,
      },
      dialog: <div data-testid="project-host-tmux-inventory-dialog" />,
    }
  },
}))

vi.mock('#/web/hooks/useWorkspaceConfigurationRecovery.tsx', () => ({
  useWorkspaceConfigurationRecovery: (options: { rootId: string; workspace: unknown; disabled?: boolean }) => {
    workspaceRecoveryState.calls.push(options)
    return {
      visible: workspaceRecoveryState.visible && !!options.workspace,
      contextAction: {
        label: 'workspace.recovery.action',
        icon: null,
        disabled: false,
        busy: false,
        destructive: true,
        separated: true,
        onSelect: workspaceRecoveryState.onSelect,
      },
      dialog: <div data-testid="workspace-recovery-dialog" />,
    }
  },
}))

vi.mock('#/web/components/ExternalAppIcon/index.tsx', () => ({
  EditorAppIcon: ({ pref }: { pref: string }) => <span data-testid="mock-editor-app-icon" data-pref={pref} />,
  TerminalAppIcon: ({ pref }: { pref: string }) => <span data-testid="mock-terminal-app-icon" data-pref={pref} />,
}))

vi.mock('#/web/repo-client.ts', async () => {
  const actual = await vi.importActual<typeof import('#/web/repo-client.ts')>('#/web/repo-client.ts')
  return {
    ...actual,
    getRepositoryRemoteBranches: repoClientMocks.getRepositoryRemoteBranches,
  }
})

vi.mock('#/web/components/repo-workspace/project-switcher-model.tsx', async () => {
  const actual = await vi.importActual<typeof import('#/web/components/repo-workspace/project-switcher-model.tsx')>(
    '#/web/components/repo-workspace/project-switcher-model.tsx',
  )
  return { ...actual, ProjectTerminalStatus: () => null }
})

const projects: ProjectSummary[] = [
  {
    id: '/repo-a',
    name: 'Repo A',
    unavailable: false,
    isGitRepo: true,
    changeCount: 5,
    terminalWorktreeKeys: [],
    branchWorkspaceRootId: null,
  },
  {
    id: '/repo-b',
    name: 'Repo B',
    unavailable: false,
    isGitRepo: false,
    changeCount: 0,
    terminalWorktreeKeys: [],
    branchWorkspaceRootId: null,
  },
]

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalResizeObserver = globalThis.ResizeObserver

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  resetReposStore()
  seedRepoState({
    id: '/repo-a',
    branches: [createRepoBranch('main', { isCurrent: true, worktree: { path: '/repo-a' } })],
    currentBranch: 'main',
    remote: { hasRemotes: true },
  })
  rescanWorkspace.mockReset()
  rescanWorkspace.mockResolvedValue(undefined)
  useReposStore.setState({ rescanWorkspace })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MockResizeObserver,
  })
  dndState.lastDragEnd = null
  dndState.contextSensors = null
  dndState.sortableItems = null
  dndState.sortableStrategy = null
  dndState.sortableOnKeyDown.mockClear()
  dndState.useSensor.mockClear()
  projectExternalActionState.requestedProjectIds = []
  projectExternalActionState.editorOnSelect.mockReset()
  projectExternalActionState.terminalOnSelect.mockReset()
  projectExternalActionState.editorDisabled = false
  projectExternalActionState.editorBusy = false
  projectExternalActionState.terminalDisabled = false
  projectExternalActionState.terminalBusy = false
  projectExternalActionState.remoteOnSelect.mockReset()
  projectExternalActionState.remoteDisabled = false
  projectExternalActionState.remoteBusy = false
  projectExternalActionState.internalTerminalOnSelect.mockReset()
  projectExternalActionState.internalTerminalDisabled = false
  projectExternalActionState.internalTerminalBusy = false
  tmuxCleanupState.calls = []
  tmuxCleanupState.onSelect.mockReset()
  tmuxCleanupState.visible = true
  hostTmuxInventoryState.calls = []
  hostTmuxInventoryState.onSelect.mockReset()
  hostTmuxInventoryState.visible = true
  workspaceRecoveryState.calls = []
  workspaceRecoveryState.onSelect.mockReset()
  workspaceRecoveryState.visible = false
  repoClientMocks.getRepositoryRemoteBranches.mockReset()
  repoClientMocks.getRepositoryRemoteBranches.mockResolvedValue(['origin/feature/menu'])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  resetReposStore()
})

function renderList(
  fixture: {
    projects?: ProjectSummary[]
    snapshots?: ReadonlyMap<string, WorktreeTerminalSnapshot>
    closeTerminal?: CloseTerminalMock
  } = {},
) {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  const onReorder = vi.fn()
  const onToggleFileArea = vi.fn()
  const closeTerminal =
    fixture.closeTerminal ?? vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
  act(() => {
    root!.render(
      <TerminalSessionContext.Provider value={terminalCommandContext(closeTerminal)}>
        <TerminalSessionReadContext.Provider value={terminalReadContext(fixture.snapshots ?? new Map())}>
          <SidebarProjectList
            id="project-list"
            projects={fixture.projects ?? projects}
            activeRepoId="/repo-a"
            onActivate={onActivate}
            onClose={onClose}
            onReorder={onReorder}
            onToggleFileArea={onToggleFileArea}
          />
        </TerminalSessionReadContext.Provider>
      </TerminalSessionContext.Provider>,
    )
  })
  return { onActivate, onClose, onReorder, onToggleFileArea, closeTerminal }
}

describe('SidebarProjectList', () => {
  test('registers each project row with a dedicated sortable activator', () => {
    renderList()

    expect(
      Array.from(container!.querySelectorAll('[data-sortable-node-id]'), (node) =>
        node.getAttribute('data-sortable-node-id'),
      ),
    ).toEqual(['/repo-a', '/repo-b'])
    expect(
      Array.from(container!.querySelectorAll('[data-sortable-activator-id]'), (node) =>
        node.getAttribute('data-sortable-activator-id'),
      ),
    ).toEqual(['/repo-a', '/repo-b'])
    expect(container!.querySelectorAll('[data-workspace-list-item-main][data-sortable-id]')).toHaveLength(0)
  })

  test('uses the shared pointer threshold and keyboard coordinates', () => {
    renderList()

    expect(dndState.useSensor).toHaveBeenCalledWith(dndState.pointerSensor, {
      activationConstraint: { distance: 6 },
    })
    expect(dndState.useSensor).toHaveBeenCalledWith(
      dndState.keyboardSensor,
      expect.objectContaining({ coordinateGetter: expect.any(Function) }),
    )
    expect(dndState.contextSensors).toEqual([
      { sensor: dndState.pointerSensor, options: { activationConstraint: { distance: 6 } } },
      { sensor: dndState.keyboardSensor, options: { coordinateGetter: expect.any(Function) } },
    ])
  })

  test('passes the ordered ids and vertical strategy to the sortable context', () => {
    renderList()

    expect(dndState.sortableItems).toEqual(['/repo-a', '/repo-b'])
    expect(dndState.sortableStrategy).toBe(dndState.verticalStrategy)
  })

  test('attaches sortable accessibility attributes and listeners only to the project grip', () => {
    renderList()
    const firstRow = container!.querySelector('[data-sortable-activator-id="/repo-a"]')

    expect(firstRow?.getAttribute('data-sortable-id')).toBe('/repo-a')
    expect(firstRow?.getAttribute('aria-roledescription')).toBe('sortable')
    act(() => firstRow?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(dndState.sortableOnKeyDown).toHaveBeenCalledTimes(1)
  })

  test('keeps native touch scrolling enabled on project rows', () => {
    renderList()
    const firstRow = container!.querySelector('[data-sortable-activator-id="/repo-a"]')

    expect(firstRow?.className).not.toContain('touch-none')
  })

  test('renders project names one font size above supporting text', () => {
    renderList()
    const projectName = Array.from(container!.querySelectorAll('span')).find(
      (element) => element.textContent === 'Repo A' && element.children.length === 0,
    )

    expect(projectName?.className).toContain('text-sm')
    expect(projectName?.className).toContain('leading-4')
    expect(projectName?.className).not.toContain('leading-none')
  })

  test('prefixes only remote project row names and labels with their SSH alias', async () => {
    const remoteId = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/kooky' })
    const prefixedRemoteId = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })
    renderList({
      projects: [
        { ...projects[0]!, id: remoteId, name: 'kooky' },
        { ...projects[1]!, id: '/workspace', name: 'workspace' },
        { ...projects[1]!, id: prefixedRemoteId, name: 'prod:workspace' },
      ],
    })

    expect(projectRow(remoteId).textContent).toContain('prod:kooky')
    expect(
      projectRow(remoteId).querySelector('[data-workspace-list-item-action="editor"]')?.getAttribute('aria-label'),
    ).toBe('worktrees.open-in-editor-label prod:kooky')
    expect((await openProjectMenu(remoteId)).map((item) => item.textContent?.trim())).toContain('Close prod:kooky')
    expect(projectRow('/workspace').textContent).toContain('workspace')
    expect(projectRow('/workspace').textContent).not.toContain(':workspace')
    expect(projectRow(prefixedRemoteId).querySelector('[data-workspace-list-item-main]')?.textContent).toBe(
      'prod:workspace',
    )
  })

  test('shows the cumulative project change count and omits a zero count', () => {
    renderList()

    const changeBadge = projectRow('/repo-a').querySelector('[data-testid="project-change-count-badge"]')
    expect(changeBadge?.textContent).toBe('5')
    expect(changeBadge?.querySelector('.lucide-git-compare-arrows')).not.toBeNull()
    expect(projectRow('/repo-b').querySelector('[data-testid="project-change-count-badge"]')).toBeNull()
  })

  test('uses a folder icon for plain projects and a Git folder icon for repositories', () => {
    renderList()
    const gitProject = projectRow('/repo-a').querySelector('[data-workspace-list-item-main]')
    const plainProject = projectRow('/repo-b').querySelector('[data-workspace-list-item-main]')

    expect(gitProject?.getAttribute('data-project-kind')).toBe('git')
    expect(gitProject?.querySelector('svg.lucide-folder-git-2')).not.toBeNull()
    expect(plainProject?.getAttribute('data-project-kind')).toBe('plain')
    expect(plainProject?.querySelector('svg.lucide-folder')).not.toBeNull()
    expect(plainProject?.querySelector('svg.lucide-folder-git-2')).toBeNull()
  })

  test('activates a project from its row', () => {
    const { onActivate } = renderList()
    const firstRow = projectRow('/repo-a').querySelector('[data-workspace-list-item-main]')

    act(() => firstRow?.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(onActivate).toHaveBeenCalledWith('/repo-a')
  })

  test('requests a file area toggle from a project row double-click', () => {
    const { onActivate, onToggleFileArea } = renderList()
    const firstRow = projectRow('/repo-a').querySelector('[data-workspace-list-item-main]')

    act(() => {
      firstRow?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      firstRow?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }))
      firstRow?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
    })

    expect(onActivate).toHaveBeenCalledTimes(2)
    expect(onActivate).toHaveBeenLastCalledWith('/repo-a')
    expect(onToggleFileArea).toHaveBeenCalledTimes(1)
  })

  test('closes a project from More without activating it', async () => {
    const { onActivate, onClose } = renderList()
    const items = await openProjectMenu('/repo-a')
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'action.pull-remote-branch',
      'action.create-worktree',
      'action.remote',
      'terminal.new-with-tmux',
      'terminal.external',
      'Close Repo A',
      'tmux.cleanup.action',
    ])
    const close = items.find((item) => item.textContent?.includes('Close Repo A'))
    expect(close?.getAttribute('data-variant')).toBe('default')

    await act(async () => {
      close?.click()
      await Promise.resolve()
    })

    expect(onClose).toHaveBeenCalledWith('/repo-a')
    expect(onActivate).not.toHaveBeenCalled()
  })

  test('offers repository creation only for Git projects without activating or closing them', async () => {
    const { onActivate, onClose } = renderList()
    const gitMenu = await openProjectMenu('/repo-a')

    expect(gitMenu.map((item) => item.textContent?.trim())).toEqual(
      expect.arrayContaining(['action.pull-remote-branch', 'action.create-worktree']),
    )

    const remoteBranch = gitMenu.find((item) => item.textContent?.includes('action.pull-remote-branch'))
    await act(async () => {
      remoteBranch?.click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('action.pull-remote-branch-title')
    await clickDialogButton('dialog.cancel')

    const worktree = (await openProjectMenu('/repo-a')).find((item) =>
      item.textContent?.includes('action.create-worktree'),
    )
    await act(async () => {
      worktree?.click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('action.create-worktree-title')
    expect(document.body.textContent).toContain('action.create-worktree-mode-new')
    expect(document.body.textContent).toContain('action.create-worktree-mode-existing')
    expect(document.body.textContent).toContain('action.create-worktree-mode-remote')
    expect(document.body.textContent).toContain('action.create-worktree-mode-detached')
    expect(document.querySelector('#cwt-base')?.textContent).toContain('main')
    await clickDialogButton('dialog.cancel')

    const plainMenu = await openProjectMenu('/repo-b')
    const plainMenuLabels = plainMenu.map((item) => item.textContent?.trim())
    expect(plainMenuLabels).not.toContain('action.pull-remote-branch')
    expect(plainMenuLabels).not.toContain('action.create-worktree')
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('offers the repository remote from Git project More and context menus only', async () => {
    const { onActivate } = renderList()

    expect((await openProjectMenu('/repo-a')).map((item) => item.textContent?.trim())).toContain('action.remote')
    expect((await openProjectMenu('/repo-b')).map((item) => item.textContent?.trim())).not.toContain('action.remote')

    const remoteMenuItem = (await openProjectMenu('/repo-a')).find((item) =>
      item.textContent?.includes('action.remote'),
    )
    await act(async () => {
      remoteMenuItem?.click()
      await Promise.resolve()
    })
    await clickContextMenuItem(projectRow('/repo-a'), 'action.remote')

    expect(projectExternalActionState.remoteOnSelect).toHaveBeenNthCalledWith(1, '/repo-a')
    expect(projectExternalActionState.remoteOnSelect).toHaveBeenNthCalledWith(2, '/repo-a')
    expect(onActivate).not.toHaveBeenCalled()
  })

  test('offers workspace repository detection only for an ordinary plain project', async () => {
    const { onActivate, onClose } = renderList()

    expect((await openProjectMenu('/repo-a')).map((item) => item.textContent?.trim())).not.toContain(
      'workspace.detect-repositories',
    )
    const detect = (await openProjectMenu('/repo-b')).find((item) =>
      item.textContent?.includes('workspace.detect-repositories'),
    )

    expect(detect).toBeDefined()
    await act(async () => {
      detect?.click()
      await Promise.resolve()
    })

    expect(rescanWorkspace).toHaveBeenCalledWith('/repo-b')
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('hides workspace repository detection after a plain project is recognized as a workspace', async () => {
    useReposStore.setState((state) => ({
      workspaceProjects: {
        ...state.workspaceProjects,
        '/repo-b': {
          rootId: '/repo-b',
          repositoryIds: ['/repo-b/api'],
          candidates: [],
          configured: true,
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    }))
    renderList()

    expect((await openProjectMenu('/repo-b')).map((item) => item.textContent?.trim())).not.toContain(
      'workspace.detect-repositories',
    )
  })

  test('offers configuration recovery only from an anomalous project context menu', async () => {
    workspaceRecoveryState.visible = true
    useReposStore.setState((state) => ({
      workspaceProjects: {
        ...state.workspaceProjects,
        '/repo-b': {
          rootId: '/repo-b',
          repositoryIds: ['/repo-b/missing'],
          candidates: [{ id: '/repo-b/missing', name: 'missing', selected: true, available: false }],
          configured: true,
          configuredRepositoryNames: ['missing'],
          configurationError: null,
          phase: 'ready',
          skipped: [],
          error: null,
        },
      },
    }))
    const { onActivate, onClose } = renderList()

    const moreLabels = (await openProjectMenu('/repo-b')).map((item) => item.textContent?.trim())
    expect(moreLabels).not.toContain('workspace.recovery.action')
    const contextItems = await openContextMenu(projectRow('/repo-b'))
    const recovery = contextItems.find((item) => item.textContent?.includes('workspace.recovery.action'))
    expect(recovery?.getAttribute('data-variant')).toBe('destructive')

    await act(async () => {
      recovery?.click()
      await Promise.resolve()
    })

    expect(workspaceRecoveryState.onSelect).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(workspaceRecoveryState.calls).toEqual([
      { rootId: '/repo-a', workspace: undefined, disabled: false },
      {
        rootId: '/repo-b',
        workspace: expect.objectContaining({ configurationError: null }),
        disabled: false,
      },
    ])
  })

  test('offers destructive tmux cleanup from More without activating or closing the project', async () => {
    const { onActivate, onClose } = renderList()
    const cleanup = (await openProjectMenu('/repo-a')).find((item) => item.textContent?.includes('tmux.cleanup.action'))

    expect(cleanup?.getAttribute('data-variant')).toBe('destructive')
    await act(async () => {
      cleanup?.click()
      await Promise.resolve()
    })

    expect(tmuxCleanupState.onSelect).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('targets only each local or remote project root for tmux cleanup', () => {
    const remoteId = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/kooky' })
    renderList({ projects: [projects[0]!, { ...projects[1]!, id: remoteId, name: 'kooky' }] })

    expect(tmuxCleanupState.calls).toEqual([
      { projectRoot: '/repo-a', itemPath: '/repo-a', disabled: false },
      { projectRoot: remoteId, itemPath: '/srv/kooky', disabled: false },
    ])
    expect(container!.querySelectorAll('[data-testid="project-tmux-cleanup-dialog"]')).toHaveLength(2)
  })

  test('renders every project through the shared frame and three-slot dock', () => {
    renderList()

    expect(projectExternalActionState.requestedProjectIds).toEqual(['/repo-a', '/repo-b'])
    for (const project of projects) {
      const row = projectRow(project.id)
      const projectButton = row.querySelector<HTMLElement>('[data-workspace-list-item-main]')
      const dock = row.querySelector('[data-workspace-list-item-action-dock]')
      const editor = row.querySelector('[data-workspace-list-item-action="editor"]')
      const terminal = row.querySelector('[data-workspace-list-item-action="terminal"]')

      expect(row.getAttribute('data-size')).toBe('project')
      expect(dock?.children).toHaveLength(3)
      expect(projectButton?.className).toContain('pr-[4.25rem]')
      expect(editor?.getAttribute('aria-label')).toBe(`worktrees.open-in-editor-label ${project.name}`)
      expect(terminal?.getAttribute('aria-label')).toBe('terminal.internal')
      expect(editor?.querySelector('[data-testid="mock-editor-app-icon"]')?.getAttribute('data-pref')).toBe('cursor')
      expect(row.querySelector('[aria-label="action.menu"]')).not.toBeNull()
    }
  })

  test('opens quick and menu actions without activating or closing the project', async () => {
    const { onActivate, onClose } = renderList()
    const row = projectRow('/repo-a')
    const editor = row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')
    const internalTerminal = row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="terminal"]')

    act(() => {
      editor?.click()
      internalTerminal?.click()
    })
    const externalTerminal = (await openProjectMenu('/repo-a')).find((item) =>
      item.textContent?.includes('terminal.external'),
    )
    await act(async () => {
      externalTerminal?.click()
      await Promise.resolve()
    })

    expect(projectExternalActionState.editorOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(projectExternalActionState.terminalOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(projectExternalActionState.internalTerminalOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(onActivate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('keeps disabled project actions visible in their stable positions', async () => {
    projectExternalActionState.editorDisabled = true
    projectExternalActionState.terminalDisabled = true
    projectExternalActionState.terminalBusy = true
    renderList()

    const row = projectRow('/repo-a')
    const editor = row.querySelector<HTMLButtonElement>('[data-workspace-list-item-action="editor"]')
    expect(editor?.disabled).toBe(true)
    const externalTerminal = (await openProjectMenu('/repo-a')).find((item) =>
      item.textContent?.includes('terminal.external'),
    )
    expect(externalTerminal?.hasAttribute('data-disabled')).toBe(true)
  })

  test('closes terminals from the project root and member repositories through the row context menu', async () => {
    const rootKey = '/repo-a\0/repo-a'
    const memberKey = '/repo-a/api\0/repo-a/api'
    const closeTerminal = vi.fn<TerminalSessionContextValue['closeTerminalAndDismissDetailIfLast']>()
    renderList({
      projects: [{ ...projects[0]!, terminalWorktreeKeys: [rootKey, memberKey] }, projects[1]!],
      snapshots: new Map([
        [rootKey, worktreeSnapshot(rootKey, [terminalSession(rootKey, 1)])],
        [memberKey, worktreeSnapshot(memberKey, [terminalSession(memberKey, 1)])],
      ]),
      closeTerminal,
    })

    await requestCloseAllFromContextMenu(projectRow('/repo-a'))

    expect(closeTerminal).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('terminal.close-all-confirm-body')
    await confirmCloseAll()
    expect(closeTerminal.mock.calls).toEqual([
      [`${rootKey}\0terminal-1`, { repoRoot: '/repo-a', worktreePath: '/repo-a' }],
      [`${memberKey}\0terminal-1`, { repoRoot: '/repo-a/api', worktreePath: '/repo-a/api' }],
    ])
  })

  test('offers host inventory only from the row context menu without activating the project', async () => {
    renderList()
    const row = projectRow('/repo-a')

    expect((await openContextMenu(row)).map((item) => item.textContent?.trim())).toEqual([
      'worktrees.open-in-editor-label',
      'action.remote',
      'terminal.external',
      'terminal.internal',
      'terminal.new-with-tmux',
      'terminal.close-all',
      'tmux.host-inventory.action',
      'tmux.cleanup.action',
    ])

    await clickContextMenuItem(row, 'worktrees.open-in-editor-label')
    await clickContextMenuItem(row, 'terminal.external')
    await clickContextMenuItem(row, 'terminal.internal')
    await clickContextMenuItem(row, 'tmux.host-inventory.action')
    await clickContextMenuItem(row, 'tmux.cleanup.action')

    expect(projectExternalActionState.editorOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(projectExternalActionState.terminalOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(projectExternalActionState.internalTerminalOnSelect).toHaveBeenCalledWith('/repo-a')
    expect(hostTmuxInventoryState.onSelect).toHaveBeenCalledTimes(1)
    expect(tmuxCleanupState.onSelect).toHaveBeenCalledTimes(1)
    expect(hostTmuxInventoryState.calls).toEqual([
      { projectRoot: '/repo-a', disabled: false },
      { projectRoot: '/repo-b', disabled: false },
    ])
    expect((await openProjectMenu('/repo-a')).map((item) => item.textContent?.trim())).not.toContain(
      'tmux.host-inventory.action',
    )
  })

  test('reorders when dropped over a different project', () => {
    const { onReorder } = renderList()

    act(() => dndState.lastDragEnd?.({ active: { id: '/repo-b' }, over: { id: '/repo-a' } }))

    expect(onReorder).toHaveBeenCalledWith('/repo-b', '/repo-a')
  })

  test('ignores same-project and missing-target drops', () => {
    const { onReorder } = renderList()

    act(() => dndState.lastDragEnd?.({ active: { id: '/repo-a' }, over: { id: '/repo-a' } }))
    act(() => dndState.lastDragEnd?.({ active: { id: '/repo-a' }, over: null }))

    expect(onReorder).not.toHaveBeenCalled()
  })
})

function projectRow(projectId: string): HTMLLIElement {
  const row = container!.querySelector(`[data-sortable-node-id="${projectId}"]`)
  if (!(row instanceof HTMLLIElement)) throw new Error(`missing project row: ${projectId}`)
  return row
}

async function openProjectMenu(projectId: string): Promise<HTMLElement[]> {
  const trigger = projectRow(projectId).querySelector<HTMLButtonElement>('[aria-label="action.menu"]')
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function clickDialogButton(label: string): Promise<void> {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`missing dialog button: ${label}`)
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

async function requestCloseAllFromContextMenu(row: HTMLElement): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes('terminal.close-all'))
  if (!item) throw new Error('missing close all terminals context menu item')
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function openContextMenu(row: HTMLElement): Promise<HTMLElement[]> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))
    await Promise.resolve()
  })
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

async function clickContextMenuItem(row: HTMLElement, label: string): Promise<void> {
  const item = (await openContextMenu(row)).find((candidate) => candidate.textContent?.includes(label))
  if (!item) throw new Error(`missing context menu item: ${label}`)
  await act(async () => {
    item.click()
    await Promise.resolve()
  })
}

async function confirmCloseAll(): Promise<void> {
  const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes('terminal.close-all-confirm-confirm'),
  )
  if (!confirm) throw new Error('missing close all terminals confirmation')
  await act(async () => {
    confirm.click()
    await Promise.resolve()
  })
}

function terminalReadContext(
  snapshots: ReadonlyMap<string, WorktreeTerminalSnapshot>,
): TerminalSessionReadContextValue {
  return {
    worktreeSnapshot: (key) =>
      snapshots.get(key) ?? { worktreeTerminalKey: key, selectedDescriptor: null, sessions: [], count: 0 },
    subscribeWorktree: () => () => {},
    repoSyncReady: () => true,
    subscribeRepoSync: () => () => {},
    snapshot: () => ({ phase: 'opening', message: null, processName: 'terminal' }),
    subscribeSnapshot: () => () => {},
  }
}

function terminalCommandContext(closeTerminal: CloseTerminalMock): TerminalSessionContextValue {
  return {
    createTerminal: vi.fn(async () => ''),
    restoreTmuxSessions: vi.fn(async () => 0),
    selectTerminal: vi.fn(),
    scrollToBottom: vi.fn(),
    pageTmux: vi.fn(),
    focusTerminal: vi.fn(),
    scrollLines: vi.fn(),
    scrollByTouch: vi.fn(),
    beginMobileSelection: vi.fn(() => false),
    extendMobileSelection: vi.fn(),
    finishMobileSelection: vi.fn(),
    cancelMobileSelection: vi.fn(),
    mobileSelectionText: vi.fn(() => ''),
    clearMobileSelection: vi.fn(),
    writeExtraKey: vi.fn(),
    clearBell: vi.fn(() => false),
    closeTerminalAndDismissDetailIfLast: closeTerminal,
    registerWorktreeHost: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    restart: vi.fn(),
    isTerminalFocusTarget: vi.fn(() => false),
    findNext: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    findPrevious: vi.fn(() => ({ resultIndex: -1, resultCount: 0, found: false })),
    clearSearch: vi.fn(),
    writeInput: vi.fn(),
    takeover: vi.fn(),
    reorderSessions: vi.fn(async () => true),
    serialize: vi.fn(() => ''),
  }
}

function worktreeSnapshot(worktreeTerminalKey: string, sessions: TerminalSessionSummary[]): WorktreeTerminalSnapshot {
  return { worktreeTerminalKey, selectedDescriptor: null, sessions, count: sessions.length }
}

function terminalSession(worktreeTerminalKey: string, index: number): TerminalSessionSummary {
  return {
    key: `${worktreeTerminalKey}\0terminal-${index}`,
    worktreeTerminalKey,
    terminalId: `terminal-${index}`,
    index,
    title: `terminal ${index}`,
    phase: 'open',
    selected: index === 1,
    hasBell: false,
  }
}

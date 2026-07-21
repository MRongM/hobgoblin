// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceRepositorySwitcher } from '#/web/components/repo-workspace/WorkspaceRepositorySwitcher.tsx'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('#/web/components/ui/dropdown-menu.tsx', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactElement }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="repository-options">{children}</div>
  ),
  DropdownMenuItem: ({ children, onSelect, ...props }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect} {...props}>
      {children}
    </button>
  ),
}))

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'
const originalActions = {
  activateWorkspaceOverview: useReposStore.getState().activateWorkspaceOverview,
  activateWorkspaceRepository: useReposStore.getState().activateWorkspaceRepository,
}
const activateWorkspaceOverview = vi.fn()
const activateWorkspaceRepository = vi.fn()
let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  activateWorkspaceOverview.mockReset()
  activateWorkspaceRepository.mockReset()
  const overview = replaceRepo(emptyRepo(ROOT, 'workspace'), (repo) => {
    repo.isGitRepo = false
  })
  const api = replaceRepo(emptyRepo(API, 'api'), (repo) => {
    repo.workspaceRootId = ROOT
  })
  const web = replaceRepo(emptyRepo(WEB, 'web'), (repo) => {
    repo.workspaceRootId = ROOT
  })
  useReposStore.setState({
    repos: { [ROOT]: overview, [API]: api, [WEB]: web },
    order: [ROOT],
    activeId: API,
    workspaceProjects: {
      [ROOT]: {
        rootId: ROOT,
        repositoryIds: [API, WEB],
        candidates: [],
        configured: false,
        configurationError: null,
        phase: 'ready',
        skipped: [],
        error: null,
      },
    },
    workspaceActiveContextByRoot: { [ROOT]: { kind: 'repository', repositoryId: API } },
    activateWorkspaceOverview,
    activateWorkspaceRepository,
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  useReposStore.setState(originalActions)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorkspaceRepositorySwitcher', () => {
  test('shows the visible repository and all workspace destinations', () => {
    act(() => root!.render(<WorkspaceRepositorySwitcher repoId={API} compact />))

    const trigger = container?.querySelector('[aria-label="workspace.repositories"]')
    expect(trigger?.textContent).toContain('api')
    expect(container?.querySelector('[data-testid="repository-options"]')?.textContent).toContain('workspace.overview')
    expect(container?.querySelector('[data-testid="repository-options"]')?.textContent).toContain('web')
    expect(container?.querySelector('[aria-current="page"]')?.textContent).toContain('api')
  })

  test('selects Overview without changing global workspace layout state', () => {
    act(() => root!.render(<WorkspaceRepositorySwitcher repoId={API} compact />))
    const overview = Array.from(container!.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('workspace.overview'),
    )

    act(() => overview?.click())

    expect(activateWorkspaceOverview).toHaveBeenCalledWith(ROOT)
  })

  test('does not render for a standalone repository', () => {
    act(() => root!.render(<WorkspaceRepositorySwitcher repoId="/standalone" />))

    expect(container?.textContent).toBe('')
  })
})

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceRepositoryRail } from '#/web/components/repo-workspace/WorkspaceRepositoryRail.tsx'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, unknown>) =>
    params?.count === undefined ? key : `${key}:${params.count}`,
}))

const ROOT = '/workspace'
const API = '/workspace/api'
const WEB = '/workspace/web'
const originalActions = {
  activateWorkspaceRepository: useReposStore.getState().activateWorkspaceRepository,
  rescanWorkspace: useReposStore.getState().rescanWorkspace,
  configureWorkspace: useReposStore.getState().configureWorkspace,
}

let container: HTMLDivElement | null = null
let root: Root | null = null
const activateWorkspaceRepository = vi.fn()
const rescanWorkspace = vi.fn(async () => {})
const configureWorkspace = vi.fn(async () => ({ ok: true as const }))

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  useReposStore.setState(originalActions)
  activateWorkspaceRepository.mockReset()
  rescanWorkspace.mockReset()
  rescanWorkspace.mockResolvedValue(undefined)
  configureWorkspace.mockReset()
  configureWorkspace.mockResolvedValue({ ok: true })
  const overview = replaceRepo(emptyRepo(ROOT, 'workspace'), (repo) => {
    repo.isGitRepo = false
  })
  const api = replaceRepo(emptyRepo(API, 'api'), (repo) => {
    repo.workspaceRootId = ROOT
    repo.data.currentBranch = 'main'
    repo.data.branches = [createRepoBranch('main', { worktree: { path: API } })]
    repo.data.status = [
      {
        path: API,
        branch: 'main',
        isMain: true,
        entries: [
          { x: 'M', y: ' ', path: 'README.md' },
          { x: '?', y: '?', path: 'notes.txt' },
        ],
      },
    ]
  })
  const web = replaceRepo(emptyRepo(WEB, 'web'), (repo) => {
    repo.workspaceRootId = ROOT
    repo.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
  })
  useReposStore.setState({
    repos: { [ROOT]: overview, [API]: api, [WEB]: web },
    order: [ROOT],
    activeId: API,
    workspaceProjects: {
      [ROOT]: {
        rootId: ROOT,
        repositoryIds: [API, WEB],
        candidates: [
          { id: API, name: 'api', selected: true, available: true },
          { id: WEB, name: 'web', selected: true, available: true },
        ],
        configured: true,
        configurationError: null,
        phase: 'ready',
        skipped: [{ path: '/workspace/broken', message: 'error.failed-read-repo' }],
        error: null,
      },
    },
    workspaceActiveRepoByRoot: { [ROOT]: API },
    activateWorkspaceRepository,
    rescanWorkspace,
    configureWorkspace,
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

describe('WorkspaceRepositoryRail', () => {
  test('renders Overview and repository state as one depth-one manifest', () => {
    act(() => root!.render(<WorkspaceRepositoryRail workspaceRootId={ROOT} currentRepoId={API} />))

    expect(container?.textContent).toContain('workspace.repositories')
    expect(container?.textContent).toContain('./')
    expect(container?.textContent).toContain('workspace.overview')
    expect(container?.textContent).toContain('api')
    expect(container?.textContent).toContain('main')
    expect(container?.textContent).toContain('2')
    expect(container?.textContent).toContain('web')
    expect(container?.textContent).toContain('workspace.repository-unavailable')
    expect(container?.textContent).toContain('workspace.scan-skipped:1')
    expect(container?.querySelector('button[aria-current="page"]')?.textContent).toContain('api')
    expect(container?.querySelector('button[aria-label="workspace.rescan"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.batch.create-action"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.batch.remove-action"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.batch.pull-action"]')).not.toBeNull()
    expect(container?.querySelector('button[aria-label="workspace.configure"]')).not.toBeNull()
  })

  test('activates Overview and child repositories through one explicit action', () => {
    act(() => root!.render(<WorkspaceRepositoryRail workspaceRootId={ROOT} currentRepoId={API} />))
    const buttons = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'))
    const overview = buttons.find((button) => button.textContent?.includes('workspace.overview'))
    const web = buttons.find((button) => button.textContent?.includes('web'))

    act(() => overview?.click())
    act(() => web?.click())

    expect(activateWorkspaceRepository).toHaveBeenNthCalledWith(1, ROOT, null)
    expect(activateWorkspaceRepository).toHaveBeenNthCalledWith(2, ROOT, WEB)
  })

  test('rescans without changing the current repository selection', () => {
    act(() => root!.render(<WorkspaceRepositoryRail workspaceRootId={ROOT} currentRepoId={API} />))

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.rescan"]')?.click())

    expect(rescanWorkspace).toHaveBeenCalledWith(ROOT)
    expect(activateWorkspaceRepository).not.toHaveBeenCalled()
  })

  test('opens configuration and saves through the workspace action', async () => {
    act(() => root!.render(<WorkspaceRepositoryRail workspaceRootId={ROOT} currentRepoId={API} />))

    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="workspace.configure"]')?.click())
    await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click())

    expect(configureWorkspace).toHaveBeenCalledWith(ROOT, { repo: ['api', 'web'] })
  })
})

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { createRepoBranch, resetReposStore } from '#/web/stores/repos/test-utils.ts'
import type { RepoState } from '#/web/stores/repos/types.ts'
import {
  resolveProjectExternalOpenTarget,
  useProjectExternalOpenActions,
  type ProjectExternalOpenActions,
} from '#/web/hooks/useProjectExternalOpenActions.ts'

const mocks = vi.hoisted(() => ({
  externalApps: {
    terminalApp: 'ghostty' as const,
    resolvedTerminalApp: 'ghostty' as const,
    terminalAvailable: true,
    editorApp: 'vscode' as const,
    resolvedEditorApp: 'vscode' as const,
    editorAvailable: true,
  },
  openRepositoryEditor: vi.fn(),
  openRepositoryRemote: vi.fn(),
  openRepositoryTerminal: vi.fn(),
  openRemoteRepositoryEditor: vi.fn(),
  openRemoteRepositoryTerminal: vi.fn(),
  setLastResult: vi.fn(),
}))

vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useRuntimeExternalAppSettings: () => mocks.externalApps,
}))

vi.mock('#/web/repo-client.ts', () => ({
  openRepositoryEditor: mocks.openRepositoryEditor,
  openRepositoryRemote: mocks.openRepositoryRemote,
  openRepositoryTerminal: mocks.openRepositoryTerminal,
}))

vi.mock('#/web/remote-client.ts', () => ({
  openRemoteRepositoryEditor: mocks.openRemoteRepositoryEditor,
  openRemoteRepositoryTerminal: mocks.openRemoteRepositoryTerminal,
}))

describe('resolveProjectExternalOpenTarget', () => {
  test('returns the selected Git branch worktree path', () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [
        createRepoBranch('main', { lastCommitHash: 'abc', worktree: { path: '/repo' } }),
        createRepoBranch('feature/demo', { lastCommitHash: 'def', worktree: { path: '/worktrees/demo' } }),
      ]
      draft.ui.selectedBranch = 'feature/demo'
    })

    expect(resolveProjectExternalOpenTarget(repo)).toBe('/worktrees/demo')
  })

  test('returns the local Plain workspace root', () => {
    const repo = createRepo('/workspace', (draft) => {
      draft.isGitRepo = false
      draft.data.branches = []
      draft.ui.selectedBranch = null
    })

    expect(resolveProjectExternalOpenTarget(repo)).toBe('/workspace')
  })

  test('returns the SSH Plain workspace remote path', () => {
    const target = normalizeRemoteTarget({
      alias: 'devbox',
      host: 'example.test',
      user: 'developer',
      port: 22,
      remotePath: '/srv/workspace',
      displayName: 'devbox:workspace',
    })
    if (!target) throw new Error('invalid remote test target')
    const repo = createRepo(target.id, (draft) => {
      draft.isGitRepo = false
      draft.data.branches = []
      draft.ui.selectedBranch = null
      draft.remote.target = target
    })

    expect(resolveProjectExternalOpenTarget(repo)).toBe('/srv/workspace')
  })

  test('returns null when the selected Git branch has no worktree', () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('feature/demo', { lastCommitHash: 'def' })]
      draft.ui.selectedBranch = 'feature/demo'
    })

    expect(resolveProjectExternalOpenTarget(repo)).toBeNull()
  })

  test('returns the selected detached worktree path', () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('main', { worktree: { path: '/repo' } })]
      draft.data.worktreesByPath = {
        '/repo': { path: '/repo', branch: 'main', isMain: true },
        '/worktrees/detached': {
          path: '/worktrees/detached',
          head: 'abcdef1234567890',
          isDetached: true,
          isMain: false,
        },
      }
      draft.ui.selectedBranch = null
      draft.ui.selectedDetachedWorktreePath = '/worktrees/detached'
    })

    expect(resolveProjectExternalOpenTarget(repo)).toBe('/worktrees/detached')
  })
})

function createRepo(id: string, mutate: (repo: RepoState) => void): RepoState {
  return replaceRepo(emptyRepo(id, 'Project'), mutate)
}

describe('useProjectExternalOpenActions', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

  beforeEach(() => {
    resetReposStore()
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    mocks.externalApps.terminalAvailable = true
    mocks.externalApps.editorAvailable = true
    mocks.openRepositoryEditor.mockReset()
    mocks.openRepositoryRemote.mockReset()
    mocks.openRepositoryTerminal.mockReset()
    mocks.openRemoteRepositoryEditor.mockReset()
    mocks.openRemoteRepositoryTerminal.mockReset()
    mocks.setLastResult.mockReset()
    for (const opener of [
      mocks.openRepositoryEditor,
      mocks.openRepositoryRemote,
      mocks.openRepositoryTerminal,
      mocks.openRemoteRepositoryEditor,
      mocks.openRemoteRepositoryTerminal,
    ]) {
      opener.mockResolvedValue({ ok: true, message: '' })
    }
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    container.remove()
    root = null
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  test('shows enabled actions with resolved app icons for an available ordinary project', async () => {
    const repo = selectedGitRepo('/repo', '/worktrees/demo')
    seedProject(repo)

    const actions = await renderActions(repo.id)

    expect(actions().visible).toBe(true)
    expect(actions().editor).toMatchObject({ disabled: false, busy: false, iconPref: 'vscode' })
    expect(actions().externalTerminal).toMatchObject({ disabled: false, busy: false, iconPref: 'ghostty' })
  })

  test('opens a multi-repository workspace root like every other project', async () => {
    const repo = createRepo('/workspace', (draft) => {
      draft.isGitRepo = false
    })
    seedProject(repo, true)

    const actions = await renderActions(repo.id)

    expect(actions().visible).toBe(true)
    expect(actions().editor.disabled).toBe(false)
    await act(async () => await actions().editor.onSelect())
    expect(mocks.openRepositoryEditor).toHaveBeenCalledWith('/workspace')
  })

  test('disables actions when the project is unavailable or has no working-directory target', async () => {
    const unavailable = selectedGitRepo('/repo', '/repo', (draft) => {
      draft.availability = { phase: 'unavailable', reason: 'missing', checkedAt: 1 }
    })
    seedProject(unavailable)
    const unavailableActions = await renderActions(unavailable.id)
    expect(unavailableActions().editor.disabled).toBe(true)
    expect(unavailableActions().externalTerminal.disabled).toBe(true)

    const noTarget = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('feature/demo', { lastCommitHash: 'def' })]
      draft.ui.selectedBranch = 'feature/demo'
    })
    seedProject(noTarget)
    const noTargetActions = await renderActions(noTarget.id)
    expect(noTargetActions().editor.disabled).toBe(true)
    expect(noTargetActions().externalTerminal.disabled).toBe(true)
  })

  test('uses external app availability for local actions', async () => {
    mocks.externalApps.editorAvailable = false
    mocks.externalApps.terminalAvailable = false
    const repo = selectedGitRepo('/repo', '/repo')
    seedProject(repo)

    const actions = await renderActions(repo.id)

    expect(actions().editor.disabled).toBe(true)
    expect(actions().externalTerminal.disabled).toBe(true)
  })

  test('opens a local project target in the configured editor', async () => {
    const repo = selectedGitRepo('/repo', '/worktrees/demo')
    seedProject(repo)
    const actions = await renderActions(repo.id)

    await act(async () => await actions().editor.onSelect())

    expect(mocks.openRepositoryEditor).toHaveBeenCalledWith('/worktrees/demo')
    expect(mocks.openRemoteRepositoryEditor).not.toHaveBeenCalled()
    expect(mocks.setLastResult).not.toHaveBeenCalled()
  })

  test('opens a Git project remote without requiring a selected worktree', async () => {
    const repo = createRepo('/repo', (draft) => {
      draft.data.branches = [createRepoBranch('feature/demo', { lastCommitHash: 'def' })]
      draft.ui.selectedBranch = 'feature/demo'
      draft.remote.hasBrowserRemote = true
      draft.remote.browserRemoteProvider = 'github'
    })
    seedProject(repo)
    const actions = await renderActions(repo.id)

    expect(actions().remote).toMatchObject({ disabled: false, busy: false })
    await act(async () => await actions().remote.onSelect())

    expect(mocks.openRepositoryRemote).toHaveBeenCalledWith(repo.id)
    expect(mocks.setLastResult).not.toHaveBeenCalled()
  })

  test('disables the remote action for Plain workspaces and repositories without a browser remote', async () => {
    const plainWorkspace = createRepo('/workspace', (draft) => {
      draft.isGitRepo = false
      draft.remote.hasBrowserRemote = true
    })
    seedProject(plainWorkspace)
    const plainActions = await renderActions(plainWorkspace.id)
    expect(plainActions().remote.disabled).toBe(true)

    const repository = selectedGitRepo('/repo', '/repo')
    seedProject(repository)
    const repositoryActions = await renderActions(repository.id)
    expect(repositoryActions().remote.disabled).toBe(true)
  })

  test('reports a failed repository remote open through the existing repo result flow', async () => {
    const repo = selectedGitRepo('/repo', '/repo', (draft) => {
      draft.remote.hasBrowserRemote = true
    })
    mocks.openRepositoryRemote.mockResolvedValue({ ok: false, message: 'error.no-remote-url' })
    seedProject(repo)
    const actions = await renderActions(repo.id)

    await act(async () => await actions().remote.onSelect())

    expect(mocks.setLastResult).toHaveBeenCalledWith(
      repo.id,
      { ok: false, message: 'error.no-remote-url' },
      repo.instanceToken,
    )
  })

  test('opens a local Plain workspace root in the configured external terminal', async () => {
    const repo = createRepo('/workspace', (draft) => {
      draft.isGitRepo = false
    })
    seedProject(repo)
    const actions = await renderActions(repo.id)

    await act(async () => await actions().externalTerminal.onSelect())

    expect(mocks.openRepositoryTerminal).toHaveBeenCalledWith({
      projectRoot: '/workspace',
      workingDirectory: '/workspace',
    })
    expect(mocks.openRemoteRepositoryTerminal).not.toHaveBeenCalled()
    expect(mocks.setLastResult).not.toHaveBeenCalled()
  })

  test('opens remote editor and terminal targets through the remote clients', async () => {
    mocks.externalApps.terminalAvailable = false
    const target = normalizeRemoteTarget({
      alias: 'devbox',
      host: 'example.test',
      user: 'developer',
      port: 22,
      remotePath: '/srv/repo',
    })
    if (!target) throw new Error('invalid remote test target')
    const repo = selectedGitRepo(target.id, '/srv/worktrees/demo', (draft) => {
      draft.remote.target = target
    })
    seedProject(repo)
    const actions = await renderActions(repo.id)

    expect(actions().externalTerminal.disabled).toBe(false)
    expect(actions().externalTerminal.iconPref).toBe('auto')
    await act(async () => {
      await actions().editor.onSelect()
      await actions().externalTerminal.onSelect()
    })

    expect(mocks.openRemoteRepositoryEditor).toHaveBeenCalledWith(target.id, '/srv/worktrees/demo')
    expect(mocks.openRemoteRepositoryTerminal).toHaveBeenCalledWith(target.id, '/srv/worktrees/demo')
    expect(mocks.openRepositoryEditor).not.toHaveBeenCalled()
    expect(mocks.openRepositoryTerminal).not.toHaveBeenCalled()
  })

  test('opens a remote Plain workspace root through both remote clients', async () => {
    mocks.externalApps.terminalAvailable = false
    const target = normalizeRemoteTarget({
      alias: 'devbox',
      host: 'example.test',
      user: 'developer',
      port: 22,
      remotePath: '/srv/workspace',
    })
    if (!target) throw new Error('invalid remote test target')
    const repo = createRepo(target.id, (draft) => {
      draft.isGitRepo = false
      draft.remote.target = target
    })
    seedProject(repo)
    const actions = await renderActions(repo.id)

    await act(async () => {
      await actions().editor.onSelect()
      await actions().externalTerminal.onSelect()
    })

    expect(mocks.openRemoteRepositoryEditor).toHaveBeenCalledWith(target.id, '/srv/workspace')
    expect(mocks.openRemoteRepositoryTerminal).toHaveBeenCalledWith(target.id, '/srv/workspace')
  })

  test('reports failed opens through the existing repo result flow', async () => {
    const repo = selectedGitRepo('/repo', '/repo')
    mocks.openRepositoryEditor.mockResolvedValue({ ok: false, message: 'error.editor-not-installed' })
    seedProject(repo)
    const actions = await renderActions(repo.id)

    await act(async () => await actions().editor.onSelect())

    expect(mocks.setLastResult).toHaveBeenCalledWith(
      repo.id,
      { ok: false, message: 'error.editor-not-installed' },
      repo.instanceToken,
    )
  })

  test('reports thrown client errors through the existing repo result flow', async () => {
    const repo = selectedGitRepo('/repo', '/repo')
    mocks.openRepositoryEditor.mockRejectedValue(new Error('editor launch failed'))
    seedProject(repo)
    const actions = await renderActions(repo.id)

    await act(async () => await actions().editor.onSelect())

    expect(mocks.setLastResult).toHaveBeenCalledWith(
      repo.id,
      { ok: false, message: 'editor launch failed' },
      repo.instanceToken,
    )
  })

  test('keeps a pending open single-flight and disables every project open action until it settles', async () => {
    const repo = selectedGitRepo('/repo', '/repo', (draft) => {
      draft.remote.hasBrowserRemote = true
    })
    let resolveOpen: ((result: { ok: true; message: string }) => void) | undefined
    mocks.openRepositoryEditor.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve
      }),
    )
    seedProject(repo)
    const actions = await renderActions(repo.id)
    let firstOpen: void | Promise<void>

    await act(async () => {
      firstOpen = actions().editor.onSelect()
      actions().editor.onSelect()
      await Promise.resolve()
    })

    expect(mocks.openRepositoryEditor).toHaveBeenCalledTimes(1)
    expect(actions().editor).toMatchObject({ busy: true, disabled: true })
    expect(actions().externalTerminal.disabled).toBe(true)
    expect(actions().remote.disabled).toBe(true)

    await act(async () => {
      resolveOpen?.({ ok: true, message: '' })
      await firstOpen
    })
    expect(actions().editor).toMatchObject({ busy: false, disabled: false })
    expect(actions().remote.disabled).toBe(false)
  })

  async function renderActions(projectId: string): Promise<() => ProjectExternalOpenActions> {
    let current: ProjectExternalOpenActions | null = null
    root ??= createRoot(container)
    await act(async () => {
      root!.render(<ActionsHarness projectId={projectId} onReady={(value) => (current = value)} />)
    })
    return () => {
      if (!current) throw new Error('project actions not rendered')
      return current
    }
  }
})

function ActionsHarness({
  projectId,
  onReady,
}: {
  projectId: string
  onReady: (actions: ProjectExternalOpenActions) => void
}) {
  onReady(useProjectExternalOpenActions(projectId))
  return null
}

function selectedGitRepo(id: string, worktreePath: string, mutate?: (repo: RepoState) => void): RepoState {
  return createRepo(id, (draft) => {
    draft.data.branches = [
      createRepoBranch('feature/demo', { lastCommitHash: 'def', worktree: { path: worktreePath } }),
    ]
    draft.ui.selectedBranch = 'feature/demo'
    mutate?.(draft)
  })
}

function seedProject(repo: RepoState, multiRepositoryWorkspace = false): void {
  useReposStore.setState({
    repos: { [repo.id]: repo },
    workspaceProjects: multiRepositoryWorkspace
      ? {
          [repo.id]: {
            rootId: repo.id,
            repositoryIds: [],
            candidates: [],
            configured: false,
            configurationError: null,
            phase: 'ready',
            skipped: [],
            error: null,
          },
        }
      : {},
    setLastResult: mocks.setLastResult,
  })
}

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceDialog } from '#/web/components/repo-workspace/BranchWorkspaceDialog.tsx'
import type { BranchWorkspacePlan, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

const mocks = vi.hoisted(() => ({
  getRepositoryFileTree: vi.fn(),
  getRepositoryRemoteBranches: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryFileTree: mocks.getRepositoryFileTree,
  getRepositoryRemoteBranches: mocks.getRepositoryRemoteBranches,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, values?: Record<string, string | number>) => {
    if (values?.repository) return `${key}:${values.repository}`
    if (values?.completed !== undefined && values.total !== undefined) {
      return `${key}:${values.completed}/${values.total}`
    }
    return key
  },
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.getRepositoryFileTree.mockResolvedValue({
    ok: true,
    worktreePath: '/workspace/api-main',
    dirPath: '/workspace/api-main',
    entries: [],
  })
  mocks.getRepositoryRemoteBranches.mockResolvedValue([])
  mocks.toastSuccess.mockReset()
  mocks.toastWarning.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.querySelectorAll('[data-slot="dialog-portal"]').forEach((node) => node.remove())
  vi.useRealTimers()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceDialog', () => {
  test('shows fetch all only on the create selection screen', () => {
    renderDialog({})
    expect(document.querySelector('[data-action="fetch-all-repositories"]')).not.toBeNull()

    renderDialog({ mode: 'extend' })
    expect(document.querySelector('[data-action="fetch-all-repositories"]')).toBeNull()

    renderDialog({ mode: 'create', plan: approvalPlan() })
    expect(document.querySelector('[data-action="fetch-all-repositories"]')).toBeNull()
  })

  test('keeps the creation form usable while all repositories are fetching', async () => {
    let finishFetch!: (result: { total: number; succeeded: number; failures: [] }) => void
    const onFetchAllRepositories = vi.fn(
      () =>
        new Promise<{ total: number; succeeded: number; failures: [] }>((resolve) => {
          finishFetch = resolve
        }),
    )
    renderDialog({ onFetchAllRepositories })
    act(() => repositoryCheckbox('api').click())
    await flushAsyncWork()

    const fetchAll = document.querySelector<HTMLButtonElement>('[data-action="fetch-all-repositories"]')
    act(() => fetchAll?.click())

    expect(fetchAll?.disabled).toBe(true)
    expect(fetchAll?.querySelector('.lucide-loader-circle')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(false)

    await act(async () => {
      finishFetch({ total: 2, succeeded: 2, failures: [] })
      await Promise.resolve()
    })

    expect(fetchAll?.disabled).toBe(false)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('workspace.branch-workspace.fetch-all-success')
    expect(mocks.getRepositoryRemoteBranches).toHaveBeenCalledTimes(2)
  })

  test('summarizes failed repositories without turning them into a dialog error', async () => {
    const onFetchAllRepositories = vi.fn(async () => ({
      total: 2,
      succeeded: 1,
      failures: [{ repositoryName: 'api', message: 'offline' }],
    }))
    renderDialog({ onFetchAllRepositories })

    await clickAction('fetch-all-repositories')

    expect(mocks.toastWarning).toHaveBeenCalledWith('workspace.branch-workspace.fetch-all-incomplete:1/2', {
      description: 'api: offline',
    })
    expect(document.body.textContent).not.toContain('offline')
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(true)
  })

  test('uses the canonical dialog cancel copy', () => {
    renderDialog({})

    expect(document.body.textContent).toContain('dialog.cancel')
    expect(document.body.textContent).not.toContain('common.cancel')
  })

  test('prefills a dated feature branch name when creating a branch workspace', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 30, 12))

    renderDialog({})

    expect(inputValue('workspace.branch-workspace.branch')).toBe('feat/20260730')
  })

  test('applies and removes a branch prefix through the prefix picker', () => {
    renderDialog({})
    setInput('workspace.branch-workspace.branch', 'topic')

    openMenu('workspace.branch-workspace.branch-prefix.pick')
    clickMenuItem('bugfix/')
    expect(inputValue('workspace.branch-workspace.branch')).toBe('bugfix/topic')

    openMenu('workspace.branch-workspace.branch-prefix.pick')
    clickMenuItem('workspace.branch-workspace.branch-prefix.none')
    expect(inputValue('workspace.branch-workspace.branch')).toBe('topic')
  })

  test('aligns the branch prefix picker with the branch input height', () => {
    renderDialog({})

    const prefix = document.querySelector<HTMLButtonElement>(
      '[aria-label="workspace.branch-workspace.branch-prefix.pick"]',
    )
    const branch = document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.branch"]')

    expect(prefix?.className).toContain('h-[calc(var(--goblin-control-height-sm,2rem)+0.25rem)]')
    expect(branch?.className).toContain('h-[calc(var(--goblin-control-height-sm,2rem)+0.25rem)]')
  })

  test('shows live create progress and the completed step count after confirmation', () => {
    const workspace = existingWorkspace()
    const liveWorkspace: BranchWorkspaceSnapshot = {
      ...workspace,
      repositories: [
        workspace.repositories[0]!,
        {
          repositoryName: 'web',
          targetBranch: 'feature/auth',
          creationBase: { kind: 'localBranch', branch: 'trunk' },
          syncBeforeCreate: false,
          branchOrigin: 'created',
          worktreePath: '/workspace/goblin-feature-auth/web',
          progress: 'pending',
          ready: false,
        },
      ],
    }
    renderDialog({
      plan: planWithSteps('create', [
        { id: 'directory', kind: 'create-directory', label: 'goblin-feature-auth' },
        { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
        { id: 'repository:web', kind: 'create-worktree', label: 'web', repositoryName: 'web' },
      ]),
      progressWorkspace: liveWorkspace,
      pending: true,
    })

    const progress = document.querySelector<HTMLElement>('[data-branch-workspace-operation-progress]')
    expect(progress?.getAttribute('role')).toBe('status')
    expect(progress?.textContent).toContain('workspace.branch-workspace.progress.create')
    expect(progress?.textContent).toContain('workspace.branch-workspace.progress.summary:2/3')
    expect(stepProgress('directory')).toBe('complete')
    expect(stepProgress('repository:api')).toBe('complete')
    expect(stepProgress('repository:web')).toBe('active')
    expect(document.querySelector('[data-action="confirm"] .lucide-loader-circle')).not.toBeNull()
  })

  test('closes a completed creation after only the final remote read failed', () => {
    const onOpenChange = vi.fn()
    renderDialog({
      plan: planWithSteps('create', [
        { id: 'directory', kind: 'create-directory', label: 'goblin-feature-auth' },
        { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
      ]),
      progressWorkspace: existingWorkspace(),
      result: {
        ok: false,
        message: 'workspace.branch-workspace.remote-operation-failed',
        branchWorkspaceId: 'branch-1',
      },
      error: 'workspace.branch-workspace.remote-operation-failed',
      onOpenChange,
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('keeps a completed creation open for a non-read execution failure', () => {
    const onOpenChange = vi.fn()
    renderDialog({
      plan: planWithSteps('create', [
        { id: 'directory', kind: 'create-directory', label: 'goblin-feature-auth' },
        { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
      ]),
      progressWorkspace: existingWorkspace(),
      result: {
        ok: false,
        message: 'workspace.branch-workspace.execute-failed',
        branchWorkspaceId: 'branch-1',
      },
      error: 'workspace.branch-workspace.execute-failed',
      onOpenChange,
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  test('shows live remove progress without changing the destructive confirmation style', () => {
    const workspace = existingWorkspace()
    const liveWorkspace = existingWorkspace()
    liveWorkspace.repositories[0]!.progress = 'removed'
    liveWorkspace.repositories[0]!.ready = false
    liveWorkspace.repositories[0]!.branchCleanupProgress = 'complete'
    renderDialog({
      mode: 'remove',
      workspace,
      progressWorkspace: liveWorkspace,
      plan: removalPlan(),
      pending: true,
    })

    const progress = document.querySelector<HTMLElement>('[data-branch-workspace-operation-progress]')
    expect(progress?.textContent).toContain('workspace.branch-workspace.progress.remove')
    expect(progress?.textContent).toContain('workspace.branch-workspace.progress.summary:1/2')
    expect(stepProgress('branch:api')).toBe('complete')
    expect(stepProgress('upstream:api')).toBe('active')
    expect(document.querySelector('[data-action="confirm"]')?.getAttribute('data-variant')).toBe('destructive')
  })

  test('keeps confirmed removal locked in the progress dialog while execution is pending', () => {
    const onOpenChange = vi.fn()
    const onCancel = vi.fn(async () => {})
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      progressWorkspace: existingWorkspace(),
      plan: removalPlan(),
      pending: true,
      onOpenChange,
      onCancel,
    })

    const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'dialog.cancel',
    )
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull()
    expect(cancel?.disabled).toBe(true)
    expect(document.querySelector('[data-branch-workspace-operation-progress]')).not.toBeNull()

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  test('unlocks a failed removal so it can be retried or closed', async () => {
    const onOpenChange = vi.fn()
    const onCancel = vi.fn(async () => {})
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      plan: removalPlan(),
      result: { ok: false, message: 'workspace.branch-workspace.execute-failed' },
      error: 'workspace.branch-workspace.execute-failed',
      pending: false,
      onOpenChange,
      onCancel,
    })

    const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'dialog.cancel',
    )
    expect(document.querySelector('[data-slot="dialog-close"]')).not.toBeNull()
    expect(cancel?.disabled).toBe(false)
    await act(async () => cancel?.click())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onCancel).not.toHaveBeenCalled()
  })

  test('closes removal only after its successful execution promise resolves', async () => {
    const onOpenChange = vi.fn()
    let finishRemoval: ((result: { ok: true; branchWorkspaceId: string }) => void) | undefined
    const onConfirm = vi.fn(
      () =>
        new Promise<{ ok: true; branchWorkspaceId: string }>((resolve) => {
          finishRemoval = resolve
        }),
    )
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      plan: { ...removalPlan(), requiredApprovals: [] },
      onOpenChange,
      onConfirm,
    })

    await clickAction('confirm')
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      finishRemoval?.({ ok: true, branchWorkspaceId: 'branch-1' })
      await Promise.resolve()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('offers force deletion on the removal check screen and invokes its separate action', async () => {
    const onOpenChange = vi.fn()
    const onForceConfirm = vi.fn(async () => ({ ok: true as const, branchWorkspaceId: 'branch-1' }))
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      plan: { ...removalPlan(), requiredApprovals: [] },
      onOpenChange,
      onForceConfirm,
    })

    const forceConfirm = document.querySelector<HTMLButtonElement>('[data-action="force-confirm"]')
    expect(forceConfirm?.textContent).toBe('workspace.branch-workspace.force-delete')
    expect(forceConfirm?.dataset.variant).toBe('destructive')
    await clickAction('force-confirm')

    expect(onForceConfirm).toHaveBeenCalledWith([])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('does not offer force deletion outside a removal plan', () => {
    renderDialog({ plan: approvalPlan() })

    expect(document.querySelector('[data-action="force-confirm"]')).toBeNull()
  })

  test('keeps progress hidden during preview and in non-target lifecycle modes', () => {
    renderDialog({ plan: planWithSteps('create', [{ id: 'directory', kind: 'create-directory', label: 'folder' }]) })
    expect(document.querySelector('[data-branch-workspace-operation-progress]')).toBeNull()

    renderDialog({
      mode: 'reduce',
      workspace: workspaceWithTwoMembers(),
      plan: reductionPlan(),
      progressWorkspace: workspaceWithTwoMembers(),
      pending: true,
    })
    expect(document.querySelector('[data-branch-workspace-operation-progress]')).toBeNull()
  })

  test('marks the first unresolved step failed after an execution error', () => {
    renderDialog({
      plan: planWithSteps('create', [
        { id: 'directory', kind: 'create-directory', label: 'folder' },
        { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
      ]),
      result: { ok: false, message: 'workspace.branch-workspace.execute-failed' },
      error: 'workspace.branch-workspace.execute-failed',
    })

    expect(stepProgress('directory')).toBe('failed')
    expect(stepProgress('repository:api')).toBe('pending')
  })

  test('returns the failed step to active while retrying', () => {
    renderDialog({
      plan: planWithSteps('create', [{ id: 'directory', kind: 'create-directory', label: 'folder' }]),
      result: { ok: false, message: 'workspace.branch-workspace.execute-failed' },
      pending: true,
    })

    expect(stepProgress('directory')).toBe('active')
  })

  test('returns a failed creation to the preserved selection form', async () => {
    const onReturnToSelection = vi.fn()
    renderDialog({})
    setInput('workspace.branch-workspace.branch', 'feature/reselect')
    click('workspace.branch-workspace.repository-named')

    renderDialog({
      plan: approvalPlan(),
      result: { ok: false, message: 'workspace.branch-workspace.execute-failed' },
      error: 'workspace.branch-workspace.execute-failed',
      onReturnToSelection,
    })
    await clickAction('return-to-selection')

    expect(onReturnToSelection).toHaveBeenCalledTimes(1)

    renderDialog({ onReturnToSelection })
    expect(inputValue('workspace.branch-workspace.branch')).toBe('feature/reselect')
    expect(checked('workspace.branch-workspace.repository-named')).toBe(true)
  })

  test('uses only completed members as the fixed baseline after partial creation', () => {
    const workspace = workspaceWithTwoMembers()
    workspace.state = { kind: 'needs-action', action: 'repair', reason: 'creation-interrupted' }
    workspace.repositories[1] = { ...workspace.repositories[1]!, progress: 'failed', ready: false }

    renderDialog({ workspace })

    expect(inputValue('workspace.branch-workspace.branch')).toBe('feature/auth')
    const members = document.querySelectorAll<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.repository-named"]',
    )
    expect(members).toHaveLength(2)
    expect(members[0]?.checked).toBe(true)
    expect(members[0]?.disabled).toBe(true)
    expect(members[1]?.checked).toBe(false)
    expect(members[1]?.disabled).toBe(false)
    expect(document.body.textContent).toContain('workspace.branch-workspace.member-fixed')
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(true)

    act(() => members[1]?.click())
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(false)
  })

  test.each(['reduce', 'repair', 'remove'] as const)(
    'does not offer selection return for a failed %s operation',
    (mode) => {
      renderDialog({
        mode,
        workspace: existingWorkspace(),
        plan: mode === 'remove' ? removalPlan() : approvalPlan(),
        result: { ok: false, message: 'workspace.branch-workspace.execute-failed' },
        error: 'workspace.branch-workspace.execute-failed',
      })

      expect(document.querySelector('[data-action="return-to-selection"]')).toBeNull()
      expect(document.querySelector('[data-action="retry"]')).not.toBeNull()
    },
  )

  test('shows a folder affordance for a directory auxiliary candidate without rendering its raw kind', () => {
    renderDialog({})

    const candidate = document.querySelector<HTMLElement>('[data-materialization-item="docs"]')
    expect(candidate?.querySelector('.lucide-folder')).not.toBeNull()
    expect(candidate?.textContent).not.toContain('directory')
  })

  test('previews a repository subset with per-repository bases and auxiliary link/copy choices', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()
    changeSelect('workspace.branch-workspace.base-named', 'develop')
    await flushAsyncWork()
    clickSelector('[data-materialization-item="docs"] [data-materialization-choice="copy"]')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'develop' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [{ name: 'docs', mode: 'copy' }],
    })
  })

  test('selects eligible repositories through a real tri-state header checkbox', async () => {
    renderDialog({
      repositories: [
        { id: '/workspace/api', name: 'api', available: true, branches: ['main'], defaultBranch: 'main' },
        { id: '/workspace/web', name: 'web', available: true, branches: ['trunk'], defaultBranch: 'trunk' },
        { id: '/workspace/offline', name: 'offline', available: false, branches: ['main'], defaultBranch: 'main' },
      ],
    })

    const selectAll = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.repositories-select-all"]',
    )
    const api = repositoryCheckbox('api')
    const web = repositoryCheckbox('web')
    const offline = repositoryCheckbox('offline')
    expect(selectAll?.checked).toBe(false)
    expect(selectAll?.indeterminate).toBe(false)
    expect(api.checked).toBe(false)
    expect(web.checked).toBe(false)
    expect(offline.disabled).toBe(true)

    act(() => api.click())
    expect(selectAll?.checked).toBe(false)
    expect(selectAll?.indeterminate).toBe(true)

    act(() => selectAll?.click())
    await flushAsyncWork()
    expect(selectAll?.checked).toBe(true)
    expect(selectAll?.indeterminate).toBe(false)
    expect(api.checked).toBe(true)
    expect(web.checked).toBe(true)
    expect(offline.checked).toBe(false)

    act(() => selectAll?.click())
    expect(api.checked).toBe(false)
    expect(web.checked).toBe(false)
  })

  test('batch toggles synchronization for selected eligible repositories through a tri-state header checkbox', async () => {
    renderDialog({
      repositories: [
        {
          id: '/workspace/api',
          name: 'api',
          available: true,
          branches: ['main'],
          defaultBranch: 'main',
          branchDetails: { main: { tracking: 'origin/main' } },
        },
        {
          id: '/workspace/web',
          name: 'web',
          available: true,
          branches: ['trunk'],
          defaultBranch: 'trunk',
          branchDetails: { trunk: { tracking: 'origin/trunk' } },
        },
        {
          id: '/workspace/offline',
          name: 'offline',
          available: true,
          branches: ['main'],
          defaultBranch: 'main',
        },
      ],
    })

    act(() =>
      document
        .querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.repositories-select-all"]')
        ?.click(),
    )
    await flushAsyncWork()

    const syncAll = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.sync-before-create-select-all"]',
    )
    const apiSync = repositorySyncCheckbox('api')
    const webSync = repositorySyncCheckbox('web')
    const offlineSync = repositorySyncCheckbox('offline')
    expect(syncAll?.checked).toBe(true)
    expect(syncAll?.indeterminate).toBe(false)
    expect(apiSync.checked).toBe(true)
    expect(webSync.checked).toBe(true)
    expect(offlineSync.checked).toBe(false)
    expect(offlineSync.disabled).toBe(true)

    act(() => apiSync.click())
    expect(syncAll?.checked).toBe(false)
    expect(syncAll?.indeterminate).toBe(true)

    act(() => syncAll?.click())
    expect(apiSync.checked).toBe(true)
    expect(webSync.checked).toBe(true)

    act(() => syncAll?.click())
    expect(apiSync.checked).toBe(false)
    expect(webSync.checked).toBe(false)
    expect(offlineSync.checked).toBe(false)

    act(() => repositoryCheckbox('web').click())
    act(() => syncAll?.click())
    expect(apiSync.checked).toBe(true)
    expect(webSync.checked).toBe(false)
  })

  test('loads local and remote creation bases and submits the selected exact remote', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/main', 'upstream/release'])
    const onPreview = vi.fn(async () => true)
    renderDialog({
      repositories: [
        {
          id: '/workspace/api',
          name: 'api',
          available: true,
          branches: ['main'],
          defaultBranch: 'main',
          branchDetails: { main: { tracking: 'origin/main' } },
        },
      ],
      onPreview,
    })
    setInput('workspace.branch-workspace.branch', 'feature/new')
    act(() => repositoryCheckbox('api').click())

    await vi.waitFor(() => expect(mocks.getRepositoryRemoteBranches).toHaveBeenCalledTimes(1))
    openSelect('workspace.branch-workspace.base-named')
    const itemTexts = selectOptionTexts()
    expect(itemTexts).toContain('main') // local branch
    expect(itemTexts).toContain('origin/main') // remote branch
    expect(itemTexts).toContain('upstream/release') // remote branch
    closeSelect()

    const sync = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.sync-before-create-named"]',
    )
    expect(sync?.checked).toBe(true)
    expect(sync?.disabled).toBe(false)

    changeSelect('workspace.branch-workspace.base-named', 'remote:upstream/release')
    await clickAction('preview')
    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/new',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/release' },
          syncBeforeCreate: true,
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('filters local and remote creation bases and clears the query when closed', async () => {
    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/main', 'upstream/release'])
    renderDialog({})
    act(() => repositoryCheckbox('api').click())
    await vi.waitFor(() => expect(mocks.getRepositoryRemoteBranches).toHaveBeenCalledTimes(1))

    openSelect('workspace.branch-workspace.base-named')
    setInput('branches.search-label', 'release')
    expect(selectOptionTexts()).toEqual(['upstream/release'])

    closeSelect()
    openSelect('workspace.branch-workspace.base-named')
    expect(inputValue('branches.search-label')).toBe('')
    expect(selectOptionTexts()).toEqual(expect.arrayContaining(['main', 'develop', 'origin/main', 'upstream/release']))
  })

  test('keeps local creation bases usable and retries a failed remote-branch read', async () => {
    mocks.getRepositoryRemoteBranches.mockRejectedValueOnce(new Error('offline'))
    renderDialog({
      repositories: [{ id: '/workspace/api', name: 'api', available: true, branches: ['main'], defaultBranch: 'main' }],
    })
    act(() => repositoryCheckbox('api').click())

    await vi.waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'workspace.branch-workspace.remote-branches-error',
      ),
    )
    expect(selectValue('workspace.branch-workspace.base-named')).toBe('main')
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(false)

    mocks.getRepositoryRemoteBranches.mockResolvedValueOnce(['origin/main'])
    clickSelector('[role="alert"] button')

    await vi.waitFor(() => expect(mocks.getRepositoryRemoteBranches).toHaveBeenCalledTimes(2))
    openSelect('workspace.branch-workspace.base-named')
    expect(selectOptionTexts()).toContain('origin/main')
  })

  test('keeps synchronization off and disabled without a usable upstream', () => {
    renderDialog({
      repositories: [{ id: '/workspace/api', name: 'api', available: true, branches: ['main'], defaultBranch: 'main' }],
    })
    act(() => repositoryCheckbox('api').click())

    const sync = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.sync-before-create-named"]',
    )
    expect(sync?.checked).toBe(false)
    expect(sync?.disabled).toBe(true)
    expect(document.body.textContent).toContain('workspace.branch-workspace.sync-no-upstream')
  })

  test('uses and synchronizes an existing common target branch instead of the selected base', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({
      repositories: [
        {
          id: '/workspace/api',
          name: 'api',
          available: true,
          branches: ['main', 'feature/auth'],
          defaultBranch: 'main',
          branchDetails: {
            main: { tracking: 'origin/main' },
            'feature/auth': { tracking: 'origin/feature/auth' },
          },
        },
      ],
      onPreview,
    })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    act(() => repositoryCheckbox('api').click())
    await flushAsyncWork()

    const base = document.querySelector<HTMLButtonElement>('[aria-label="workspace.branch-workspace.base-named"]')
    const sync = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.sync-before-create-named"]',
    )
    expect(base?.textContent).toContain('feature/auth')
    expect(base?.disabled).toBe(true)
    expect(sync?.checked).toBe(true)
    expect(document.body.textContent).toContain('workspace.branch-workspace.existing-target-used')

    await clickAction('preview')
    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'feature/auth' },
          syncBeforeCreate: true,
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('keeps repository dependencies disabled until explicitly enabled', async () => {
    renderDialog({})

    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()

    expect(mocks.getRepositoryFileTree).not.toHaveBeenCalled()
    const dependencySwitch = document.querySelector<HTMLElement>(
      '[aria-label="workspace.branch-workspace.repository-dependencies-toggle-named"]',
    )
    expect(dependencySwitch?.getAttribute('aria-checked')).toBe('false')
    const repositoryRow = dependencySwitch?.closest('[data-branch-workspace-repository-row="api"]')
    expect(repositoryRow?.children[1]?.contains(dependencySwitch ?? null)).toBe(true)
    expect(repositoryRow?.children[2]?.matches('[data-slot="select-trigger"]')).toBe(true)

    act(() => dependencySwitch?.click())
    await flushAsyncWork()

    expect(mocks.getRepositoryFileTree).toHaveBeenCalledWith(
      '/workspace/api',
      '/workspace/api-main',
      '/workspace/api-main',
      expect.any(AbortSignal),
    )
    expect(document.querySelector('[data-worktree-bootstrap-source-select]')).not.toBeNull()
  })

  test('selects a nested dependency from the source worktree tree and submits its exact source', async () => {
    mocks.getRepositoryFileTree.mockImplementation(async (_repoId: string, worktreePath: string, dirPath: string) =>
      dirPath === worktreePath
        ? {
            ok: true,
            worktreePath,
            dirPath,
            entries: [
              {
                name: 'backend',
                absolutePath: `${worktreePath}/backend`,
                relativePath: 'backend',
                kind: 'directory',
              },
            ],
          }
        : {
            ok: true,
            worktreePath,
            dirPath,
            entries: [
              {
                name: '.venv',
                absolutePath: `${worktreePath}/backend/.venv`,
                relativePath: 'backend/.venv',
                kind: 'directory',
              },
            ],
          },
    )
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await vi.waitFor(() => expect(document.querySelector('[data-worktree-dependency-expand="backend"]')).not.toBeNull())

    clickSelector('[data-worktree-dependency-expand="backend"]')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-worktree-dependency-path="backend/.venv"]')).not.toBeNull(),
    )
    clickSelector('[data-worktree-dependency-path="backend/.venv"]')
    changeSelect('worktree-dependency-tree.mode', 'copy')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'main' },
          syncBeforeCreate: false,
          worktreeBootstrap: {
            kind: 'materialize',
            sourceWorktreePath: '/workspace/api-main',
            selections: [{ path: 'backend/.venv', mode: 'copy' }],
          },
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('clears repository dependency choices when disabled', async () => {
    mocks.getRepositoryFileTree.mockResolvedValue({
      ok: true,
      worktreePath: '/workspace/api-main',
      dirPath: '/workspace/api-main',
      entries: [
        {
          name: 'node_modules',
          absolutePath: '/workspace/api-main/node_modules',
          relativePath: 'node_modules',
          kind: 'directory',
        },
      ],
    })
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()
    clickSelector('[data-worktree-dependency-path="node_modules"]')

    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    expect(document.querySelector('[data-worktree-dependency-path="node_modules"]')).toBeNull()
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()

    expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path="node_modules"]')?.checked).toBe(
      false,
    )
    await clickAction('preview')
    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'main' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('aborts an in-flight repository dependency read when disabled', async () => {
    let finishRead: ((result: { ok: true; worktreePath: string; dirPath: string; entries: [] }) => void) | undefined
    mocks.getRepositoryFileTree.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve
      }),
    )
    renderDialog({})
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')

    const signal = mocks.getRepositoryFileTree.mock.calls[0]?.[3] as AbortSignal | undefined
    expect(signal?.aborted).toBe(false)
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      finishRead?.({
        ok: true,
        worktreePath: '/workspace/api-main',
        dirPath: '/workspace/api-main',
        entries: [],
      })
      await Promise.resolve()
    })
  })

  test('resets repository dependencies when the repository is deselected', async () => {
    mocks.getRepositoryFileTree.mockResolvedValue({
      ok: true,
      worktreePath: '/workspace/api-main',
      dirPath: '/workspace/api-main',
      entries: [],
    })
    renderDialog({})
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()

    click('workspace.branch-workspace.repository-named')

    const dependencySwitch = document.querySelector<HTMLElement>(
      '[aria-label="workspace.branch-workspace.repository-dependencies-toggle-named"]',
    )
    expect(dependencySwitch?.getAttribute('aria-checked')).toBe('false')
    expect(dependencySwitch?.getAttribute('data-disabled')).not.toBeNull()
    expect(document.querySelector('[data-worktree-bootstrap-source-select]')).toBeNull()

    click('workspace.branch-workspace.repository-named')
    expect(dependencySwitch?.getAttribute('aria-checked')).toBe('false')
    expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1)
  })

  test('loads and submits repository dependencies with default copy mode from the selected base worktree', async () => {
    mocks.getRepositoryFileTree.mockResolvedValueOnce({
      ok: true,
      worktreePath: '/workspace/api-main',
      dirPath: '/workspace/api-main',
      entries: [
        {
          name: 'node_modules',
          absolutePath: '/workspace/api-main/node_modules',
          relativePath: 'node_modules',
          kind: 'directory',
        },
      ],
    })
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()

    expect(mocks.getRepositoryFileTree).toHaveBeenCalledWith(
      '/workspace/api',
      '/workspace/api-main',
      '/workspace/api-main',
      expect.any(AbortSignal),
    )
    clickSelector('[data-worktree-dependency-path="node_modules"]')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'main' },
          syncBeforeCreate: false,
          worktreeBootstrap: {
            kind: 'materialize',
            sourceWorktreePath: '/workspace/api-main',
            selections: [{ path: 'node_modules', mode: 'copy' }],
          },
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('reloads repository dependencies when the selected base worktree changes', async () => {
    renderDialog({})
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()
    expect(mocks.getRepositoryFileTree).toHaveBeenLastCalledWith(
      '/workspace/api',
      '/workspace/api-main',
      '/workspace/api-main',
      expect.any(AbortSignal),
    )

    changeSelect('workspace.branch-workspace.base-named', 'develop')
    await flushAsyncWork()
    expect(mocks.getRepositoryFileTree).toHaveBeenLastCalledWith(
      '/workspace/api',
      '/workspace/api-develop',
      '/workspace/api-develop',
      expect.any(AbortSignal),
    )
  })

  test('keeps an empty selected-base source instead of falling back', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ repositories: [repositoryWithDependencySources()], onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')

    await vi.waitFor(() => expect(mocks.getRepositoryFileTree).toHaveBeenCalledTimes(1))

    const sourceSelect = document.querySelector<HTMLSelectElement>('[aria-label="worktree-bootstrap.source-select"]')
    expect(sourceSelect?.value).toBe('worktree:/workspace/api-develop')
    expect(Array.from(sourceSelect?.options ?? []).map((option) => option.value)).toContain(
      'worktree:/workspace/api-main',
    )
    await clickAction('preview')
    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'develop' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('offers every existing worktree and clears selections when the source changes', async () => {
    mocks.getRepositoryFileTree.mockImplementation(async (_repoId: string, worktreePath: string, dirPath: string) => {
      const name = worktreePath === '/workspace/api-main' ? '.env' : 'node_modules'
      return {
        ok: true,
        worktreePath,
        dirPath,
        entries: [
          {
            name,
            absolutePath: `${worktreePath}/${name}`,
            relativePath: name,
            kind: name === 'node_modules' ? 'directory' : 'file',
          },
        ],
      }
    })
    renderDialog({ repositories: [repositoryWithDependencySources()] })
    act(() => repositoryCheckbox('api').click())
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-worktree-dependency-path="node_modules"]')).not.toBeNull(),
    )

    const sourceSelect = document.querySelector<HTMLSelectElement>('[aria-label="worktree-bootstrap.source-select"]')
    expect(document.body.textContent).toContain('worktree-bootstrap.source-branch')
    expect(Array.from(sourceSelect?.options ?? []).map((option) => option.value)).toEqual([
      'worktree:/workspace/api-main',
      'worktree:/workspace/api-develop',
      'worktree:/workspace/api-feature',
      'worktree:/workspace/api-detached',
    ])
    clickSelector('[data-worktree-dependency-path="node_modules"]')
    changeSelect('worktree-bootstrap.source-select', 'worktree:/workspace/api-main')
    await vi.waitFor(() => expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull())

    expect(document.querySelector('[data-worktree-dependency-path="node_modules"]')).toBeNull()
    expect(document.querySelector<HTMLInputElement>('[data-worktree-dependency-path=".env"]')?.checked).toBe(false)
  })

  test('loads a non-base dependency source, clears old choices, and submits its exact path', async () => {
    mocks.getRepositoryFileTree.mockImplementation(async (_repoId: string, worktreePath: string, dirPath: string) => {
      const name = worktreePath === '/workspace/api-feature' ? '.env' : 'node_modules'
      return {
        ok: true,
        worktreePath,
        dirPath,
        entries: [
          {
            name,
            absolutePath: `${worktreePath}/${name}`,
            relativePath: name,
            kind: name === 'node_modules' ? 'directory' : 'file',
          },
        ],
      }
    })
    const onPreview = vi.fn(async () => true)
    renderDialog({ repositories: [repositoryWithDependencySources()], onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await vi.waitFor(() =>
      expect(document.querySelector('[data-worktree-dependency-path="node_modules"]')).not.toBeNull(),
    )

    clickSelector('[data-worktree-dependency-path="node_modules"]')
    const sourceSelect = document.querySelector<HTMLSelectElement>('[aria-label="worktree-bootstrap.source-select"]')
    expect(Array.from(sourceSelect?.options ?? []).map((option) => option.value)).toContain(
      'worktree:/workspace/api-feature',
    )

    changeSelect('worktree-bootstrap.source-select', 'worktree:/workspace/api-feature')
    await vi.waitFor(() => expect(document.querySelector('[data-worktree-dependency-path=".env"]')).not.toBeNull())

    expect(mocks.getRepositoryFileTree).toHaveBeenLastCalledWith(
      '/workspace/api',
      '/workspace/api-feature',
      '/workspace/api-feature',
      expect.any(AbortSignal),
    )
    expect(document.querySelector('[data-worktree-dependency-path="node_modules"]')).toBeNull()
    clickSelector('[data-worktree-dependency-path=".env"]')
    changeSelect('worktree-dependency-tree.mode', 'copy')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'develop' },
          syncBeforeCreate: false,
          worktreeBootstrap: {
            kind: 'materialize',
            selections: [{ path: '.env', mode: 'copy' }],
            sourceWorktreePath: '/workspace/api-feature',
          },
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('keeps per-item repository choices independent from auxiliary bulk choices', async () => {
    mocks.getRepositoryFileTree.mockResolvedValueOnce({
      ok: true,
      worktreePath: '/workspace/api-main',
      dirPath: '/workspace/api-main',
      entries: [
        {
          name: 'node_modules',
          absolutePath: '/workspace/api-main/node_modules',
          relativePath: 'node_modules',
          kind: 'directory',
        },
        {
          name: '.env',
          absolutePath: '/workspace/api-main/.env',
          relativePath: '.env',
          kind: 'file',
        },
      ],
    })
    const onPreview = vi.fn(async () => true)
    renderDialog({
      onPreview,
      auxiliaryCandidates: [
        { name: 'docs', path: '/workspace/docs', kind: 'directory', outsideRoot: false },
        { name: 'AGENTS.md', path: '/workspace/AGENTS.md', kind: 'file', outsideRoot: false },
      ],
    })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()

    clickSelector('[data-worktree-dependency-path="node_modules"]')
    changeSelect('worktree-dependency-tree.mode', 'copy')
    clickSelector('[data-worktree-dependency-path=".env"]')
    const modeSelects = document.querySelectorAll<HTMLSelectElement>('[aria-label="worktree-dependency-tree.mode"]')
    act(() => {
      const select = modeSelects[1]
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'copy')
      select?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const auxiliaryList = '[aria-labelledby="branch-workspace-auxiliary-candidates"]'
    clickSelector(`${auxiliaryList} [data-materialization-select-all]`)
    clickSelector(`${auxiliaryList} [data-materialization-bulk-choice="symlink"]`)
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'main' },
          syncBeforeCreate: false,
          worktreeBootstrap: {
            kind: 'materialize',
            sourceWorktreePath: '/workspace/api-main',
            selections: [
              { path: 'node_modules', mode: 'copy' },
              { path: '.env', mode: 'copy' },
            ],
          },
        },
      ],
      auxiliaryEntries: [
        { name: 'docs', mode: 'symlink' },
        { name: 'AGENTS.md', mode: 'symlink' },
      ],
    })
  })

  test('excludes fixed auxiliary members from batch selection', () => {
    const workspace = existingWorkspace()
    workspace.auxiliaryEntries = [
      {
        name: 'docs',
        mode: 'copy',
        sourcePath: '/workspace/docs',
        targetPath: '/workspace/goblin-feature-auth/docs',
        progress: 'complete',
        ready: true,
      },
    ]
    renderDialog({
      workspace,
      auxiliaryCandidates: [
        { name: 'docs', path: '/workspace/docs', kind: 'directory', outsideRoot: false },
        { name: '.env', path: '/workspace/.env', kind: 'file', outsideRoot: false },
      ],
    })

    const fixed = document.querySelector<HTMLButtonElement>('[data-materialization-select="docs"]')
    expect(fixed?.disabled).toBe(true)
    const fixedChoice = document.querySelector<HTMLButtonElement>(
      '[data-materialization-item="docs"] [data-materialization-choice="copy"]',
    )
    expect(fixedChoice?.dataset.state).toBe('on')
    expect(fixedChoice?.disabled).toBe(true)
    clickSelector('[aria-labelledby="branch-workspace-auxiliary-candidates"] [data-materialization-select-all]')
    expect(fixed?.dataset.state).toBe('unchecked')
    expect(document.querySelector('[data-materialization-select=".env"]')?.getAttribute('data-state')).toBe('checked')
  })

  test('refreshes auxiliary candidates without resetting surviving choices or other form input', async () => {
    const onRefreshAuxiliaryCandidates = vi.fn(async () => ({
      ok: true as const,
      rootId: '/workspace',
      items: [],
      auxiliaryCandidates: [],
    }))
    const onPreview = vi.fn(async () => true)
    renderDialog({
      onPreview,
      onRefreshAuxiliaryCandidates,
      auxiliaryCandidates: [
        { name: 'docs', path: '/workspace/docs', kind: 'directory', outsideRoot: false },
        { name: '.env', path: '/workspace/.env', kind: 'file', outsideRoot: false },
      ],
    })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()
    changeSelect('workspace.branch-workspace.base-named', 'develop')
    clickSelector('[data-materialization-item="docs"] [data-materialization-choice="copy"]')
    clickSelector('[data-materialization-item=".env"] [data-materialization-choice="symlink"]')

    await clickLabel('workspace.branch-workspace.auxiliary-refresh')
    expect(onRefreshAuxiliaryCandidates).toHaveBeenCalledTimes(1)

    renderDialog({
      onPreview,
      onRefreshAuxiliaryCandidates,
      auxiliaryCandidates: [
        { name: 'docs', path: '/workspace/docs', kind: 'directory', outsideRoot: false },
        { name: 'AGENTS.md', path: '/workspace/AGENTS.md', kind: 'file', outsideRoot: false },
      ],
    })

    expect(inputValue('workspace.branch-workspace.branch')).toBe('feature/auth')
    expect(checked('workspace.branch-workspace.repository-named')).toBe(true)
    expect(selectValue('workspace.branch-workspace.base-named')).toBe('develop')
    expect(choiceState('docs', 'copy')).toBe('on')
    expect(choiceState('AGENTS.md', 'skip')).toBe('on')
    expect(document.querySelector('[data-materialization-item=".env"]')).toBeNull()

    await clickAction('preview')
    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'develop' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [{ name: 'docs', mode: 'copy' }],
    })
  })

  test('keeps the previous auxiliary list visible and reports refresh failures', async () => {
    const onRefreshAuxiliaryCandidates = vi.fn(async () => ({
      ok: false as const,
      message: 'workspace.branch-workspace.read-failed',
    }))
    renderDialog({ onRefreshAuxiliaryCandidates })

    await clickLabel('workspace.branch-workspace.auxiliary-refresh')

    expect(document.querySelector('[data-materialization-item="docs"]')).not.toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('workspace.branch-workspace.read-failed')
  })

  test('disables and spins the auxiliary refresh action while refreshing', async () => {
    let resolveRefresh: ((result: { ok: true; rootId: string; items: []; auxiliaryCandidates: [] }) => void) | undefined
    const onRefreshAuxiliaryCandidates = vi.fn(
      async () =>
        await new Promise<{ ok: true; rootId: string; items: []; auxiliaryCandidates: [] }>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    renderDialog({ onRefreshAuxiliaryCandidates })

    const refresh = document.querySelector<HTMLButtonElement>(
      '[aria-label="workspace.branch-workspace.auxiliary-refresh"]',
    )
    act(() => refresh?.click())

    expect(refresh?.disabled).toBe(true)
    expect(refresh?.querySelector('.animate-spin')).not.toBeNull()

    await act(async () => {
      resolveRefresh?.({ ok: true, rootId: '/workspace', items: [], auxiliaryCandidates: [] })
      await Promise.resolve()
    })
    expect(refresh?.disabled).toBe(false)
  })

  test('keeps preview enabled when repository dependencies cannot be loaded', async () => {
    mocks.getRepositoryFileTree.mockRejectedValueOnce(new Error('offline'))
    renderDialog({})
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    click('workspace.branch-workspace.repository-dependencies-toggle-named')
    await flushAsyncWork()

    expect(document.querySelector('[data-worktree-dependency-error="/workspace/api-main"]')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(false)
  })

  test('defaults every server-required approval and allows confirming the create plan', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, branchWorkspaceId: 'branch-1' }))
    renderDialog({ workspace: existingWorkspace() })

    expect(
      document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.repository-named"]')?.disabled,
    ).toBe(true)
    expect(document.body.textContent).toContain('workspace.branch-workspace.member-fixed')
    renderDialog({ workspace: existingWorkspace(), plan: approvalPlan(), onConfirm })
    for (const approval of ['outside-root-source', 'modified-copy', 'unmanaged-content', 'close-terminals'] as const) {
      expect(checked(`workspace.branch-workspace.approval.${approval}`)).toBe(true)
    }
    await clickAction('confirm')
    expect(onConfirm).toHaveBeenCalledWith([
      'outside-root-source',
      'modified-copy',
      'unmanaged-content',
      'close-terminals',
    ])
  })

  test('defaults every required approval for a remove plan', () => {
    renderDialog({ mode: 'remove', workspace: existingWorkspace(), plan: removalPlan() })

    expect(checked('workspace.branch-workspace.approval.modified-copy')).toBe(true)
  })

  test('groups local and upstream branch cleanup by repository before removal', () => {
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      plan: planWithSteps('remove', [
        { id: 'repository:api', kind: 'remove-worktree', label: 'api', repositoryName: 'api' },
        { id: 'branch:api', kind: 'delete-local-branch', label: 'feature/auth', repositoryName: 'api' },
        {
          id: 'upstream:api',
          kind: 'delete-upstream-branch',
          label: 'origin/feature/auth',
          repositoryName: 'api',
        },
      ]),
    })

    const group = document.querySelector<HTMLElement>('[data-branch-workspace-branch-group="api"]')
    expect(group).not.toBeNull()
    expect(group?.getAttribute('role')).toBe('group')
    expect(group?.getAttribute('aria-label')).toBe('api')
    expect(group?.textContent).toContain('workspace.branch-workspace.step.local-branch')
    expect(group?.textContent).toContain('feature/auth')
    expect(group?.textContent).toContain('workspace.branch-workspace.step.upstream-branch')
    expect(group?.textContent).toContain('origin/feature/auth')
    expect(group?.querySelector('.lucide-arrow-right')).not.toBeNull()
    expect(document.querySelector('[data-branch-workspace-plan-step="remove-worktree"]')?.textContent).toBe('api')
  })

  test('renders local-only branch cleanup without an upstream rail', () => {
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      plan: planWithSteps('remove', [
        { id: 'branch:api', kind: 'delete-local-branch', label: 'feature/auth', repositoryName: 'api' },
      ]),
    })

    const group = document.querySelector<HTMLElement>('[data-branch-workspace-branch-group="api"]')
    expect(group).not.toBeNull()
    expect(group?.textContent).toContain('feature/auth')
    expect(group?.textContent).not.toContain('workspace.branch-workspace.step.upstream-branch')
    expect(group?.querySelector('.lucide-arrow-right')).toBeNull()
  })

  test('highlights only the created branch workspace directory in green', () => {
    renderDialog({
      plan: planWithSteps('create', [
        { id: 'directory', kind: 'create-directory', label: 'goblin-feature-auth' },
        { id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' },
      ]),
    })

    const directory = document.querySelector<HTMLElement>('[data-branch-workspace-plan-step="create-directory"]')
    const repository = document.querySelector<HTMLElement>('[data-branch-workspace-plan-step="create-worktree"]')
    expect(directory?.className).toContain('bg-success-surface')
    expect(directory?.className).toContain('text-success')
    expect(directory?.className).toContain('font-semibold')
    expect(repository?.className).not.toContain('text-success')
    expect(repository?.className).not.toContain('text-danger')
  })

  test('shows the effective creation source and synchronization intent in the preview', () => {
    const plan = approvalPlan()
    plan.repositories = [
      {
        repositoryName: 'api',
        repoId: '/workspace/api',
        targetBranch: 'feature/auth',
        creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/main' },
        syncBeforeCreate: true,
        branchOrigin: 'created',
        worktreePath: '/workspace/goblin-feature-auth/api',
        mode: {
          kind: 'newBranch',
          newBranch: 'feature/auth',
          creationBase: { kind: 'remoteBranch', remoteRef: 'upstream/main' },
        },
        worktreeBootstrap: { kind: 'skip' },
        confirmationRequired: false,
        satisfied: false,
        action: 'create-worktree',
      },
    ]
    plan.steps = [{ id: 'repository:api', kind: 'create-worktree', label: 'api', repositoryName: 'api' }]

    renderDialog({ plan })

    const repository = document.querySelector<HTMLElement>('[data-branch-workspace-plan-step="create-worktree"]')
    expect(repository?.textContent).toContain('workspace.branch-workspace.preview-source-remote')
    expect(repository?.textContent).toContain('workspace.branch-workspace.preview-sync-enabled')
  })

  test('highlights only the removed branch workspace directory in red', () => {
    renderDialog({
      mode: 'remove',
      workspace: existingWorkspace(),
      plan: planWithSteps('remove', [
        { id: 'repository:api', kind: 'remove-worktree', label: 'api', repositoryName: 'api' },
        { id: 'directory', kind: 'remove-directory', label: 'goblin-feature-auth' },
      ]),
    })

    const directory = document.querySelector<HTMLElement>('[data-branch-workspace-plan-step="remove-directory"]')
    const repository = document.querySelector<HTMLElement>('[data-branch-workspace-plan-step="remove-worktree"]')
    expect(directory?.className).toContain('bg-danger-surface')
    expect(directory?.className).toContain('text-danger')
    expect(directory?.className).toContain('font-semibold')
    expect(repository?.className).not.toContain('text-success')
    expect(repository?.className).not.toContain('text-danger')
  })

  test('does not highlight a branch workspace directory recreated during repair', () => {
    renderDialog({
      mode: 'repair',
      workspace: existingWorkspace(),
      plan: planWithSteps('repair', [{ id: 'directory', kind: 'create-directory', label: 'goblin-feature-auth' }]),
    })

    const directory = document.querySelector<HTMLElement>('[data-branch-workspace-plan-step="create-directory"]')
    expect(directory?.className).not.toContain('bg-success-surface')
    expect(directory?.className).not.toContain('text-success')
    expect(directory?.className).not.toContain('font-semibold')
  })

  test('refreshes the branch workspace query cache from the repair dialog and closes it', async () => {
    const onOpenChange = vi.fn()
    const onRefreshAuxiliaryCandidates = vi.fn(async () => ({
      ok: true as const,
      rootId: '/workspace',
      items: [existingWorkspace()],
      auxiliaryCandidates: [],
    }))
    renderDialog({
      mode: 'repair',
      workspace: {
        ...existingWorkspace(),
        state: { kind: 'needs-action', action: 'repair', reason: 'drift' },
      },
      error: 'workspace.branch-workspace.nothing-to-repair',
      onOpenChange,
      onRefreshAuxiliaryCandidates,
    })

    await clickAction('clear-cache')

    expect(onRefreshAuxiliaryCandidates).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('previews branch workspace removal without a force-worktree option', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ mode: 'remove', workspace: existingWorkspace(), onPreview })

    expect(document.querySelector('[aria-label="action.confirm-remove-worktree-force"]')).toBeNull()
    expect(checked('workspace.branch-workspace.delete-local-branch')).toBe(true)
    expect(checked('workspace.branch-workspace.delete-upstream-branch')).toBe(false)
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'remove',
      branchWorkspaceId: 'branch-1',
      alsoDeleteBranch: true,
      alsoDeleteUpstream: false,
    })
  })

  test('extends an existing branch workspace with only non-member repository controls', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ mode: 'extend', workspace: existingWorkspace(), onPreview })

    const branchInput = document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.branch"]')
    expect(branchInput?.value).toBe('feature/auth')
    expect(branchInput?.disabled).toBe(true)
    expect(document.body.textContent).not.toContain('workspace.branch-workspace.member-fixed')
    expect(document.querySelector('[aria-labelledby="branch-workspace-auxiliary-candidates"]')).toBeNull()
    expect(document.querySelectorAll('[aria-label="workspace.branch-workspace.repository-named"]')).toHaveLength(1)
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(true)

    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          creationBase: { kind: 'localBranch', branch: 'main' },
          syncBeforeCreate: false,
        },
        {
          repositoryName: 'web',
          creationBase: { kind: 'localBranch', branch: 'trunk' },
          syncBeforeCreate: false,
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('previews a member reduction while retaining at least one member', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ mode: 'reduce', workspace: workspaceWithTwoMembers(), onPreview })

    const preview = document.querySelector<HTMLButtonElement>('[data-action="preview"]')
    expect(preview?.disabled).toBe(true)
    expect(document.body.textContent).toContain('workspace.branch-workspace.reduce-retains-branches')

    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('[data-branch-workspace-reduce-member]'))
    expect(checkboxes).toHaveLength(2)
    act(() => checkboxes[0]?.click())
    expect(preview?.disabled).toBe(false)
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'reduce',
      branchWorkspaceId: 'branch-1',
      repositories: ['api'],
    })

    act(() => checkboxes[1]?.click())
    expect(preview?.disabled).toBe(true)
  })

  test('locks a member-scoped reduction to its preselected repository', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({
      mode: 'reduce',
      workspace: workspaceWithTwoMembers(),
      fixedReduceRepositoryName: 'api',
      onPreview,
    })

    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('[data-branch-workspace-reduce-member]'))
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([true, false])
    expect(checkboxes.every((checkbox) => checkbox.disabled)).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(false)

    await clickAction('preview')
    expect(onPreview).toHaveBeenCalledWith({
      operation: 'reduce',
      branchWorkspaceId: 'branch-1',
      repositories: ['api'],
    })
  })

  test('requires only terminal approval for member reduction', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, branchWorkspaceId: 'branch-1' }))
    renderDialog({ mode: 'reduce', workspace: workspaceWithTwoMembers(), plan: reductionPlan(), onConfirm })

    const dirtyApproval = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.approval.discard-member-changes"]',
    )
    const terminalApproval = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.approval.close-terminals"]',
    )
    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm"]')
    expect(dirtyApproval).toBeNull()
    expect(terminalApproval?.checked).toBe(false)
    expect(confirm?.disabled).toBe(true)
    expect(confirm?.dataset.variant).toBe('destructive')

    act(() => terminalApproval?.click())
    expect(confirm?.disabled).toBe(false)
    await clickAction('confirm')
    expect(onConfirm).toHaveBeenCalledWith(['close-terminals'])
  })

  test('requires unmanaged-content approval before cleaning a member-removal residue', async () => {
    const plan = reductionPlan()
    plan.repositories[0] = {
      ...plan.repositories[0]!,
      action: 'remove-entry',
      worktreePresent: false,
    }
    plan.requiredApprovals = ['unmanaged-content']
    plan.terminalSessionIds = []
    plan.steps = [
      {
        id: 'repository:api',
        kind: 'remove-entry',
        label: 'api',
        repositoryName: 'api',
        entryName: 'api',
      },
    ]
    const onConfirm = vi.fn(async () => ({ ok: true as const, branchWorkspaceId: 'branch-1' }))
    renderDialog({ mode: 'reduce', workspace: workspaceWithTwoMembers(), plan, onConfirm })

    const unmanagedApproval = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.approval.unmanaged-content"]',
    )
    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm"]')
    expect(unmanagedApproval?.checked).toBe(false)
    expect(confirm?.disabled).toBe(true)

    act(() => unmanagedApproval?.click())
    expect(confirm?.disabled).toBe(false)
    await clickAction('confirm')
    expect(onConfirm).toHaveBeenCalledWith(['unmanaged-content'])
  })
})

function renderDialog(overrides: Partial<React.ComponentProps<typeof BranchWorkspaceDialog>>) {
  act(() =>
    root.render(
      <BranchWorkspaceDialog
        open
        mode="create"
        repositories={[
          {
            id: '/workspace/api',
            name: 'api',
            available: true,
            branches: ['main', 'develop'],
            defaultBranch: 'main',
            worktrees: [
              { path: '/workspace/api-main', branch: 'main', isMain: true },
              { path: '/workspace/api-develop', branch: 'develop', isMain: false },
              {
                path: '/workspace/api-detached',
                head: 'abcdef123456',
                isDetached: true,
                isMain: false,
              },
            ],
          },
          { id: '/workspace/web', name: 'web', available: true, branches: ['trunk'], defaultBranch: 'trunk' },
        ]}
        auxiliaryCandidates={[{ name: 'docs', path: '/workspace/docs', kind: 'directory', outsideRoot: false }]}
        workspace={null}
        progressWorkspace={null}
        plan={null}
        result={null}
        pending={false}
        error={null}
        onOpenChange={() => {}}
        onRefreshAuxiliaryCandidates={async () => ({
          ok: true,
          rootId: '/workspace',
          items: [],
          auxiliaryCandidates: [],
        })}
        onFetchAllRepositories={async () => ({ total: 2, succeeded: 2, failures: [] })}
        onPreview={async () => true}
        onConfirm={async () => null}
        onForceConfirm={async () => null}
        onRetry={async () => null}
        onReturnToSelection={() => {}}
        onCancel={async () => {}}
        {...overrides}
      />,
    ),
  )
}

function repositoryWithDependencySources() {
  return {
    id: '/workspace/api',
    name: 'api',
    available: true,
    branches: ['develop', 'main', 'feature/source'],
    defaultBranch: 'develop',
    worktrees: [
      { path: '/workspace/api-main', branch: 'main', isMain: true },
      { path: '/workspace/api-develop', branch: 'develop', isMain: false },
      { path: '/workspace/api-feature', branch: 'feature/source', isMain: false },
      {
        path: '/workspace/api-detached',
        head: 'abcdef123456',
        isDetached: true,
        isMain: false,
      },
    ],
  }
}

function setInput(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(label: string) {
  act(() => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.click())
}

function repositoryCheckbox(repositoryName: string): HTMLInputElement {
  const checkbox = document.querySelector<HTMLInputElement>(
    `[data-branch-workspace-repository-row="${repositoryName}"] input[type="checkbox"]`,
  )
  if (!checkbox) throw new Error(`Missing repository checkbox: ${repositoryName}`)
  return checkbox
}

function repositorySyncCheckbox(repositoryName: string): HTMLInputElement {
  const checkbox = document.querySelector<HTMLInputElement>(
    `[data-branch-workspace-repository-row="${repositoryName}"] [aria-label="workspace.branch-workspace.sync-before-create-named"]`,
  )
  if (!checkbox) throw new Error(`Missing repository synchronization checkbox: ${repositoryName}`)
  return checkbox
}

function clickSelector(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  act(() => element.click())
}

function clickMenuItem(text: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!item) throw new Error(`Missing menu item: ${text}`)
  act(() => item.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function openMenu(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
  if (!trigger) throw new Error(`Missing menu trigger: ${label}`)
  act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
}

function changeSelect(label: string, value: string) {
  const element = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (!element) throw new Error(`Missing select: ${label}`)

  if (element instanceof HTMLSelectElement) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(element, value)
      element.dispatchEvent(new Event('change', { bubbles: true }))
    })
    return
  }

  openSelect(label)
  clickSelectOption(value.startsWith('remote:') ? value.slice('remote:'.length) : value)
}

async function clickAction(action: string) {
  await act(async () => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click())
}

async function clickLabel(label: string) {
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click())
}

function inputValue(label: string): string {
  return document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)?.value ?? ''
}

function checked(label: string): boolean {
  return document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)?.checked ?? false
}

function selectValue(label: string): string {
  const element = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (!element) return ''
  return element instanceof HTMLSelectElement ? element.value : (element.textContent?.trim() ?? '')
}

function openSelect(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
  if (!trigger) throw new Error(`Missing select trigger: ${label}`)
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
  act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
}

function closeSelect() {
  const content = document.querySelector<HTMLElement>('[data-slot="select-content"]')
  if (!content) throw new Error('Missing open select content')
  act(() => content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
}

function clickSelectOption(text: string) {
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!option) throw new Error(`Missing select option: ${text}. Available: ${selectOptionTexts().join(', ')}`)
  act(() => option.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function selectOptionTexts(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).map(
    (option) => option.textContent?.trim() ?? '',
  )
}

function choiceState(item: string, choice: string): string | null | undefined {
  return document
    .querySelector(`[data-materialization-item="${item}"] [data-materialization-choice="${choice}"]`)
    ?.getAttribute('data-state')
}

function stepProgress(id: string): string | undefined {
  return (
    document
      .querySelector<HTMLElement>(`[data-branch-workspace-progress-step="${id}"]`)
      ?.getAttribute('data-progress-status') ?? undefined
  )
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function existingWorkspace(): BranchWorkspaceSnapshot {
  return {
    id: 'branch-1',
    rootId: '/workspace',
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: '/workspace/goblin-feature-auth',
    state: { kind: 'ready' },
    available: true,
    issues: [],
    repositories: [
      {
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: '/workspace/goblin-feature-auth/api',
        progress: 'complete',
        ready: true,
      },
    ],
    auxiliaryEntries: [],
  }
}

function workspaceWithTwoMembers(): BranchWorkspaceSnapshot {
  const workspace = existingWorkspace()
  return {
    ...workspace,
    repositories: [
      ...workspace.repositories,
      {
        repositoryName: 'web',
        targetBranch: 'feature/auth',
        creationBase: { kind: 'localBranch', branch: 'trunk' },
        syncBeforeCreate: false,
        branchOrigin: 'pre-existing',
        worktreePath: '/workspace/goblin-feature-auth/web',
        progress: 'complete',
        ready: true,
      },
    ],
  }
}

function approvalPlan(): BranchWorkspacePlan {
  const workspace = existingWorkspace()
  return {
    token: 'sha256:plan',
    rootId: workspace.rootId,
    operation: 'extend',
    branchWorkspaceId: workspace.id,
    branch: workspace.branch,
    directoryName: workspace.directoryName,
    path: workspace.path,
    manifest: {
      id: workspace.id,
      rootId: workspace.rootId,
      branch: workspace.branch,
      directoryName: workspace.directoryName,
      path: workspace.path,
      repositories: workspace.repositories,
      auxiliaryEntries: [],
    },
    repositories: [],
    auxiliaryEntries: [],
    requiredApprovals: ['outside-root-source', 'modified-copy', 'unmanaged-content', 'close-terminals'],
    steps: [],
    terminalSessionIds: ['terminal-1'],
    unmanagedEntries: ['notes.txt'],
  }
}

function planWithSteps(
  operation: BranchWorkspacePlan['operation'],
  steps: BranchWorkspacePlan['steps'],
): BranchWorkspacePlan {
  return { ...approvalPlan(), operation, steps }
}

function removalPlan(): BranchWorkspacePlan {
  const plan = approvalPlan()
  return {
    ...plan,
    operation: 'remove',
    requiredApprovals: ['modified-copy'],
    steps: [
      {
        id: 'branch:api',
        kind: 'delete-local-branch',
        label: 'feature/auth',
        repositoryName: 'api',
      },
      {
        id: 'upstream:api',
        kind: 'delete-upstream-branch',
        label: 'origin/feature/auth',
        repositoryName: 'api',
      },
    ],
    removalOptions: { alsoDeleteBranch: true, alsoDeleteUpstream: true },
  }
}

function reductionPlan(): BranchWorkspacePlan {
  const plan = approvalPlan()
  return {
    ...plan,
    operation: 'reduce',
    repositories: [
      {
        repositoryName: 'api',
        repoId: '/workspace/api',
        targetBranch: 'feature/auth',
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: '/workspace/goblin-feature-auth/api',
        mode: { kind: 'existingBranch', branch: 'feature/auth' },
        worktreeBootstrap: { kind: 'skip' },
        confirmationRequired: false,
        satisfied: false,
        action: 'remove-worktree',
        worktreePresent: true,
      },
    ],
    requiredApprovals: ['close-terminals'],
    terminalSessionIds: ['terminal-api'],
    steps: [{ id: 'repository:api', kind: 'remove-worktree', label: 'api', repositoryName: 'api' }],
  }
}

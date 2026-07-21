// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceDialog } from '#/web/components/repo-workspace/BranchWorkspaceDialog.tsx'
import type { BranchWorkspacePlan, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

const mocks = vi.hoisted(() => ({
  getRepositoryWorktreeBootstrapPreflight: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getRepositoryWorktreeBootstrapPreflight: mocks.getRepositoryWorktreeBootstrapPreflight,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, values?: Record<string, string>) =>
    values?.repository ? `${key}:${values.repository}` : key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.getRepositoryWorktreeBootstrapPreflight.mockResolvedValue({
    ok: true,
    preflight: { kind: 'candidates', candidates: [] },
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.querySelectorAll('[data-slot="dialog-portal"]').forEach((node) => node.remove())
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceDialog', () => {
  test('uses the canonical dialog cancel copy', () => {
    renderDialog({})

    expect(document.body.textContent).toContain('dialog.cancel')
    expect(document.body.textContent).not.toContain('common.cancel')
  })

  test('shows a folder affordance for a directory auxiliary candidate without rendering its raw kind', () => {
    renderDialog({})

    const candidate = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.auxiliary-named"]',
    )
    expect(candidate?.closest('label')?.querySelector('.lucide-folder')).not.toBeNull()
    expect(candidate?.closest('label')?.textContent).not.toContain('directory')
  })

  test('previews a repository subset with per-repository bases and auxiliary link/copy choices', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()
    changeSelect('workspace.branch-workspace.base-named', 'develop')
    click('workspace.branch-workspace.auxiliary-named')
    changeSelect('workspace.branch-workspace.mode-named', 'copy')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [{ repositoryName: 'api', baseBranch: 'develop' }],
      auxiliaryEntries: [{ name: 'docs', mode: 'copy' }],
    })
  })

  test('loads and submits ignored repository dependencies for each selected repository', async () => {
    mocks.getRepositoryWorktreeBootstrapPreflight.mockResolvedValueOnce({
      ok: true,
      preflight: {
        kind: 'candidates',
        candidates: [{ path: 'node_modules', kind: 'directory' }],
      },
    })
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()

    expect(mocks.getRepositoryWorktreeBootstrapPreflight).toHaveBeenCalledWith(
      '/workspace/api',
      expect.any(AbortSignal),
      'ignored-only',
    )
    click('node_modules: action.create-worktree-bootstrap-candidate-symlink')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'create',
      branch: 'feature/auth',
      repositories: [
        {
          repositoryName: 'api',
          baseBranch: 'main',
          worktreeBootstrap: {
            kind: 'materialize',
            candidateScope: 'ignored-only',
            selections: [{ path: 'node_modules', mode: 'symlink' }],
          },
        },
      ],
      auxiliaryEntries: [],
    })
  })

  test('blocks preview when repository dependencies cannot be loaded', async () => {
    mocks.getRepositoryWorktreeBootstrapPreflight.mockRejectedValueOnce(new Error('offline'))
    renderDialog({})
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()

    expect(document.body.textContent).toContain('workspace.branch-workspace.repository-dependencies-error')
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(true)
  })

  test('keeps existing extension members fixed and confirms every server-required approval', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, branchWorkspaceId: 'branch-1' }))
    renderDialog({ workspace: existingWorkspace() })

    expect(
      document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.repository-named"]')?.disabled,
    ).toBe(true)
    expect(document.body.textContent).toContain('workspace.branch-workspace.member-fixed')
    renderDialog({ workspace: existingWorkspace(), plan: approvalPlan(), onConfirm })
    for (const approval of ['outside-root-source', 'modified-copy', 'unmanaged-content', 'close-terminals'] as const) {
      click(`workspace.branch-workspace.approval.${approval}`)
    }
    await clickAction('confirm')
    expect(onConfirm).toHaveBeenCalledWith([
      'outside-root-source',
      'modified-copy',
      'unmanaged-content',
      'close-terminals',
    ])
  })

  test('shows exact local and upstream branch names with repository context before removal', () => {
    renderDialog({ mode: 'remove', workspace: existingWorkspace(), plan: removalPlan() })

    const text = document.body.textContent ?? ''
    expect(text).toContain('workspace.branch-workspace.step.delete-local-branch:api')
    expect(text).toContain('feature/auth')
    expect(text).toContain('workspace.branch-workspace.step.delete-upstream-branch:api')
    expect(text).toContain('origin/feature/auth')
  })

  test('previews branch workspace force removal only after explicit selection', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ mode: 'remove', workspace: existingWorkspace(), onPreview })

    const force = document.querySelector<HTMLInputElement>('[aria-label="action.confirm-remove-worktree-force"]')
    expect(force?.checked).toBe(false)
    click('action.confirm-remove-worktree-force')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'remove',
      branchWorkspaceId: 'branch-1',
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
      forceRemoveWorktrees: true,
    })
  })

  test('resets force removal when switching to another branch workspace', () => {
    renderDialog({ mode: 'remove', workspace: existingWorkspace() })
    click('action.confirm-remove-worktree-force')
    expect(
      document.querySelector<HTMLInputElement>('[aria-label="action.confirm-remove-worktree-force"]')?.checked,
    ).toBe(true)

    const nextWorkspace = existingWorkspace()
    nextWorkspace.id = 'branch-2'
    nextWorkspace.branch = 'feature/other'
    renderDialog({ mode: 'remove', workspace: nextWorkspace })

    expect(
      document.querySelector<HTMLInputElement>('[aria-label="action.confirm-remove-worktree-force"]')?.checked,
    ).toBe(false)
  })
})

function renderDialog(overrides: Partial<React.ComponentProps<typeof BranchWorkspaceDialog>>) {
  act(() =>
    root.render(
      <BranchWorkspaceDialog
        open
        mode="create"
        repositories={[
          { id: '/workspace/api', name: 'api', available: true, branches: ['main', 'develop'], defaultBranch: 'main' },
          { id: '/workspace/web', name: 'web', available: true, branches: ['trunk'], defaultBranch: 'trunk' },
        ]}
        auxiliaryCandidates={[{ name: 'docs', path: '/workspace/docs', kind: 'directory', outsideRoot: false }]}
        workspace={null}
        plan={null}
        result={null}
        pending={false}
        error={null}
        onOpenChange={() => {}}
        onPreview={async () => true}
        onConfirm={async () => null}
        onRetry={async () => null}
        onCancel={async () => {}}
        {...overrides}
      />,
    ),
  )
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

function changeSelect(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickAction(action: string) {
  await act(async () => document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click())
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
    lifecycle: 'ready',
    available: true,
    issues: [],
    repositories: [
      {
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        baseBranch: 'main',
        branchOrigin: 'created',
        worktreePath: '/workspace/goblin-feature-auth/api',
        progress: 'complete',
        observedState: 'ready',
      },
    ],
    auxiliaryEntries: [],
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

function removalPlan(): BranchWorkspacePlan {
  const plan = approvalPlan()
  return {
    ...plan,
    operation: 'remove',
    requiredApprovals: [],
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
    removalOptions: { alsoDeleteBranch: true, alsoDeleteUpstream: true, forceRemoveWorktrees: false },
  }
}

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
    clickSelector('[data-materialization-item="docs"] [data-materialization-choice="copy"]')
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
    clickSelector('[data-materialization-item="node_modules"] [data-materialization-choice="symlink"]')
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

  test('applies bulk choices independently to repository dependencies and auxiliary entries', async () => {
    mocks.getRepositoryWorktreeBootstrapPreflight.mockResolvedValueOnce({
      ok: true,
      preflight: {
        kind: 'candidates',
        candidates: [
          { path: 'node_modules', kind: 'directory' },
          { path: '.env', kind: 'file' },
        ],
      },
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
    await flushAsyncWork()

    const repositoryList = '[aria-labelledby="branch-workspace-repository-dependencies-api"]'
    clickSelector(`${repositoryList} [data-materialization-select-all]`)
    clickSelector(`${repositoryList} [data-materialization-bulk-choice="copy"]`)
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
          baseBranch: 'main',
          worktreeBootstrap: {
            kind: 'materialize',
            candidateScope: 'ignored-only',
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
        observedState: 'ready',
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
      repositories: [{ repositoryName: 'api', baseBranch: 'develop' }],
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

  test('blocks preview when repository dependencies cannot be loaded', async () => {
    mocks.getRepositoryWorktreeBootstrapPreflight.mockRejectedValueOnce(new Error('offline'))
    renderDialog({})
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
    await flushAsyncWork()

    expect(document.body.textContent).toContain('workspace.branch-workspace.repository-dependencies-error')
    expect(document.querySelector<HTMLButtonElement>('[data-action="preview"]')?.disabled).toBe(true)
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

  test('requires explicit destructive approval for exact repository dependency replacements', () => {
    const plan: BranchWorkspacePlan = {
      ...approvalPlan(),
      operation: 'repair',
      requiredApprovals: ['replace-repository-dependencies'],
      steps: [
        {
          id: 'repository-replacement:api:.env',
          kind: 'replace-repository-dependency',
          label: 'api/.env',
          repositoryName: 'api',
          entryName: '.env',
        },
        {
          id: 'repository-replacement:api:node_modules',
          kind: 'replace-repository-dependency',
          label: 'api/node_modules',
          repositoryName: 'api',
          entryName: 'node_modules',
        },
      ],
    }
    renderDialog({ mode: 'repair', workspace: existingWorkspace(), plan })

    expect(document.body.textContent).toContain('api/.env')
    expect(document.body.textContent).toContain('api/node_modules')
    const approval = document.querySelector<HTMLInputElement>(
      '[aria-label="workspace.branch-workspace.approval.replace-repository-dependencies"]',
    )
    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm"]')
    expect(approval?.checked).toBe(false)
    expect(confirm?.disabled).toBe(true)
    expect(confirm?.dataset.variant).toBe('destructive')

    act(() => approval?.click())
    expect(confirm?.disabled).toBe(false)
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
        onRefreshAuxiliaryCandidates={async () => ({
          ok: true,
          rootId: '/workspace',
          items: [],
          auxiliaryCandidates: [],
        })}
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

function clickSelector(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  act(() => element.click())
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
  return document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)?.value ?? ''
}

function choiceState(item: string, choice: string): string | null | undefined {
  return document
    .querySelector(`[data-materialization-item="${item}"] [data-materialization-choice="${choice}"]`)
    ?.getAttribute('data-state')
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

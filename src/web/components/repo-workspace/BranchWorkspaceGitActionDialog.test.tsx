// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceGitActionPanel } from '#/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx'
import type {
  BranchWorkspaceGitActionPlan,
  BranchWorkspaceGitActionResult,
} from '#/shared/branch-workspace-git-actions.ts'

const mocks = vi.hoisted(() => ({ providers: vi.fn(), generate: vi.fn() }))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.providers,
  generateRepositoryCommitMessage: mocks.generate,
}))
vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

const batchPlan: BranchWorkspaceGitActionPlan = {
  kind: 'batch-commit',
  token: 'sha256:batch',
  rootId: '/workspace',
  branchWorkspaceId: 'ws-1',
  members: ['api', 'web'].map((repositoryName) => ({
    repositoryName,
    repoId: `/workspace/${repositoryName}`,
    targetBranch: 'feature/a',
    targetWorktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
    dirty: true,
    changeCount: 1,
    fingerprint: `sha256:${repositoryName}`,
  })),
}

function syncPlan(kind: 'pull' | 'push', ready = true): BranchWorkspaceGitActionPlan {
  return {
    kind,
    token: `sha256:${kind}`,
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    ready,
    members: ['api', 'web'].map((repositoryName, index) => ({
      repositoryName,
      repoId: `/workspace/${repositoryName}`,
      targetBranch: 'feature/a',
      targetWorktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
      targetHead: `target-head-${index}`,
      ready,
      ...(!ready
        ? {
            message:
              kind === 'pull'
                ? 'workspace.branch-workspace.git-action.target-upstream-required'
                : 'workspace.branch-workspace.git-action.remote-required',
          }
        : {}),
      fingerprint: `sha256:${repositoryName}`,
    })),
  }
}

function mergePlan(): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge' }> {
  return {
    kind: 'batch-merge',
    token: 'sha256:merge',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    members: [
      mergeMember('api'),
      mergeMember('web', {
        destinationBranches: mergeDestinations('web').map((destination) =>
          destination.branch === 'main' ? { ...destination, pullMergePushReady: false } : destination,
        ),
      }),
      mergeMember('docs', { ready: false, message: 'destination unavailable', destinationBranches: [] }),
    ],
  }
}

function mergeMember(
  repositoryName: string,
  fields: Partial<Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge' }>['members'][number]> = {},
): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge' }>['members'][number] {
  return {
    repositoryName,
    repoId: `/workspace/${repositoryName}`,
    targetBranch: 'feature/a',
    targetWorktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
    targetHead: `${repositoryName}-target-head`,
    ready: true,
    destinationBranches: mergeDestinations(repositoryName),
    fingerprint: `sha256:${repositoryName}`,
    ...fields,
  }
}

function mergeDestinations(repositoryName: string) {
  return [
    {
      branch: 'main',
      head: 'main-head',
      ready: true,
      worktreePath: `/workspace/${repositoryName}`,
      requiresTemporaryWorktree: false,
      pullMergePushReady: true,
    },
    {
      branch: 'release/v2',
      head: 'release-head',
      ready: true,
      worktreePath: `/workspace/${repositoryName}-release`,
      requiresTemporaryWorktree: false,
      pullMergePushReady: true,
    },
    {
      branch: 'staging',
      head: 'staging-head',
      ready: true,
      requiresTemporaryWorktree: true,
      pullMergePushReady: true,
    },
  ]
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.providers.mockResolvedValue({ codex: true, claude: true })
  mocks.generate
    .mockResolvedValueOnce({ ok: true, message: 'feat: api' })
    .mockResolvedValueOnce({ ok: true, message: 'feat: web' })
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.querySelectorAll('[data-slot="dialog-portal"]').forEach((node) => node.remove())
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchWorkspaceGitActionPanel', () => {
  test('keeps the batch-merge identity while its plan is loading', async () => {
    render({ kind: 'batch-merge', plan: null })
    await flush()

    const dialog = document.querySelector('[data-testid="branch-workspace-batch-merge-dialog"]')
    expect(dialog).not.toBeNull()
    expect(container.contains(dialog)).toBe(false)
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')).toBeNull()
    expect(dialog?.textContent).toContain('workspace.branch-workspace.git-action.batch-merge')
    expect(dialog?.textContent).not.toContain('workspace.branch-workspace.git-action.batch-commit')
  })

  test('renders batch commit as an inline surface with the worktree commit icon', async () => {
    render({ plan: batchPlan })
    await flush()

    const panel = document.querySelector('[data-testid="branch-workspace-git-action-panel"]')
    const commit = document.querySelector('[data-action="batch-commit"]')
    expect(panel).not.toBeNull()
    expect(document.querySelector('[data-slot="dialog-portal"]')).toBeNull()
    expect(commit?.querySelector('.lucide-send-horizontal')).not.toBeNull()
    expect(commit?.querySelector('.lucide-git-commit-horizontal')).toBeNull()
  })

  test('keeps both generate-all providers in one right-aligned action group', async () => {
    render({ plan: batchPlan })
    await flush()

    const actions = document.querySelector('[data-testid="branch-workspace-generate-all-actions"]')
    const codex = document.querySelector('[data-action="generate-all-codex"]')
    const claude = document.querySelector('[data-action="generate-all-claude"]')

    expect(actions).not.toBeNull()
    expect(codex?.parentElement).toBe(actions)
    expect(claude?.parentElement).toBe(actions)
  })

  test('generates editable messages serially and submits all dirty repositories', async () => {
    const onBatchCommit = vi.fn(async () => null)
    render({ plan: batchPlan, onBatchCommit })
    await flush()

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="generate-all-codex"]')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await flush()

    expect(mocks.generate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['/workspace/api', '/workspace/goblin-feature-a/api', 'codex'],
      ['/workspace/web', '/workspace/goblin-feature-a/web', 'codex'],
    ])
    expect(document.querySelector<HTMLTextAreaElement>('[data-repository="api"]')?.value).toBe('feat: api')
    expect(document.querySelector<HTMLTextAreaElement>('[data-repository="web"]')?.value).toBe('feat: web')

    await act(async () => document.querySelector<HTMLButtonElement>('[data-action="batch-commit"]')?.click())
    expect(onBatchCommit).toHaveBeenCalledWith([
      { repositoryName: 'api', message: 'feat: api' },
      { repositoryName: 'web', message: 'feat: web' },
    ])
  })

  test('offers local merge and pull-merge-push as distinct actions', () => {
    render({ kind: 'batch-merge', plan: mergePlan() })

    expect(document.querySelector('[data-action="merge"]')).not.toBeNull()
    expect(document.querySelector('[data-action="pull-merge-push"]')).not.toBeNull()
  })

  test('widens destination selection and shows only the complete branch name', async () => {
    const plan = mergePlan()
    const longBranch = 'release/customer-facing/complete-branch-name'
    plan.members[0]!.destinationBranches.push({
      branch: longBranch,
      head: 'long-branch-head',
      ready: true,
      requiresTemporaryWorktree: true,
      pullMergePushReady: true,
    })
    render({ kind: 'batch-merge', plan })

    const dialog = document.querySelector<HTMLElement>('[data-testid="branch-workspace-batch-merge-dialog"]')
    const trigger = document.querySelector<HTMLButtonElement>('[data-merge-destination="api"]')
    expect(dialog?.className).toContain('sm:max-w-[72rem]')
    expect(dialog?.className).toContain('w-[calc(100vw-0.5rem)]')
    expect(trigger?.parentElement?.className).toContain('minmax(20rem,2fr)')
    expect(trigger?.className).toContain('min-w-80')

    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await Promise.resolve()
    })
    const option = document.querySelector<HTMLElement>(`[data-merge-destination-option="api:${longBranch}"]`)
    expect(option?.className).toContain('break-all')
    expect(option?.textContent).toBe(longBranch)
    expect(document.body.textContent).not.toContain('workspace.branch-workspace.git-action.temporary-worktree')
  })

  test('selects ready members by default and disables unavailable members', () => {
    render({ kind: 'batch-merge', plan: mergePlan() })

    expect(mergeCheckbox('api')?.dataset.state).toBe('checked')
    expect(mergeCheckbox('web')?.dataset.state).toBe('checked')
    expect(mergeCheckbox('docs')?.dataset.state).toBe('unchecked')
    expect(mergeCheckbox('docs')?.disabled).toBe(true)
  })

  test('requires a destination for every selected member and computes readiness from those destinations', async () => {
    render({ kind: 'batch-merge', plan: mergePlan() })
    const local = document.querySelector<HTMLButtonElement>('[data-action="merge"]')
    const remote = document.querySelector<HTMLButtonElement>('[data-action="pull-merge-push"]')

    expect(local?.disabled).toBe(true)
    expect(remote?.disabled).toBe(true)

    await selectMergeDestination('api', 'main')
    await selectMergeDestination('web', 'main')
    expect(local?.disabled).toBe(false)
    expect(remote?.disabled).toBe(true)

    await act(async () => mergeCheckbox('web')?.click())
    expect(remote?.disabled).toBe(false)

    await act(async () => mergeCheckbox('api')?.click())
    expect(local?.disabled).toBe(true)
    expect(remote?.disabled).toBe(true)
  })

  test('submits the selected member-to-destination mappings in plan order', async () => {
    const plan = mergePlan()
    const onOpenChange = vi.fn()
    const onBatchMerge = vi.fn(
      async (): Promise<BranchWorkspaceGitActionResult> => ({
        ok: true,
        kind: 'batch-merge',
        planToken: plan.token,
        branchWorkspaceId: plan.branchWorkspaceId,
        members: [],
      }),
    )
    render({ kind: 'batch-merge', plan, onOpenChange, onBatchMerge })

    await act(async () => mergeCheckbox('web')?.click())
    await selectMergeDestination('api', 'release/v2')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })

    expect(onBatchMerge).toHaveBeenCalledWith('merge', [{ repositoryName: 'api', destinationBranch: 'release/v2' }])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('locks selection and projects live member step progress after execution starts', async () => {
    const plan = mergePlan()
    let finish: ((result: BranchWorkspaceGitActionResult) => void) | undefined
    const pendingResult = new Promise<BranchWorkspaceGitActionResult>((resolve) => {
      finish = resolve
    })
    const onBatchMerge = vi.fn(() => pendingResult)
    render({ kind: 'batch-merge', plan, onBatchMerge })
    await selectMergeDestination('api', 'main')
    await selectMergeDestination('web', 'staging')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })

    render({
      kind: 'batch-merge',
      plan,
      pending: true,
      onBatchMerge,
      activeOperation: {
        kind: 'batch-merge',
        currentStep: 2,
        completedCount: 1,
        totalCount: 2,
        cancellable: true,
        repositoryName: 'web',
        step: 'merge',
      },
    })

    const progress = document.querySelector<HTMLElement>('[data-testid="branch-workspace-batch-merge-progress"]')
    expect(progress?.dataset.completed).toBe('1')
    expect(progress?.dataset.total).toBe('2')
    expect(mergeCheckbox('api')?.disabled).toBe(true)
    expect(document.querySelector<HTMLElement>('[data-merge-step="api:merge"]')?.dataset.status).toBe('complete')
    expect(document.querySelector<HTMLElement>('[data-merge-step="web:merge"]')?.dataset.status).toBe('active')

    finish?.({
      ok: true,
      kind: 'batch-merge',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [],
    })
  })

  test('keeps a failed batch locked to its original mode and destinations for retry', async () => {
    const plan = mergePlan()
    const failure: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-merge',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'merge failed',
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'merge failed' },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const onBatchMerge = vi.fn(async () => failure)
    render({ kind: 'batch-merge', plan, onBatchMerge })
    await selectMergeDestination('api', 'main')
    await selectMergeDestination('web', 'staging')

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })
    render({ kind: 'batch-merge', plan, result: failure, onBatchMerge })

    expect(document.querySelector('[data-action="pull-merge-push"]')).toBeNull()
    expect(document.querySelector('[data-action="merge"]')?.textContent).toContain('workspace.branch-workspace.retry')
    expect(mergeCheckbox('api')?.disabled).toBe(true)

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })
    const expectedTargets = [
      { repositoryName: 'api', destinationBranch: 'main' },
      { repositoryName: 'web', destinationBranch: 'staging' },
    ]
    expect(onBatchMerge).toHaveBeenNthCalledWith(1, 'merge', expectedTargets)
    expect(onBatchMerge).toHaveBeenNthCalledWith(2, 'merge', expectedTargets)
  })

  test.each([
    ['pull', '.lucide-arrow-down'],
    ['push', '.lucide-arrow-up'],
  ] as const)('renders ordered %s members and closes only after successful execution', async (kind, icon) => {
    const plan = syncPlan(kind)
    const onOpenChange = vi.fn()
    const onSync = vi.fn(async () => ({
      ok: true as const,
      kind,
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [],
    }))
    render({ kind, plan, onOpenChange, onSync })

    const panel = document.querySelector('[data-testid="branch-workspace-git-action-panel"]')
    const action = document.querySelector<HTMLButtonElement>(`[data-action="${kind}"]`)
    expect(panel?.textContent).toContain('api')
    expect(panel?.textContent).toContain('web')
    expect(panel?.textContent).toContain('feature/a')
    expect(action?.querySelector(icon)).not.toBeNull()

    await act(async () => {
      action?.click()
      await Promise.resolve()
    })
    expect(onSync).toHaveBeenCalledWith(kind)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('keeps an unready sync action disabled and shows the member readiness reason', () => {
    const plan = syncPlan('pull', false)
    render({ kind: 'pull', plan })

    expect(document.querySelector<HTMLButtonElement>('[data-action="pull"]')?.disabled).toBe(true)
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')?.textContent).toContain(
      'workspace.branch-workspace.git-action.target-upstream-required',
    )
  })
})

function render(overrides: Partial<React.ComponentProps<typeof BranchWorkspaceGitActionPanel>>) {
  act(() =>
    root.render(
      <BranchWorkspaceGitActionPanel
        open
        kind="batch-commit"
        plan={null}
        result={null}
        activeOperation={null}
        pending={false}
        error={null}
        onOpenChange={() => {}}
        onBatchCommit={async () => null}
        onBatchMerge={async () => null}
        onSync={async () => null}
        onCancel={async () => {}}
        {...overrides}
      />,
    ),
  )
}

function mergeCheckbox(repositoryName: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-merge-repository="${repositoryName}"]`)
}

async function selectMergeDestination(repositoryName: string, destinationBranch: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-merge-destination="${repositoryName}"]`)
  if (!trigger) throw new Error(`Missing destination trigger for ${repositoryName}`)
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })
  const option = document.querySelector<HTMLElement>(
    `[data-merge-destination-option="${repositoryName}:${destinationBranch}"]`,
  )
  if (!option) throw new Error(`Missing destination option ${repositoryName}:${destinationBranch}`)
  await act(async () => {
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

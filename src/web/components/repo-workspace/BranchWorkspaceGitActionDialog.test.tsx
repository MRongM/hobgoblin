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

function mergeOutPlan(): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-out' }> {
  return {
    kind: 'batch-merge-out',
    token: 'sha256:merge',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    members: [
      mergeOutMember('api'),
      mergeOutMember('web', {
        destinationBranches: mergeOutDestinations('web').map((destination) =>
          destination.branch === 'main' ? { ...destination, pullMergePushReady: false } : destination,
        ),
      }),
      mergeOutMember('docs', { ready: false, message: 'destination unavailable', destinationBranches: [] }),
    ],
  }
}

function mergeOutMember(
  repositoryName: string,
  fields: Partial<Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-out' }>['members'][number]> = {},
): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-out' }>['members'][number] {
  return {
    repositoryName,
    repoId: `/workspace/${repositoryName}`,
    targetBranch: 'feature/a',
    targetWorktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
    targetHead: `${repositoryName}-target-head`,
    ready: true,
    destinationBranches: mergeOutDestinations(repositoryName),
    fingerprint: `sha256:${repositoryName}`,
    ...fields,
  }
}

function mergeOutDestinations(repositoryName: string) {
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

function mergeInPlan(): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-in' }> {
  return {
    kind: 'batch-merge-in',
    token: 'sha256:merge-in',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    members: [
      mergeInMember('api'),
      mergeInMember('web', { pullMergePushReady: false }),
      mergeInMember('docs', {
        ready: false,
        message: 'source unavailable',
        sourceBranches: [],
      }),
    ],
  }
}

function mergeInMember(
  repositoryName: string,
  fields: Partial<Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-in' }>['members'][number]> = {},
): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-merge-in' }>['members'][number] {
  return {
    repositoryName,
    repoId: `/workspace/${repositoryName}`,
    targetBranch: 'feature/a',
    targetWorktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
    targetHead: `${repositoryName}-target-head`,
    ready: true,
    pullMergePushReady: true,
    sourceBranches: [
      { branch: 'main', head: 'main-head' },
      { branch: 'release/v2', head: 'release-head' },
    ],
    fingerprint: `sha256:${repositoryName}`,
    ...fields,
  }
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
  test('keeps the batch-merge-out identity while its plan is loading', async () => {
    render({ kind: 'batch-merge-out', plan: null })
    await flush()

    const dialog = document.querySelector('[data-testid="branch-workspace-batch-merge-dialog"]')
    expect(dialog).not.toBeNull()
    expect(container.contains(dialog)).toBe(false)
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')).toBeNull()
    expect(dialog?.textContent).toContain('workspace.branch-workspace.git-action.batch-merge-out')
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

  test('places an off-by-default automation switch before providers and hides manual controls while enabled', async () => {
    render({ plan: batchPlan })
    await flush()

    const toggle = document.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="action.commit-auto-commit-and-push"]',
    )
    const codex = document.querySelector<HTMLButtonElement>('[data-action="generate-all-codex"]')
    expect(toggle?.getAttribute('aria-checked')).toBe('false')
    expect((toggle?.compareDocumentPosition(codex!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

    await act(async () => toggle?.click())

    expect(document.querySelector('[data-repository="api"]')).toBeNull()
    expect(document.querySelector('[data-repository="web"]')).toBeNull()
    expect(document.querySelector('[data-action="batch-commit"]')).toBeNull()
    expect(buttonWithExactText('dialog.cancel')).toBeNull()
    expect(buttonWithExactText('Codex')).toBeNull()
    expect(buttonWithExactText('Claude')).toBeNull()
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')?.textContent).toContain('api')
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')?.textContent).toContain('web')

    await act(async () => toggle?.click())

    expect(document.querySelector('[data-repository="api"]')).not.toBeNull()
    expect(document.querySelector('[data-repository="web"]')).not.toBeNull()
    expect(document.querySelector('[data-action="batch-commit"]')).not.toBeNull()
    expect(buttonWithExactText('dialog.cancel')).not.toBeNull()
  })

  test('automatically batch commits and pushes the messages generated in the current run', async () => {
    const onBatchCommit = vi.fn(async () => null)
    const onBatchCommitAndPush = vi.fn(
      async (): Promise<BranchWorkspaceGitActionResult> => ({
        ok: true,
        kind: 'push',
        planToken: 'sha256:push',
        branchWorkspaceId: 'ws-1',
        members: [],
      }),
    )
    const onOpenChange = vi.fn()
    render({ plan: batchPlan, onBatchCommit, onBatchCommitAndPush, onOpenChange })
    await flush()

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[role="switch"][aria-label="action.commit-auto-commit-and-push"]')
        ?.click()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="generate-all-codex"]')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await flush()

    expect(onBatchCommit).not.toHaveBeenCalled()
    expect(onBatchCommitAndPush).toHaveBeenCalledWith([
      { repositoryName: 'api', message: 'feat: api' },
      { repositoryName: 'web', message: 'feat: web' },
    ])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('does not start batch writes when any automatic generation fails', async () => {
    mocks.generate.mockReset()
    mocks.generate
      .mockResolvedValueOnce({ ok: true, message: 'feat: api' })
      .mockResolvedValueOnce({ ok: false, message: 'generation failed' })
    const onBatchCommitAndPush = vi.fn(async () => null)
    render({ plan: batchPlan, onBatchCommitAndPush })
    await flush()

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[role="switch"][aria-label="action.commit-auto-commit-and-push"]')
        ?.click()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="generate-all-codex"]')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await flush()

    expect(onBatchCommitAndPush).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')?.textContent).toContain(
      'generation failed',
    )
  })

  test('summarizes every failed batch commit member and hands the aggregate to AI', async () => {
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-commit',
      planToken: batchPlan.token,
      branchWorkspaceId: batchPlan.branchWorkspaceId,
      message: 'workspace.branch-workspace.git-action.members-failed',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'commit',
          message: 'api commit failed',
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        {
          repositoryName: 'web',
          phase: 'failed',
          step: 'commit',
          message: 'web hook rejected',
          worktreePath: '/workspace/goblin-feature-a/web',
        },
      ],
    }
    const onBatchErrorAiHandoff = vi.fn(async () => true)
    const onOpenChange = vi.fn()

    render({ plan: batchPlan, result, error: result.message, onBatchErrorAiHandoff, onOpenChange })
    await flush()

    const summary = document.querySelector('[data-slot="branch-workspace-batch-error-summary"]')
    expect(summary?.textContent).toContain('api')
    expect(summary?.textContent).toContain('api commit failed')
    expect(summary?.textContent).toContain('web')
    expect(summary?.textContent).toContain('web hook rejected')
    expect(summary?.textContent).toContain('workspace.branch-workspace.git-action.failure-step.commit')
    expect(document.body.textContent).toContain('workspace.branch-workspace.git-action.member-failure-ai-handoff')

    await act(async () => buttonWithExactText('action.merge-conflict-ai-codex')?.click())
    await flush()

    expect(onBatchErrorAiHandoff).toHaveBeenCalledWith({
      provider: 'codex',
      kind: 'batch-commit',
      failures: [
        {
          repositoryName: 'api',
          step: 'commit',
          message: 'api commit failed',
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        {
          repositoryName: 'web',
          step: 'commit',
          message: 'web hook rejected',
          worktreePath: '/workspace/goblin-feature-a/web',
        },
      ],
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test.each(['pull', 'push'] as const)('offers the same aggregate AI handoff for failed batch %s', async (kind) => {
    const plan = syncPlan(kind)
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind,
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'workspace.branch-workspace.git-action.members-failed',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: kind,
          message: `${kind} failed`,
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        { repositoryName: 'web', phase: 'succeeded' },
      ],
    }

    render({ kind, plan, result, error: result.message })
    await flush()

    expect(document.querySelector('[data-slot="branch-workspace-batch-error-summary"]')?.textContent).toContain(
      `${kind} failed`,
    )
    expect(document.querySelector('[data-slot="merge-conflict-ai-actions"]')).not.toBeNull()
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
    render({ kind: 'batch-merge-out', plan: mergeOutPlan() })

    expect(document.querySelector('[data-action="merge"]')).not.toBeNull()
    expect(document.querySelector('[data-action="pull-merge-push"]')).not.toBeNull()
  })

  test('requires merge-in sources, renders source-to-target direction, and submits plan order', async () => {
    const plan = mergeInPlan()
    const onOpenChange = vi.fn()
    const onBatchMergeIn = vi.fn(
      async (): Promise<BranchWorkspaceGitActionResult> => ({
        ok: true,
        kind: 'batch-merge-in',
        planToken: plan.token,
        branchWorkspaceId: plan.branchWorkspaceId,
        members: [],
      }),
    )
    render({ kind: 'batch-merge-in', plan, onOpenChange, onBatchMergeIn })

    const local = document.querySelector<HTMLButtonElement>('[data-action="merge"]')
    const remote = document.querySelector<HTMLButtonElement>('[data-action="pull-merge-push"]')
    const apiSource = document.querySelector<HTMLElement>('[data-merge-source="api"]')
    const apiTarget = document.querySelector<HTMLElement>('[data-merge-target="api"]')
    expect(local?.disabled).toBe(true)
    expect(remote?.disabled).toBe(true)
    expect(apiSource).not.toBeNull()
    expect(apiTarget?.textContent).toBe('feature/a')
    expect((apiSource?.compareDocumentPosition(apiTarget!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(mergeCheckbox('docs')?.disabled).toBe(true)

    await selectMergeSource('api', 'release/v2')
    await selectMergeSource('web', 'main')
    expect(local?.disabled).toBe(false)
    expect(remote?.disabled).toBe(true)

    await act(async () => mergeCheckbox('web')?.click())
    expect(remote?.disabled).toBe(false)
    await act(async () => {
      local?.click()
      await Promise.resolve()
    })

    expect(onBatchMergeIn).toHaveBeenCalledWith('merge', [{ repositoryName: 'api', sourceBranch: 'release/v2' }])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('widens destination selection and shows only the complete branch name', async () => {
    const plan = mergeOutPlan()
    const longBranch = 'release/customer-facing/complete-branch-name'
    plan.members[0]!.destinationBranches.push({
      branch: longBranch,
      head: 'long-branch-head',
      ready: true,
      requiresTemporaryWorktree: true,
      pullMergePushReady: true,
    })
    render({ kind: 'batch-merge-out', plan })

    const dialog = document.querySelector<HTMLElement>('[data-testid="branch-workspace-batch-merge-dialog"]')
    const trigger = document.querySelector<HTMLButtonElement>('[data-merge-destination="api"]')
    expect(dialog?.className).toContain('sm:max-w-[42.667rem]')
    expect(dialog?.className).toContain('sm:w-[66.667vw]')
    expect(trigger?.parentElement?.className).toContain('minmax(12rem,2fr)')
    expect(trigger?.className).toContain('min-w-48')

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
    render({ kind: 'batch-merge-out', plan: mergeOutPlan() })

    expect(mergeCheckbox('api')?.dataset.state).toBe('checked')
    expect(mergeCheckbox('web')?.dataset.state).toBe('checked')
    expect(mergeCheckbox('docs')?.dataset.state).toBe('unchecked')
    expect(mergeCheckbox('docs')?.disabled).toBe(true)
  })

  test('requires a destination for every selected member and computes readiness from those destinations', async () => {
    render({ kind: 'batch-merge-out', plan: mergeOutPlan() })
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
    const plan = mergeOutPlan()
    const onOpenChange = vi.fn()
    const onBatchMergeOut = vi.fn(
      async (): Promise<BranchWorkspaceGitActionResult> => ({
        ok: true,
        kind: 'batch-merge-out',
        planToken: plan.token,
        branchWorkspaceId: plan.branchWorkspaceId,
        members: [],
      }),
    )
    render({ kind: 'batch-merge-out', plan, onOpenChange, onBatchMergeOut })

    await act(async () => mergeCheckbox('web')?.click())
    await selectMergeDestination('api', 'release/v2')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })

    expect(onBatchMergeOut).toHaveBeenCalledWith('merge', [{ repositoryName: 'api', destinationBranch: 'release/v2' }])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('locks selection and projects live member step progress after execution starts', async () => {
    const plan = mergeOutPlan()
    let finish: ((result: BranchWorkspaceGitActionResult) => void) | undefined
    const pendingResult = new Promise<BranchWorkspaceGitActionResult>((resolve) => {
      finish = resolve
    })
    const onBatchMergeOut = vi.fn(() => pendingResult)
    render({ kind: 'batch-merge-out', plan, onBatchMergeOut })
    await selectMergeDestination('api', 'main')
    await selectMergeDestination('web', 'staging')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })

    render({
      kind: 'batch-merge-out',
      plan,
      pending: true,
      onBatchMergeOut,
      activeOperation: {
        kind: 'batch-merge-out',
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
      kind: 'batch-merge-out',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [],
    })
  })

  test('keeps a failed batch locked to its original mode and destinations for retry', async () => {
    const plan = mergeOutPlan()
    const failure: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-merge-out',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'merge failed',
      members: [
        { repositoryName: 'api', phase: 'failed', step: 'merge', message: 'merge failed' },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const onBatchMergeOut = vi.fn(async () => failure)
    render({ kind: 'batch-merge-out', plan, onBatchMergeOut })
    await selectMergeDestination('api', 'main')
    await selectMergeDestination('web', 'staging')

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })
    render({ kind: 'batch-merge-out', plan, result: failure, onBatchMergeOut })

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
    expect(onBatchMergeOut).toHaveBeenNthCalledWith(1, 'merge', expectedTargets)
    expect(onBatchMergeOut).toHaveBeenNthCalledWith(2, 'merge', expectedTargets)
  })

  test('hands all merge-in failures to AI and closes after a successful handoff', async () => {
    const plan = mergeInPlan()
    const conflictWorktree = {
      branch: 'feature/a',
      path: '/workspace/goblin-feature-a/api',
    }
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-merge-in',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'conflict',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'merge',
          message: 'conflict',
          reason: 'merge-conflict',
          worktreePath: conflictWorktree.path,
          conflictWorktree,
        },
        {
          repositoryName: 'web',
          phase: 'failed',
          step: 'push',
          message: 'remote rejected',
          worktreePath: '/workspace/goblin-feature-a/web',
        },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const onOpenChange = vi.fn()
    const onBatchErrorAiHandoff = vi.fn(async () => true)

    render({
      kind: 'batch-merge-in',
      plan,
      result,
      error: 'conflict',
      onOpenChange,
      onBatchErrorAiHandoff,
    })
    await flush()

    const actions = document.querySelector('[data-slot="merge-conflict-ai-actions"]')
    const codex = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'action.merge-conflict-ai-codex',
    )
    expect(actions).not.toBeNull()
    expect(codex).not.toBeUndefined()

    await act(async () => codex?.click())
    await flush()

    expect(onBatchErrorAiHandoff).toHaveBeenCalledWith({
      provider: 'codex',
      kind: 'batch-merge-in',
      failures: [
        {
          repositoryName: 'api',
          step: 'merge',
          message: 'conflict',
          reason: 'merge-conflict',
          worktreePath: conflictWorktree.path,
          conflictWorktree,
        },
        {
          repositoryName: 'web',
          step: 'push',
          message: 'remote rejected',
          worktreePath: '/workspace/goblin-feature-a/web',
        },
      ],
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('does not offer AI handoff when no member failed', async () => {
    const plan = mergeOutPlan()
    const result: BranchWorkspaceGitActionResult = {
      ok: true,
      kind: 'batch-merge-out',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        { repositoryName: 'web', phase: 'succeeded' },
        { repositoryName: 'docs', phase: 'satisfied' },
      ],
    }

    render({ kind: 'batch-merge-out', plan, result })
    await flush()

    expect(document.querySelector('[data-slot="merge-conflict-ai-actions"]')).toBeNull()
  })

  test('keeps the merge dialog open and reports a failed AI terminal handoff', async () => {
    const plan = mergeOutPlan()
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-merge-out',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'conflict',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'merge',
          message: 'conflict',
          reason: 'merge-conflict',
          worktreePath: '/workspace/api',
          conflictWorktree: { branch: 'main', path: '/workspace/api' },
        },
        { repositoryName: 'web', phase: 'not-started' },
        { repositoryName: 'docs', phase: 'not-started' },
      ],
    }
    const onOpenChange = vi.fn()

    render({
      kind: 'batch-merge-out',
      plan,
      result,
      error: 'conflict',
      onOpenChange,
      onBatchErrorAiHandoff: vi.fn(async () => false),
    })
    await flush()

    const claude = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === 'action.merge-conflict-ai-claude',
    )
    await act(async () => claude?.click())
    await flush()

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('action.merge-conflict-ai-prefill-failed')
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
        onBatchCommitAndPush={async () => null}
        onBatchMergeIn={async () => null}
        onBatchMergeOut={async () => null}
        onSync={async () => null}
        onCancel={async () => {}}
        onBatchErrorAiHandoff={async () => false}
        {...overrides}
      />,
    ),
  )
}

function buttonWithExactText(text: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === text,
    ) ?? null
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

async function selectMergeSource(repositoryName: string, sourceBranch: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-merge-source="${repositoryName}"]`)
  if (!trigger) throw new Error(`Missing source trigger for ${repositoryName}`)
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })
  const option = document.querySelector<HTMLElement>(`[data-merge-source-option="${repositoryName}:${sourceBranch}"]`)
  if (!option) throw new Error(`Missing source option ${repositoryName}:${sourceBranch}`)
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

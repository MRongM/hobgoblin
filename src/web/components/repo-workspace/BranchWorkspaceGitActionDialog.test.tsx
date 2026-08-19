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
vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, values?: { repository?: string }) =>
    key === 'workspace.branch-workspace.git-action.select-upstream-for-member' ? `${key}:${values?.repository}` : key,
}))

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

function discardPlan(dirty = true): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-discard' }> {
  return {
    kind: 'batch-discard',
    token: 'sha256:discard',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    members: ['api', 'web'].map((repositoryName, index) => {
      const paths = dirty && index === 0 ? ['src/api.ts', 'scratch/new.txt'] : []
      return {
        repositoryName,
        repoId: `/workspace/${repositoryName}`,
        targetBranch: 'feature/a',
        targetWorktreePath: `/workspace/goblin-feature-a/${repositoryName}`,
        paths,
        changeCount: paths.length,
        fingerprint: `sha256:${repositoryName}`,
      }
    }),
  }
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

function upstreamPlan(): Extract<BranchWorkspaceGitActionPlan, { kind: 'batch-set-upstream' }> {
  return {
    kind: 'batch-set-upstream',
    token: 'sha256:upstream',
    rootId: '/workspace',
    branchWorkspaceId: 'ws-1',
    ready: true,
    members: [
      {
        repositoryName: 'api',
        repoId: '/workspace/api',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/goblin-feature-a/api',
        targetHead: 'api-target-head',
        currentUpstream: 'origin/feature/a',
        trackingGone: true,
        remoteBranches: [
          { remoteRef: 'origin/feature/a', head: 'api-feature-head' },
          { remoteRef: 'origin/release', head: 'api-release-head' },
        ],
        ready: true,
        fingerprint: 'sha256:api',
      },
      {
        repositoryName: 'web',
        repoId: '/workspace/web',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/goblin-feature-a/web',
        targetHead: 'web-target-head',
        currentUpstream: null,
        trackingGone: false,
        remoteBranches: [
          { remoteRef: 'upstream/web-main', head: 'web-main-head' },
          { remoteRef: 'upstream/web-release', head: 'web-release-head' },
        ],
        ready: true,
        fingerprint: 'sha256:web',
      },
      {
        repositoryName: 'docs',
        repoId: '/workspace/docs',
        targetBranch: 'feature/a',
        targetWorktreePath: '/workspace/goblin-feature-a/docs',
        targetHead: 'docs-target-head',
        currentUpstream: null,
        trackingGone: false,
        remoteBranches: [],
        ready: true,
        message: 'workspace.branch-workspace.git-action.remote-branch-required',
        fingerprint: 'sha256:docs',
      },
    ],
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
          destination.destination.kind === 'local' && destination.destination.branch === 'main'
            ? { ...destination, pullMergePushReady: false }
            : destination,
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
      destination: { kind: 'local' as const, branch: 'main' },
      head: 'main-head',
      ready: true,
      worktreePath: `/workspace/${repositoryName}`,
      requiresTemporaryWorktree: false,
      pullMergePushReady: true,
    },
    {
      destination: { kind: 'local' as const, branch: 'release/v2' },
      head: 'release-head',
      ready: true,
      worktreePath: `/workspace/${repositoryName}-release`,
      requiresTemporaryWorktree: false,
      pullMergePushReady: true,
    },
    {
      destination: { kind: 'local' as const, branch: 'staging' },
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
      { source: { kind: 'local', branch: 'main' }, head: 'main-head' },
      { source: { kind: 'local', branch: 'release/v2' }, head: 'release-head' },
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
  test.each([
    ['batch-commit', batchPlan],
    ['batch-discard', discardPlan()],
    ['batch-set-upstream', upstreamPlan()],
    ['pull', syncPlan('pull')],
    ['push', syncPlan('push')],
  ] as const)('renders unified batch progress for %s', (kind, plan) => {
    render({ kind, plan })

    expect(document.querySelector('[data-testid="branch-workspace-batch-progress"]')).not.toBeNull()
  })

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

  test('reviews dirty and clean members inline before confirming batch discard', async () => {
    const plan = discardPlan()
    const onBatchDiscard = vi.fn(async () => ({
      ok: true as const,
      kind: 'batch-discard' as const,
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [],
    }))
    const onOpenChange = vi.fn()
    render({ kind: 'batch-discard', plan, onBatchDiscard, onOpenChange })

    const panel = document.querySelector('[data-testid="branch-workspace-git-action-panel"]')
    const action = document.querySelector<HTMLButtonElement>('[data-action="batch-discard"]')
    expect(panel?.textContent).toContain('api')
    expect(panel?.textContent).toContain('web')
    expect(panel?.textContent).toContain('workspace.branch-workspace.git-action.change-count')
    expect(panel?.textContent).toContain('workspace.branch-workspace.git-action.clean-skipped')
    expect(action?.getAttribute('data-variant')).toBe('destructive')
    expect(action?.querySelector('.lucide-rotate-ccw')).not.toBeNull()

    await act(async () => {
      action?.click()
      await Promise.resolve()
    })

    expect(onBatchDiscard).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('disables batch discard when every member worktree is clean', () => {
    render({ kind: 'batch-discard', plan: discardPlan(false) })

    expect(document.querySelector<HTMLButtonElement>('[data-action="batch-discard"]')?.disabled).toBe(true)
  })

  test('keeps each batch upstream member candidates and search query isolated', async () => {
    const plan = upstreamPlan()
    render({ kind: 'batch-set-upstream', plan })

    expect(document.querySelector('[data-upstream-current="api"]')?.textContent).toContain('origin/feature/a')
    expect(document.querySelector('[data-upstream-current="api"]')?.textContent).toContain(
      'action.branch-upstream-gone',
    )
    expect(upstreamCheckbox('docs')?.disabled).toBe(true)
    expect(document.querySelector('[data-upstream-current="docs"]')?.parentElement?.textContent).toContain(
      'workspace.branch-workspace.git-action.remote-branch-required',
    )

    await openUpstreamRemote('api')
    expect(document.querySelector('[data-upstream-remote-option="api:origin/release"]')).not.toBeNull()
    expect(document.querySelector('[data-upstream-remote-option="web:upstream/web-release"]')).toBeNull()
    await closeSelect()

    await openUpstreamRemote('web')
    setInputValue('branch-workspace-upstream-web-filter', 'release')
    expect(document.querySelector('[data-upstream-remote-option="web:upstream/web-release"]')).not.toBeNull()
    expect(document.querySelector('[data-upstream-remote-option="web:upstream/web-main"]')).toBeNull()
    await closeSelect()

    await openUpstreamRemote('api')
    expect(document.querySelector('[data-upstream-remote-option="api:origin/feature/a"]')).not.toBeNull()
  })

  test('gives each batch upstream remote selector a unique member-specific accessible name', () => {
    render({ kind: 'batch-set-upstream', plan: upstreamPlan() })

    const api = document.querySelector<HTMLButtonElement>('[data-upstream-remote="api"]')
    const web = document.querySelector<HTMLButtonElement>('[data-upstream-remote="web"]')
    expect(api?.getAttribute('aria-label')).toBe('workspace.branch-workspace.git-action.select-upstream-for-member:api')
    expect(web?.getAttribute('aria-label')).toBe('workspace.branch-workspace.git-action.select-upstream-for-member:web')
    expect(api?.textContent).toContain('workspace.branch-workspace.git-action.select-upstream')
  })

  test('requires explicit candidate mappings and submits selected members in manifest order', async () => {
    const plan = upstreamPlan()
    let resolveExecution: ((result: BranchWorkspaceGitActionResult | null) => void) | null = null
    const onBatchSetUpstream = vi.fn(
      () => new Promise<BranchWorkspaceGitActionResult | null>((resolve) => (resolveExecution = resolve)),
    )
    render({ kind: 'batch-set-upstream', plan, onBatchSetUpstream })

    const action = document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')
    expect(action?.disabled).toBe(true)

    await act(async () => upstreamCheckbox('web')?.click())
    await selectUpstreamRemote('api', 'origin/release')
    expect(action?.disabled).toBe(false)
    expect(upstreamRow('web')?.textContent).toContain('workspace.branch-workspace.git-action.not-selected')

    await act(async () => upstreamSelectAllCheckbox()?.click())
    expect(action?.disabled).toBe(true)
    await selectUpstreamRemote('web', 'upstream/web-release')
    expect(action?.disabled).toBe(false)

    await act(async () => upstreamSelectAllCheckbox()?.click())
    expect(action?.disabled).toBe(true)
    await act(async () => upstreamSelectAllCheckbox()?.click())
    expect(action?.disabled).toBe(false)

    await act(async () => {
      action?.click()
      await Promise.resolve()
    })
    expect(onBatchSetUpstream).toHaveBeenCalledWith([
      { repositoryName: 'api', action: 'set', remoteRef: 'origin/release' },
      { repositoryName: 'web', action: 'set', remoteRef: 'upstream/web-release' },
    ])
    expect(upstreamCheckbox('api')?.disabled).toBe(true)
    expect(upstreamCheckbox('web')?.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('[data-upstream-remote="api"]')?.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('[data-upstream-remote="web"]')?.disabled).toBe(true)

    await act(async () => resolveExecution?.(null))
  })

  test('toggles a selected member to remove its upstream and submits an unset action', async () => {
    const onBatchSetUpstream = vi.fn(async () => null)
    render({ kind: 'batch-set-upstream', plan: upstreamPlan(), onBatchSetUpstream })

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="branch-workspace-batch-unset-upstream-api"]')?.click()
      upstreamCheckbox('web')?.click()
    })

    expect(upstreamRow('api')?.textContent).toContain('workspace.branch-workspace.git-action.remove-upstream-selected')
    expect(document.querySelector<HTMLButtonElement>('[data-upstream-remote="api"]')?.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')?.disabled).toBe(false)

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')?.click()
      await Promise.resolve()
    })

    expect(onBatchSetUpstream).toHaveBeenCalledWith([{ repositoryName: 'api', action: 'unset' }])
  })

  test('prioritizes upstream result phases over ready selection state and resets local state on reopen or plan token change', async () => {
    const plan = upstreamPlan()
    render({ kind: 'batch-set-upstream', plan })

    await selectUpstreamRemote('api', 'origin/release')
    await selectUpstreamRemote('web', 'upstream/web-release')
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-set-upstream',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [
        { repositoryName: 'api', phase: 'succeeded' },
        {
          repositoryName: 'web',
          phase: 'failed',
          step: 'upstream',
          message: 'workspace.branch-workspace.git-action.execute-failed',
        },
      ],
    }
    render({ kind: 'batch-set-upstream', plan, result })
    await flush()

    expect(upstreamRow('api')?.textContent).toContain('workspace.branch-workspace.git-action.phase.succeeded')
    expect(upstreamRow('web')?.textContent).toContain('workspace.branch-workspace.git-action.phase.failed')
    expect(upstreamRow('docs')?.textContent).toContain('workspace.branch-workspace.git-action.remote-branch-required')

    await act(async () => upstreamCheckbox('api')?.click())
    await act(async () => upstreamCheckbox('web')?.click())
    expect(upstreamRow('api')?.textContent).toContain('workspace.branch-workspace.git-action.not-selected')
    expect(upstreamRow('web')?.textContent).toContain('workspace.branch-workspace.git-action.not-selected')

    render({ open: false, kind: 'batch-set-upstream', plan, result: null })
    render({ kind: 'batch-set-upstream', plan, result: null })
    expect(document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')?.disabled).toBe(true)

    await selectUpstreamRemote('api', 'origin/release')
    await selectUpstreamRemote('web', 'upstream/web-release')
    expect(document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')?.disabled).toBe(false)
    render({ kind: 'batch-set-upstream', plan: { ...plan, token: 'sha256:upstream-next' }, result: null })
    expect(document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')?.disabled).toBe(true)
  })

  test('clears upstream mapping, query, and execution lock when the inline panel reopens', async () => {
    const plan = upstreamPlan()
    let resolveExecution: ((result: BranchWorkspaceGitActionResult | null) => void) | null = null
    const onBatchSetUpstream = vi.fn(
      () => new Promise<BranchWorkspaceGitActionResult | null>((resolve) => (resolveExecution = resolve)),
    )
    render({ kind: 'batch-set-upstream', plan, onBatchSetUpstream })

    await selectUpstreamRemote('api', 'origin/release')
    await openUpstreamRemote('web')
    setInputValue('branch-workspace-upstream-web-filter', 'release')
    const webRelease = document.querySelector<HTMLElement>('[data-upstream-remote-option="web:upstream/web-release"]')
    await act(async () => {
      webRelease?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const action = document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')
    await act(async () => {
      action?.click()
      await Promise.resolve()
    })
    expect(upstreamCheckbox('api')?.disabled).toBe(true)

    render({ open: false, kind: 'batch-set-upstream', plan, onBatchSetUpstream })
    render({ kind: 'batch-set-upstream', plan, onBatchSetUpstream })

    expect(upstreamCheckbox('api')?.disabled).toBe(false)
    expect(document.querySelector<HTMLButtonElement>('[data-action="batch-set-upstream"]')?.disabled).toBe(true)
    await openUpstreamRemote('web')
    expect(document.querySelector('[data-upstream-remote-option="web:upstream/web-main"]')).not.toBeNull()

    await act(async () => resolveExecution?.(null))
  })

  test('keeps failed batch discard available for retry and shows the discard failure step', async () => {
    const plan = discardPlan()
    const result: BranchWorkspaceGitActionResult = {
      ok: false,
      kind: 'batch-discard',
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      message: 'workspace.branch-workspace.git-action.members-failed',
      members: [
        {
          repositoryName: 'api',
          phase: 'failed',
          step: 'discard',
          message: 'discard failed',
          worktreePath: '/workspace/goblin-feature-a/api',
        },
        { repositoryName: 'web', phase: 'satisfied' },
      ],
    }
    const onBatchDiscard = vi.fn(async () => result)
    render({ kind: 'batch-discard', plan, result, error: result.message, onBatchDiscard })

    expect(document.querySelector('[data-slot="branch-workspace-batch-error-summary"]')?.textContent).toContain(
      'workspace.branch-workspace.git-action.failure-step.discard',
    )
    expect(document.querySelector('[data-action="batch-discard"]')?.textContent).toContain(
      'workspace.branch-workspace.retry',
    )

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="batch-discard"]')?.click()
      await Promise.resolve()
    })
    expect(onBatchDiscard).toHaveBeenCalledTimes(1)
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

    expect(onBatchMergeIn).toHaveBeenCalledWith('merge', [
      { repositoryName: 'api', source: { kind: 'local', branch: 'release/v2' } },
    ])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('keeps same-named local and remote merge-in sources distinct and submits the remote selection', async () => {
    const plan = mergeInPlan()
    plan.members[0]!.sourceBranches.push(
      { source: { kind: 'local', branch: 'origin/main' }, head: 'local-origin-main' },
      { source: { kind: 'remote', remoteRef: 'origin/main' }, head: 'remote-origin-main' },
    )
    const onBatchMergeIn = vi.fn(async () => null)
    render({ kind: 'batch-merge-in', plan, onBatchMergeIn })

    await act(async () => mergeCheckbox('web')?.click())
    const trigger = document.querySelector<HTMLButtonElement>('[data-merge-source="api"]')
    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await Promise.resolve()
    })
    expect(document.querySelector('[data-merge-source-option="api:local:origin/main"]')).not.toBeNull()
    expect(document.querySelector('[data-merge-source-option="api:remote:origin/main"]')).not.toBeNull()
    expect(document.querySelector('[data-merge-source-kind="remote"]')?.textContent).toContain('tab.remote-branches')

    await selectMergeSource('api', 'origin/main', 'remote')
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="merge"]')?.click()
      await Promise.resolve()
    })

    expect(onBatchMergeIn).toHaveBeenCalledWith('merge', [
      { repositoryName: 'api', source: { kind: 'remote', remoteRef: 'origin/main' } },
    ])
  })

  test('widens destination selection and shows only the complete branch name', async () => {
    const plan = mergeOutPlan()
    const longBranch = 'release/customer-facing/complete-branch-name'
    plan.members[0]!.destinationBranches.push({
      destination: { kind: 'local', branch: longBranch },
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
    const option = document.querySelector<HTMLElement>(`[data-merge-destination-option="api:local:${longBranch}"]`)
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

  test.each([
    ['batch-merge-in', mergeInPlan],
    ['batch-merge-out', mergeOutPlan],
  ] as const)('supports tri-state select-all for %s eligible members', async (kind, createPlan) => {
    render({ kind, plan: createPlan() })

    const selectAll = mergeSelectAllCheckbox()
    expect(selectAll?.dataset.state).toBe('checked')
    expect(mergeCheckbox('docs')?.disabled).toBe(true)

    await act(async () => mergeCheckbox('web')?.click())
    expect(selectAll?.dataset.state).toBe('indeterminate')

    await act(async () => selectAll?.click())
    expect(mergeCheckbox('api')?.dataset.state).toBe('checked')
    expect(mergeCheckbox('web')?.dataset.state).toBe('checked')
    expect(mergeCheckbox('docs')?.dataset.state).toBe('unchecked')

    await act(async () => selectAll?.click())
    expect(mergeCheckbox('api')?.dataset.state).toBe('unchecked')
    expect(mergeCheckbox('web')?.dataset.state).toBe('unchecked')
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

    expect(onBatchMergeOut).toHaveBeenCalledWith('merge', [
      { repositoryName: 'api', destination: { kind: 'local', branch: 'release/v2' } },
    ])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('requires synchronized mode for a remote merge-out destination', async () => {
    const plan = mergeOutPlan()
    plan.members[0]!.destinationBranches.push({
      destination: { kind: 'remote', remoteRef: 'origin/release/v2' },
      head: 'remote-release-head',
      ready: true,
      requiresTemporaryWorktree: true,
      pullMergePushReady: true,
    })
    const onBatchMergeOut = vi.fn(async () => null)
    render({ kind: 'batch-merge-out', plan, onBatchMergeOut })

    await act(async () => mergeCheckbox('web')?.click())
    await selectMergeDestination('api', 'origin/release/v2', 'remote')
    const mergeOnly = document.querySelector<HTMLButtonElement>('[data-action="merge"]')
    const synchronized = document.querySelector<HTMLButtonElement>('[data-action="pull-merge-push"]')
    expect(mergeOnly?.disabled).toBe(true)
    expect(synchronized?.disabled).toBe(false)
    expect(document.querySelector('[data-merge-destination="api"]')?.textContent).toContain('tab.remote-branches')

    await act(async () => {
      synchronized?.click()
      await Promise.resolve()
    })
    expect(onBatchMergeOut).toHaveBeenCalledWith('pull-merge-push', [
      { repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'origin/release/v2' } },
    ])
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
    expect(mergeSelectAllCheckbox()?.disabled).toBe(true)
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
      { repositoryName: 'api', destination: { kind: 'local', branch: 'main' } },
      { repositoryName: 'web', destination: { kind: 'local', branch: 'staging' } },
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
    expect(onSync).toHaveBeenCalledWith(kind, ['api', 'web'])
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

  test('selects ready sync members by default and executes only that subset', async () => {
    const plan = syncPlan('push')
    if (plan.kind !== 'push') throw new Error('expected push plan')
    plan.ready = false
    plan.members[1]!.ready = false
    plan.members[1]!.message = 'workspace.branch-workspace.git-action.remote-required'
    const onSync = vi.fn(async () => ({
      ok: true as const,
      kind: 'push' as const,
      planToken: plan.token,
      branchWorkspaceId: plan.branchWorkspaceId,
      members: [],
    }))
    render({ kind: 'push', plan, onSync })

    const api = document.querySelector<HTMLButtonElement>('[data-sync-repository="api"]')
    const web = document.querySelector<HTMLButtonElement>('[data-sync-repository="web"]')
    const action = document.querySelector<HTMLButtonElement>('[data-action="push"]')
    expect(api?.getAttribute('data-state')).toBe('checked')
    expect(web?.disabled).toBe(true)
    expect(document.querySelector('[data-testid="branch-workspace-git-action-panel"]')?.textContent).toContain(
      'workspace.branch-workspace.git-action.selected-count',
    )

    await act(async () => {
      action?.click()
      await Promise.resolve()
    })
    expect(onSync).toHaveBeenCalledWith('push', ['api'])
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
        onBatchDiscard={async () => null}
        onBatchSetUpstream={async () => null}
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

function mergeSelectAllCheckbox(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-merge-select-all]')
}

function upstreamSelectAllCheckbox(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-merge-select-all]')
}

function upstreamCheckbox(repositoryName: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-upstream-repository="${repositoryName}"]`)
}

function upstreamRow(repositoryName: string): HTMLElement | null {
  return upstreamCheckbox(repositoryName)?.closest('.border-b') ?? null
}

async function openUpstreamRemote(repositoryName: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-upstream-remote="${repositoryName}"]`)
  if (!trigger) throw new Error(`Missing upstream trigger for ${repositoryName}`)
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })
}

async function closeSelect() {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
  })
}

function setInputValue(id: string, value: string) {
  const input = document.getElementById(id)
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input ${id}`)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function selectUpstreamRemote(repositoryName: string, remoteRef: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-upstream-remote="${repositoryName}"]`)
  if (!trigger) throw new Error(`Missing upstream trigger for ${repositoryName}`)
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })
  const option = document.querySelector<HTMLElement>(`[data-upstream-remote-option="${repositoryName}:${remoteRef}"]`)
  if (!option) throw new Error(`Missing upstream remote option ${repositoryName}:${remoteRef}`)
  await act(async () => {
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

async function selectMergeDestination(
  repositoryName: string,
  destinationBranch: string,
  kind: 'local' | 'remote' = 'local',
) {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-merge-destination="${repositoryName}"]`)
  if (!trigger) throw new Error(`Missing destination trigger for ${repositoryName}`)
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })
  const option = document.querySelector<HTMLElement>(
    `[data-merge-destination-option="${repositoryName}:${kind}:${destinationBranch}"]`,
  )
  if (!option) throw new Error(`Missing destination option ${repositoryName}:${destinationBranch}`)
  await act(async () => {
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}

async function selectMergeSource(repositoryName: string, sourceBranch: string, kind: 'local' | 'remote' = 'local') {
  const trigger = document.querySelector<HTMLButtonElement>(`[data-merge-source="${repositoryName}"]`)
  if (!trigger) throw new Error(`Missing source trigger for ${repositoryName}`)
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()
  })
  const option = document.querySelector<HTMLElement>(
    `[data-merge-source-option="${repositoryName}:${kind}:${sourceBranch}"]`,
  )
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

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceGitActionPanel } from '#/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx'
import type { BranchWorkspaceGitActionPlan } from '#/shared/branch-workspace-git-actions.ts'

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

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.providers.mockResolvedValue({ codex: true, claude: true })
  mocks.generate
    .mockResolvedValueOnce({ ok: true, message: 'feat: api' })
    .mockResolvedValueOnce({ ok: true, message: 'feat: web' })
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
  test('keeps the merge-back identity while its plan is loading', () => {
    render({ kind: 'merge-back', plan: null })

    const panel = document.querySelector('[data-testid="branch-workspace-git-action-panel"]')
    expect(panel?.textContent).toContain('workspace.branch-workspace.git-action.merge-back')
    expect(panel?.textContent).not.toContain('workspace.branch-workspace.git-action.batch-commit')
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
    const mergePlan: BranchWorkspaceGitActionPlan = {
      kind: 'merge-back',
      token: 'sha256:merge',
      rootId: '/workspace',
      branchWorkspaceId: 'ws-1',
      pullMergePushReady: true,
      members: [
        {
          repositoryName: 'api',
          repoId: '/workspace/api',
          targetBranch: 'feature/a',
          targetWorktreePath: '/workspace/goblin-feature-a/api',
          targetHead: 'target-head',
          baseBranch: 'main',
          baseWorktreePath: '/workspace/api',
          baseHead: 'base-head',
          mergeSatisfied: false,
          pullMergePushReady: true,
          fingerprint: 'sha256:api',
        },
      ],
    }
    render({ plan: mergePlan })

    expect(document.querySelector('[data-action="merge"]')).not.toBeNull()
    expect(document.querySelector('[data-action="pull-merge-push"]')).not.toBeNull()
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
        onMergeBack={async () => null}
        onSync={async () => null}
        onCancel={async () => {}}
        {...overrides}
      />,
    ),
  )
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

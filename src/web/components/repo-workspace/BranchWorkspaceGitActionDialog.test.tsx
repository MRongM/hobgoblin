// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceGitActionDialog } from '#/web/components/repo-workspace/BranchWorkspaceGitActionDialog.tsx'
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

describe('BranchWorkspaceGitActionDialog', () => {
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
})

function render(overrides: Partial<React.ComponentProps<typeof BranchWorkspaceGitActionDialog>>) {
  act(() =>
    root.render(
      <BranchWorkspaceGitActionDialog
        open
        plan={null}
        result={null}
        activeOperation={null}
        pending={false}
        error={null}
        onOpenChange={() => {}}
        onBatchCommit={async () => null}
        onMergeBack={async () => null}
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

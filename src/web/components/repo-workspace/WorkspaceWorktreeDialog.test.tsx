// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceWorktreeDialog } from '#/web/components/repo-workspace/WorkspaceWorktreeDialog.tsx'
import type { WorkspaceWorktreeBatchResult, WorkspaceWorktreePlan } from '#/shared/workspace-worktrees.ts'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params?.count === undefined ? key : `${key}:${params.count}`,
}))

const plan: WorkspaceWorktreePlan = {
  token: 'sha256:plan',
  rootId: '/workspace',
  operation: 'create',
  branch: 'feature/a',
  members: [
    {
      repoId: '/workspace/api',
      branch: 'feature/a',
      baseRef: 'main',
      worktreePath: '/workspace/api-feature-a',
      worktreeBootstrap: { kind: 'run', configHash: 'sha256:bootstrap', configTrusted: false },
      bootstrapPreview: {
        hasConfig: true,
        hasOperations: true,
        configHash: 'sha256:bootstrap',
        copyCount: 2,
        symlinkCount: 0,
        hardlinkCount: 0,
        excludeCount: 0,
      },
      confirmationRequired: true,
    },
  ],
}

const successResult: WorkspaceWorktreeBatchResult = {
  ok: true,
  planToken: plan.token,
  operation: 'create',
  branch: plan.branch,
  members: [{ repoId: '/workspace/api', phase: 'succeeded' }],
}

const failedResult: WorkspaceWorktreeBatchResult = {
  ok: false,
  planToken: plan.token,
  operation: 'create',
  branch: plan.branch,
  members: [{ repoId: '/workspace/api', phase: 'failed', message: 'busy' }],
  message: 'busy',
}

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.querySelectorAll('[data-slot="dialog-portal"]').forEach((node) => node.remove())
  root = null
  container = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorkspaceWorktreeDialog', () => {
  test('previews creation with a selected shared base branch', async () => {
    const onPreview = vi.fn(async () => {})
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="create"
          repositoryCount={2}
          baseBranches={['main', 'develop']}
          removableBranches={[]}
          plan={null}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={onPreview}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    const input = document.querySelector<HTMLInputElement>('input')!
    const base = document.querySelector<HTMLSelectElement>('select[aria-label="workspace.worktree.base-branch-label"]')!
    expect(base.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'feature/b')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(base, 'develop')
      base.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const summary = document.querySelector('[data-testid="workspace-worktree-intent-summary"]')
    expect(summary?.textContent).toContain('develop')
    expect(summary?.textContent).toContain('feature/b')
    expect(summary?.textContent).toContain('workspace.worktree.repositories-count:2')
    expect(document.querySelector('button[data-action="preview"]')?.textContent).toContain(
      'workspace.worktree.check-repositories',
    )
    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="preview"]')?.click())

    expect(onPreview).toHaveBeenCalledWith({ operation: 'create', branch: 'feature/b', baseBranch: 'develop' })
  })

  test('previews removal from shared worktree branch choices', async () => {
    const onPreview = vi.fn(async () => {})
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="remove"
          baseBranches={[]}
          removableBranches={['feature/a', 'feature/b']}
          plan={null}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={onPreview}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    const branch = document.querySelector<HTMLSelectElement>(
      'select[aria-label="workspace.worktree.remove-branch-label"]',
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(branch, 'feature/b')
      branch.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="preview"]')?.click())

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'remove',
      branch: 'feature/b',
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
    })
  })

  test('offers dependent local and upstream branch deletion options for removal', async () => {
    const onPreview = vi.fn(async () => {})
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="remove"
          repositoryCount={2}
          baseBranches={[]}
          removableBranches={['feature/a']}
          plan={null}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={onPreview}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    const removeWorktree = document.querySelector('[data-workspace-removal-step="worktree"]')
    const deleteBranchLabel = findLabel('action.confirm-remove-worktree-also-delete-branch')
    expect(removeWorktree?.textContent).toContain('workspace.worktree.remove-linked-worktree')
    expect(removeWorktree?.textContent).toContain('workspace.worktree.always')
    expect(
      removeWorktree && deleteBranchLabel
        ? removeWorktree.compareDocumentPosition(deleteBranchLabel) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0,
    ).not.toBe(0)
    const cleanupOptions = document.querySelector('[data-workspace-removal-cleanup]')
    expect(cleanupOptions?.className).toContain('grid-cols-2')
    const deleteBranch = checkboxForLabel('action.confirm-remove-worktree-also-delete-branch')
    const deleteUpstream = checkboxForLabel('action.confirm-delete-branch-also-delete-upstream')
    expect(deleteUpstream.hasAttribute('disabled')).toBe(true)
    await act(async () => deleteBranch.click())
    expect(deleteUpstream.hasAttribute('disabled')).toBe(false)
    await act(async () => deleteUpstream.click())
    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="preview"]')?.click())

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'remove',
      branch: 'feature/a',
      alsoDeleteBranch: true,
      alsoDeleteUpstream: true,
    })
  })

  test('disables branch cleanup for a protected worktree branch', () => {
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="remove"
          baseBranches={[]}
          removableBranches={['main']}
          plan={null}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={async () => {}}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    expect(checkboxForLabel('action.confirm-remove-worktree-also-delete-branch').hasAttribute('disabled')).toBe(true)
    expect(checkboxForLabel('action.confirm-delete-branch-also-delete-upstream').hasAttribute('disabled')).toBe(true)
  })

  test('closes after a completely successful confirmation', async () => {
    const onOpenChange = vi.fn()
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="create"
          repositoryCount={2}
          plan={plan}
          result={null}
          pending={false}
          error={null}
          onOpenChange={onOpenChange}
          onPreview={async () => {}}
          onConfirm={async () => successResult}
          onRetry={async () => successResult}
          onCancel={async () => {}}
        />,
      ),
    )

    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="confirm"]')?.click())

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('keeps the dialog open after an incomplete confirmation', async () => {
    const onOpenChange = vi.fn()
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="create"
          repositoryCount={2}
          plan={plan}
          result={null}
          pending={false}
          error={null}
          onOpenChange={onOpenChange}
          onPreview={async () => {}}
          onConfirm={async () => failedResult}
          onRetry={async () => successResult}
          onCancel={async () => {}}
        />,
      ),
    )

    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="confirm"]')?.click())

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  test('closes when retry completes every repository', async () => {
    const onOpenChange = vi.fn()
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="create"
          plan={plan}
          result={failedResult}
          pending={false}
          error="busy"
          onOpenChange={onOpenChange}
          onPreview={async () => {}}
          onConfirm={async () => failedResult}
          onRetry={async () => successResult}
          onCancel={async () => {}}
        />,
      ),
    )

    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="retry"]')?.click())

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('shows authoritative repository bases, paths, and bootstrap preview before creation', async () => {
    const onConfirm = vi.fn(async () => {})
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="create"
          repositoryCount={2}
          plan={plan}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={async () => {}}
          onConfirm={async () => {
            await onConfirm()
            return null
          }}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    const summary = document.querySelector('[data-testid="workspace-worktree-intent-summary"]')
    expect(summary?.textContent).toContain('main')
    expect(summary?.textContent).toContain('feature/a')
    expect(summary?.textContent).toContain('workspace.worktree.repositories-count:2')
    const repositoryLabel = document.querySelector('[data-workspace-repository-id]')
    expect(repositoryLabel?.textContent).toBe('api')
    expect(repositoryLabel?.getAttribute('title')).toBe('/workspace/api')
    const worktreePath = document.querySelector('span[title="/workspace/api-feature-a"]')
    expect(worktreePath?.textContent).toBe('api-feature-a')
    expect(worktreePath?.getAttribute('title')).toBe('/workspace/api-feature-a')
    expect(document.body.textContent).toContain('workspace.worktree.bootstrap-copy:2')
    await act(async () => document.querySelector<HTMLButtonElement>('button[data-action="confirm"]')?.click())
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('uses destructive confirmation for removal and retains partial result rows for retry', () => {
    const removePlan = { ...plan, operation: 'remove' as const, members: [{ ...plan.members[0]!, baseRef: undefined }] }
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="remove"
          initialBranch="feature/a"
          plan={removePlan}
          result={{
            ok: false,
            planToken: removePlan.token,
            operation: 'remove',
            branch: 'feature/a',
            members: [{ repoId: '/workspace/api', phase: 'failed', message: 'busy' }],
            message: 'busy',
          }}
          pending={false}
          error="busy"
          onOpenChange={() => {}}
          onPreview={async () => {}}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    expect(document.body.textContent).toContain('workspace.worktree.remove-warning')
    expect(document.querySelector('span[title="/workspace/api-feature-a"]')?.textContent).toBe('api-feature-a')
    expect(document.body.textContent).toContain('workspace.worktree.phase.failed')
    expect(document.querySelector('button[data-action="retry"]')).not.toBeNull()
    expect(document.querySelector('button[data-action="confirm"]')?.getAttribute('data-variant')).toBe('destructive')
  })

  test('shows relative worktree paths while retaining absolute titles before pull', () => {
    const pullPlan = { ...plan, operation: 'pull' as const, members: [{ ...plan.members[0]!, baseRef: undefined }] }
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="pull"
          initialBranch="feature/a"
          plan={pullPlan}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={async () => {}}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    const worktreePath = document.querySelector('span[title="/workspace/api-feature-a"]')
    expect(worktreePath?.textContent).toBe('api-feature-a')
    expect(worktreePath?.getAttribute('title')).toBe('/workspace/api-feature-a')
  })

  test('uses the physical workspace root for remote plan paths', () => {
    const remotePlan = {
      ...plan,
      rootId: 'ssh-config://prod/srv/workspace',
      operation: 'pull' as const,
      members: [
        {
          ...plan.members[0]!,
          repoId: 'ssh-config://prod/srv/workspace/api',
          baseRef: undefined,
          worktreePath: '/srv/workspace/api-feature-a',
        },
      ],
    }
    act(() =>
      root!.render(
        <WorkspaceWorktreeDialog
          open
          operation="pull"
          initialBranch="feature/a"
          plan={remotePlan}
          result={null}
          pending={false}
          error={null}
          onOpenChange={() => {}}
          onPreview={async () => {}}
          onConfirm={async () => null}
          onRetry={async () => null}
          onCancel={async () => {}}
        />,
      ),
    )

    const worktreePath = document.querySelector('span[title="/srv/workspace/api-feature-a"]')
    expect(worktreePath?.textContent).toBe('api-feature-a')
    expect(worktreePath?.getAttribute('title')).toBe('/srv/workspace/api-feature-a')
  })
})

function findLabel(text: string): HTMLLabelElement | undefined {
  return Array.from(document.querySelectorAll<HTMLLabelElement>('label')).find((label) => label.textContent === text)
}

function checkboxForLabel(text: string): HTMLButtonElement {
  const label = findLabel(text)
  const checkbox = label ? document.getElementById(label.htmlFor) : null
  if (!(checkbox instanceof HTMLButtonElement)) throw new Error(`Missing checkbox for ${text}`)
  return checkbox
}

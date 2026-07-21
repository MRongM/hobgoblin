// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchWorkspaceDialog } from '#/web/components/repo-workspace/BranchWorkspaceDialog.tsx'
import type { BranchWorkspacePlan, BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

describe('BranchWorkspaceDialog', () => {
  test('previews a repository subset with per-repository bases and auxiliary link/copy choices', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ onPreview })
    setInput('workspace.branch-workspace.branch', 'feature/auth')
    click('workspace.branch-workspace.repository-named')
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

  test('keeps existing extension members fixed and confirms every server-required approval', async () => {
    const onConfirm = vi.fn(async () => ({ ok: true as const, branchWorkspaceId: 'branch-1' }))
    renderDialog({ workspace: existingWorkspace() })

    expect(document.querySelector<HTMLInputElement>('[aria-label="workspace.branch-workspace.repository-named"]')?.disabled).toBe(true)
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
})

function renderDialog(overrides: Partial<React.ComponentProps<typeof BranchWorkspaceDialog>>) {
  act(() =>
    root.render(
      <BranchWorkspaceDialog
        open
        mode="create"
        repositories={[
          { name: 'api', available: true, branches: ['main', 'develop'], defaultBranch: 'main' },
          { name: 'web', available: true, branches: ['trunk'], defaultBranch: 'trunk' },
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

// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type {
  BranchWorkspaceDependencyCandidate,
  BranchWorkspaceDependencyPlan,
} from '#/shared/branch-workspace-dependencies.ts'
import { BranchWorkspaceDependencyDialog } from '#/web/components/repo-workspace/BranchWorkspaceDependencyDialog.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

const candidates: BranchWorkspaceDependencyCandidate[] = [
  {
    name: '.env',
    sourcePath: '/workspace/.env',
    sourceKind: 'file',
    targetPath: '/workspace/hobgoblin-feature/.env',
    targetKind: 'missing',
    outsideRoot: true,
  },
  {
    name: 'config',
    sourcePath: '/workspace/config',
    sourceKind: 'directory',
    targetPath: '/workspace/hobgoblin-feature/config',
    targetKind: 'directory',
    outsideRoot: false,
  },
]

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

describe('BranchWorkspaceDependencyDialog', () => {
  test('previews copy or symlink choices for missing and occupied targets', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ mode: 'add', onPreview })

    expect(document.querySelector('[data-materialization-item=".env"]')).not.toBeNull()
    expect(document.querySelector('[data-materialization-item="config"]')).not.toBeNull()
    click('[data-materialization-item="config"] [data-materialization-choice="symlink"]')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      entries: [{ name: 'config', mode: 'symlink' }],
    })
  })

  test('previews checked removals only for present targets', async () => {
    const onPreview = vi.fn(async () => true)
    renderDialog({ mode: 'remove', onPreview })

    expect(document.querySelector('[data-dependency-remove="config"]')).not.toBeNull()
    expect(document.querySelector('[data-dependency-remove=".env"]')).toBeNull()
    click('[data-dependency-remove="config"]')
    await clickAction('preview')

    expect(onPreview).toHaveBeenCalledWith({
      operation: 'remove',
      branchWorkspaceId: 'branch-1',
      names: ['config'],
    })
  })

  test('requires previewed approvals before confirming an add plan', async () => {
    const onConfirm = vi.fn(async () => ({
      ok: true as const,
      operation: 'add' as const,
      branchWorkspaceId: 'branch-1',
      completedNames: ['.env'],
    }))
    const onOpenChange = vi.fn()
    renderDialog({ mode: 'add', plan: addPlan(), onConfirm, onOpenChange })

    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm"]')
    expect(confirm?.disabled).toBe(true)
    click('[data-dependency-approval="outside-root-source"]')
    await clickAction('confirm')

    expect(onConfirm).toHaveBeenCalledWith(['outside-root-source'])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('uses destructive confirmation for removal and keeps failures visible', async () => {
    const onConfirm = vi.fn(async () => ({
      ok: false as const,
      message: 'remove failed',
      operation: 'remove' as const,
      branchWorkspaceId: 'branch-1',
      completedNames: [],
    }))
    const onOpenChange = vi.fn()
    const { rerender } = renderDialog({ mode: 'remove', plan: removePlan(), onConfirm, onOpenChange })

    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm"]')
    expect(confirm?.dataset.variant).toBe('destructive')
    await clickAction('confirm')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    rerender({ mode: 'remove', plan: removePlan(), error: 'remove failed', onConfirm, onOpenChange })
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('remove failed')
  })

  test('labels replacement previews and uses destructive confirmation', () => {
    renderDialog({ mode: 'add', plan: replacementAddPlan() })

    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm"]')
    expect(confirm?.dataset.variant).toBe('destructive')
    expect(document.body.textContent).toContain('workspace.branch-workspace.dependency.operation.replace')
    expect(confirm?.textContent).toBe('workspace.branch-workspace.dependency.add.replace-confirm')
  })
})

function renderDialog(
  overrides: Partial<Parameters<typeof BranchWorkspaceDependencyDialog>[0]> = {},
) {
  type Props = Parameters<typeof BranchWorkspaceDependencyDialog>[0]
  const base: Props = {
    open: true,
    mode: 'add' as const,
    branchWorkspaceId: 'branch-1',
    candidates,
    plan: null,
    result: null,
    pending: false,
    error: null,
    onOpenChange: vi.fn(),
    onPreview: vi.fn(async () => true),
    onConfirm: vi.fn(async () => null),
    onCancel: vi.fn(async () => undefined),
  }
  const render = (next: Partial<Props>) => {
    act(() => root.render(<BranchWorkspaceDependencyDialog {...base} {...overrides} {...next} />))
  }
  render({})
  return { rerender: render }
}

function addPlan(): BranchWorkspaceDependencyPlan {
  return {
    token: 'sha256:add',
    rootId: '/workspace',
    operation: 'add',
    branchWorkspaceId: 'branch-1',
    requiredApprovals: ['outside-root-source'],
    entries: [
      {
        name: '.env',
        mode: 'copy',
        sourcePath: '/workspace/.env',
        sourceKind: 'file',
        targetPath: '/workspace/hobgoblin-feature/.env',
        targetKind: 'missing',
        outsideRoot: true,
      },
    ],
  }
}

function replacementAddPlan(): BranchWorkspaceDependencyPlan {
  return {
    token: 'sha256:replace',
    rootId: '/workspace',
    operation: 'add',
    branchWorkspaceId: 'branch-1',
    requiredApprovals: [],
    entries: [
      {
        name: 'config',
        mode: 'symlink',
        sourcePath: '/workspace/config',
        sourceKind: 'directory',
        targetPath: '/workspace/hobgoblin-feature/config',
        targetKind: 'directory',
        targetFingerprint: 'fingerprint:config',
        outsideRoot: false,
      },
    ],
  }
}

function removePlan(): BranchWorkspaceDependencyPlan {
  return {
    token: 'sha256:remove',
    rootId: '/workspace',
    operation: 'remove',
    branchWorkspaceId: 'branch-1',
    requiredApprovals: [],
    entries: [
      {
        name: 'config',
        sourcePath: '/workspace/config',
        targetPath: '/workspace/hobgoblin-feature/config',
        targetKind: 'directory',
        fingerprint: 'fingerprint:config',
      },
    ],
  }
}

function click(selector: string): void {
  const target = document.querySelector<HTMLElement>(selector)
  if (!target) throw new Error(`Missing selector: ${selector}`)
  act(() => target.click())
}

async function clickAction(action: string): Promise<void> {
  await act(async () => {
    document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click()
    await Promise.resolve()
  })
}

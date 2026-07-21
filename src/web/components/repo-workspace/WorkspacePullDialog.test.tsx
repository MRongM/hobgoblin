// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorkspacePullPlan, WorkspacePullResult } from '#/shared/workspace-pull.ts'
import { WorkspacePullDialog } from '#/web/components/repo-workspace/WorkspacePullDialog.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

const plan: WorkspacePullPlan = {
  token: 'sha256:pull',
  rootId: '/workspace',
  members: [{ repoId: '/workspace/api', branch: 'main', worktreePath: '/workspace/api' }],
}

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

describe('WorkspacePullDialog', () => {
  test('shows one initial execute action and closes after success', async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn(async () => successResult())
    renderDialog({ onOpenChange, onConfirm })

    expect(document.querySelectorAll('[data-action="confirm-pull"]')).toHaveLength(1)
    await act(async () => document.querySelector<HTMLButtonElement>('[data-action="confirm-pull"]')?.click())

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('shows retry instead of a duplicate confirm action after a partial failure', () => {
    renderDialog({
      result: {
        ok: false,
        planToken: plan.token,
        members: [{ repoId: '/workspace/api', phase: 'failed', message: 'busy' }],
        message: 'busy',
      },
    })

    expect(document.querySelector('[data-action="confirm-pull"]')).toBeNull()
    expect(document.body.textContent).toContain('workspace.branch-workspace.retry')
  })

  test('aborts an active pull before closing', () => {
    const onCancel = vi.fn(async () => {})
    const onOpenChange = vi.fn()
    renderDialog({ pending: true, onCancel, onOpenChange })

    act(() => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')?.click())

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

function renderDialog(overrides: Partial<React.ComponentProps<typeof WorkspacePullDialog>>) {
  act(() =>
    root.render(
      <WorkspacePullDialog
        open
        plan={plan}
        result={null}
        pending={false}
        error={null}
        onOpenChange={() => {}}
        onConfirm={async () => null}
        onRetry={async () => null}
        onCancel={async () => {}}
        {...overrides}
      />,
    ),
  )
}

function successResult(): WorkspacePullResult {
  return {
    ok: true,
    planToken: plan.token,
    members: [{ repoId: '/workspace/api', phase: 'succeeded' }],
  }
}

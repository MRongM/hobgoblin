// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { BranchWorkspaceDeleteDialog } from '#/web/components/repo-workspace/BranchWorkspaceDeleteDialog.tsx'
import type { BranchWorkspaceSnapshot } from '#/shared/branch-workspaces.ts'

const mocks = vi.hoisted(() => ({ plan: vi.fn(), execute: vi.fn(), abort: vi.fn() }))
vi.mock('#/web/workspace-client.ts', () => ({
  planBranchWorkspace: mocks.plan,
  executeBranchWorkspace: mocks.execute,
  abortBranchWorkspace: mocks.abort,
}))
vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))
const item: BranchWorkspaceSnapshot = {
  id: 'folder',
  rootId: '/workspace',
  path: '/workspace/example',
  directoryName: 'example',
  branch: '',
  available: true,
  state: { kind: 'ready' },
  repositories: [],
  auxiliaryEntries: [],
  issues: [],
}
let root: Root
let container: HTMLDivElement
const onDeleted = vi.fn()
const onOpenChange = vi.fn()
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.plan.mockResolvedValue({
    ok: true,
    plan: {
      token: 'plan',
      path: item.path,
      requiredApprovals: ['unmanaged-content', 'delete-repository', 'close-terminals'],
    },
  })
  mocks.execute.mockResolvedValue({ ok: true, branchWorkspaceId: item.id })
  mocks.abort.mockResolvedValue({ ok: true })
  onDeleted.mockReset()
  onOpenChange.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <BranchWorkspaceDeleteDialog
        rootId={item.rootId}
        workspace={item}
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    ),
  )
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})
async function confirm() {
  await act(async () => document.querySelector<HTMLButtonElement>('[data-action="delete-workspace"]')!.click())
}
test('confirms the whole folder once without checkboxes and automatically supplies required approvals', async () => {
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1)
  expect(document.querySelector('[role="checkbox"], input')).toBeNull()
  expect(document.body.textContent).toContain(item.path)
  expect(mocks.plan).not.toHaveBeenCalled()
  await confirm()
  expect(mocks.plan).toHaveBeenCalledWith(
    item.rootId,
    { operation: 'remove', branchWorkspaceId: item.id, alsoDeleteBranch: false, alsoDeleteUpstream: false },
    expect.any(AbortSignal),
  )
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(item.rootId, {
    planToken: 'plan',
    approvals: ['unmanaged-content', 'delete-repository', 'close-terminals'],
  })
  expect(onDeleted).toHaveBeenCalledWith(item)
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
test('rebuilds a stale plan at the same path without another confirmation', async () => {
  mocks.execute.mockResolvedValueOnce({ ok: false, message: 'workspace.branch-workspace.plan-stale' })
  await confirm()
  expect(mocks.plan).toHaveBeenCalledTimes(2)
  expect(mocks.execute).toHaveBeenCalledTimes(2)
  expect(onDeleted).toHaveBeenCalledTimes(1)
})
test('keeps a failure visible without closing or reporting success', async () => {
  mocks.execute.mockResolvedValueOnce({ ok: false, message: 'workspace.branch-workspace.operation-failed' })
  await confirm()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('workspace.branch-workspace.operation-failed')
  expect(onDeleted).not.toHaveBeenCalled()
  expect(onOpenChange).not.toHaveBeenCalled()
})
test('never deletes a path that changed after the user opened the confirmation', async () => {
  mocks.plan.mockResolvedValueOnce({
    ok: true,
    plan: { token: 'new', path: '/workspace/renamed', requiredApprovals: [] },
  })
  await confirm()
  expect(mocks.execute).not.toHaveBeenCalled()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('workspace.branch-workspace.plan-stale')
})
test('cancels a running deletion without opening another confirmation', async () => {
  let finish!: (value: unknown) => void
  mocks.execute.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await confirm()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!.click())
  expect(mocks.abort).toHaveBeenCalledExactlyOnceWith(item.rootId)
  expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1)
  await act(async () => finish({ ok: false, message: 'cancelled' }))
  expect(onDeleted).not.toHaveBeenCalled()
})

test('keeps retry disabled until the cancellation request has settled', async () => {
  let finishAbort!: () => void
  mocks.abort.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishAbort = resolve
      }),
  )
  mocks.plan.mockImplementationOnce(
    (_rootId: string, _request: unknown, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      }),
  )
  await confirm()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!.click())
  expect(document.querySelector<HTMLButtonElement>('[data-action="delete-workspace"]')?.disabled).toBe(true)
  await act(async () => finishAbort())
  expect(document.querySelector<HTMLButtonElement>('[data-action="delete-workspace"]')?.disabled).toBe(false)
})

test('waits for an outstanding cancellation before closing even when deletion succeeds', async () => {
  let finishExecution!: (value: unknown) => void
  let finishAbort!: () => void
  mocks.execute.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishExecution = resolve
      }),
  )
  mocks.abort.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishAbort = resolve
      }),
  )
  await confirm()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!.click())
  await act(async () => finishExecution({ ok: true, branchWorkspaceId: item.id }))
  expect(onDeleted).not.toHaveBeenCalled()
  expect(onOpenChange).not.toHaveBeenCalled()
  await act(async () => finishAbort())
  expect(onDeleted).toHaveBeenCalledWith(item)
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

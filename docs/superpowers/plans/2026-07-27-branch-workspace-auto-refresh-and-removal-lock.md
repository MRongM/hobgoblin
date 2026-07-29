# Branch Workspace Auto Refresh and Removal Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh a newly drifted branch workspace once, and keep confirmed branch-workspace removal in its progress dialog until execution settles.

**Architecture:** Keep drift detection in `WorkspaceRepositoryRail`, where successful branch-workspace query snapshots are already projected, and remember attempted drift IDs in a component-local ref. Keep removal locking inside `BranchWorkspaceDialog` by deriving a local interaction guard from `mode`, `plan`, and `pending`; reuse the existing server execution, invalidation, and progress projection unchanged.

**Tech Stack:** TypeScript 6 strip-only mode, React 19, TanStack Query 5, Radix Dialog, Vitest 4.

## Global Constraints

- Do not execute repair automatically; only call the existing root-scoped `branchQuery.refresh()`.
- Do not clear `localStorage`, `sessionStorage`, or the restorable repository cache.
- Trigger automatic refresh only for `needs-action / repair / drift`, not creation interruption or continuation states.
- Do not add polling, retries, server fields, routes, dependencies, or global dialog behavior.
- Lock only confirmed or retried whole-branch-workspace removal while `pending`; other lifecycle modes retain existing cancellation behavior.
- Keep repo-alias imports with explicit `.ts` / `.tsx` extensions and avoid unsupported TypeScript runtime syntax.
- Do not create Git commits or branches because the user did not request them.

---

### Task 1: Refresh newly drifted branch workspaces once

**Files:**

- Modify: `src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx`
- Test: `src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx`

**Interfaces:**

- Consumes: `branchQuery.data: BranchWorkspaceReadResult | undefined` and `branchQuery.refresh(): Promise<BranchWorkspaceReadResult>`.
- Produces: component-local `autoRefreshedDriftIds: React.MutableRefObject<Set<string>>` behavior; no exported API.

- [x] **Step 1: Add failing tests for one refresh per drift episode**

Add these tests beside the existing branch-workspace reload tests. They mutate the hoisted query fixture, rerender the same Rail, and restore the original fixture before returning:

```tsx
test('refreshes a newly drifted branch workspace once per drift episode', async () => {
  const originalItems = branchWorkspaceState.items
  const drifted = {
    ...originalItems[0]!,
    state: { kind: 'needs-action' as const, action: 'repair' as const, reason: 'drift' as const },
  }
  try {
    branchWorkspaceState.items = [drifted, ...originalItems.slice(1)]
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)

    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)

    branchWorkspaceState.items = originalItems
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())

    branchWorkspaceState.items = [drifted, ...originalItems.slice(1)]
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(2)
  } finally {
    branchWorkspaceState.items = originalItems
  }
})

test('coalesces new drift and ignores other repair lifecycle states', async () => {
  const originalItems = branchWorkspaceState.items
  try {
    branchWorkspaceState.items = originalItems.map((item) => ({
      ...item,
      state: { kind: 'needs-action' as const, action: 'repair' as const, reason: 'drift' as const },
    }))
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)

    branchWorkspaceState.refresh.mockClear()
    branchWorkspaceState.items = [
      {
        ...originalItems[0]!,
        state: {
          kind: 'needs-action' as const,
          action: 'repair' as const,
          reason: 'creation-interrupted' as const,
        },
      },
      { ...originalItems[1]!, state: { kind: 'needs-action' as const, action: 'continue-delete' as const } },
    ]
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    expect(branchWorkspaceState.refresh).not.toHaveBeenCalled()
  } finally {
    branchWorkspaceState.items = originalItems
  }
})

test('does not loop when automatic drift refresh rejects', async () => {
  const originalItems = branchWorkspaceState.items
  branchWorkspaceState.refresh.mockRejectedValue(new Error('temporary read failure'))
  try {
    branchWorkspaceState.items = [
      {
        ...originalItems[0]!,
        state: { kind: 'needs-action', action: 'repair', reason: 'drift' },
      },
      ...originalItems.slice(1),
    ]
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    renderRail({ currentRepoId: ROOT })
    await act(async () => Promise.resolve())
    expect(branchWorkspaceState.refresh).toHaveBeenCalledTimes(1)
  } finally {
    branchWorkspaceState.items = originalItems
  }
})
```

- [x] **Step 2: Run the Rail test and verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: FAIL because rendering a drifted snapshot does not call `branchWorkspaceState.refresh`.

- [x] **Step 3: Implement the minimal drift observation effect**

Add `useRef` to the React import, create the ref beside the other local branch-workspace state, and add this effect after the existing active-member reconciliation effect:

```tsx
const autoRefreshedDriftIds = useRef<Set<string>>(new Set())

useEffect(() => {
  if (!branchQuery.data?.ok) return
  const driftedIds = new Set(
    branchItems.flatMap((item) =>
      item.state.kind === 'needs-action' && item.state.action === 'repair' && item.state.reason === 'drift'
        ? [item.id]
        : [],
    ),
  )
  const attemptedIds = autoRefreshedDriftIds.current
  for (const id of attemptedIds) {
    if (!driftedIds.has(id)) attemptedIds.delete(id)
  }
  const newIds = [...driftedIds].filter((id) => !attemptedIds.has(id))
  if (newIds.length === 0) return
  for (const id of newIds) attemptedIds.add(id)
  void branchQuery.refresh().catch(() => undefined)
}, [branchItems, branchQuery.data, branchQuery.refresh])
```

Do not route this through the error-row `branchReloadPending` state: the automatic refresh is silent, and the attempted-ID ref is the loop guard.

- [x] **Step 4: Run the Rail test and verify GREEN**

Run:

```sh
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx
```

Expected: PASS, including the existing manual remote-read reload and repair-dialog cache refresh coverage.

---

### Task 2: Keep confirmed removal inside its progress dialog

**Files:**

- Modify: `src/web/components/repo-workspace/BranchWorkspaceDialog.tsx`
- Test: `src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx`

**Interfaces:**

- Consumes: existing `mode`, `plan`, `pending`, `result`, `onOpenChange`, and `onCancel` props.
- Produces: local `removalExecutionLocked: boolean`; no server or shared type changes.

- [x] **Step 1: Add failing removal-lock tests**

Add these tests near the existing live removal progress test:

```tsx
test('keeps confirmed removal locked in the progress dialog while execution is pending', () => {
  const onOpenChange = vi.fn()
  const onCancel = vi.fn(async () => {})
  renderDialog({
    mode: 'remove',
    workspace: existingWorkspace(),
    progressWorkspace: existingWorkspace(),
    plan: removalPlan(),
    pending: true,
    onOpenChange,
    onCancel,
  })

  const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === 'dialog.cancel',
  )
  expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull()
  expect(cancel?.disabled).toBe(true)
  expect(document.querySelector('[data-branch-workspace-operation-progress]')).not.toBeNull()

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(onCancel).not.toHaveBeenCalled()
})

test('unlocks a failed removal so it can be retried or closed', async () => {
  const onOpenChange = vi.fn()
  const onCancel = vi.fn(async () => {})
  renderDialog({
    mode: 'remove',
    workspace: existingWorkspace(),
    plan: removalPlan(),
    result: { ok: false, message: 'workspace.branch-workspace.execute-failed' },
    error: 'workspace.branch-workspace.execute-failed',
    pending: false,
    onOpenChange,
    onCancel,
  })

  const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === 'dialog.cancel',
  )
  expect(document.querySelector('[data-slot="dialog-close"]')).not.toBeNull()
  expect(cancel?.disabled).toBe(false)
  await act(async () => cancel?.click())
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(onCancel).not.toHaveBeenCalled()
})

test('closes removal only after its successful execution promise resolves', async () => {
  const onOpenChange = vi.fn()
  let finishRemoval: ((result: { ok: true; branchWorkspaceId: string }) => void) | undefined
  const onConfirm = vi.fn(
    () =>
      new Promise<{ ok: true; branchWorkspaceId: string }>((resolve) => {
        finishRemoval = resolve
      }),
  )
  renderDialog({
    mode: 'remove',
    workspace: existingWorkspace(),
    plan: { ...removalPlan(), requiredApprovals: [] },
    onOpenChange,
    onConfirm,
  })

  let confirmation: Promise<void> | undefined
  act(() => {
    confirmation = clickAction('confirm')
  })
  expect(onOpenChange).not.toHaveBeenCalled()

  await act(async () => {
    finishRemoval?.({ ok: true, branchWorkspaceId: 'branch-1' })
    await confirmation
  })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
```

If the nested `act()` around `clickAction()` warns, replace that small block with a direct button click and retain the deferred promise assertion:

```tsx
let confirmation: Promise<void> | undefined
act(() => {
  confirmation = Promise.resolve(document.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click()).then(
    () => undefined,
  )
})
```

- [x] **Step 2: Run the dialog test and verify RED**

Run:

```sh
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: FAIL because the top close control and Cancel button remain available during pending removal.

- [x] **Step 3: Implement the removal execution guard**

Derive the lock before `close`, guard every dismissal path, and leave successful `run()` closure unchanged:

```tsx
const removalExecutionLocked = mode === 'remove' && plan !== null && pending

const close = () => {
  if (removalExecutionLocked) return
  if (pending) void onCancel()
  onOpenChange(false)
}
```

Update the controlled dialog and content:

```tsx
<Dialog
  open={open}
  onOpenChange={(next) => {
    if (!next && removalExecutionLocked) return
    if (next) onOpenChange(true)
    else close()
  }}
>
  <DialogContent
    className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
    showCloseButton={!removalExecutionLocked}
    onEscapeKeyDown={(event) => {
      if (removalExecutionLocked) event.preventDefault()
    }}
    onPointerDownOutside={(event) => {
      if (removalExecutionLocked) event.preventDefault()
    }}
  >
```

Disable the existing Cancel button only during locked removal execution:

```tsx
<Button type="button" variant="outline" disabled={removalExecutionLocked} onClick={close}>
  {t('dialog.cancel')}
</Button>
```

Do not change `run`, the server execute/abort endpoints, invalidation, or the progress projection. `run` already awaits `onConfirm` and closes only after an `{ ok: true }` result.

- [x] **Step 4: Run the dialog test and verify GREEN**

Run:

```sh
bun run test src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: PASS with removal locked while pending, failure dismissible, and success closing only after resolution.

---

### Task 3: Verify the combined behavior and architecture

**Files:**

- Verify: `CONTEXT.md`
- Verify: `docs/superpowers/specs/2026-07-27-branch-workspace-auto-refresh-and-removal-lock-design.md`
- Verify: Task 1 and Task 2 source and test files

**Interfaces:**

- Consumes: the renderer-only behaviors from Tasks 1 and 2.
- Produces: verified feature behavior without server, shared protocol, dependency, or global dialog changes.

- [x] **Step 1: Run focused regression tests**

Run:

```sh
bun run test src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx src/web/components/repo-workspace/branch-workspace-operation-progress.test.ts src/web/branch-workspace-queries.test.ts
```

Expected: PASS with no failed tests or React `act()` warnings.

- [x] **Step 2: Run architecture and type verification**

Run:

```sh
bun run check:architecture
bun run typecheck
```

Expected: both commands exit 0.

- [x] **Step 3: Run the complete test suite**

Run:

```sh
bun run test
```

Expected: all tests pass with exit code 0.

- [x] **Step 4: Inspect the final change scope**

Run:

```sh
git diff --check
git diff -- CONTEXT.md docs/superpowers/specs/2026-07-27-branch-workspace-auto-refresh-and-removal-lock-design.md docs/superpowers/plans/2026-07-27-branch-workspace-auto-refresh-and-removal-lock.md src/web/components/repo-workspace/WorkspaceRepositoryRail.tsx src/web/components/repo-workspace/WorkspaceRepositoryRail.test.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.tsx src/web/components/repo-workspace/BranchWorkspaceDialog.test.tsx
```

Expected: only the agreed glossary/spec/plan, one Rail-local auto-refresh effect, one dialog-local removal guard, and their tests; no server, shared protocol, package, or unrelated changes.

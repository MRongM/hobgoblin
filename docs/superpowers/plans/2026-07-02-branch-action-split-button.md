# Branch Action Split Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a branch action split button whose left side executes a per-branch remembered quick action, defaulting to Edit, while the right side opens the existing action menu.

**Architecture:** Keep branch action generation in `useBranchActionItems`; add quick-action memory only in the renderer presentation layer. `BranchActionsDropdown` becomes the split-button presenter and remembers a `BranchActionItem['id']` by `repoId + "\0" + branchName`, with destructive items excluded and unavailable remembered actions falling back to Edit.

**Tech Stack:** React 19, TypeScript strip-only mode, Radix dropdown primitives, existing shadcn-style `Button`/`AsyncButton`, Vitest with jsdom.

---

## File Structure

- Modify `src/web/components/BranchActionsMenu.tsx`
  - Owns split-button UI, quick-action resolution, renderer-memory map, dropdown execution, and menu item rendering.
- Modify `src/web/components/BranchActionControls.tsx`
  - Threads optional `repoId` and `branchName` into dropdown-mode action controls.
- Modify `src/web/components/branch-list/BranchRow.tsx`
  - Passes `repo.id` and `branch.name` to row action dropdowns.
- Modify `src/web/components/repo-toolbar/RepoToolbar.tsx`
  - Passes `repoId` and focused `branch.name` to focus-mode action controls.
- Modify `src/web/components/topbar/TopbarRepoControls.tsx`
  - Passes `repoId` and focused `branch.name` to topbar focus-mode action controls.
- Create `src/web/components/BranchActionsMenu.test.tsx`
  - Direct unit coverage for split-button behavior.
- Modify `src/web/components/repo-toolbar/RepoToolbar.test.tsx`
  - Update focus-mode assertion from the old single `action.menu` button to the split control.

Project policy override: do not run `git commit` unless the user explicitly asks. This plan intentionally omits commit steps despite the generic writing-plans template.

---

### Task 1: Add Failing Split-Button Tests

**Files:**

- Create: `src/web/components/BranchActionsMenu.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/web/components/BranchActionsMenu.test.tsx` with this content:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchActionsDropdown, type BranchActionItem } from '#/web/components/BranchActionsMenu.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => {
    if (key === 'action.menu') return 'Actions'
    return key
  },
}))

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  document.body.innerHTML = ''
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

function item(
  id: BranchActionItem['id'],
  label: string,
  onSelect = vi.fn(),
  overrides: Partial<BranchActionItem> = {},
): BranchActionItem {
  return {
    id,
    label,
    title: label,
    ariaLabel: label,
    disabled: false,
    visible: true,
    icon: <span data-testid={`${id}-icon`} />,
    onSelect,
    ...overrides,
  }
}

function renderDropdown({
  repoId = '/repo',
  branchName = 'feature/a',
  open = true,
  editor = item('editor', 'Edit'),
  terminal = item('terminal', 'Terminal'),
  destructive = item('deleteBranch', 'Delete branch', vi.fn(), { destructive: true }),
}: {
  repoId?: string
  branchName?: string
  open?: boolean
  editor?: BranchActionItem
  terminal?: BranchActionItem
  destructive?: BranchActionItem
} = {}) {
  act(() => {
    root!.render(
      <BranchActionsDropdown
        repoId={repoId}
        branchName={branchName}
        patchItems={[]}
        externalItems={[editor, terminal]}
        mainItems={[]}
        destructiveItems={[destructive]}
        open={open}
      />,
    )
  })
}

function button(label: string): HTMLButtonElement {
  const node = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(node).not.toBeNull()
  return node!
}

function menuItem(label: string): HTMLElement {
  const node = Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]')).find(
    (itemNode) => itemNode.textContent?.includes(label),
  )
  expect(node).not.toBeNull()
  return node!
}

describe('BranchActionsDropdown split button', () => {
  test('renders edit as the default quick action and runs it from the left button', () => {
    const onEdit = vi.fn()

    renderDropdown({ repoId: '/repo/default', branchName: 'feature/default', editor: item('editor', 'Edit', onEdit) })

    expect(button('Edit').textContent).toContain('Edit')

    act(() => {
      button('Edit').click()
    })

    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  test('remembers a non-destructive menu action per repo and branch', () => {
    const terminalA = item('terminal', 'Terminal A')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/a',
      terminal: terminalA,
    })

    act(() => {
      menuItem('Terminal A').click()
    })

    expect(button('Terminal A').textContent).toContain('Terminal A')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/b',
      terminal: item('terminal', 'Terminal B'),
    })

    expect(button('Edit').textContent).toContain('Edit')

    renderDropdown({
      repoId: '/repo/memory',
      branchName: 'feature/a',
      terminal: terminalA,
    })

    expect(button('Terminal A').textContent).toContain('Terminal A')
  })

  test('does not remember destructive menu actions', () => {
    const onDelete = vi.fn()

    renderDropdown({
      repoId: '/repo/destructive',
      branchName: 'feature/destructive',
      destructive: item('deleteBranch', 'Delete branch', onDelete, { destructive: true }),
    })

    act(() => {
      menuItem('Delete branch').click()
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(button('Edit').textContent).toContain('Edit')
  })

  test('falls back to edit when the remembered action becomes disabled', () => {
    renderDropdown({
      repoId: '/repo/fallback',
      branchName: 'feature/fallback',
      terminal: item('terminal', 'Terminal'),
    })

    act(() => {
      menuItem('Terminal').click()
    })

    renderDropdown({
      repoId: '/repo/fallback',
      branchName: 'feature/fallback',
      terminal: item('terminal', 'Terminal', vi.fn(), { disabled: true }),
    })

    expect(button('Edit').textContent).toContain('Edit')
  })

  test('disables the edit quick action when edit is unavailable', () => {
    renderDropdown({
      repoId: '/repo/disabled-edit',
      branchName: 'feature/disabled-edit',
      editor: item('editor', 'Edit', vi.fn(), { disabled: true }),
    })

    expect(button('Edit').disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused new test and verify it fails**

Run:

```sh
bun run test -- src/web/components/BranchActionsMenu.test.tsx
```

Expected: fail before implementation because `BranchActionsDropdown` does not render an Edit quick button and does not accept or use `repoId`/`branchName` quick-action memory.

---

### Task 2: Implement Quick-Action Resolution And Split Button

**Files:**

- Modify: `src/web/components/BranchActionsMenu.tsx`

- [ ] **Step 1: Update imports**

Change the first import from:

```ts
import { Loader2, MoreHorizontal } from 'lucide-react'
```

to:

```ts
import { ChevronDown, Loader2 } from 'lucide-react'
```

Add these imports near the existing component imports:

```ts
import { AsyncButton } from '#/web/components/AsyncButton.tsx'
import { cn } from '#/web/lib/cn.ts'
```

- [ ] **Step 2: Re-export `BranchActionItem` for the new component test**

Change the existing type-only import:

```ts
import {
  useBranchActionItems,
  type BranchActionItem,
  type BranchActionItemGroups,
} from '#/web/hooks/useBranchActionItems.ts'
```

to:

```ts
import {
  useBranchActionItems,
  type BranchActionItem,
  type BranchActionItemGroups,
} from '#/web/hooks/useBranchActionItems.ts'

export type { BranchActionItem } from '#/web/hooks/useBranchActionItems.ts'
```

- [ ] **Step 3: Add quick-action memory helpers above `BranchActionsDropdown`**

Insert this code above `export function BranchActionsDropdown`:

```ts
const DEFAULT_QUICK_ACTION_ID: BranchActionItem['id'] = 'editor'
const rememberedQuickActions = new Map<string, BranchActionItem['id']>()

function branchQuickActionKey(repoId: string, branchName: string): string {
  return `${repoId}\0${branchName}`
}

function findVisibleNonDestructiveAction(
  items: BranchActionItem[],
  id: BranchActionItem['id'],
): BranchActionItem | null {
  return items.find((item) => item.id === id && item.visible && !item.destructive) ?? null
}

function resolveQuickAction(
  items: BranchActionItem[],
  rememberedId: BranchActionItem['id'] | undefined,
): BranchActionItem | null {
  const fallback = findVisibleNonDestructiveAction(items, DEFAULT_QUICK_ACTION_ID)
  const remembered = rememberedId ? findVisibleNonDestructiveAction(items, rememberedId) : null
  if (remembered && !remembered.disabled) return remembered
  return fallback
}
```

- [ ] **Step 4: Extend `BranchActionsDropdown` props**

Change the function signature from:

```ts
export function BranchActionsDropdown({
  patchItems,
  mainItems,
  externalItems,
  destructiveItems,
  open,
  onOpenChange,
}: Pick<BranchActionItemGroups, 'patchItems' | 'mainItems' | 'externalItems' | 'destructiveItems'> & {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
```

to:

```ts
export function BranchActionsDropdown({
  repoId,
  branchName,
  patchItems,
  mainItems,
  externalItems,
  destructiveItems,
  open,
  onOpenChange,
}: Pick<BranchActionItemGroups, 'patchItems' | 'mainItems' | 'externalItems' | 'destructiveItems'> & {
  repoId?: string
  branchName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
```

- [ ] **Step 5: Add quick-action lookup inside `BranchActionsDropdown`**

After `const busyAction = pendingAction ?? visibleItems.find((item) => item.busy)?.id ?? null`, add:

```ts
const memoryKey = repoId && branchName ? branchQuickActionKey(repoId, branchName) : null
const rememberedActionId = memoryKey ? rememberedQuickActions.get(memoryKey) : undefined
const quickAction = resolveQuickAction(visibleItems, rememberedActionId)
const quickActionDisabled = !quickAction || branchActionMenuItemDisabled(quickAction, busyAction)
```

- [ ] **Step 6: Update menu item execution to remember safe actions**

Replace the current `runItem` body:

```ts
function runItem(item: BranchActionItem) {
  if (branchActionMenuItemDisabled(item, busyAction)) return
  void run(item.id, item.onSelect)
}
```

with:

```ts
function runItem(item: BranchActionItem) {
  if (branchActionMenuItemDisabled(item, busyAction)) return
  if (memoryKey && !item.destructive) rememberedQuickActions.set(memoryKey, item.id)
  void run(item.id, item.onSelect)
}

function runQuickAction() {
  if (!quickAction || quickActionDisabled) return
  void run(quickAction.id, quickAction.onSelect)
}
```

- [ ] **Step 7: Replace the single trigger button with a split trigger**

Replace the current `DropdownMenuTrigger` block:

```tsx
<DropdownMenuTrigger asChild>
  <Button
    variant="ghost"
    size="sm"
    title={t('action.menu')}
    aria-label={t('action.menu')}
    aria-busy={busyAction ? true : undefined}
    className="data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
    onClick={(e) => e.stopPropagation()}
    onDoubleClick={(e) => e.stopPropagation()}
  >
    {busyAction ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
  </Button>
</DropdownMenuTrigger>
```

with:

```tsx
<div
  className="inline-flex items-center"
  onClick={(e) => e.stopPropagation()}
  onDoubleClick={(e) => e.stopPropagation()}
>
  <AsyncButton
    variant="ghost"
    size="sm"
    loading={quickAction?.busy}
    disabled={quickActionDisabled}
    onClick={runQuickAction}
    title={quickAction?.title ?? quickAction?.label ?? t('action.menu')}
    aria-label={quickAction?.ariaLabel ?? quickAction?.title ?? quickAction?.label ?? t('action.menu')}
    className={cn(
      'rounded-r-none pr-2',
      quickAction?.destructive && 'text-danger hover:bg-danger-surface hover:text-danger',
    )}
  >
    {({ busy }) => (
      <>
        {busy ? <Loader2 className="size-4 animate-spin" /> : quickAction?.icon}
        {quickAction?.label ?? t('action.menu')}
      </>
    )}
  </AsyncButton>
  <DropdownMenuTrigger asChild>
    <Button
      variant="ghost"
      size="icon-sm"
      title={t('action.menu')}
      aria-label={t('action.menu')}
      aria-busy={busyAction ? true : undefined}
      className="rounded-l-none px-1 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
    >
      {busyAction ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-3" />}
    </Button>
  </DropdownMenuTrigger>
</div>
```

- [ ] **Step 8: Run the new focused test**

Run:

```sh
bun run test -- src/web/components/BranchActionsMenu.test.tsx
```

Expected: the new component tests pass, but repository-wide typecheck may still fail until call sites pass `repoId` and `branchName`.

---

### Task 3: Thread Branch Identity Through Existing Call Sites

**Files:**

- Modify: `src/web/components/BranchActionsMenu.tsx`
- Modify: `src/web/components/BranchActionControls.tsx`
- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/repo-toolbar/RepoToolbar.tsx`
- Modify: `src/web/components/topbar/TopbarRepoControls.tsx`

- [ ] **Step 1: Pass identity from `BranchActionsMenu`**

In `src/web/components/BranchActionsMenu.tsx`, update the `BranchActionsDropdown` call inside `BranchActionsMenu` from:

```tsx
<BranchActionsDropdown
  patchItems={patchItems}
  mainItems={mainItems}
  externalItems={externalItems}
  destructiveItems={destructiveItems}
  open={open}
  onOpenChange={onOpenChange}
/>
```

to:

```tsx
<BranchActionsDropdown
  repoId={repo.id}
  branchName={branch.name}
  patchItems={patchItems}
  mainItems={mainItems}
  externalItems={externalItems}
  destructiveItems={destructiveItems}
  open={open}
  onOpenChange={onOpenChange}
/>
```

- [ ] **Step 2: Extend `BranchActionControls` props and internal forwarding**

In `src/web/components/BranchActionControls.tsx`, change the props interface from:

```ts
interface BranchActionControlsProps {
  actions: BranchActionItemGroups
  variant?: BranchActionControlsVariant
  iconOnly?: boolean
}
```

to:

```ts
interface BranchActionControlsProps {
  actions: BranchActionItemGroups
  variant?: BranchActionControlsVariant
  iconOnly?: boolean
  repoId?: string
  branchName?: string
}
```

Change the component signature from:

```ts
export function BranchActionControls({ actions, variant = 'bar', iconOnly = false }: BranchActionControlsProps) {
```

to:

```ts
export function BranchActionControls({
  actions,
  variant = 'bar',
  iconOnly = false,
  repoId,
  branchName,
}: BranchActionControlsProps) {
```

In the `variant === 'menu'` branch, add identity props:

```tsx
<BranchActionsDropdown
  repoId={repoId}
  branchName={branchName}
  patchItems={patchItems}
  mainItems={mainItems}
  externalItems={externalItems}
  destructiveItems={destructiveItems}
/>
```

In the `variant === 'auto'` branch, pass identity into `BranchActionAuto`:

```tsx
<BranchActionAuto
  repoId={repoId}
  branchName={branchName}
  visibleItems={visibleItems}
  patchItems={patchItems}
  mainItems={mainItems}
  externalItems={externalItems}
  destructiveItems={destructiveItems}
/>
```

Update `BranchActionAuto` parameters to include `repoId?: string` and `branchName?: string`, then pass them into its collapsed `BranchActionsDropdown`.

- [ ] **Step 3: Pass identity from branch rows**

In `src/web/components/branch-list/BranchRow.tsx`, update the row dropdown from:

```tsx
<BranchActionsDropdown
  patchItems={actions.patchItems}
  mainItems={actions.mainItems}
  externalItems={actions.externalItems}
  destructiveItems={actions.destructiveItems}
  open={actionMenuOpen}
  onOpenChange={onActionMenuOpenChange}
/>
```

to:

```tsx
<BranchActionsDropdown
  repoId={repo.id}
  branchName={branch.name}
  patchItems={actions.patchItems}
  mainItems={actions.mainItems}
  externalItems={actions.externalItems}
  destructiveItems={actions.destructiveItems}
  open={actionMenuOpen}
  onOpenChange={onActionMenuOpenChange}
/>
```

- [ ] **Step 4: Pass identity from repo toolbar focus actions**

In `src/web/components/repo-toolbar/RepoToolbar.tsx`, update:

```tsx
<BranchActionControls actions={actions} variant="menu" />
```

to:

```tsx
<BranchActionControls actions={actions} variant="menu" repoId={repoId} branchName={branch.name} />
```

- [ ] **Step 5: Pass identity from topbar focus actions**

In `src/web/components/topbar/TopbarRepoControls.tsx`, update:

```tsx
<BranchActionControls actions={actions} variant="menu" />
```

to:

```tsx
<BranchActionControls actions={actions} variant="menu" repoId={repoId} branchName={branch.name} />
```

- [ ] **Step 6: Run focused component tests**

Run:

```sh
bun run test -- src/web/components/BranchActionsMenu.test.tsx src/web/components/branch-list/BranchRow.test.tsx
```

Expected: pass.

---

### Task 4: Update Toolbar Test Expectations

**Files:**

- Modify: `src/web/components/repo-toolbar/RepoToolbar.test.tsx`

- [ ] **Step 1: Update focus-mode assertions**

In test `shows focus-mode branch switcher and branch action menu`, replace:

```ts
expect(container?.querySelector('button[aria-label="action.menu"]')).not.toBeNull()
```

with:

```ts
expect(container?.querySelector('button[aria-label="worktrees.open-in-editor-label"]')).not.toBeNull()
expect(container?.querySelector('button[aria-label="action.menu"]')).not.toBeNull()
```

If the test i18n mock resolves labels differently after implementation, use the exact rendered aria-label from the mocked `useT` behavior in that file. Do not loosen the assertion to only check button count.

- [ ] **Step 2: Run toolbar tests**

Run:

```sh
bun run test -- src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected: pass.

---

### Task 5: Final Verification

**Files:**

- Verify only; no new file edits expected.

- [ ] **Step 1: Run focused UI tests**

Run:

```sh
bun run test -- src/web/components/BranchActionsMenu.test.tsx src/web/components/branch-list/BranchRow.test.tsx src/web/components/repo-toolbar/RepoToolbar.test.tsx
```

Expected: all listed test files pass.

- [ ] **Step 2: Run typecheck**

Run:

```sh
bun run typecheck
```

Expected: pass with no TypeScript errors.

- [ ] **Step 3: Run architecture guard**

Run:

```sh
bun run check:architecture
```

Expected: pass. This feature should stay inside `src/web/**` and must not introduce `src/main` or `src/server` imports.

- [ ] **Step 4: Inspect git status**

Run:

```sh
git status --short
```

Expected changed files:

```text
 M src/web/components/BranchActionControls.tsx
 M src/web/components/BranchActionsMenu.tsx
 M src/web/components/branch-list/BranchRow.tsx
 M src/web/components/repo-toolbar/RepoToolbar.tsx
 M src/web/components/repo-toolbar/RepoToolbar.test.tsx
 M src/web/components/topbar/TopbarRepoControls.tsx
?? src/web/components/BranchActionsMenu.test.tsx
```

The already-created superpowers design and plan docs may also appear. Do not revert unrelated user files.

---

## Self-Review

- Spec coverage: the plan covers the split layout, default Edit quick action, per repo/branch memory, non-destructive-only memory, unavailable-action fallback, disabled Edit fallback, existing menu preservation, and verification.
- Completion scan: no unfinished text is present. The only conditional instruction is for test i18n label matching and includes a concrete fallback rule.
- Type consistency: plan uses existing `BranchActionItem['id']`, `repoId`, `branchName`, `BranchActionsDropdown`, `BranchActionControls`, and existing action group names consistently.

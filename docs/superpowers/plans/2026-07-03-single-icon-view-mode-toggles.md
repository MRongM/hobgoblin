# Single Icon View Mode Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the branch view, Changes file view, and History file view two-button switchers with single icon buttons that cycle between their existing modes.

**Architecture:** Keep the existing control component APIs and state ownership. Convert `BranchViewModeControl` and `FileListViewModeControl` from two-item `ToggleGroup`s to icon-only `Button`s that compute the next mode locally and call the existing `onChange` callback.

**Tech Stack:** TypeScript in Node strip-only mode, React, lucide-react, shared shadcn-style `Button`, project `Tip`, Vitest/jsdom.

---

## Repository Constraints

- Do not use TypeScript enums, runtime namespaces, parameter properties, or import aliases.
- Use repo-alias imports with explicit `.ts` / `.tsx` extensions.
- Do not create re-export shims.
- Do not run or plan version-control commits because project instructions explicitly forbid planning or executing commits unless the user asks.
- Before editing `src/web/components/repo-workspace/ProjectHistoryPanel.tsx` or `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`, re-read the current diff because those files already have unrelated uncommitted changes.
- Keep scope limited to item 3 from the original request. Do not add the file-area bottom status/action bar and do not move workspace layout or Settings controls.

## File Structure

- Create `src/web/components/repo-toolbar/BranchViewModeControl.test.tsx`: focused jsdom tests for the branch single-icon cycle button and disabled behavior.
- Create `src/web/components/FileListViewModeControl.test.tsx`: focused jsdom tests for the file list/tree single-icon cycle button.
- Modify `src/web/components/repo-toolbar/BranchViewModeControl.tsx`: replace `ToggleGroup` rendering with a single `Button` wrapped in `Tip`; keep the existing props.
- Modify `src/web/components/FileListViewModeControl.tsx`: replace `ToggleGroup` rendering with a single `Button` wrapped in `Tip`; keep the existing props and `FileListViewToolbar`.
- Modify `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`: update branch toolbar expectations from two branch filter buttons to one cycle button.
- Modify `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`: update action-bar expectations from two file view buttons to one cycle button.
- Modify `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`: update detail-toolbar expectations from two file view buttons to one cycle button.

## Task 1: Branch View Single-Icon Control Tests

**Files:**
- Create: `src/web/components/repo-toolbar/BranchViewModeControl.test.tsx`
- Test: `src/web/components/repo-toolbar/BranchViewModeControl.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/web/components/repo-toolbar/BranchViewModeControl.test.tsx` with:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchViewModeControl } from '#/web/components/repo-toolbar/BranchViewModeControl.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchViewModeControl', () => {
  test('renders one button and switches all branches to worktrees', () => {
    const onChange = vi.fn()
    render(<BranchViewModeControl value="all" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="branches.filter-tooltip.worktrees"]',
    )
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('worktrees')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('renders one button and switches worktrees to all branches', () => {
    const onChange = vi.fn()
    render(<BranchViewModeControl value="worktrees" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="branches.filter-tooltip.all"]')
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('all')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('does not call onChange while disabled', () => {
    const onChange = vi.fn()
    render(<BranchViewModeControl value="all" disabled onChange={onChange} />)

    const button = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="branches.filter-tooltip.worktrees"]',
    )
    expect(button).toBeInstanceOf(HTMLButtonElement)
    expect(button!.disabled).toBe(true)

    act(() => {
      button!.click()
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
}
```

- [ ] **Step 2: Run the new branch control tests and verify they fail**

Run:

```bash
bun run test src/web/components/repo-toolbar/BranchViewModeControl.test.tsx
```

Expected: FAIL because the current implementation renders two `ToggleGroupItem` buttons instead of one button.

## Task 2: File List View Single-Icon Control Tests

**Files:**
- Create: `src/web/components/FileListViewModeControl.test.tsx`
- Test: `src/web/components/FileListViewModeControl.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/web/components/FileListViewModeControl.test.tsx` with:

```tsx
// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FileListViewModeControl } from '#/web/components/FileListViewModeControl.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('FileListViewModeControl', () => {
  test('renders one button and switches tree view to list view', () => {
    const onChange = vi.fn()
    render(<FileListViewModeControl value="tree" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('list')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('renders one button and switches list view to tree view', () => {
    const onChange = vi.fn()
    render(<FileListViewModeControl value="list" onChange={onChange} />)

    const buttons = container!.querySelectorAll('button')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
    expect(buttons).toHaveLength(1)
    expect(button).toBeInstanceOf(HTMLButtonElement)

    act(() => {
      button!.click()
    })

    expect(onChange).toHaveBeenCalledWith('tree')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

function render(element: React.ReactNode) {
  act(() => {
    root!.render(element)
  })
}
```

- [ ] **Step 2: Run the new file view control tests and verify they fail**

Run:

```bash
bun run test src/web/components/FileListViewModeControl.test.tsx
```

Expected: FAIL because the current implementation renders two `ToggleGroupItem` buttons instead of one button.

## Task 3: Implement BranchViewModeControl as a Single Button

**Files:**
- Modify: `src/web/components/repo-toolbar/BranchViewModeControl.tsx`
- Test: `src/web/components/repo-toolbar/BranchViewModeControl.test.tsx`

- [ ] **Step 1: Replace the control implementation**

Replace the contents of `src/web/components/repo-toolbar/BranchViewModeControl.tsx` with:

```tsx
import { FolderTree, ListTree, type LucideIcon } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useT } from '#/web/stores/i18n.ts'
import { BRANCH_VIEW_MODE_OPTIONS } from '#/web/components/repo-toolbar/branch-view-mode-options.ts'
import type { BranchViewMode } from '#/web/stores/repos/types.ts'

interface Props {
  value: BranchViewMode
  disabled?: boolean
  onChange: (viewMode: BranchViewMode) => void
}

type BranchViewToggleMode = (typeof BRANCH_VIEW_MODE_OPTIONS)[number]['id']

const BRANCH_VIEW_MODE_ICONS = {
  all: ListTree,
  worktrees: FolderTree,
} satisfies Record<BranchViewToggleMode, LucideIcon>

const BRANCH_VIEW_MODE_TOOLTIP_KEYS = Object.fromEntries(
  BRANCH_VIEW_MODE_OPTIONS.map((option) => [option.id, option.tooltipKey]),
) as Record<BranchViewToggleMode, string>

function visibleBranchViewMode(value: BranchViewMode): BranchViewToggleMode {
  return value === 'worktrees' ? 'worktrees' : 'all'
}

function nextBranchViewMode(value: BranchViewMode): BranchViewToggleMode {
  return visibleBranchViewMode(value) === 'all' ? 'worktrees' : 'all'
}

export function BranchViewModeControl({ value, disabled = false, onChange }: Props) {
  const t = useT()
  const currentValue = visibleBranchViewMode(value)
  const nextValue = nextBranchViewMode(value)
  const Icon = BRANCH_VIEW_MODE_ICONS[currentValue]
  const label = t(BRANCH_VIEW_MODE_TOOLTIP_KEYS[nextValue])

  return (
    <Tip label={label}>
      <span className="inline-flex shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          onClick={() => onChange(nextValue)}
        >
          <Icon />
        </Button>
      </span>
    </Tip>
  )
}
```

Implementation notes:

- `visibleBranchViewMode()` preserves the existing UI surface of `BRANCH_VIEW_MODE_OPTIONS`, which exposes `all` and `worktrees`.
- If the store contains the legacy hidden `no-worktree` mode, the button displays as `all` and the next click moves to `worktrees`. Do not add a third button or a third cycle state.
- Keep `aria-label` equal to the action label for the next mode.

- [ ] **Step 2: Run the branch control test and verify it passes**

Run:

```bash
bun run test src/web/components/repo-toolbar/BranchViewModeControl.test.tsx
```

Expected: PASS.

## Task 4: Implement FileListViewModeControl as a Single Button

**Files:**
- Modify: `src/web/components/FileListViewModeControl.tsx`
- Test: `src/web/components/FileListViewModeControl.test.tsx`

- [ ] **Step 1: Replace the control implementation while preserving FileListViewToolbar**

Replace the contents of `src/web/components/FileListViewModeControl.tsx` with:

```tsx
import { FolderTree, List, type LucideIcon } from 'lucide-react'
import { Button } from '#/web/components/ui/button.tsx'
import { Tip } from '#/web/components/Tip.tsx'
import { useT } from '#/web/stores/i18n.ts'

export type FileListViewMode = 'list' | 'tree'

const FILE_LIST_VIEW_OPTIONS: Array<{ id: FileListViewMode; labelKey: string; icon: LucideIcon }> = [
  { id: 'list', labelKey: 'file-list.view-list', icon: List },
  { id: 'tree', labelKey: 'file-list.view-tree', icon: FolderTree },
]

const FILE_LIST_VIEW_OPTION_BY_ID = Object.fromEntries(
  FILE_LIST_VIEW_OPTIONS.map((option) => [option.id, option]),
) as Record<FileListViewMode, (typeof FILE_LIST_VIEW_OPTIONS)[number]>

interface FileListViewModeControlProps {
  value: FileListViewMode
  onChange: (mode: FileListViewMode) => void
}

function nextFileListViewMode(value: FileListViewMode): FileListViewMode {
  return value === 'tree' ? 'list' : 'tree'
}

export function FileListViewModeControl({ value, onChange }: FileListViewModeControlProps) {
  const t = useT()
  const nextValue = nextFileListViewMode(value)
  const CurrentIcon = FILE_LIST_VIEW_OPTION_BY_ID[value].icon
  const label = t(FILE_LIST_VIEW_OPTION_BY_ID[nextValue].labelKey)

  return (
    <Tip label={label}>
      <Button type="button" variant="outline" size="icon-sm" aria-label={label} onClick={() => onChange(nextValue)}>
        <CurrentIcon />
      </Button>
    </Tip>
  )
}

export function FileListViewToolbar(props: FileListViewModeControlProps) {
  return (
    <div className="flex min-h-8 shrink-0 items-center justify-end border-b border-toolbar-border bg-toolbar px-2">
      <FileListViewModeControl {...props} />
    </div>
  )
}
```

- [ ] **Step 2: Run the file view control test and verify it passes**

Run:

```bash
bun run test src/web/components/FileListViewModeControl.test.tsx
```

Expected: PASS.

## Task 5: Update Branch Toolbar Integration Expectations

**Files:**
- Modify: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`
- Test: `src/web/components/repo-workspace/RepoExplorerPane.test.tsx`

- [ ] **Step 1: Update the branch toolbar test expectation**

In the `places branch filters and repo actions above the branch list` test, replace this block:

```ts
const allBranchesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.all"]')
const worktreesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.worktrees"]')
const noWorktreeFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.no-worktree"]')
```

with:

```ts
const branchViewToggle = branchToolbar?.querySelector<HTMLButtonElement>(
  'button[aria-label="branches.filter-tooltip.worktrees"]',
)
const allBranchesFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.all"]')
const noWorktreeFilter = branchToolbar?.querySelector('[aria-label="branches.filter-tooltip.no-worktree"]')
```

Then replace these expectations:

```ts
expect(allBranchesFilter).toBeTruthy()
expect(worktreesFilter).toBeTruthy()
expect(noWorktreeFilter).toBeNull()
expect(filter!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(filter!.compareDocumentPosition(createWorktree!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

with:

```ts
expect(branchViewToggle).toBeTruthy()
expect(allBranchesFilter).toBeNull()
expect(noWorktreeFilter).toBeNull()
expect(filter!.contains(branchViewToggle!)).toBe(true)
expect(filter!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(filter!.compareDocumentPosition(createWorktree!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

- [ ] **Step 2: Run the explorer pane tests and verify the updated branch expectation**

Run:

```bash
bun run test src/web/components/repo-workspace/RepoExplorerPane.test.tsx
```

Expected: PASS.

## Task 6: Update Changes Panel Integration Expectations

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`
- Test: `src/web/components/repo-workspace/ProjectChangesPanel.test.tsx`

- [ ] **Step 1: Update the default tree view test**

In the `defaults changed files to a folder hierarchy and keeps reveal clicks` test, replace:

```ts
expect(
  container?.querySelector('[data-testid="project-changes-action-bar"] button[aria-label="file-list.view-list"]'),
).toBeTruthy()
expect(
  container?.querySelector('[data-testid="project-changes-action-bar"] button[aria-label="file-list.view-tree"]'),
).toBeTruthy()
```

with:

```ts
expect(
  container?.querySelector('[data-testid="project-changes-action-bar"] button[aria-label="file-list.view-list"]'),
).toBeTruthy()
expect(
  container?.querySelector('[data-testid="project-changes-action-bar"] button[aria-label="file-list.view-tree"]'),
).toBeNull()
```

- [ ] **Step 2: Update the copy action ordering test**

Rename the test from:

```ts
test('copies changed file paths from the action bar after the tree view toggle', async () => {
```

to:

```ts
test('copies changed file paths from the action bar after the view mode control', async () => {
```

Inside that test, replace:

```ts
const treeViewButton = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
const copyFilePaths = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
expect(treeViewButton).toBeTruthy()
expect(copyFilePaths).toBeTruthy()
expect(treeViewButton!.compareDocumentPosition(copyFilePaths!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

with:

```ts
const viewModeButton = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
const copyFilePaths = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
expect(viewModeButton).toBeTruthy()
expect(copyFilePaths).toBeTruthy()
expect(viewModeButton!.compareDocumentPosition(copyFilePaths!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

- [ ] **Step 3: Update the toolbar ordering test**

In the `orders change toolbar actions and omits the commit entry` test, replace:

```ts
const listView = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
const treeView = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
const copy = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
const refresh = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="changes.refresh"]')
const selection = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="changes.selection-toggle-title"]')
const commit = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="action.commit-title"]')

expect(leftActions).toBeTruthy()
for (const control of [listView, treeView, copy, refresh, selection]) {
  expect(control).toBeTruthy()
  expect(leftActions!.contains(control!)).toBe(true)
}
expect(commit).toBeNull()
expect(listView!.compareDocumentPosition(treeView!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(treeView!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(copy!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(refresh!.compareDocumentPosition(selection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

with:

```ts
const viewMode = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
const treeView = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
const copy = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
const refresh = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="changes.refresh"]')
const selection = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="changes.selection-toggle-title"]')
const commit = actionBar?.querySelector<HTMLButtonElement>('button[aria-label="action.commit-title"]')

expect(leftActions).toBeTruthy()
for (const control of [viewMode, copy, refresh, selection]) {
  expect(control).toBeTruthy()
  expect(leftActions!.contains(control!)).toBe(true)
}
expect(treeView).toBeNull()
expect(commit).toBeNull()
expect(viewMode!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(copy!.compareDocumentPosition(refresh!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
expect(refresh!.compareDocumentPosition(selection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

- [ ] **Step 4: Run the Changes panel tests**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectChangesPanel.test.tsx
```

Expected: PASS.

## Task 7: Update History Panel Integration Expectations

**Files:**
- Modify: `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`
- Test: `src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx`

- [ ] **Step 1: Re-read the file before editing**

Run:

```bash
git diff -- src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
sed -n '250,340p' src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
```

Expected: output shows any pre-existing local edits plus the current copy-path toolbar test. Preserve unrelated changes.

- [ ] **Step 2: Update the copy toolbar expectation**

In the `copies selected commit detail and file paths from the detail toolbar` test, replace:

```ts
const treeViewButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
const copyFilePaths = container?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
expect(treeViewButton).toBeTruthy()
expect(copyFilePaths).toBeTruthy()
expect(treeViewButton!.compareDocumentPosition(copyFilePaths!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

with:

```ts
const viewModeButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-list"]')
const treeViewButton = container?.querySelector<HTMLButtonElement>('button[aria-label="file-list.view-tree"]')
const copyFilePaths = container?.querySelector<HTMLButtonElement>('button[aria-label="history.copy-file-paths"]')
expect(viewModeButton).toBeTruthy()
expect(treeViewButton).toBeNull()
expect(copyFilePaths).toBeTruthy()
expect(viewModeButton!.compareDocumentPosition(copyFilePaths!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

- [ ] **Step 3: Run the History panel tests**

Run:

```bash
bun run test src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
```

Expected: PASS.

## Task 8: Final Verification

**Files:**
- Verify: all files changed in Tasks 1-7

- [ ] **Step 1: Run focused tests together**

Run:

```bash
bun run test src/web/components/repo-toolbar/BranchViewModeControl.test.tsx src/web/components/FileListViewModeControl.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff -- src/web/components/repo-toolbar/BranchViewModeControl.tsx src/web/components/repo-toolbar/BranchViewModeControl.test.tsx src/web/components/FileListViewModeControl.tsx src/web/components/FileListViewModeControl.test.tsx src/web/components/repo-workspace/RepoExplorerPane.test.tsx src/web/components/repo-workspace/ProjectChangesPanel.test.tsx src/web/components/repo-workspace/ProjectHistoryPanel.test.tsx
```

Expected: the diff only changes the three view-mode switchers and their tests. It must not include the file-area bottom bar, workspace layout relocation, Settings relocation, store changes, or i18n dictionary changes.

## Self-Review Notes

- Spec coverage: Tasks 3 and 4 implement the single icon buttons, current-state icon, next-action label, click cycling, disabled branch behavior, and unchanged caller APIs. Tasks 5-7 update existing branch/Changes/History integration expectations. Task 8 verifies the scoped behavior.
- Placeholder scan: this plan contains no deferred implementation placeholders.
- Type consistency: `BranchViewModeControl` keeps `BranchViewMode`; file list controls keep `FileListViewMode`; both call existing `onChange` callbacks with existing union values.

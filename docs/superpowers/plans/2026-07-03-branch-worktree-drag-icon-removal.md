# Branch Worktree Drag Icon Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the worktree reorder icon in the branch list while preserving Worktrees-view drag sorting.

**Architecture:** Keep dnd-kit ownership in `BranchList` and keep branch row display in `BranchRow`. Move sortable activator props from the dedicated `GripVertical` button to the row-level sortable props, then remove the drag-handle UI and its left grid column. Preserve existing `reorderWorktrees(repoId, fromPath, toPath)` data flow.

**Tech Stack:** React, TypeScript strip-only mode, dnd-kit, Zustand, Vitest, jsdom, Bun.

---

## 文件结构

- Modify: `src/web/components/BranchList.test.tsx`
  - Responsibility: component-level coverage for worktree row display and drag ordering.
  - Update drag-handle assertions to require no reorder button/icon while keeping sortable rows and reorder behavior.

- Modify: `src/web/components/branch-list/BranchRow.test.tsx`
  - Responsibility: row-level coverage for sortable props and branch row layout.
  - Update old drag-handle assertions to require row-level sortable props and standard row padding.

- Modify: `src/web/components/branch-list/BranchRow.tsx`
  - Responsibility: render one branch row, selection state, inline summary, and actions.
  - Remove `GripVertical` and `dragHandle`; accept optional row-level sortable props.

- Modify: `src/web/components/BranchList.tsx`
  - Responsibility: choose visible branches, wire dnd-kit sorting, and call `reorderWorktrees`.
  - Pass sortable attributes/listeners to `BranchRow.sortable` instead of `BranchRow.dragHandle`.

项目 `AGENTS.md` 明确禁止在用户未主动要求时计划或执行 git 提交/分支操作。本计划不包含提交步骤；实现完成后如需提交，先向用户请求确认。

---

### Task 1: BranchList Tests For Hidden Drag Icon And Preserved Sorting

**Files:**
- Modify: `src/web/components/BranchList.test.tsx`

- [ ] **Step 1: Replace drag-handle visibility tests with hidden-icon sortable-row tests**

In `src/web/components/BranchList.test.tsx`, replace these two tests:

```tsx
  test('shows drag handles only in worktrees view without search', () => {
    seedWorktreeRepo('worktrees')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(2)
  })

  test('hides drag handles in all view', () => {
    seedWorktreeRepo('all')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
  })
```

with:

```tsx
  test('hides worktree drag icons while keeping worktree rows sortable', () => {
    seedWorktreeRepo('worktrees')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(0)

    const sortableRows = Array.from(container?.querySelectorAll<HTMLLIElement>('li[data-sortable-id]') ?? [])
    expect(sortableRows.map((row) => row.getAttribute('data-sortable-id'))).toEqual(['/repo', '/tmp/worktree-a'])
    expect(sortableRows.every((row) => !row.className.includes('1.75rem'))).toBe(true)
  })

  test('does not mark branch rows sortable in all view', () => {
    seedWorktreeRepo('all')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(0)
    expect(container?.querySelectorAll('li[data-sortable-id]')).toHaveLength(0)
  })
```

- [ ] **Step 2: Update the stale search test to stop expecting drag handles**

Replace the test named `ignores stale branch search state when rendering worktree drag handles` with:

```tsx
  test('keeps worktree rows visible with stale branch search state without showing drag icons', () => {
    seedWorktreeRepo('worktrees')
    useReposStore.getState().setBranchSearchQuery(REPO_ID, 'feature')

    renderList()

    expect(document.querySelectorAll('[aria-label="重新排序工作树"]')).toHaveLength(0)
    expect(document.querySelectorAll('.lucide-grip-vertical')).toHaveLength(0)
    expect(container?.textContent).toContain('main')
    expect(container?.textContent).toContain('feature/a')
  })
```

- [ ] **Step 3: Run the focused BranchList test and verify it fails**

Run:

```bash
bun run test "src/web/components/BranchList.test.tsx"
```

Expected: FAIL because current worktree rows still render `[aria-label="重新排序工作树"]`, `.lucide-grip-vertical`, and sortable attributes on the handle button rather than the row `<li>`.

---

### Task 2: Remove BranchRow Drag Handle UI

**Files:**
- Modify: `src/web/components/branch-list/BranchRow.tsx`
- Modify: `src/web/components/branch-list/BranchRow.test.tsx`

- [ ] **Step 1: Remove GripVertical and drag handle types**

In `src/web/components/branch-list/BranchRow.tsx`, remove this import:

```ts
import { GripVertical } from 'lucide-react'
```

Delete the `BranchRowDragHandle` interface:

```ts
interface BranchRowDragHandle {
  label: string
  ref: (node: HTMLButtonElement | null) => void
  props: HTMLAttributes<HTMLButtonElement>
}
```

Change `BranchRowSortable` from:

```ts
interface BranchRowSortable {
  setNodeRef: (node: HTMLLIElement | null) => void
  style?: CSSProperties
  isDragging?: boolean
}
```

to:

```ts
interface BranchRowSortable {
  setNodeRef: (node: HTMLLIElement | null) => void
  style?: CSSProperties
  isDragging?: boolean
  props?: HTMLAttributes<HTMLLIElement>
}
```

Remove `dragHandle?: BranchRowDragHandle` from `BranchRowProps`.

- [ ] **Step 2: Remove dragHandle destructuring and attach sortable props to the row**

In the `BranchRow` function parameter destructuring, remove `dragHandle`.

Change the opening `<li>` from:

```tsx
    <li
      ref={sortable || isSelected ? setItemRef : undefined}
      style={sortable?.style}
      onClick={() => onSelectBranch(branch.name)}
      onDoubleClick={() => onOpenBranchStatus(branch.name)}
      className={cn(
        'relative grid min-h-8 items-stretch cursor-pointer',
        dragHandle
          ? showActions
            ? 'grid-cols-[1.75rem_minmax(0,1fr)_auto]'
            : 'grid-cols-[1.75rem_minmax(0,1fr)]'
          : showActions
            ? 'grid-cols-[minmax(0,1fr)_auto]'
            : 'grid-cols-1',
        'transition-colors duration-100',
        isSelected
          ? 'bg-list-row-selected text-list-row-selected-foreground hover:bg-list-row-selected'
          : 'hover:bg-list-row-hover',
        sortable?.isDragging && 'z-10 bg-[var(--goblin-card-bg,var(--color-card))] text-foreground shadow-sm',
      )}
    >
```

to:

```tsx
    <li
      {...sortable?.props}
      ref={sortable || isSelected ? setItemRef : undefined}
      style={sortable?.style}
      onClick={() => onSelectBranch(branch.name)}
      onDoubleClick={() => onOpenBranchStatus(branch.name)}
      className={cn(
        'relative grid min-h-8 items-stretch cursor-pointer',
        showActions ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1',
        'transition-colors duration-100',
        isSelected
          ? 'bg-list-row-selected text-list-row-selected-foreground hover:bg-list-row-selected'
          : 'hover:bg-list-row-hover',
        sortable?.isDragging && 'z-10 bg-[var(--goblin-card-bg,var(--color-card))] text-foreground shadow-sm',
      )}
    >
```

- [ ] **Step 3: Delete the drag handle element and restore content padding**

Delete this entire block:

```tsx
      {dragHandle && (
        <div className="relative z-20 flex items-center justify-center py-1 pl-0">
          <button
            ref={dragHandle.ref}
            type="button"
            {...dragHandle.props}
            aria-label={dragHandle.label}
            title={dragHandle.label}
            onClick={(event) => {
              event.stopPropagation()
              dragHandle.props.onClick?.(event)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              dragHandle.props.onDoubleClick?.(event)
            }}
            className={cn(
              'flex size-6 touch-none cursor-grab items-center justify-center rounded-[var(--goblin-brand-radius-sm,var(--radius-sm))] text-muted-foreground hover:bg-list-row-hover hover:text-foreground active:cursor-grabbing',
              dragHandle.props.className,
            )}
          >
            <GripVertical size={14} />
          </button>
        </div>
      )}
```

Change the content wrapper from:

```tsx
      <div
        className={cn('pointer-events-none relative z-10 flex min-w-0 items-center py-1', dragHandle ? 'pr-4' : 'px-4')}
      >
```

to:

```tsx
      <div className="pointer-events-none relative z-10 flex min-w-0 items-center px-4 py-1">
```

- [ ] **Step 4: Run BranchList tests and verify they still fail for BranchList wiring**

Update the two old drag-handle tests in `src/web/components/branch-list/BranchRow.test.tsx` to assert row-level sortable props:

```tsx
  test('applies sortable props to the row without rendering a drag handle', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
          sortable={{
            setNodeRef: vi.fn(),
            props: { role: 'button' },
          }}
        />
      </ul>,
    )

    const handle = document.querySelector('[aria-label="重新排序工作树"]')
    const row = document.querySelector('li[role="button"]')
    expect(handle).toBeNull()
    expect(document.querySelector('.lucide-grip-vertical')).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.className).toContain('grid-cols-1')
    expect(row?.className).not.toContain('1.75rem')
  })

  test('keeps standard content padding when sortable props are provided', () => {
    const repo = emptyRepo('/tmp/repo', 'repo')
    const branch = createRepoBranch('feature/a', { worktree: { path: '/tmp/worktree-a' } })

    render(
      <ul>
        <BranchRow
          repo={repo}
          branch={branch}
          selected={null}
          onSelectBranch={vi.fn()}
          onOpenBranchStatus={vi.fn()}
          selectedRef={createRef<HTMLLIElement>()}
          showActions={false}
          sortable={{
            setNodeRef: vi.fn(),
            props: { role: 'button' },
          }}
        />
      </ul>,
    )

    const content = Array.from(document.querySelectorAll<HTMLElement>('li > .pointer-events-none')).find((node) =>
      node.textContent?.includes('feature/a'),
    )

    expect(content?.className).toContain('px-4')
    expect(content?.className).toContain('py-1')
    expect(content?.className).not.toContain('pr-4')
  })
```

Run:

```bash
bun run test "src/web/components/branch-list/BranchRow.test.tsx" "src/web/components/BranchList.test.tsx"
```

Expected: FAIL because `SortableBranchRow` still passes a deleted `dragHandle` prop and has not moved sortable attributes/listeners to `sortable.props`.

---

### Task 3: Move Sortable Activator Props To The Row

**Files:**
- Modify: `src/web/components/BranchList.tsx`
- Test: `src/web/components/BranchList.test.tsx`

- [ ] **Step 1: Stop passing dragHandleLabel to SortableBranchRow**

In `src/web/components/BranchList.tsx`, change this row creation:

```tsx
      <SortableBranchRow
        {...rowProps}
        key={branch.name}
        id={branch.worktree.path}
        dragHandleLabel={t('branches.reorder-worktree')}
      />
```

to:

```tsx
      <SortableBranchRow {...rowProps} key={branch.name} id={branch.worktree.path} />
```

- [ ] **Step 2: Update SortableBranchRow props and useSortable destructuring**

Change the function signature from:

```tsx
function SortableBranchRow(props: ComponentProps<typeof BranchRow> & { id: string; dragHandleLabel: string }) {
  const { id, dragHandleLabel, ...rowProps } = props
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
```

to:

```tsx
function SortableBranchRow(props: ComponentProps<typeof BranchRow> & { id: string }) {
  const { id, ...rowProps } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
```

- [ ] **Step 3: Pass sortable attributes and listeners through sortable.props**

Change the `BranchRow` call inside `SortableBranchRow` from:

```tsx
    <BranchRow
      {...rowProps}
      sortable={{
        setNodeRef,
        style: {
          transform: CSS.Transform.toString(verticalTransform),
          transition,
        },
        isDragging,
      }}
      dragHandle={{
        label: dragHandleLabel,
        ref: setActivatorNodeRef,
        props: { ...attributes, ...listeners },
      }}
    />
```

to:

```tsx
    <BranchRow
      {...rowProps}
      sortable={{
        setNodeRef,
        style: {
          transform: CSS.Transform.toString(verticalTransform),
          transition,
        },
        isDragging,
        props: { ...attributes, ...listeners },
      }}
    />
```

- [ ] **Step 4: Run the focused BranchList test and verify it passes**

Run:

```bash
bun run test "src/web/components/branch-list/BranchRow.test.tsx" "src/web/components/BranchList.test.tsx"
```

Expected: PASS.

- [ ] **Step 5: Run residual icon and drag-handle searches**

Run:

```bash
rg -n "GripVertical|dragHandle|setActivatorNodeRef|branches\\.reorder-worktree|grid-cols-\\[1\\.75rem" "src/web/components/BranchList.tsx" "src/web/components/branch-list/BranchRow.tsx"
```

Expected: no output.

---

### Task 4: Final Verification

**Files:**
- Verify: `src/web/components/BranchList.test.tsx`
- Verify: `src/web/components/branch-list/BranchRow.test.tsx`
- Verify: `src/web/components/BranchList.tsx`
- Verify: `src/web/components/branch-list/BranchRow.tsx`

- [ ] **Step 1: Run focused tests for changed behavior**

Run:

```bash
bun run test "src/web/components/branch-list/BranchRow.test.tsx" "src/web/components/BranchList.test.tsx"
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run architecture guard**

Run:

```bash
bun run check:architecture
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff for this feature**

Run:

```bash
git diff -- "src/web/components/BranchList.test.tsx" "src/web/components/branch-list/BranchRow.test.tsx" "src/web/components/BranchList.tsx" "src/web/components/branch-list/BranchRow.tsx"
```

Expected:
- `BranchRow.tsx` has no `GripVertical`, no `dragHandle`, and no `1.75rem` drag column.
- `BranchList.tsx` still uses dnd-kit for Worktrees view and passes sortable props to `BranchRow`.
- `BranchList.test.tsx` asserts no reorder icon/button is rendered and reorder behavior remains.
- `BranchRow.test.tsx` asserts sortable props apply to the row and row content keeps standard padding.

---

## 自审

- Spec coverage: hidden worktree drag icon, removed left column, preserved Worktrees-view dnd sorting, unchanged All/No Worktree drag entry behavior, unchanged row selection/status/action behavior.
- Deferred-language scan: no deferred implementation language is used; each code-changing step includes concrete code.
- Type consistency: `BranchRowSortable.props` is `HTMLAttributes<HTMLLIElement>`, and `SortableBranchRow` supplies `{ ...attributes, ...listeners }` to that field.
- Project instruction compatibility: no branch, worktree, merge, push, or commit commands are included because the user did not request implementation commits.

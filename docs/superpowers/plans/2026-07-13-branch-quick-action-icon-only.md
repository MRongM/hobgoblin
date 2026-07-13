# Branch Quick Action Button — Icon Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the text label from the quick action button on each branch row, leaving only the icon.

**Architecture:** Single targeted edit to `BranchActionsDropdown` in `BranchActionsMenu.tsx`. Change `size="sm"` to `size="icon-sm"`, strip `gap-0.5` from the className, and remove the label text node. The tooltip (`title`) and `aria-label` stay intact so discoverability and accessibility are unaffected.

**Tech Stack:** React, Tailwind CSS, `AsyncButton` component (internal)

---

### Task 1: Apply icon-only change to the quick action button

**Files:**
- Modify: `src/web/components/BranchActionsMenu.tsx:142-161`

- [ ] **Step 1: Open the file and locate the AsyncButton**

  In `BranchActionsDropdown` (around line 142), find the `AsyncButton` that renders the quick action. It currently looks like:

  ```tsx
  <AsyncButton
    variant="ghost"
    size="sm"
    loading={quickAction?.busy}
    disabled={quickActionDisabled}
    onClick={runQuickAction}
    title={quickAction?.title ?? quickAction?.label ?? t('action.menu')}
    aria-label={quickAction?.ariaLabel ?? quickAction?.title ?? quickAction?.label ?? t('action.menu')}
    className={cn(
      'gap-0.5 rounded-r-none px-1.5 pr-1.5',
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
  ```

- [ ] **Step 2: Apply the three changes**

  Replace with:

  ```tsx
  <AsyncButton
    variant="ghost"
    size="icon-sm"
    loading={quickAction?.busy}
    disabled={quickActionDisabled}
    onClick={runQuickAction}
    title={quickAction?.title ?? quickAction?.label ?? t('action.menu')}
    aria-label={quickAction?.ariaLabel ?? quickAction?.title ?? quickAction?.label ?? t('action.menu')}
    className={cn(
      'rounded-r-none px-1.5',
      quickAction?.destructive && 'text-danger hover:bg-danger-surface hover:text-danger',
    )}
  >
    {({ busy }) => (
      <>
        {busy ? <Loader2 className="size-4 animate-spin" /> : quickAction?.icon}
      </>
    )}
  </AsyncButton>
  ```

  Changes made:
  - `size="sm"` → `size="icon-sm"`
  - `'gap-0.5 rounded-r-none px-1.5 pr-1.5'` → `'rounded-r-none px-1.5'`
  - Removed `{quickAction?.label ?? t('action.menu')}` line

- [ ] **Step 3: Build to verify no type errors**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors related to `BranchActionsMenu.tsx`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/web/components/BranchActionsMenu.tsx
  git commit -m "feat(ui): show only icon in branch quick action button"
  ```

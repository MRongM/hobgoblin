---
title: Branch Quick Action Button — Icon Only
date: 2026-07-13
status: approved
---

## Problem

The quick action button (left half of the split button on each branch row) currently renders an icon plus a text label. The label takes up horizontal space and is redundant given the tooltip already conveys the action name.

## Goal

Show only the icon in the quick action button. Keep the tooltip and aria-label so discoverability and accessibility are not degraded.

## Scope

Single file: `src/web/components/BranchActionsMenu.tsx`

Only the `AsyncButton` inside `BranchActionsDropdown` that renders the quick action is changed. Nothing else moves.

## Changes

In `BranchActionsDropdown`, update the quick action `AsyncButton`:

1. `size="sm"` → `size="icon-sm"`
2. Remove `gap-0.5` from `className`; keep `rounded-r-none` and `px-1.5`
3. Remove the label render: `{quickAction?.label ?? t('action.menu')}`

The `title`, `aria-label`, `disabled`, `busy`, and `onClick` props are untouched.

```diff
 <AsyncButton
   variant="ghost"
-  size="sm"
+  size="icon-sm"
   loading={quickAction?.busy}
   disabled={quickActionDisabled}
   onClick={runQuickAction}
   title={quickAction?.title ?? quickAction?.label ?? t('action.menu')}
   aria-label={quickAction?.ariaLabel ?? quickAction?.title ?? quickAction?.label ?? t('action.menu')}
   className={cn(
-    'gap-0.5 rounded-r-none px-1.5 pr-1.5',
+    'rounded-r-none px-1.5',
     quickAction?.destructive && 'text-danger hover:bg-danger-surface hover:text-danger',
   )}
 >
   {({ busy }) => (
     <>
       {busy ? <Loader2 className="size-4 animate-spin" /> : quickAction?.icon}
-      {quickAction?.label ?? t('action.menu')}
     </>
   )}
 </AsyncButton>
```

## Out of Scope

- `BranchRowRecentActions` (event-history buttons) — already icon-only, no change
- Dropdown trigger (ChevronDown button) — no change
- Any i18n keys — no change
- Any store/persistence logic — no change

## Accessibility

The `aria-label` on the button is already set to the action's label or title. Removing the visible text does not affect screen reader output.

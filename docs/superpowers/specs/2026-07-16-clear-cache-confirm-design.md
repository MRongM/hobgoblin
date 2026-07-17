# Clear Cache Confirmation Dialog

Date: 2026-07-16
Status: Approved

## Problem

The "清除缓存" (clear cache) item in the repo tab strip "+" dropdown
(`src/web/components/repo-tabs/RepoTabStrip.tsx`) executes immediately on
select: `localStorage.clear()` + `sessionStorage.clear()` +
`window.location.reload()`. It sits directly below "克隆新仓库" separated
only by a divider, so a misclick silently wipes the cached snapshots of
**all** repos on the current server origin (`goblin.repo-store` /
`restorableRepoCache`), regenerates the web terminal client id, and reloads
the page — with no warning. Server-side data is unaffected, but the action
is disruptive and currently unconfirmed.

## Goal

Clicking "清除缓存" opens a confirmation dialog. Cache is cleared and the
page reloaded only after the user confirms. Cancel (button, Esc,
outside-click) does nothing.

## Approach

Reuse the existing `ConfirmDialog` component
(`src/web/components/ConfirmDialog.tsx`), the codebase's standard pattern
for destructive-operation confirmation (protected-branch push, dirty
checkout). It is built on shadcn AlertDialog with correct a11y semantics
(role=alertdialog, initial focus on Cancel, Esc/outside-click cancel).

Alternatives rejected:

- `window.confirm()` — inconsistent styling, not themeable.
- AlertDialog nested inside the menu item — not viable: the dropdown
  unmounts on select, taking the dialog with it. Dialog state must live
  outside the dropdown.

## Changes

### `src/web/components/repo-tabs/RepoTabStrip.tsx`

- Add `confirmClearCacheOpen` state to `RepoTabStrip`.
- `OpenRepoMenuItems` no longer clears storage itself; it receives an
  `onClearCache` callback prop that opens the dialog. Both render sites
  (regular "+" menu and small-screen compact "more" menu) share the one
  dialog instance rendered at the `RepoTabStrip` top level, outside both
  dropdowns.
- On confirm, run the existing logic unchanged:
  `localStorage.clear(); sessionStorage.clear(); window.location.reload()`
  (keep the try/catch with the `[gbl]` console.error).
- Pass `destructive` so the confirm button renders red.

### `src/web/components/repo-tabs/types.ts`

Extend `RepoTabStripLabels` with three fields:

- `clearCacheConfirmTitle`
- `clearCacheConfirmMessage`
- `clearCacheConfirmLabel`

### `src/web/components/RepoTabs.tsx`

Wire the three new labels from i18n alongside the existing `clearCache`
label.

### i18n (`src/shared/i18n/en.ts`, `zh.ts`, `ko.ts`, `ja.ts`)

Three new keys, zh reference copy:

- `repo-tabs.clear-cache-confirm-title`: `清除缓存？`
- `repo-tabs.clear-cache-confirm-message`: `将清除此服务器下所有仓库的本地缓存并刷新页面。服务器数据不受影响，仓库将重新加载。`
- `repo-tabs.clear-cache-confirm`: `清除并刷新`

en/ko/ja carry equivalent translations.

### Tests (`src/web/components/repo-tabs/RepoTabStrip.test.tsx`)

- Selecting "清除缓存" opens the dialog and does NOT clear storage or
  reload.
- Confirming clears localStorage/sessionStorage and triggers reload.
- Cancelling closes the dialog with no side effects.
- Extend the test `labels` fixture with the three new fields (also in
  `RepoTabStrip.keyboard.test.tsx` if its fixture requires them).

## Out of Scope

- The identical clear-cache button on the crash fallback screen
  (`src/web/components/ErrorBoundary.tsx`) stays immediate — it lives on
  an explicit error-recovery screen where intent is unambiguous.
- Moving the item into the native File menu (earlier idea, dropped).
- Per-repo cache clearing granularity.

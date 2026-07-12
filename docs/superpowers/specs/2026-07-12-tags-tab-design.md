# Tags Tab & Local Tag Management

**Date:** 2026-07-12
**Status:** Approved

## Overview

Three connected features:
1. A new **Tags tab** in the explorer tab strip (after History)
2. A **local tag list** inside that tab — searchable, with delete support
3. A **"Create tag" menu item** in the branch dropdown (in the patch group, alongside existing patch actions)

Scope is local tags only. Remote tags already exist in the Remote Branches panel.

---

## Data Layer

### New RPC endpoints

Added to `src/shared/rpc.ts`:

```ts
localTags: (input: { cwd: string }) => Promise<string[]>
createLocalTag: (input: { cwd: string; name: string; ref: string }) => Promise<RpcResult>
deleteLocalTag: (input: { cwd: string; name: string }) => Promise<RpcResult>
```

Routes registered in `src/shared/embedded-server-rpc-routes.ts`:

```
'repo.localTags':      { route: '/api/repo/local-tags',       method: 'POST' }
'repo.createLocalTag': { route: '/api/repo/create-local-tag', method: 'POST' }
'repo.deleteLocalTag': { route: '/api/repo/delete-local-tag', method: 'POST' }
```

### Backend handlers

- `localTags` — runs `git tag --sort=-creatordate` in `cwd`, splits on newlines, filters blanks
- `createLocalTag` — runs `git tag <name> <ref>`; validates `name` using existing `isSafeBranchName` guard before invoking git
- `deleteLocalTag` — runs `git tag -d <name>`

### Client wrappers

Three new typed fetch wrappers in `src/web/repo-client.ts`, following the pattern of `getRepositoryRemoteTags` / `deleteRepositoryRemoteTag`.

---

## Tags Tab

### Type change

`ExplorerTab` in `src/web/stores/repos/types.ts` extended:

```ts
'files' | 'changes' | 'status' | 'history' | 'tags' | 'remoteBranches' | 'ports'
```

### Tab strip

In `RepoExplorerPane.tsx`, a new tab entry inserted after History:

```ts
{ id: 'tags' as const, label: t('tab.tags'), icon: Tag }
```

### `ProjectTagsPanel.tsx` (new file)

Located at `src/web/components/repo-workspace/ProjectTagsPanel.tsx`.

Structure:
- **Toolbar row**: search input (left), refresh button + "New tag" button (right)
- **Tag list**: scrollable `ScrollPane`; one row per tag — tag name on the left, delete icon button on the right (ghost, appears on row hover)
- **Empty state**: shown when no tags exist, using `EmptyState` component
- **Error state**: shown on load failure
- **Create dialog**: inline within the panel — fields: tag name (required), ref (defaults to `HEAD`); buttons: Create / Cancel
- **Delete confirmation**: `ConfirmDialog`, same pattern as remote-branch delete

Data flow:
- Load tags on mount via `localTags` RPC
- Reload after create or delete
- `AbortController` for in-flight request cancellation
- Pattern follows `ProjectHistoryPanel`

The create-tag dialog component is extracted as a shared component (not duplicated) so it can also be used from the branch dropdown.

---

## Branch Dropdown: "Create tag" Action

In `useBranchActionItems.ts`, a new `createTag` item added to `patchItems`:

- **Label**: `t('action.create-tag')`
- **Icon**: `Tag` from lucide-react
- **Visible**: when `branch.lastCommitHash` is non-empty
- **Disabled**: when any other branch action is busy
- **Behavior**: opens the shared create-tag dialog, pre-filled with `ref = branch.lastCommitHash`

The dialog is rendered in the `dialogs` slot of `BranchActionsMenu.tsx`, matching the pattern of other dialog-backed actions in that hook.

---

## i18n Keys

Added to `src/shared/i18n/en.ts` (and mirrored in `ja.ts`, `ko.ts`, `zh.ts`):

```
tab.tags                  → "Tags"
tags.empty                → "No local tags"
tags.new                  → "New tag"
tags.name-label           → "Tag name"
tags.ref-label            → "Ref (branch, commit, or HEAD)"
tags.create               → "Create tag"
tags.delete               → "Delete tag"
tags.confirm-title        → "Delete tag '{name}'?"
tags.confirm-body         → "This will delete the local tag. Remote tags are not affected."
tags.confirm-delete       → "Delete"
tags.create-success       → "Tag created"
tags.delete-success       → "Tag deleted"
tags.load-error           → "Failed to load tags"
tags.search-label         → "Search local tags"
tags.search-placeholder   → "Search local tags"
tags.refresh              → "Refresh tags"
action.create-tag         → "Create tag"
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/shared/rpc.ts` | Add 3 RPC endpoint types |
| `src/shared/embedded-server-rpc-routes.ts` | Register 3 routes |
| `src/server/routes/` | Add 3 new route handlers (localTags, createLocalTag, deleteLocalTag) |
| `src/web/repo-client.ts` | Add 3 client wrappers |
| `src/web/stores/repos/types.ts` | Extend `ExplorerTab` with `'tags'` |
| `src/web/components/repo-workspace/RepoExplorerPane.tsx` | Insert Tags tab, add panel switch case |
| `src/web/components/repo-workspace/ProjectTagsPanel.tsx` | New file |
| `src/web/hooks/useBranchActionItems.ts` | Add `createTag` patchItem |
| `src/web/components/BranchActionsMenu.tsx` | Wire create-tag dialog to `dialogs` slot |
| `src/shared/i18n/en.ts` | New keys |
| `src/shared/i18n/ja.ts` | New keys |
| `src/shared/i18n/ko.ts` | New keys |
| `src/shared/i18n/zh.ts` | New keys |

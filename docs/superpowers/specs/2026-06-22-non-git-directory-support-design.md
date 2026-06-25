# Non-Git Directory Support Design

**Date:** 2026-06-22
**Branch:** feat/non-git

## Overview

Allow users to open any readable directory, not just git repositories. When a non-git directory is opened, the app shows a usable workspace with the terminal available and a prominent "Initialize Git Repository" button in the branch area. After `git init`, the UI automatically refreshes into a normal git workspace.

## User Experience

1. User opens a directory that is not a git repository (via drag-drop, dialog, or recent menu).
2. The directory opens as a tab in the workspace — no error toast, no rejection.
3. The **branch area** (left panel) shows:
   - The full directory path in muted text
   - An "Initialize Git Repository" button (primary style)
4. The **terminal** is fully functional, scoped to that directory.
5. Git-related tabs (Changes, History, Status) are present but show empty/disabled state naturally (no data to display).
6. Clicking "Initialize Git Repository":
   - Calls `git init` on the directory
   - On success: refreshes the repo state, `isGitRepo` flips to `true`, the normal branch list appears
   - On failure: shows an error toast

## Architecture

### Data Model Changes

**`src/shared/rpc.ts` — `ProbeResult`**

Add `isGitRepo?: boolean`. When `ok: true` and `isGitRepo: false`, the directory is readable but not a git repo.

```ts
export interface ProbeResult {
  ok: boolean
  root?: string
  name?: string
  message?: string
  isGitRepo?: boolean  // undefined or true = git repo; false = non-git readable directory
}
```

**`src/web/stores/repos/types.ts` — `RepoState`**

Add `isGitRepo: boolean` (defaults to `true`).

### Server-Side Changes

**`src/server/modules/repo-backend.ts` — `createLocalRepoBackend.probe()`**

Change the non-git-repo branch from returning `{ ok: false }` to returning:
```ts
{ ok: true, root: repoId, name: path.basename(repoId), isGitRepo: false }
```
Only if the directory is readable. Path errors (not found, not directory, permission denied) still return `ok: false`.

**`src/server/modules/repo-write-paths.ts`** — Add `initRepository(cwd)` that runs `git init <cwd>`.

**`src/server/routes/repo.ts`** — Register a `POST /repo/init` route that calls `initRepository`.

### Client-Side Changes

**`src/web/repo-client.ts`** — Add `gitInitRepository(cwd: string)` that calls the new route.

**`src/web/stores/repos/helpers.ts`** — `emptyRepo()` defaults `isGitRepo: true`.

**`src/web/stores/repos/lifecycle-write-paths.ts`** — In `resolveRepoPath`, when probe returns `ok: true, isGitRepo: false`, pass `isGitRepo: false` through `ResolvedRepo` so it lands on `RepoState`.

**`src/web/stores/repos/operations.ts`** (or a new action) — Add `initGitRepository(id)`:
1. Calls `gitInitRepository(id)`
2. On success: sets `repo.isGitRepo = true`, then calls `refreshCoreData(id)` to load branches/status

### UI Changes

**`src/web/components/repo-workspace/RepoExplorerPane.tsx` — `BranchArea`**

When `repo.isGitRepo === false`, render `NonGitRepoPlaceholder` instead of `<BranchList>` and filter controls.

**`src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx`** (new file)

Simple component:
- Displays the repo path (muted, small font, truncated)
- "Initialize Git Repository" button that calls `initGitRepository`
- Loading state while init runs
- Error state passed to toast on failure

## Files Touched

| File | Change |
|------|--------|
| `src/shared/rpc.ts` | Add `isGitRepo?` to `ProbeResult` |
| `src/web/stores/repos/types.ts` | Add `isGitRepo: boolean` to `RepoState` |
| `src/server/modules/repo-backend.ts` | `probe()` returns ok for readable non-git dirs |
| `src/server/modules/repo-write-paths.ts` | Add `initRepository` |
| `src/server/routes/repo.ts` | Register `POST /repo/init` |
| `src/web/repo-client.ts` | Add `gitInitRepository` |
| `src/web/stores/repos/helpers.ts` | `emptyRepo` defaults `isGitRepo: true` |
| `src/web/stores/repos/lifecycle-write-paths.ts` | Propagate `isGitRepo: false` from probe |
| `src/web/stores/repos/operations.ts` | Add `initGitRepository` action |
| `src/web/components/repo-workspace/RepoExplorerPane.tsx` | Branch area switches on `isGitRepo` |
| `src/web/components/repo-workspace/NonGitRepoPlaceholder.tsx` | New component |

## Out of Scope

- `git init` options (initial branch name, bare repo, etc.)
- Session restore behavior for non-git repos (they probe on restore; if still non-git, show placeholder again — no special handling needed)
- Remote repos (SSH-backed repos always require git; this is local-only)

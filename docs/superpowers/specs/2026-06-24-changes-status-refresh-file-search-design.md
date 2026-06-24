# Changes Status Refresh and File Search Design

## Goal

Improve the repository explorer tabs with two focused workflows:

- Add a refresh icon to the `Changes` tab that refreshes only the selected repository's working-tree status.
- Add a search-and-locate control to the `Files` tab that finds files by name or relative path, jumps between matches, and can fall back to a bounded whole-worktree search when loaded nodes do not contain a match.

The intent is to make local change review and file navigation faster without changing the meaning of the top-level repository sync button.

## Scope

In scope:

- A compact status-refresh icon in the `Changes` tab action bar.
- Status-only refresh behavior through the existing `refreshStatus` store action.
- A `Files` tab search control with match count and previous/next navigation.
- Loaded-node search using the current file tree model.
- A bounded whole-worktree path search API for fallback results.
- Reuse of the existing file tree reveal path flow to expand parents and select matched results.
- Local and SSH-backed remote repositories.
- Focused unit and component tests for the changed behavior.

Out of scope:

- Changing the topbar sync behavior.
- Fetching remotes from the `Changes` tab refresh icon.
- Rebuilding branch snapshots or history from the `Changes` tab refresh icon.
- Persisting file search text or results across app restarts.
- Building a persistent file index.
- Filtering the file tree based on the search query.
- Infinite result loading.
- Fuzzy ranking beyond simple case-insensitive name and path matching.
- Creating a git commit for this design document unless the user explicitly requests it.

## Confirmed Decisions

- The `Changes` tab icon means refresh working-tree status only.
- The `Files` tab search behaves like a find box, not a tree filter.
- Search matches both file name and worktree-relative path.
- Loaded tree nodes are searched first.
- If loaded nodes do not produce any results, the UI can trigger a bounded whole-worktree search.
- Whole-worktree search must be cancellable, limited, and safe for large local or remote repositories.
- Search state is local UI state and resets on repo or worktree change.
- Do not execute git commit or branch operations for this design unless explicitly requested.

## Current State

`RepoExplorerPane` owns the explorer tabs:

- `files`
- `changes`
- `status`
- `history`
- `ports` for remote repositories

`ProjectChangesPanel` renders selected worktree changes through `StatusList`. It already owns:

- File list/tree view mode.
- Selection mode for path-scoped discard.
- Commit controls.
- Status loading, stale, and error presentation through existing repo resource state.

`ProjectFileTree` already has the key mechanics needed for search location:

- It lazily loads one directory level at a time.
- It keeps loaded directory entries in component-local state.
- It flattens loaded and expanded nodes into `flatNodes`.
- It can reveal a relative path by loading parent directories, expanding them, selecting the target node, and scrolling it into view.
- It uses `repo.data.status` to decorate changed paths and virtual deleted paths.

The topbar repository refresh button is implemented by `RepoActivityControl`. It runs `manual-refresh-requested`, which can fetch remotes and refresh snapshot, status, and history. That behavior is intentionally broader than the new `Changes` tab icon.

## Architecture

Keep tab-specific behavior near the tab components and add only one backend read capability for fallback file search.

```text
ProjectChangesPanel
  -> useReposStore.refreshStatus(repo.id, { token })
  -> existing repo status refresh workflow
  -> repo.data.status updates
  -> StatusList rerenders
```

```text
ProjectFileTree
  -> search loaded flatNodes in renderer
  -> if needed, repo-client.ts searchRepositoryFileTree(...)
  -> POST /api/repo/file-search
  -> repo-read-paths.ts searchRepositoryFileTree(...)
  -> RepoBackend.searchFiles(...)
  -> local filesystem or remote SSH path search
  -> reveal selected relative path through existing reveal flow
```

This preserves separation of responsibilities:

- `ProjectChangesPanel` owns status refresh UI only.
- `ProjectFileTree` owns search UI, loaded-node matching, result navigation, and reveal requests.
- The server owns bounded worktree path search and containment validation.
- Repo store state remains the source of truth for status and selected branch/worktree.

## Changes Tab Refresh

Add an icon-only button to `ProjectChangesActionBar`.

Behavior:

- Label: `Refresh changes`.
- Icon: `RefreshCw`.
- Click captures the repo `instanceToken` and calls `refreshStatus(repo.id, { token })`.
- The button is disabled and visually busy while the status resource is loading for the current repo.
- It does not call `syncAndRefresh`.
- It does not call `runRepoRefreshIntent` with `manual-refresh-requested`.
- It does not fetch remotes.
- It does not refresh branch snapshot or history.

Failure behavior:

- Existing change rows remain visible if stale data exists.
- Existing `resources.status.error` and stale notice behavior surfaces the failure.
- No local success state is invented by the button.

The copy should avoid the broader word `Sync` in this local toolbar because it would conflict with the topbar repository sync semantics.

## Files Tab Search UI

Add a compact search control to `FileTreeToolbar`.

Controls:

- Search input with placeholder `Search files`.
- Match count text such as `2 / 15`.
- Previous and next icon buttons.
- A small loading state while fallback search is running.
- A short inline error message for fallback search failures.

Keyboard behavior:

- `Enter` jumps to the next match.
- `Shift+Enter` jumps to the previous match.
- Clearing the input clears results and preserves the current tree selection.
- Search input focus should not trigger file tree copy, paste, rename, or undo shortcuts.

No-worktree behavior:

- The search input and navigation buttons are disabled when the selected branch has no worktree.

Repo/worktree switch behavior:

- Search query, loaded results, fallback results, active match index, loading state, and errors reset when `repoId` or active `worktreePath` changes.

## Loaded-Node Search

Loaded-node search runs entirely in the renderer against `flatNodes`.

Matching rules:

- Case-insensitive.
- Match `node.name`.
- Match `node.relativePath`.
- Include files, directories, symlink nodes, and virtual nodes that are currently loaded in the tree model.

Ranking:

1. File name prefix match.
2. File name contains match.
3. Relative path prefix match.
4. Relative path contains match.
5. Natural sort by relative path inside the same rank.

Navigation:

- The active result is selected in the tree.
- If the node is already visible, scroll directly to its row.
- If the result is known only as a relative path from fallback search, pass it into the existing reveal path flow.
- Navigation wraps around at the first and last result.

## Fallback Whole-Worktree Search

Fallback search exists to find paths that are not currently loaded into the lazy file tree.

Trigger:

- Debounce search text before running fallback search.
- Search loaded nodes first.
- If loaded results are empty for the stable query, trigger one fallback search for that query.
- User edits cancel the previous fallback request.
- Empty or whitespace-only queries do not search.

Result shape:

```ts
interface RepoFileSearchMatch {
  relativePath: string
  kind: 'file' | 'directory' | 'symlink' | 'other'
}

type RepoFileSearchResult =
  | {
      ok: true
      matches: RepoFileSearchMatch[]
      truncated: boolean
      limit: number
    }
  | {
      ok: false
      message: string
    }
```

Search constraints:

- Default limit: 100 matches.
- Hard cap enforced server-side.
- Results are relative paths only, plus a coarse kind.
- Do not return full directory contents.
- Prefer Git-backed candidate enumeration: `git ls-files -co --exclude-standard` for tracked and untracked non-ignored files, with directory matches derived from returned path prefixes.
- Skip `.git`.
- Skip common heavy generated directories such as `node_modules`, `dist`, `build`, `.next`, `.turbo`, `.cache`, and `coverage`.
- Server-side containment must ensure search stays inside the selected worktree.
- Remote search must use a cancellable SSH command and path-safe quoting.

Ranking should mirror loaded-node search as closely as practical. If the backend can only return naturally sorted candidate paths, the renderer can apply final ranking using each result's basename and relative path.

When fallback results are available:

- Merge display/navigation results with loaded-node results for the same query.
- Deduplicate by `relativePath`, preferring loaded nodes because they can scroll immediately.
- Show a truncated indicator such as `First 100 results` when `truncated` is true.
- Selecting a fallback-only result reveals the relative path, which loads parents and selects the final node or virtual path.

## Data Flow

Status refresh:

1. User clicks the `Changes` tab refresh icon.
2. `ProjectChangesPanel` calls `refreshStatus(repo.id, { token })`.
3. The existing status resource starts loading.
4. `getRepositoryStatus` returns `WorktreeStatus[]`.
5. Store updates `repo.data.status`, `statusLoaded`, and `worktreesByPath`.
6. `ProjectChangesPanel` rerenders from store state.

File search:

1. User types a query in the `Files` tab toolbar.
2. Component computes loaded-node matches from `flatNodes`.
3. If matches exist, count and navigation update immediately.
4. If no loaded matches exist after debounce, fallback search starts.
5. A newer query aborts the previous fallback request.
6. Successful fallback results are ranked, deduplicated, and displayed in the same navigation model.
7. Navigating to a loaded result selects and scrolls the visible node.
8. Navigating to a fallback-only result calls the existing reveal path logic.

## Error Handling

Changes refresh:

- Failed status refresh keeps existing visible data.
- Existing status stale/error UI remains responsible for user feedback.
- The refresh button only reflects pending state; it does not own separate result toasts.

File search:

- Loaded-node search has no error state.
- Fallback search failure displays a short message near the search control.
- Fallback search failure does not clear the current file tree.
- Cancelled fallback searches do not show errors.
- Stale fallback results from old queries must not replace newer search state.
- Over-limit fallback results return `truncated: true` rather than streaming more results.

Expected backend error keys:

- `error.invalid-arguments`
- `error.invalid-path`
- `error.path-not-found`
- `error.path-not-directory`
- `error.path-permission-denied`
- `error.failed-read-repo`
- `error.ssh-config-changed`

## Testing

Component tests:

- `ProjectChangesPanel` renders a refresh icon in the action bar.
- Clicking the icon calls `refreshStatus` with the current repo id and instance token.
- Clicking the icon does not call `syncAndRefresh`.
- The icon disables or shows loading while status refresh is active.
- Existing changes remain rendered during stale status errors.

File tree tests:

- Search input matches loaded file names.
- Search input matches loaded relative paths.
- Match count renders current index and total.
- `Enter` moves to the next match.
- `Shift+Enter` moves to the previous match.
- Navigation wraps around.
- Loaded match navigation selects and scrolls the existing node.
- No loaded match starts fallback search after debounce.
- A changed query aborts or ignores the older fallback result.
- Fallback results deduplicate loaded results by relative path.
- Selecting a fallback result calls the reveal path flow and loads parent directories.
- Search state clears when worktree changes.

Backend tests:

- Local search validates `worktreePath` containment.
- Local search rejects invalid paths and empty queries.
- Local search skips `.git` and configured heavy directories.
- Local search enforces result limits and sets `truncated`.
- Local search respects cancellation before applying results.
- Remote command builder quotes worktree path and query safely.
- Remote search maps common failures to existing error keys.

Verification:

- `bun run typecheck`
- Targeted component tests for `ProjectChangesPanel` and `ProjectFileTree`
- Targeted server/read-path tests for file search
- i18n snapshot tests
- `bun run test` if the targeted changes touch shared store or backend boundaries broadly

## Principles Applied

- KISS: status refresh uses the existing `refreshStatus` path instead of adding a new repo operation.
- YAGNI: search is not persisted and no index is introduced.
- DRY: file location reuses the existing reveal flow instead of implementing a second expansion path.
- SOLID: UI components handle interaction state, store actions handle repo state, and backend read paths handle filesystem/SSH search.

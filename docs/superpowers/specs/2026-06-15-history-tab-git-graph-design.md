# History Tab Git Graph Design

## Summary

Add a `History` tab to the existing repository explorer tab group. The tab shows the currently selected branch's commit history as a lightweight graph. Selecting a commit shows commit metadata and per-file change statistics.

The first version is read-only. It does not execute Git write operations, render full patch hunks, show every branch in the repository, or add a second history mode.

## Goals

- Add a `History` tab next to the existing `Files`, `Changes`, `Status`, and remote-only `Ports` tabs.
- Show the currently selected branch's reachable commits, starting with the latest 100 commits.
- Support `Load more` pagination for the selected branch.
- Render a lightweight commit graph with one row per commit.
- Select a commit and show:
  - full commit id
  - short commit id
  - subject
  - author
  - author date
  - parent commit ids
  - changed files with status and additions/deletions
- Allow file rows to reveal the file in the `Files` tab when the selected branch has a worktree.
- Support local repositories and SSH remote repositories through the existing repo backend abstraction.

## Non-Goals

- No full-repository `--all` graph.
- No PR-only commit filter.
- No full diff patch rendering or expandable hunks.
- No inline diff viewer.
- No refs, branch labels, or tag decorations.
- No new graph visualization dependency.
- No session persistence for history data.
- No changes to branch write actions, commit, merge, reset, pull, push, or checkout behavior.

## Current Context

`RepoExplorerPane` already owns the file area tab group and currently renders:

- `ProjectFileTree`
- `ProjectChangesPanel`
- `ProjectStatusPanel`
- `ProjectPortsPanel` for remote repositories

The repository data layer already has:

- `RepoBackend` abstraction for local and SSH remote repositories.
- local `getLog()` in `src/system/git/branches.ts`, but it only returns `LogEntry` and is not exposed through the server API.
- remote `getRemoteLog()` in `src/system/ssh/git.ts`, also not exposed through the server API.
- `LogEntry` and `parseLog()` in shared/system code, but the shape lacks parent commits and file detail data.
- read operation lanes and resource helpers that can be reused for cancellable read requests.

The design should extend those boundaries instead of bypassing them from the renderer.

## Data Model

Add shared renderer/server types in `src/shared/git-types.ts`:

```ts
export interface CommitHistoryEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents: string[]
}

export interface CommitFileChange {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown'
  additions: number
  deletions: number
  oldPath?: string
}

export interface CommitDetail {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents: string[]
  files: CommitFileChange[]
}
```

Use string literal unions rather than enums so the project remains compatible with Node.js strip-only TypeScript mode.

## Backend Design

Extend `RepoBackend` with read-only methods:

```ts
getHistory(branch: string, input: { limit: number; skip: number }, signal?: AbortSignal): Promise<CommitHistoryEntry[]>
getCommitDetail(commit: string, signal?: AbortSignal): Promise<CommitDetail | null>
```

Local repositories:

- Validate branch names with `isSafeBranchName`.
- Validate commit ids with `GIT_HASH_RE`.
- Read history with:

```txt
git log --format=<%H, %h, %s, %an, %aI, %P joined by FIELD_SEP> -n <limit> --skip <skip> <branch>
```

- Clamp `limit` to a bounded value such as 1-200.
- Normalize `skip` to a non-negative integer.
- Read commit metadata with:

```txt
git show -s --format=<%H, %h, %s, %an, %aI, %P joined by FIELD_SEP> <commit>
```

- Read file stats with two diff-tree calls and join the results by path:

```txt
git diff-tree --no-commit-id --name-status -r -M -C --root <commit>
git diff-tree --no-commit-id --numstat -r -M -C --root <commit>
```

For merge commits, first version behavior is "diff against Git's default parent comparison for this command." If the command yields no file rows for a merge commit, the UI still shows commit metadata and parents.

SSH remote repositories:

- Add equivalent read-only command variants to `src/system/ssh/commands.ts`.
- Expose remote history/detail through `src/system/ssh/git.ts`.
- Preserve the existing timeout/cancellation pattern used by remote snapshot, status, and patch commands.

Server routes:

- Add `/api/repo/history`.
- Add `/api/repo/commit-detail`.
- Keep both routes read-only and wrapped by the existing `jsonOr` fallback pattern.
- Invalid arguments return an empty history or `null` detail rather than throwing through to the renderer.

Renderer client:

- Add `getRepositoryHistory(repoId, branch, { limit, skip }, signal)`.
- Add `getRepositoryCommitDetail(repoId, commit, signal)`.

## UI Design

Add `history` to the explorer tab union:

```ts
type ExplorerTab = 'files' | 'changes' | 'status' | 'history' | 'ports'
```

Add `ProjectHistoryPanel` under `src/web/components/repo-workspace/`.

Layout:

- Left pane: graph list.
- Right pane: selected commit detail.
- Keep the panel within the existing explorer section, not a floating card.
- Use compact typography and existing selected/empty/error visual language.

Graph list row:

- lane graphic
- short hash
- subject
- author
- date

Detail panel:

- commit ids and metadata at the top
- parent hashes as compact text tokens
- file changes below with status, path, additions, and deletions
- reveal-to-files action for file rows when the selected branch has a worktree

File reveal:

- Reuse the existing `RepoExplorerPane` reveal request flow.
- A file row click switches to `Files` and reveals the path.
- If no worktree exists, file rows are displayed without reveal behavior.

## Frontend State

Keep history state local to `ProjectHistoryPanel`:

- active branch
- loaded commits
- selected commit hash
- detail cache for commits loaded during the component lifetime
- loading/error state for list and detail
- pagination state

Do not persist history data in session state. Do not add it to `RestorableRepoSnapshot`.

Use stale request protection:

- Abort or ignore history responses after branch changes.
- Abort or ignore detail responses after selected commit changes.
- Reset history when the selected branch changes.
- Reload the first page when the panel is visible and manual repo refresh completes.

## Error Handling

- No selected branch: show the existing branch-empty style.
- Invalid or missing branch: show an empty/error state in the history list.
- History load failure: show an error state in the left pane and keep the detail pane empty.
- Detail load failure: show the error in the right pane while preserving the list selection.
- Binary file numstat values of `-` are normalized to `0`.
- Unknown name-status codes map to `unknown`.
- Remote command failures return user-visible translation keys where possible.

## Internationalization

Add localized labels for:

- `tab.history`
- history empty state
- history load error
- commit detail empty state
- `Load more`
- file additions/deletions labels if not already reusable

Keep labels short so they fit the compact explorer toolbar.

## Testing

Parser tests:

- history parser with parents
- merge commit with multiple parents
- subject and author containing spaces and non-ASCII text
- name-status parser for added, modified, deleted, renamed, copied, unknown
- numstat parser for binary rows where additions/deletions are `-`

Backend tests:

- local command construction for history and detail
- invalid branch names are rejected
- invalid commit hashes are rejected
- remote command construction for history and detail

Route/client tests:

- `/api/repo/history` validates `repoId`, `branch`, `limit`, and `skip`
- `/api/repo/commit-detail` validates `repoId` and `commit`
- renderer client sends the expected payloads

Component tests:

- `History` tab appears in the explorer tab bar.
- entering the tab loads the selected branch history.
- changing selected branch resets and reloads history.
- clicking a commit loads and renders detail.
- `Load more` appends commits.
- history empty/error states render.
- detail error does not clear the graph list.
- file row reveal switches back to `Files`.

Verification commands:

```txt
bun run test src/system/git/parsers.test.ts src/system/git/branches.test.ts src/system/ssh/git.test.ts src/server/routes/repo.test.ts src/web/repo-client.test.ts src/web/components/repo-workspace/RepoExplorerPane.test.tsx
bun run typecheck
bun run check:architecture
```

Run broader `bun run test` if implementation touches shared refresh/store behavior beyond the component-local state described here.

## Design Principles

- KISS: use structured Git output and a lightweight renderer-side graph, not a graph library.
- YAGNI: ship current-branch history and required commit detail only.
- DRY: reuse repo backend, server route, repo client, tab, file path, and reveal patterns already present in the codebase.
- SOLID: keep Git parsing, backend reads, server routing, renderer fetching, graph layout, and commit detail rendering as separate units with narrow responsibilities.

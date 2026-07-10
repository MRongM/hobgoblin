# Remote Branches Tab Design

## Goal

Add a remote branches tab to the repository file area so users can inspect and manage remote branches from the same pane that already hosts files, changes, status, history, and ports.

The tab must support:

- Listing remote-tracking refs such as `origin/feature/a`.
- Searching the list locally.
- Refreshing the list manually.
- Deleting the real remote branch on the server with a second confirmation.

Deletion means the equivalent of:

```text
git push <remote> --delete -- <branch>
```

It does not mean only deleting the local remote-tracking ref with `git branch -dr`.

## Scope

In scope:

- Add a `remoteBranches` tab beside the existing repository explorer tabs.
- Add a focused `ProjectRemoteBranchesPanel` for list, search, refresh, and delete flows.
- Reuse `getRepositoryRemoteBranches(repoId)` for the default list.
- Use manual refresh through the existing user fetch path, then reload the remote branch list.
- Add an explicit remote-branch deletion API instead of reusing local branch deletion.
- Support both local repositories and SSH-backed remote repositories.
- Protect `main`, `master`, `develop`, and `trunk` from remote deletion.
- Require a destructive confirmation dialog before deleting any allowed remote branch.

Out of scope:

- Automatic fetch every time the tab opens.
- Batch delete.
- A separate action to delete only local remote-tracking refs.
- Force deleting protected branches.
- Redesigning `ProjectFileTree`, `BranchList`, or local branch actions.

## Current Context

The file area is composed in `src/web/components/repo-workspace/RepoExplorerPane.tsx`. Git repositories currently render tabs for files, changes, status, history, and remote-only ports. Non-git workspaces use a separate plain workspace path and should not receive this tab.

The app already has:

- `getRepositoryRemoteBranches()` in `src/web/repo-client.ts`.
- Remote-tracking ref parsing via `isRemoteTrackingRef()` and `parseRemoteTrackingRefs()` in `src/shared/worktree-create.ts`.
- Local and SSH repo backend boundaries in `src/server/modules/repo-backend.ts`.
- Local upstream deletion support through `deleteUpstreamBranch()` in `src/system/git/branches.ts`, which already uses `git push --delete`.
- Existing destructive confirmation primitives and translated branch deletion copy.

The new feature should reuse these boundaries while keeping local branch deletion and remote server branch deletion separate.

## Architecture

Add `remoteBranches` to the explorer tab union in `RepoExplorerPane`.

Create a new component:

```text
src/web/components/repo-workspace/ProjectRemoteBranchesPanel.tsx
```

The panel owns only remote branch management UI state:

- Loaded remote refs.
- Search query.
- Loading and refresh state.
- Inline load error.
- Delete confirmation payload.
- Delete pending/error state.

Add a dedicated client function:

```ts
deleteRepositoryRemoteBranch(
  repoId: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
): Promise<ExecResult>
```

Route it through:

```text
src/web/repo-client.ts
src/server/routes/repo.ts
src/server/modules/repo-write-paths.ts
src/server/modules/repo-backend.ts
src/system/git/branches.ts
src/system/ssh/git.ts
src/system/ssh/commands.ts
```

The repo backend should expose this as a distinct method, for example:

```ts
deleteRemoteServerBranch(remote: string, branch: string, signal?: AbortSignal): Promise<ExecResult>
```

Local implementation runs:

```text
git push <remote> --delete -- <branch>
```

SSH implementation runs the same git operation in the remote repository through the existing remote command mechanism.

This keeps responsibilities separated:

- UI panel owns interaction state.
- Web client owns HTTP request shape.
- Server route owns input normalization.
- Repo backend owns local versus SSH dispatch.
- System git layer owns safe command construction.

## Interaction Design

The remote branches tab uses a compact list, matching the existing file-area utility panels. Each row shows the full ref, for example:

```text
origin/feature/a
```

The panel toolbar includes:

- Search input.
- Refresh button.

Refresh behavior:

1. Run the existing user fetch path for the repository.
2. Reload remote branches from `getRepositoryRemoteBranches(repoId)`.
3. Keep the current tab active.

Empty and error states:

- No remote branches: show an empty state.
- Search has no matches: show a filtered empty state.
- Initial load fails: show an inline error state with retry through refresh.

Delete behavior:

1. User clicks the row delete action.
2. Protected branches keep the delete action visible but disabled with an explanatory tooltip.
3. A destructive confirmation dialog opens for allowed branches.
4. The dialog states that this deletes the branch from the remote server.
5. The dialog shows:
   - Remote, such as `origin`.
   - Branch, such as `feature/a`.
   - Full ref, such as `origin/feature/a`.
6. Confirm runs the dedicated remote branch deletion API.
7. Success reloads the list and triggers repo refresh so local branch tracking state can update.

## Data Model And Validation

Remote branch refs remain strings in the existing `remote/branch` shape.

Add a pure helper that parses a remote ref into:

```ts
type RemoteBranchRefParts = {
  remote: string
  branch: string
  fullRef: string
}
```

Parsing rules:

- Split at the first `/`.
- The prefix is `remote`.
- The remainder is `branch`, preserving nested branch names such as `feature/a`.
- Accept only refs that pass `isRemoteTrackingRef(ref)`.
- Reject `*/HEAD`, which `isRemoteTrackingRef()` already excludes.
- Validate the branch with `isSafeBranchName`.
- Validate the remote with the same remote name rule used by `isRemoteTrackingRef`.
- Treat protected status by checking the branch part only.

Examples:

```text
origin/main -> protected
upstream/main -> protected
origin/feature/a -> deletable
origin/HEAD -> invalid
```

Server and system layers must repeat validation. Renderer validation is only for user experience.

## Error Handling

List load failures stay inside the remote branches panel and do not affect other tabs.

Delete failures surface through existing `ExecResult.message` handling. The list remains unchanged until a successful reload.

If the remote branch was already deleted by another actor, the git command may fail. The app should surface that result instead of treating it as success; the user can refresh to reconcile state.

Cancelled operations follow existing repo operation behavior and should avoid noisy destructive-error messaging.

## Testing

Add focused tests for:

- Pure ref parsing, search, and protected-branch helpers.
- Web client request shape for deleting a remote server branch.
- Server route input normalization and invalid input rejection.
- Local system git command construction and validation.
- SSH remote command construction and validation.
- React panel loading, search, refresh, protected branch behavior, delete confirmation, and success reload.
- `RepoExplorerPane` rendering the new tab for git repositories and not for plain workspaces.

Run verification:

```text
bun run typecheck
bun run test
bun run check:architecture
```

## Design Principles

KISS: The feature is a single panel with list, search, refresh, and delete. It does not introduce batch management or hidden auto-fetch behavior.

YAGNI: No new generic branch management framework is added. The API is specific to deleting remote server branches.

DRY: The design reuses remote-tracking ref parsing, existing fetch behavior, repo backend dispatch, confirmation primitives, and repo refresh flows.

SOLID: Local branch deletion, remote server branch deletion, UI interaction state, backend dispatch, and git command construction remain separate responsibilities.

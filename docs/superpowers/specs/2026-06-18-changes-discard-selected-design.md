# Changes Discard Selected Design

## Goal

The `Changes` tab should let users discard uncommitted changes for selected files or folders instead of forcing an all-worktree reset.

The feature must support:

- Single changed file discard.
- Changed folder discard.
- Multi-selection discard across files and folders.
- Local repositories and SSH-backed remote repositories.
- Staged, unstaged, and untracked changes in the selected paths.

## Scope

In scope:

- Add explicit selection controls to the `Changes` tab in both tree and list views.
- Add a toolbar action for discarding the current selection.
- Add a confirmation dialog for every discard operation.
- Add a repository write API for path-scoped discard.
- Implement equivalent local and SSH remote Git mutations.
- Refresh repository snapshot/status after successful mutations.
- Keep failed selections intact so the user can retry or adjust.

Out of scope:

- Hunk-level discard.
- Stage/unstage controls.
- A separate hover-only discard action per row.
- A no-confirm fast path.
- Special merge-conflict resolution UX.
- Replacing the existing all-worktree `reset-hard` branch action.

## Confirmed Decisions

- Use explicit checkboxes plus a top toolbar action.
- Discard means all uncommitted changes under the selected paths: staged, unstaged, and untracked.
- Always show a confirmation dialog.
- Support local and SSH remote repositories from the first version.
- Do not create a git commit for this design document unless the user explicitly requests it.

## Current State

`ProjectChangesPanel` renders the selected branch worktree changes through `StatusList`.

- `ProjectChangesPanel` owns the view mode state and action bar.
- `StatusList` renders changed paths in list or tree mode.
- Tree mode uses `FilePathTreeList`, which already derives directory rows from changed file paths.
- Path clicks call `onRevealPath(relativePath)` and switch/reveal in the Files tab.
- The action bar currently exposes commit and file-list view mode controls.
- The existing destructive reset action is a branch action:
  - UI calls `resetRepositoryHard(repo.id, worktreePath)`.
  - Server route calls `resetRepositoryHard`.
  - Backend runs `git reset --hard` locally or remotely.

That reset action discards the whole worktree and is not suitable for file/folder-scoped discard.

## Architecture

Add a focused repo mutation instead of making the renderer construct Git commands.

The write path should be:

```text
ProjectChangesPanel
  -> repo-client.ts discardRepositoryChanges(repoId, worktreePath, paths)
  -> POST /api/repo/discard-changes
  -> repo-write-paths.ts discardRepositoryChanges(...)
  -> RepoBackend.discardChanges(worktreePath, paths)
  -> system/git/reset.ts or system/ssh/git.ts
```

The API input is:

```ts
{
  repoId: string
  worktreePath: string
  paths: string[]
}
```

`paths` are repository-relative paths from `git status --porcelain -z`.

Server-side validation should reject:

- Invalid repo locators.
- Non-absolute `worktreePath`.
- Empty `paths`.
- Empty path entries.
- Absolute path entries.
- Path entries containing `..` segments.

Discard mutations need a slightly stricter refresh rule than ordinary one-step writes. Server-side input validation failures should not publish invalidation. Once the backend starts the Git discard operation, the server should publish repo snapshot invalidation for both success and failure, because `git restore` and `git clean` are not transactional and a failed command may still leave partial filesystem changes.

## Git Semantics

Discarding selected paths should remove all uncommitted changes in those paths.

Local implementation:

```text
git restore --staged --worktree --source=HEAD -- <paths...>
git clean -fd -- <paths...>
```

Remote implementation:

```text
git -C <worktree> restore --staged --worktree --source=HEAD -- <paths...> &&
git -C <worktree> clean -fd -- <paths...>
```

The implementation should pass local paths as process arguments, not shell-concatenated strings. Remote command construction should shell-quote every path and keep `--` before the pathspecs.

Behavior notes:

- Modified tracked files revert to `HEAD`.
- Deleted tracked files are restored from `HEAD`.
- Staged changes are unstaged and reverted.
- Untracked files and directories under selected paths are deleted by `git clean -fd`.
- Folder discard passes the relative directory path and lets Git pathspec handling apply it recursively.
- Merge-conflict or unmerged states are not handled with custom recovery in this feature. If Git fails, the failure is returned through `ExecResult`.

## UI Design

The `Changes` tab remains a compact operational panel.

Tree and list views should both support selection:

- File rows show a checkbox before the status code/path content.
- Directory rows show a checkbox and folder label.
- Checking a directory selects all currently visible changed entries under that directory.
- Mixed directory selection should render as indeterminate where the underlying checkbox primitive supports it.
- Clicking a path still reveals it in the Files tab.
- Clicking a checkbox only changes selection.

The action bar should show:

- Existing commit control.
- `N selected` when the selection is non-empty.
- A destructive `Discard selected` button when the selection is non-empty.
- Existing file view mode controls when changes exist.

Selection state should be component-local to `ProjectChangesPanel` because it is short-lived interaction state.

After status data changes, selection should be intersected with the current changed paths so stale paths naturally disappear.

## Confirmation UX

Every discard action opens a confirmation dialog.

Title variants:

- One file: `Discard changes to this file?`
- One folder: `Discard changes in this folder?`
- Multiple selected targets: `Discard changes to {count} selected items?`

Body:

- State that staged, unstaged, and untracked changes under the selected paths will be discarded.
- State that untracked files and folders will be deleted and cannot be restored from Git.

Confirm button:

- Destructive variant.
- Label: `Discard`.

On success:

- Close the dialog.
- Clear current selection.
- Write the result through `setLastResult`.
- Let repo invalidation refresh Changes, Files, and branch dirty summary.

On failure:

- Close or keep the dialog according to existing `ConfirmDialog` behavior.
- Preserve current selection.
- Write the failure through `setLastResult`.
- Rely on the discard write path to publish invalidation when Git was attempted, so partial changes do not leave stale status in the UI.

## Error Handling

Use existing `ExecResult` behavior.

- Invalid input returns `{ ok: false, message: 'error.invalid-arguments' }`.
- Git failures return the Git-derived message from the local or remote runner.
- Validation failures before Git starts must not publish repo snapshot invalidation.
- Failures after Git starts should publish repo snapshot invalidation, because partial changes are possible.
- The UI should not invent success if status has not refreshed yet.

## Testing

System Git tests:

- `discardChangesForPaths` calls `git restore --staged --worktree --source=HEAD -- <paths...>`.
- It then calls `git clean -fd -- <paths...>`.
- Multiple paths preserve argument boundaries.
- A failed restore returns failure and does not run clean.
- A failed clean returns failure.

SSH tests:

- Remote command type includes path array.
- Command builder shell-quotes worktree path and every selected path.
- Command builder includes `--` before pathspecs for both restore and clean.
- Remote Git wrapper returns `ExecResult` from remote command result.

Server tests:

- Route parses `repoId`, `worktreePath`, and `paths`.
- Invalid path arrays return `error.invalid-arguments`.
- Local backend dispatches to the local discard implementation.
- Remote backend dispatches to the remote discard implementation.
- Successful discard mutations publish repo snapshot invalidation.
- Git-attempted discard failures publish repo snapshot invalidation.
- Validation failures do not publish invalidation.

Web tests:

- `repo-client.ts` posts the correct body.
- `ProjectChangesPanel` renders checkboxes in tree and list views.
- Selecting a file enables `Discard selected`.
- Selecting a folder selects all changed child paths.
- Multi-selection shows the selected count.
- Confirming calls the discard client with relative paths.
- Success clears selection.
- Failure preserves selection.
- Path reveal clicks still call `onRevealPath`.

## Principle Notes

- KISS: one focused mutation for path-scoped discard, no staging model or hunk UI.
- YAGNI: no fast discard, no hunk-level support, no merge-conflict-specific UX.
- DRY: reuse repo client, route, backend, invalidation, and confirmation patterns.
- SOLID: renderer owns interaction state; server write paths own validation and mutation orchestration; system modules own Git command details.

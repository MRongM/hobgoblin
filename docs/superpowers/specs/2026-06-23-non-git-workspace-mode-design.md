# Non-Git Workspace Mode Design

**Date:** 2026-06-23  
**Status:** Approved design; implementation not started  
**Supersedes:** `docs/superpowers/specs/2026-06-22-non-git-directory-support-design.md`

## Overview

Hobgoblin must support opening and using readable local directories that are not Git repositories. A non-Git local directory is a plain project workspace: files and terminal are usable, while branch and Git features are hidden or disabled. Remote repository testing and import must not require local Git availability or require the remote path to already be a Git repository.

This design uses `RepoState.isGitRepo` as the single runtime capability flag. Git workspaces keep the existing behavior. Non-Git local workspaces use the same repo tab and file explorer shell, but render only features that do not depend on Git metadata.

## Goals

- Open any readable local directory without rejecting it for `error.not-git-repo`.
- Hide the branch area for non-Git local workspaces.
- Keep the file tree usable for non-Git local workspaces.
- Provide a terminal for non-Git local workspaces, scoped to the opened directory.
- Show only file and terminal tabs for non-Git local workspaces. The current ports panel is remote-port-forwarding oriented, so non-Git local workspaces omit `Ports` unless the implementation explicitly adds useful local port behavior in the same scope.
- Disable or hide all branch-related and Git-related operations when `isGitRepo === false`.
- Let remote test and import flows validate remote target access without requiring Git availability or Git repository detection.

## Non-Goals

- Do not provide an "Initialize Git Repository" action in non-Git mode.
- Do not add Git initialization options.
- Do not redesign the full repo/workspace domain model.
- Do not make local port forwarding or local port discovery a new feature.
- Do not change normal Git repository behavior.

## Backend Contract

Local repository probing distinguishes three cases:

- Readable Git repository: `{ ok: true, root, name, isGitRepo: true }`
- Readable non-Git directory: `{ ok: true, root: directoryPath, name, isGitRepo: false }`
- Invalid path, missing path, non-directory, or unreadable path: `{ ok: false, message }`

The renderer stores this result as `RepoState.isGitRepo`. Missing or `true` means normal Git mode. Explicit `false` means plain workspace mode.

Remote test and import must not depend on local `git` availability and must not reject a remote path because Git metadata cannot be detected. Remote validation remains limited to the remote configuration, connection, and path/input checks needed to create a usable remote workspace.

## Renderer Workspace Behavior

### Layout

For `repo.isGitRepo === false` and a local repo id:

- The branch pane is not rendered.
- The workspace body becomes a single project pane instead of branch pane plus detail pane.
- The file area toolbar shows only tabs that are meaningful for a plain directory.
- `Files` is the default active tab.

Visible tabs:

- `Files`: existing project file tree.
- `Terminal`: terminal sessions rooted at the opened directory.
- `Ports`: omitted for the current scope because the existing ports panel is remote-port-forwarding oriented. It may be added only if the implementation also adds useful local port behavior.

Hidden tabs:

- `Changes`
- `Status`
- `History`

### Top-Level Chrome

For non-Git local workspaces:

- The repo toolbar hides branch search/filter controls.
- Create worktree, branch activity, branch actions, and branch shortcuts are not mounted.
- The repo tab uses a plain folder icon instead of a Git repository icon.
- Layout controls are hidden when they no longer affect the visible plain workspace.

### Branch Detail

`BranchDetail` remains Git-only. Non-Git workspaces do not render branch detail, branch detail toolbar, branch terminal tabs, branch action dialogs, or detail focus controls tied to branch state.

## Terminal Design

The current terminal model is scoped by `{ repoRoot, branch, worktreePath }`. Non-Git local workspaces still need one or more terminal sessions in the opened directory, without exposing synthetic branch data to the user.

Use a small compatibility boundary:

- `repoRoot`: the opened directory path.
- `worktreePath`: the same opened directory path.
- `branch`: a stable internal label such as `workspace`.

The synthetic branch label is only an internal terminal protocol value. It must not appear in visible UI copy.

Terminal session keys remain stable because `repoRoot` and `worktreePath` are both stable for the opened directory. The terminal catalog must allow local non-Git workspace terminal creation without calling `getWorktrees()` or `resolveKnownWorktree()` for that workspace.

## Git Operation Gating

All Git-dependent reads and writes must be gated by `repo.isGitRepo`.

When `isGitRepo === false`:

- Do not refresh branches, status, history, remotes, pull requests, or worktrees.
- Do not mount branch action controls.
- Do not register branch action keyboard shortcuts.
- Do not allow `runBranchAction` or `submitBranchAction` to execute Git operations for that repo.
- Do not show create worktree.
- Do not show Git empty states that imply there are branches but none matched.

Implement Git gating with a centralized capability helper or focused store-level guard rather than repeated ad hoc checks across components. Components may still branch on `repo.isGitRepo` for layout decisions.

## Data Flow

1. User opens a local directory through dialog, drag/drop, recent entry, or session restore.
2. Server probe returns `isGitRepo`.
3. Repo lifecycle writes `isGitRepo` into `RepoState`.
4. Initial refresh runs Git data loading only for Git repos.
5. Non-Git local workspace renders the plain workspace pane.
6. File tree reads use the opened path directly.
7. Terminal creation uses the opened path as both repo root and terminal cwd.

For remote import:

1. User enters/selects remote target.
2. Remote validation checks only remote connection/path requirements.
3. Workspace is opened even if Git metadata cannot be detected.
4. Git data failures after opening are handled by the existing Git panel error or empty states and do not retroactively close or reject the imported workspace.

## Error Handling

- Local invalid path and permission failures still show existing open failure behavior.
- Local readable non-Git directories are not errors.
- Non-Git terminal creation failures show the existing terminal error state.
- Hidden Git features should not emit errors just because the repo is non-Git.
- Remote Git detection failures must not be surfaced as import blockers.

## Testing

Server tests:

- Local readable non-Git directory probe returns `ok: true` and `isGitRepo: false`.
- Local invalid/unreadable paths still return `ok: false`.
- Remote test/import paths do not fail when Git availability or Git repo detection fails.

Store tests:

- `RepoState.isGitRepo` is propagated from probe results.
- Non-Git repos do not trigger core Git refresh paths.
- Branch action runners reject or no-op for non-Git repos.
- Session restore preserves non-Git mode after probing.

UI tests:

- Non-Git local workspace hides branch pane.
- Non-Git local workspace shows `Files` and `Terminal`.
- Non-Git local workspace hides `Changes`, `Status`, and `History`.
- Non-Git local workspace hides create worktree and branch action controls.
- Repo tab icon distinguishes plain directories from Git repos.

Terminal tests:

- Non-Git local workspace can create a terminal rooted at the opened directory.
- Non-Git terminal sessions can be selected, reordered, and closed.
- Non-Git terminal session keys remain stable across render/sync.
- Existing Git terminal behavior is unchanged.

## Implementation Notes

- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Keep changes scoped to repo lifecycle, workspace rendering, action gating, remote validation, and terminal compatibility.
- Avoid introducing a broad workspace abstraction unless the existing terminal and repo boundaries cannot stay clear with a small compatibility boundary.
- Remove or replace the current `NonGitRepoPlaceholder`/Git-init UI path because this design intentionally does not offer Git initialization.

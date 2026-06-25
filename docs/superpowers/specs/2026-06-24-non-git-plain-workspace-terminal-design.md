# Non-Git Plain Workspace Terminal Design

**Date:** 2026-06-24  
**Status:** Draft for implementation  
**Supersedes:** `docs/superpowers/specs/2026-06-23-non-git-workspace-mode-design.md`

## Overview

Non-Git local directories should open as plain workspaces without any Git-specific empty state or initialization prompt. The user should see the file area and terminal area directly. The terminal area should automatically create the first session for the opened directory so the workspace is immediately usable.

This design refines the earlier non-Git workspace mode work. The key behavior change is that plain workspaces are terminal-first once the workspace is opened: they do not show `branches.empty`, do not show a Git initialization placeholder, and do not require the user to manually create the first terminal session.

## Goals

- Open readable local directories that are not Git repositories.
- Render non-Git local directories as plain workspaces with only files and terminal.
- Automatically create the first terminal session for a plain workspace when the terminal area is opened and no session exists yet.
- Keep the terminal scoped to the opened directory.
- Prevent Git empty states such as `branches.empty` from appearing in plain workspace mode.
- Preserve existing Git workspace behavior unchanged.

## Non-Goals

- Do not add Git initialization in non-Git mode.
- Do not redesign repo probing or remote repository validation.
- Do not add local ports support to plain workspaces.
- Do not change Git repository behavior or branch workflows.

## Behavior

### Plain Workspace Entry

When `repo.isGitRepo === false` for a local repository:

- The branch pane is not rendered.
- The workspace renders `PlainWorkspacePane`.
- The file tab is available.
- The terminal tab is available.
- Git-oriented tabs and controls are hidden.

### Terminal Auto-Entry

When `PlainWorkspaceTerminalPanel` mounts for a plain workspace:

- If there is no terminal session for that workspace yet, it creates one automatically.
- The session uses the existing non-Git compatibility boundary:
  - `repoRoot`: the opened directory path
  - `worktreePath`: the opened directory path
  - `branch`: the stable internal non-Git label already used by the terminal model
- If a session already exists, the panel reuses it and does not create another one.

The auto-create behavior is limited to the first missing session. It must not create duplicate sessions on re-render, tab switching, or unrelated store updates.

### Empty State Rules

Plain workspace mode must not reuse any Git empty state text.

- `branches.empty` must not appear in plain workspace mode.
- `NonGitRepoPlaceholder` must not be used for local plain workspaces.
- Any empty state in the file area or terminal area must describe the actual plain-workspace condition, not a missing branch.

## Data Flow

1. User opens a readable local directory.
2. Probe marks the workspace as `isGitRepo: false`.
3. Repo state stores the plain-workspace capability.
4. `RepoView` routes the repo into the plain workspace shell.
5. `PlainWorkspacePane` renders files and terminal tabs.
6. `PlainWorkspaceTerminalPanel` checks whether a session exists.
7. If no session exists, it creates the first terminal session for the opened directory.

## Error Handling

- If terminal auto-creation fails, the terminal area shows the existing terminal error or empty state for that panel.
- File tree rendering continues independently of terminal session creation.
- Plain workspace mode must not surface Git-specific errors or branch empty-state copy.

## Testing

UI tests:

- Non-Git local workspaces render `PlainWorkspacePane` instead of the branch/detail layout.
- Plain workspace terminal panels auto-create the first session exactly once.
- Plain workspace mode does not render `branches.empty`.
- Plain workspace mode does not render `NonGitRepoPlaceholder`.

Store and terminal tests:

- Plain workspace terminal keys remain stable across re-render.
- Existing sessions are reused rather than duplicated.
- Git workspace terminal behavior remains unchanged.

## Implementation Notes

- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Keep the change scoped to workspace rendering and terminal session bootstrap.
- Do not introduce a new workspace abstraction unless the current plain-workspace boundary cannot remain small.

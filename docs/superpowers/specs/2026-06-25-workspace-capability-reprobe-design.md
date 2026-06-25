# Workspace Capability Reprobe Design

**Date:** 2026-06-25
**Status:** Approved design; implementation not started

## Overview

Hobgoblin already represents Git and plain workspaces through `RepoState.isGitRepo`.
Opening the same workspace path again can already update that capability in place.
The missing behavior is refresh-triggered reprobing: when a plain workspace gains Git
metadata, or a Git workspace loses Git metadata, the current tab should switch mode
without closing, reimporting, or changing workspace order.

This design makes manual refresh re-probe the workspace capability before running
Git data refresh. Session restore continues to re-probe through the existing
hydration path. Automatic `.git` file watching is a future enhancement and is not
part of this implementation.

## Goals

- Refreshing a plain workspace re-probes the path and switches it to Git mode if
  it is now a Git repository.
- Refreshing a Git workspace re-probes the path and switches it to plain mode if
  it is no longer a Git repository.
- Keep the current workspace tab, order, active selection, and terminal processes.
- Cover both local directories and SSH remote workspaces.
- Reuse the existing repo lifecycle capability update path instead of adding a
  parallel workspace conversion model.
- Keep session restore behavior based on probing the current workspace state.

## Non-Goals

- Do not add automatic `.git` creation or deletion watching in this phase.
- Do not add an "Initialize Git Repository" button.
- Do not close or recreate terminal sessions during mode switches.
- Do not redesign the repo/workspace domain model.
- Do not change normal Git branch, status, history, or worktree behavior beyond
  the capability reprobe that happens before refresh.

## Architecture

The repo lifecycle layer owns workspace capability changes. UI components should
trigger refresh intent only; they should not inspect `.git`, call probe directly,
or write `RepoState.isGitRepo`.

Add or extract a focused lifecycle helper such as `reprobeWorkspaceCapability`.
The helper should reuse the existing pieces:

- `resolveRepoPath()` for local and remote probing.
- `addResolvedRepo()` for in-place repo updates and `isGitRepo` changes.
- Existing token rotation when the capability changes.
- Existing Git projection cleanup when a repo becomes plain.
- Existing initial Git refresh when a repo becomes Git-capable.

The helper should accept the current `repoId` and `instanceToken`. It only writes
probe results when the repo still exists and the token still matches. This keeps
stale async refreshes from mutating a workspace after it has been closed, reopened,
or switched by another reprobe.

## Refresh Behavior

Manual refresh becomes:

1. Capture the current `repoId` and `instanceToken`.
2. Re-probe the workspace capability.
3. If probing fails, mark the repo unavailable and stop.
4. If the repo is plain after reprobe, stop without running Git snapshot, status,
   pull request, or fetch paths.
5. If the repo is Git after reprobe, run the existing Git refresh pipeline.

Capability outcomes:

- Plain to Git: set `isGitRepo` to `true`, rotate `instanceToken`, then start
  snapshot/status refresh for the new Git-capable instance.
- Git to plain: set `isGitRepo` to `false`, rotate `instanceToken`, clear Git
  projection data, and render the plain workspace shell.
- Git to Git: continue existing manual sync and refresh behavior.
- Plain to plain: finish the refresh without Git reads and keep the plain shell.

The implementation should avoid duplicating capability transition logic. If a
manual refresh needs to call `ensureWorkspaceOpen()` internally for the current
repo, it must preserve active tab state and avoid reordering; otherwise a narrow
helper can call `resolveRepoPath()` and `addResolvedRepo()` directly.

## UI Behavior

The repo-level refresh affordance must be visible for plain workspaces as well as
Git workspaces. Plain workspaces need that control to pick up external Git
initialization or Git metadata removal.

Expected visible behavior:

- The user opens a plain local or remote workspace.
- The user creates Git metadata from the terminal or another tool.
- The user clicks refresh.
- The existing workspace tab switches in place to Git mode and loads branch/status
  data.

The reverse also works:

- The user has a Git workspace open.
- Git metadata is removed externally.
- The user clicks refresh.
- The same tab switches to plain workspace mode.

The app must not require reimport, close/reopen, or drag/drop to pick up the new
mode. It also must not show Git empty states such as `branches.empty` for a plain
workspace after reprobe.

## Session Restore

Session restore already reopens saved workspaces through the probing path. Keep
that behavior. A workspace saved as Git may restore as plain if Git metadata was
removed before launch. A workspace saved as plain may restore as Git if Git
metadata was added before launch.

No additional persisted "workspace kind" should become authoritative over the
probe result. `RepoState.isGitRepo` remains the runtime capability projection.

## Terminal Handling

Do not close terminal sessions during capability switches. Terminal processes are
runtime state owned by the terminal subsystem, not Git projection data.

Rules:

- Plain to Git keeps the root-directory terminal sessions.
- Git to plain keeps terminal processes, but the plain UI shows only the workspace
  root terminal group.
- Git worktree terminals that are not visible in plain mode are not killed by the
  capability switch.
- Existing close-tab lifecycle cleanup still owns terminal shutdown behavior.
- The internal non-Git synthetic branch label remains internal and must not be
  shown in visible UI copy.

## Error Handling

- Probe failure marks the repo unavailable and uses the existing unavailable view.
- Unavailable retry uses the same manual refresh/reprobe path and can recover to
  either Git or plain mode.
- Git snapshot/status/fetch failures after a successful Git reprobe keep existing
  Git refresh error behavior.
- Plain refresh does not run Git reads, so it should not emit Git-specific errors
  or render Git empty states.
- SSH connection failure or remote target failure marks the remote workspace
  unavailable.
- SSH target available but not Git-capable renders a plain remote workspace.

## Testing

Store tests:

- Manual refresh on a plain local workspace re-probes and does not run Git reads
  when it remains plain.
- Manual refresh switches a plain local workspace to Git and starts snapshot/status.
- Manual refresh switches a Git local workspace to plain and clears Git projection.
- Remote plain to Git and Git to plain use the same lifecycle behavior.
- Probe failure during manual refresh marks the workspace unavailable.
- Unavailable retry can restore to Git or plain mode.
- Capability changes rotate `instanceToken` so stale refresh results are ignored.

UI tests:

- Plain workspace shows the repo refresh control.
- Plain to Git refresh switches the current tab in place.
- Git to plain refresh switches the current tab in place.
- Tab order and active workspace are unchanged by capability switches.
- Plain workspace after reprobe does not render Git empty states.

Terminal tests:

- Capability switches do not call terminal close/delete paths.
- Existing plain root terminal sessions remain usable after plain to Git.
- Existing terminal processes are preserved after Git to plain.
- Plain UI shows the root workspace terminal group after Git to plain.

## Implementation Notes

- Keep repo-alias imports with explicit `.ts`/`.tsx` extensions.
- Prefer a small lifecycle helper over a new broad workspace abstraction.
- Keep UI changes limited to exposing refresh for plain workspaces and routing
  refresh through the updated store action.
- Keep Git operation guards intact: Git reads and writes still require
  `repo.isGitRepo !== false` after reprobe.
- Do not persist a separate authoritative workspace kind; probing remains the
  source of truth for current capability.

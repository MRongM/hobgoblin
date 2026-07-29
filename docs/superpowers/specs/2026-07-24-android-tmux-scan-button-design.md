# Android tmux scan button design

## Goal

Allow a user to manually rescan the current remote project for running,
discoverable Hobgoblin tmux sessions and merge newly recovered terminals into
the existing project terminal list.

## Scope

- Add a `Scan tmux` action to the project's `Remote SSH` terminal panel.
- Keep the existing automatic scan when the Terminals tab becomes available.
- Scan only the current project root and the usable worktree paths already
  accepted by `repositoryTmuxDiscoveryPaths`.
- Reuse the existing remote discovery, metadata validation, deterministic name
  validation, and terminal recovery flow.

The feature does not scan every configured project, expose arbitrary tmux
sessions, or add a second terminal list model.

## Interaction

- The button is enabled when discovery paths are available and no scan is in
  progress.
- While scanning, it is disabled and its label changes to `Scanning...`.
- A successful scan relies on the existing terminal-session observer to update
  the visible list.
- A failed scan uses the existing repository action error surface.
- A recovered session remains an Android `disconnected` terminal until the user
  opens it and attaches to the running remote tmux session.

## State and data flow

`RepositoryWorkspaceScreen` owns the transient scan-in-progress state because
it already owns discovery orchestration and repository action errors. Both the
automatic effect and manual button call one scan function, which rejects
re-entry and invokes the existing `onDiscoverTmuxTerminals` callback on the IO
dispatcher.

The callback remains project-scoped:

1. Discover associated remote tmux sessions.
2. Validate Hobgoblin metadata and deterministic identity.
3. Convert discoveries into recovery candidates.
4. Merge candidates into `TerminalSessionManager`.
5. Let the observed terminal-session list recompose the panel.

## Error and concurrency policy

- Only one scan may run for a repository screen at a time.
- Scan state is cleared in all success and failure paths.
- A new scan clears the previous action error before starting.
- Discovery failures do not remove or mutate already retained terminals.

## Tmux startup fallback

The Android startup payload must make tmux and the native login shell mutually
exclusive branches. When tmux is available, the payload executes the tmux
attach-or-create command and must not continue to `exec "${SHELL:-/bin/sh}"
-l`. The native login shell is executed only from the `else` branch when tmux
is unavailable.

## Testing

- Unit-test scan action state: ready, unavailable, and scanning.
- Unit-test stable button labels.
- Unit-test that the tmux startup branch cannot fall through to the native
  login shell.
- Run Android unit tests plus repository-wide type, test, architecture, and
  whitespace checks.

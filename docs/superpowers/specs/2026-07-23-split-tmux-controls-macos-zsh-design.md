# Split Tmux Controls and macOS Zsh Launch Design

**Date:** 2026-07-23

**Status:** Approved for autonomous implementation

## Summary

Replace the single tmux preference with independent local and remote preferences. Each preference controls both in-app terminals and built-in external Terminal/Ghostty launches for its location. Fix local macOS tmux discovery by performing the availability check in the user's login shell instead of a fixed `/bin/sh` wrapper whose GUI-launch PATH may omit Homebrew.

## Goals

- Let users enable tmux independently for local and SSH terminal launches.
- Apply the local preference to local in-app terminals and local Terminal/Ghostty actions.
- Apply the remote preference to SSH in-app terminals and remote Terminal/Ghostty actions.
- Preserve existing behavior during upgrade by migrating the current global preference to both scoped preferences.
- Preserve older remote-only installations by migrating their remote preference only to the remote scope.
- Make a Homebrew tmux found by the user's macOS zsh login environment available to local terminal launches.

## Non-goals

- Changing tmux session identity or lifecycle semantics.
- Managing, killing, or migrating existing tmux sessions.
- Changing active terminal sessions immediately when a setting changes.
- Adding per-project or per-terminal overrides.
- Adding new dependencies or realtime channels.

## Settings Model

Server-owned runtime-coherent settings expose two booleans:

```ts
interface SettingsPrefs {
  localTerminalTmuxEnabled: boolean
  remoteTerminalTmuxEnabled: boolean
}
```

Both default to `false`. Settings invalidation and refetch remain unchanged.

Persisted settings use this migration order independently for each scope:

- Local: valid `localTerminalTmuxEnabled`, then valid legacy global `internalTerminalTmuxEnabled`, then `false`.
- Remote: valid `remoteTerminalTmuxEnabled`, then valid legacy global `internalTerminalTmuxEnabled`, then `false`.

The historical `remoteTerminalTmuxEnabled` field already has remote-only semantics, so it is also the new canonical remote field. A subsequent settings write persists only the two scoped fields and removes `internalTerminalTmuxEnabled`.

## Routing

The terminal catalog receives two narrow preference readers. Its local path reads only `localTerminalTmuxEnabled`; its SSH path reads only `remoteTerminalTmuxEnabled`.

External launch routing follows the same boundary:

- Local repository, worktree, plain-workspace, and branch-workspace Terminal/Ghostty actions use the local preference.
- SSH repository, worktree, plain-workspace, and branch-workspace Terminal/Ghostty actions use the remote preference.

The renderer only edits and projects settings. It does not decide which preference applies to a launch target.

## Local Login-shell Invocation

The demonstrated failure has this boundary mismatch:

1. A macOS GUI-launched server starts the managed local wrapper with `/bin/sh -lc`.
2. That shell's PATH does not include `/opt/homebrew/bin`, so `command -v tmux` reports missing.
3. The wrapper falls back to `/bin/zsh -l`.
4. Zsh initialization adds Homebrew to PATH, but the tmux decision has already been made; `TMUX` remains unset.

The local invocation builder will select the same safe absolute login shell used for fallback and use it as the wrapper command:

```text
<login-shell> -lc <managed-script>
```

The managed script keeps the current semantics: change to the target directory, attach/create the deterministic tmux session when `command -v tmux` succeeds, otherwise replace the wrapper with the login shell. On macOS, `/bin/zsh` is the final default when `SHELL` is absent or unsafe. Windows remains unchanged and does not use this builder.

This avoids hard-coded Homebrew or MacPorts paths and lets the user's supported login-shell initialization define command availability.

## UI and Copy

The existing Tmux sessions group contains two rows:

- Use tmux for local terminals
- Use tmux for remote terminals

Each hint states that the preference applies to both in-app and supported external terminals. Existing sentence-case and translation conventions remain unchanged across English, Simplified Chinese, Japanese, and Korean.

## Error Handling

- Unsafe or non-absolute shell paths continue to fall back to a platform-safe shell.
- Missing tmux remains a supported direct-login-shell fallback.
- A detected tmux executable that fails continues to surface its error instead of silently falling back.
- Invalid settings values normalize through the migration rules without entering renderer state.
- No path may kill or rewrite an existing tmux session.

## Testing

- Settings source tests cover defaults, scoped persistence, current-global migration, legacy remote-only migration, precedence, and removal of the global field after writes.
- Snapshot, bootstrap, native projection, renderer read/write, and UI tests cover both booleans.
- Terminal catalog tests prove local and SSH in-app launches consult different preference readers.
- Repository/remote action tests prove local and SSH external launches use their matching preference.
- Local invocation tests prove the configured login shell is the wrapper command, performs tmux detection, and remains the fallback shell.
- Full verification runs type checking, unit tests, and the architecture guard.

## Architecture Review

- Settings truth remains in the server source/write/read layers.
- Terminal routing remains in server terminal and external-launch orchestration.
- Shell command construction remains in `src/system/`.
- Electron main owns no preference or tmux policy.
- No renderer-to-main or server-to-Electron import boundary changes are introduced.


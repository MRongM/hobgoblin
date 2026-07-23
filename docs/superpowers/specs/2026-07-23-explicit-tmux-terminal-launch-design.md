# Explicit tmux Internal Terminal Launch Design

**Date:** 2026-07-23

**Status:** Approved through autonomous implementation direction

## Summary

Remove the persisted local and remote tmux preferences. Internal terminals use the target host's native login shell by default. A user may explicitly create a tmux-backed internal terminal from terminal creation menus and workspace item menus; if tmux is unavailable on the local or SSH target host, that launch silently falls back to the native login shell.

## Goals

- Make every ordinary internal-terminal creation path launch the native login shell.
- Add an explicit “New terminal with tmux” action to the terminal topbar menu, item More menus, and item context menus.
- Support the explicit action for local and SSH targets.
- Preserve deterministic tmux session identity and native-shell fallback.
- Remove tmux preferences from settings UI, snapshots, bootstrap data, persistence, and external-terminal launch policy.

## Non-goals

- Killing, migrating, or renaming existing tmux sessions.
- Changing an already-running internal terminal when another launch mode is selected.
- Adding a remembered project, worktree, or terminal launch preference.
- Adding a tmux availability probe to the renderer.
- Adding an explicit tmux mode to external terminal applications.

## Domain Model

`TerminalLaunchMode` is a per-create-request value with two valid states:

```ts
type TerminalLaunchMode = 'native' | 'tmux-if-available'
```

The mode is user intent, not runtime-coherent or restorable state. It is not part of a tmux session descriptor or terminal session key. Missing or invalid transport input normalizes to `native`.

## Architecture

The renderer selects a launch mode only through a typed terminal creation action. The server terminal catalog validates and applies that mode. Local and remote command construction remains in `src/system/`, and the terminal worker receives the mode in the create request rather than reading settings.

For local launches, `tmux-if-available` uses the existing login-shell wrapper to run `command -v tmux`, attach or create the deterministic session when found, and execute the native login shell when not found. For SSH launches, the existing remote shell script performs the same check on the remote host. A discovered tmux command that fails remains an error.

Ordinary create actions omit the mode or pass `native`. Explicit tmux actions pass `tmux-if-available`. Session restart reuses the command and arguments chosen when that session was created.

## UI

- The terminal topbar's direct New button remains native.
- The terminal topbar overflow menu contains both “New terminal” and “New terminal with tmux”.
- Project, repository, worktree, branch workspace, and member-worktree context menus contain the explicit tmux action.
- Their item More menus contain the same explicit action.
- Existing quick internal-terminal buttons remain native.
- External-terminal actions remain native and retain their existing labels.

All menus reuse the current action models and menu primitives. No new settings row or persistent selector is introduced.

## Settings Migration

`localTerminalTmuxEnabled`, `remoteTerminalTmuxEnabled`, and the historical `internalTerminalTmuxEnabled` are no longer part of settings types or projections. Persisted legacy fields are ignored during read normalization and disappear when normalized settings are written. No new migration flag is stored.

## Error Handling

- Missing tmux is a supported fallback, not an error.
- Invalid launch modes become `native` at the server boundary.
- A detected tmux executable that fails surfaces the underlying launch error.
- Existing terminal-session collision and authorization rules remain unchanged.

## Testing

- Shared validation tests cover native defaulting and the two accepted modes.
- Terminal catalog tests prove native is the default and explicit tmux works independently for local and SSH terminals.
- Renderer registry tests prove each action sends the expected mode.
- Menu tests cover topbar, context-menu, and item-menu exposure.
- Settings tests prove tmux fields are absent and legacy persisted values are discarded.
- Repository and remote external-terminal tests prove they no longer receive tmux policy.
- Full verification runs typecheck, unit tests, and the architecture guard.

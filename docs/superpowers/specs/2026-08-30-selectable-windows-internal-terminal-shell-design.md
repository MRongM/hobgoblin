# Selectable Windows Internal Terminal Shell Design

## Goal

Let users of the primary application Windows version choose Automatic, WSL, PowerShell, or Command Prompt for ordinary internal terminals while preserving the current reliable automatic fallback policy.

## Product Boundary

This work targets the primary application built from the root `src/` tree. The independent `windows/` package remains source-isolated and is not an acceptance target for this change.

The preference applies only when Hobgoblin launches an ordinary local Windows internal-terminal shell. It does not change:

- a project's identity or application-owned Git execution environment;
- a WSL project's registered distribution or Linux path;
- an SSH project's remote shell;
- an explicit tmux launch or another trusted explicit terminal command;
- the external-terminal application preference.

## Preference Model

Add one server-owned, persisted, runtime-coherent setting named `windowsInternalTerminalShell` with these values:

- `auto`: preserve the existing WSL-preferred fallback chain;
- `wsl`: launch only a usable WSL shell;
- `powershell`: launch PowerShell 7 when available, then Windows PowerShell 5.1;
- `cmd`: launch only Command Prompt.

The default is `auto`, including when loading legacy or invalid persisted settings. The setting appears only when the renderer host platform is `win32`, but it remains part of the ordinary server settings snapshot so all renderers converge on the same server truth.

All settings-file writes share one serialized persistence queue. Each accepted write captures its complete JSON snapshot before entering the queue, later writes proceed after earlier success or failure, and the last accepted preference therefore remains authoritative after relaunch.

## Shell Resolution

Automatic mode retains the existing validated candidate order:

1. usable `%SystemRoot%\System32\wsl.exe`;
2. stable PowerShell 7 under program files;
3. PowerShell 7 from an absolute inherited `PATH` directory;
4. Windows PowerShell 5.1;
5. an absolute existing `%COMSPEC%`;
6. `%SystemRoot%\System32\cmd.exe`.

Explicit modes filter that same safe candidate model rather than introducing a new executable lookup path:

- WSL includes only the WSL candidate. A Windows drive path is passed through `wsl.exe --cd` as structured argv. A UNC working directory makes WSL unavailable rather than opening in an unrelated directory.
- PowerShell includes PowerShell 7 and Windows PowerShell candidates only. Falling from PowerShell 7 to Windows PowerShell is an in-family fallback, not a change to another shell type.
- Command Prompt includes `%COMSPEC%` and the system `cmd.exe` candidate only.

All candidates remain absolute, existing, case-insensitively deduplicated, and outside repository-controlled lookup paths.

## Failure Semantics

- Automatic mode continues across shell types when a candidate is unavailable or its PTY spawn fails.
- An explicit selection never crosses into another shell type.
- If an explicit selection has no usable candidate, terminal creation or restart returns a localized, selection-specific unavailable error.
- If a selected candidate exists but fails to spawn, the existing final spawn diagnostic remains visible.
- Once a shell starts, later profile, distribution, or process failures remain ordinary terminal output and lifecycle events.

## Runtime Configuration Flow

The parent server process owns the persisted setting. At server runtime creation it synchronously reads and normalizes the persisted shell preference, falling back to `auto`, then configures the worker-backed terminal host before the worker is used.

The worker protocol gains a server-only configuration message. `WorkerBackedTerminalHost` sends the current preference before any registration or request sent to a newly spawned worker and sends an updated configuration message after a successful settings write. The terminal worker stores only the current normalized preference; renderer terminal requests cannot supply or override it.

`TerminalSessionManager` reads the worker's current preference when spawning a shell. Changing the setting does not terminate or mutate a running PTY. A new terminal uses the latest preference, and restarting an existing terminal respawns it with the latest preference.

This configuration message is discrete runtime state, so it does not use terminal output streaming or settings-file reads from the worker process.

## Settings UI

Add a Windows-only group to the existing Terminal settings page. The selector contains Automatic, WSL, PowerShell, and Command Prompt in that order.

The help text states that the preference applies to new and restarted local Windows internal terminals and does not change the project's Git environment. The UI writes through the existing settings client, web write path, query cache projection, server write path, and settings invalidation flow.

## Verification

Focused tests prove:

- legacy, invalid, and missing persisted values normalize to `auto`;
- all four values persist and project through settings snapshots;
- concurrent preference writes persist in accepted order so the last value survives reload;
- explicit shell modes include only their allowed safe candidates;
- WSL remains unavailable for UNC working directories;
- explicit unavailable modes return selection-specific errors;
- a terminal worker receives configuration before ordinary messages after initial spawn and receives later updates;
- new and restarted PTYs use the latest worker-owned preference without changing trusted explicit commands;
- the selector is visible on Windows, hidden elsewhere, and writes all four values;
- WSL projects, SSH terminals, and explicit tmux invocations retain their existing command paths.

Repository verification runs:

```bash
bun run typecheck
bun run check:architecture
bun run test
```

Exact WSL, PowerShell, Command Prompt, and ConPTY behavior still requires a packaged Windows smoke test.

## Non-Goals

- Selecting a WSL distribution or Linux user.
- Installing, updating, repairing, or configuring a shell.
- Changing application-owned Git routing, credentials, proxy ownership, or line-ending policy.
- Switching or terminating already running terminals when the preference changes.
- Adding a per-project, per-worktree, or per-terminal override.
- Changing the external-terminal preference.
- Modifying the independent `windows/` package.

# WSL-Preferred Windows External Terminal Design

## Goal

On Windows, open the selected local workspace in Windows Terminal using the user's usable default WSL distribution. Preserve the current native Windows launch behavior when WSL is unavailable and the PowerShell fallback when Windows Terminal cannot launch.

This decision applies independently to both Windows implementations:

- the primary application's `src/` Windows path;
- the independent `windows/` platform package.

The two packages remain source-isolated. Their equivalent files change together, without adding a synchronization layer or a runtime dependency between packages.

## Launch Policy

For a valid local Windows working directory, resolve and launch in this order:

1. When `wt.exe` is available and `%SystemRoot%\System32\wsl.exe --list --quiet` succeeds within five seconds with at least one registered distribution, start `wt.exe -d <working-directory> <absolute-wsl.exe>`.
2. When `wt.exe` is available but usable WSL is not, retain `wt.exe -d <working-directory>` so the user's native/default Windows Terminal profile remains authoritative.
3. When the Windows Terminal process cannot be spawned, or `wt.exe` is unavailable, retain the existing detached PowerShell launcher and working-directory environment handoff.
4. When no supported external terminal can launch, return the existing structured error.

Windows Terminal's command line treats the executable after `-d` as the tab command line. Launching `wsl.exe` without distribution or user arguments selects the user's configured default distribution and default user. The Windows working directory remains an argv value rather than interpolated shell text.

## Shared WSL Capability

The internal and external Windows terminal paths need the same definition of usable WSL. A focused shared helper owns only this platform capability:

- resolve `SYSTEMROOT` or `WINDIR` case-insensitively;
- construct and validate an absolute system `wsl.exe` path;
- require an existing file;
- probe registered distributions with a bounded hidden synchronous process;
- return the absolute executable only after a successful non-empty probe.

Internal shell candidate resolution consumes this helper without changing its existing ordering or fallback semantics. The helper remains Node-only and is imported only by server/system modules.

## Failure Semantics

- Missing `wsl.exe`, a failed or timed-out probe, or an empty distribution list excludes WSL without surfacing an error.
- A failure to spawn Windows Terminal continues to PowerShell when PowerShell is available.
- Once Windows Terminal reports that it spawned, later WSL initialization, profile, or process-exit failures remain visible in that external terminal; Hobgoblin cannot reliably observe them and does not open a second terminal.
- Invalid Windows working directories remain rejected before any capability probe or process launch.

## Renderer Device Classification

WSL is a shell choice inside a Windows desktop host, not a Mobile Web platform signal. A Windows desktop user agent therefore remains non-mobile even when Electron or the device exposes `ontouchstart` or positive touch points. Explicit mobile user agents take precedence over the desktop guard, and the existing touch fallback for non-Windows devices remains unchanged, preserving Android, legacy mobile Windows, and iPad behavior.

This correction is renderer-local and does not couple Mobile Web presentation to terminal shell resolution. Both source-isolated packages use the same narrow guard and regression tests.

## Verification

Equivalent focused tests in both packages prove:

- usable WSL adds the absolute `wsl.exe` command to the Windows Terminal argv;
- no registered distribution preserves native Windows Terminal behavior;
- Windows Terminal spawn failure falls back to PowerShell;
- existing invalid-path and terminal-not-installed behavior remains unchanged;
- internal shell resolution still prefers the same WSL helper before native shells.
- a touch-capable Windows desktop does not mount the Mobile Web terminal dock or command deck;
- Android and desktop-style iPad detection remain mobile.

Repository verification includes both packages' focused tests, type checks, architecture check, and full test suites.

## Out of Scope

- Persisted WSL distribution or user selection.
- Installing, updating, repairing, or configuring WSL or Windows Terminal.
- Directly opening a legacy standalone `wsl.exe` console when Windows Terminal is absent.
- WSL path-conversion APIs, remote terminals, or tmux behavior.

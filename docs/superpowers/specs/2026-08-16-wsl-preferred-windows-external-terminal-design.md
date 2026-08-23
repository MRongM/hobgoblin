# Selectable Windows External Terminal Design

## Goal

On Windows, let the user choose Automatic, WSL, PowerShell, or Command Prompt for external terminals opened from a local Windows workspace. Automatic preserves the existing WSL-preferred behavior. Explicit choices retain the selected shell instead of silently changing to a different shell.

This decision applies independently to both Windows implementations:

- the primary application's `src/` Windows path;
- the independent `windows/` platform package.

The two packages remain source-isolated. Their equivalent files change together, without adding a synchronization layer or a runtime dependency between packages.

## Launch Policy

The existing server-owned `terminalApp` setting persists the selection and converges it across renderers. The Windows settings surface projects Windows-specific choices; macOS keeps its existing Automatic, Ghostty, and Terminal.app choices.

For a valid local Windows working directory, Automatic resolves and launches in this order:

1. When `wt.exe` is available and `%SystemRoot%\System32\wsl.exe --list --quiet` succeeds within five seconds with at least one registered distribution, start `wt.exe -d <working-directory> <absolute-wsl.exe>`.
2. When `wt.exe` is available but usable WSL is not, retain `wt.exe -d <working-directory>` so the user's native/default Windows Terminal profile remains authoritative.
3. When the Windows Terminal process cannot be spawned, or `wt.exe` is unavailable, retain the existing detached PowerShell launcher and working-directory environment handoff.
4. When PowerShell is unavailable, use a standalone Command Prompt as the final native fallback.
5. When no supported external terminal can launch, return the existing structured error.

Windows Terminal's command line treats the executable after `-d` as the tab command line. Launching `wsl.exe` without distribution or user arguments selects the user's configured default distribution and default user. The Windows working directory remains an argv value rather than interpolated shell text.

Explicit selections use these policies:

- **WSL** requires usable WSL and Windows Terminal, then launches `wt.exe -d <working-directory> <absolute-wsl.exe>`. It does not change to PowerShell or Command Prompt when unavailable.
- **PowerShell** launches `powershell.exe -NoLogo -NoExit` in Windows Terminal. If Windows Terminal cannot launch, it opens standalone PowerShell in the same working directory.
- **Command Prompt** launches `cmd.exe /K` in Windows Terminal. If Windows Terminal cannot launch, it opens a standalone Command Prompt with the same structured working directory.

WSL projects are not local Windows workspaces. Their external-terminal action continues to open the project's exact registered distribution and absolute Linux path, regardless of this preference.

## Shared WSL Capability

The internal and external Windows terminal paths need the same definition of usable WSL. A focused shared helper owns only this platform capability:

- resolve `SYSTEMROOT` or `WINDIR` case-insensitively;
- construct and validate an absolute system `wsl.exe` path;
- require an existing file;
- probe registered distributions with a bounded hidden synchronous process;
- return the absolute executable only after a successful non-empty probe.

Internal shell candidate resolution consumes this helper without changing its existing ordering or fallback semantics. The helper remains Node-only and is imported only by server/system modules.

Windows command discovery treats both ordinary executable files and accessible Windows App Execution Alias reparse-point symlinks as installed commands. This is required for Store-distributed `wt.exe`: Bun may reject `stat` on its `WindowsApps` alias even though the alias is executable. An inaccessible alias or a non-symlink `stat` failure remains unavailable.

## Failure Semantics

- Missing `wsl.exe`, a failed or timed-out probe, or an empty distribution list excludes WSL without surfacing an error.
- In Automatic mode, a failure to spawn Windows Terminal continues to PowerShell and then Command Prompt when available.
- An explicit PowerShell or Command Prompt selection may fall back to the standalone host for the same shell, but never to another shell.
- An explicit WSL selection reports unavailability when usable WSL or Windows Terminal is missing.
- Once Windows Terminal reports that it spawned, later WSL initialization, profile, or process-exit failures remain visible in that external terminal; Hobgoblin cannot reliably observe them and does not open a second terminal.
- Invalid Windows working directories remain rejected before any capability probe or process launch.

## Renderer Device Classification

WSL is a shell choice inside a Windows desktop host, not a Mobile Web platform signal. A Windows desktop user agent therefore remains non-mobile even when Electron or the device exposes `ontouchstart` or positive touch points. Explicit mobile user agents take precedence over the desktop guard, and the existing touch fallback for non-Windows devices remains unchanged, preserving Android, legacy mobile Windows, and iPad behavior.

This correction is renderer-local and does not couple Mobile Web presentation to terminal shell resolution. Both source-isolated packages use the same narrow guard and regression tests.

## Verification

Equivalent focused tests in both packages prove:

- usable WSL adds the absolute `wsl.exe` command to the Windows Terminal argv;
- explicit WSL, PowerShell, and Command Prompt selections produce the intended structured command arrays;
- selected PowerShell and Command Prompt retain their shell when Windows Terminal is unavailable;
- the Windows settings picker persists all three explicit selections;
- no registered distribution preserves native Windows Terminal behavior;
- Windows Terminal spawn failure falls back to PowerShell;
- existing invalid-path and terminal-not-installed behavior remains unchanged;
- internal shell resolution still prefers the same WSL helper before native shells.
- Windows Terminal detection accepts an accessible `WindowsApps/wt.exe` App Execution Alias even when `stat` cannot follow it;
- a touch-capable Windows desktop does not mount the Mobile Web terminal dock or command deck;
- Android and desktop-style iPad detection remain mobile.

Repository verification includes both packages' focused tests, type checks, architecture check, and full test suites.

## Out of Scope

- Persisted WSL distribution or user selection.
- Installing, updating, repairing, or configuring WSL or Windows Terminal.
- Directly opening a legacy standalone `wsl.exe` console when Windows Terminal is absent.
- Changing WSL-project distribution routing, SSH remote terminals, or tmux behavior.

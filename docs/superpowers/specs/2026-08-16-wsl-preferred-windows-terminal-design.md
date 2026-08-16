# WSL-Prioritized Windows Internal Terminal Design

## Goal

Use a developer's usable default WSL distribution as the first internal-terminal shell on Windows. Preserve a reliable native Windows shell for systems without usable WSL.

This decision applies independently to both Windows implementations:

- the primary application's `src/` Windows path;
- the standalone `windows/` platform package.

It supersedes the WSL exclusion in the earlier Windows shell selection design. The packages remain source-isolated; no shared-core extraction or synchronization mechanism is introduced.

## Shell Resolution

For an ordinary Windows internal terminal, resolve candidates in this order:

1. `%SystemRoot%\System32\wsl.exe`, only when it is an absolute existing file and `wsl.exe --list --quiet` succeeds within five seconds with at least one registered distribution;
2. stable PowerShell 7 from the program-files locations;
3. PowerShell 7 from an absolute inherited `PATH` directory;
4. Windows PowerShell 5.1;
5. an absolute existing `%COMSPEC%`;
6. `%SystemRoot%\System32\cmd.exe`.

The WSL probe does not select, install, update, or configure a distribution. Launching `wsl.exe` without arguments uses the user's default WSL distribution and user. The existing PTY `cwd` remains the only working-directory input, so normal Windows project paths retain WSL's documented current-directory mapping.

All executable candidates remain absolute, validated, case-insensitively deduplicated, and outside repository-controlled lookup paths.

## Failure Semantics

- Missing `wsl.exe`, an empty distribution list, a failed probe, or a timed-out probe excludes WSL and proceeds to native candidates.
- A node-pty spawn failure for WSL proceeds to the next candidate.
- Once WSL starts, later distribution, shell-profile, or process-exit failures remain ordinary terminal output and lifecycle events; Hobgoblin does not replace a started session with another shell.
- Trusted explicit terminal commands are unchanged.

## Windows Platform Package Appearance

The standalone Windows package has an existing PowerShell bootstrap that applies legacy ConPTY console appearance before launching a native candidate. A WSL candidate bypasses that bootstrap and starts directly. xterm remains responsible for renderer appearance, while PowerShell bootstrapping remains unchanged for its native candidates.

## Release Verification

Resolver tests in both packages prove WSL is first only after a successful registered-distribution probe, and that native fallback remains available when no distribution is registered. The standalone package also proves that its ConPTY appearance path starts WSL directly.

The packaged Windows smoke test accepts WSL, PowerShell 7, or Windows PowerShell. It chooses a portable WSL marker-and-`pwd` command when WSL is selected, translates the expected working directory with that selected default distribution, and preserves the existing PowerShell command path otherwise.

## Out of Scope

- Persisted shell selection or distribution selection.
- Installing, updating, or repairing WSL.
- WSL-specific path conversion APIs or remote/tmux behavior.
- Changes to the terminal protocol, renderer state, or external-terminal integration.

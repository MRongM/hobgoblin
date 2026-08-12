# Windows 11 Internal Terminal Shell Design

## Goal

Make Hobgoblin's internal terminal useful for development on Windows 11 while preserving reliable startup on a clean system. The existing xterm.js renderer, node-pty worker, ConPTY transport, terminal session protocol, and Windows path handling remain in place. This change selects a better command interpreter inside that existing terminal stack.

## Terminology

- **Internal terminal** is the Hobgoblin-managed session and terminal surface.
- **Internal terminal shell** is the interactive command interpreter attached to that session's PTY.
- **Windows Terminal** is an external graphical terminal host. It is not a shell and is not part of this internal-terminal launch path.

This distinction follows Microsoft's terminal-versus-shell model and prevents `wt.exe` from being treated as an embeddable child shell.

## Current Evidence

The packaged Windows smoke test already proves that the Electron app can start its server, spawn the terminal worker, and create a node-pty session in a path containing spaces and Chinese characters. It does not prove that the chosen shell is suitable for development, that a renderer-equivalent attachment can write input, or that command output returns through the terminal WebSocket.

The current PTY runtime selects `%COMSPEC%`, normally `cmd.exe`, for every ordinary Windows internal terminal. There is no PowerShell discovery policy or user-configurable internal shell. The renderer already receives the server's ConPTY compatibility metadata, so no renderer or protocol redesign is required.

## Options Considered

### 1. Automatically prefer PowerShell 7 with system fallbacks — selected

Use PowerShell 7 when installed, Windows PowerShell 5.1 on a clean Windows 11 system, and `cmd.exe` only as the final fallback.

This gives developers modern PowerShell and UTF-8 defaults without making an optional component a hard dependency. It also keeps a clean Windows 11 installation usable.

### 2. Always use Windows PowerShell 5.1

This is dependable because Windows 11 includes it, but it retains legacy encoding behavior and ignores an installed PowerShell 7. It is a safe fallback, not the best default.

### 3. Add an internal-shell setting now

This would support PowerShell, cmd, Git Bash, and WSL explicitly, but it expands settings persistence, validation, UI, localization, and recovery before the base Windows terminal works reliably. It is intentionally deferred.

Calling Windows Terminal is not an option: it creates or targets an external terminal host rather than supplying the shell process for the existing node-pty session.

## Shell Resolution Policy

For an ordinary Windows 11 internal terminal, construct an ordered list of absolute executable candidates:

1. Stable PowerShell 7 at `%ProgramFiles%\PowerShell\7\pwsh.exe` (also consider the native 64-bit `ProgramW6432` value when present).
2. `pwsh.exe` found in an absolute directory from the inherited `PATH`.
3. Windows PowerShell 5.1 at `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`.
4. An absolute, existing `%COMSPEC%` executable.
5. `%SystemRoot%\System32\cmd.exe`.

Candidate paths are deduplicated case-insensitively and must be absolute, free of NUL characters, and exist as files. The resolver must not search the repository working directory. In particular, it must not invoke bare `pwsh.exe`, `powershell.exe`, or `cmd.exe`, and must not use the default `where.exe` search that includes the current directory. This prevents an untrusted repository from shadowing the shell executable.

If an explicit command is supplied by a trusted existing server path, preserve it exactly and do not apply automatic fallback.

## Spawn and Fallback Behavior

Shells are launched directly through `node-pty.spawn(executable, argv, { cwd, env, ... })`. No command string, `cmd /c`, `powershell -Command`, wrapper script, or `Start-Process` layer is introduced.

- PowerShell 7: `pwsh.exe -NoLogo`
- Windows PowerShell 5.1: `powershell.exe -NoLogo`
- cmd: `cmd.exe` with no startup arguments

Normal development sessions load the user's PowerShell profile so their PATH, functions, modules, aliases, and prompt match their development environment. Hobgoblin does not pass `-ExecutionPolicy Bypass`, `-NonInteractive`, or `-NoProfile` in product sessions.

If a candidate cannot be spawned, try the next resolved candidate. If all candidates fail, return a concise terminal creation error containing no secret data. Once a shell has spawned successfully, later profile errors or process exit are ordinary terminal output/lifecycle events and must not silently switch the session to another shell.

The working directory remains the structured node-pty `cwd` option. Shell arguments never contain the repository path, preserving drive letters, spaces, parentheses, apostrophes, and non-ASCII Windows paths without an extra parsing layer.

## Architecture

Keep this policy in the terminal source layer under `src/server/terminal/`:

- A focused, pure Windows shell resolver owns candidate construction, validation, ordering, arguments, and deduplication.
- `terminal-pty-runtime.ts` owns PTY creation and iterates the resolved candidates.
- `terminal-session-manager.ts`, the terminal worker protocol, WebSocket boundary, renderer registry, and xterm view remain unchanged.

The resolver accepts injectable environment and file-probe inputs for deterministic cross-platform unit tests. It uses `path.win32` semantics even when those tests run on macOS. No new dependency is required.

## Error Handling

- Missing PowerShell 7 is normal and does not produce a user-visible error.
- A missing or invalid standard candidate falls through to the next candidate.
- An invalid relative `%COMSPEC%` is ignored.
- Spawn failures are retained for diagnostics while fallback continues.
- If no shell starts, terminal creation returns an error through the existing session result path; the application remains usable.
- A successfully started shell that subsequently exits remains an exited terminal. Hobgoblin does not mask a broken user profile by replacing the shell.

No profile-recovery UI is added in this change. A future explicit “start without profile” action can be designed separately if real failure evidence justifies it.

## Windows CI Verification

Extend the packaged Windows workflow beyond create-and-close:

1. Launch the packaged app with an isolated user-data directory.
2. Create a workspace path containing spaces and Chinese characters.
3. Connect through the same terminal WebSocket used by the renderer.
4. Create and attach the internal terminal.
5. Assert that the selected process is PowerShell on the hosted image.
6. Send a PowerShell command that emits a unique Unicode marker and the current working directory.
7. Wait for the corresponding terminal output event and verify the marker and working directory.
8. Resize the session and verify the mutation succeeds.
9. Close the session and print startup/worker diagnostics on failure.

Resolver unit tests cover PowerShell 7 present, PowerShell 7 missing, Windows PowerShell fallback, invalid `%COMSPEC%`, cmd fallback, path deduplication, and avoidance of relative/current-directory candidates. The production spawn test proves that resolved commands and argument arrays reach node-pty without string interpolation.

GitHub's hosted `windows-latest` image is Windows Server rather than Windows 11 x64. It is valid evidence for packaged Electron, PowerShell, node-pty, ConPTY, Unicode paths, and terminal I/O, but it is not exact Windows 11 client evidence. Release-level Windows 11 proof requires a Windows 11 x64 machine or self-hosted runner.

## Out of Scope

- Bundling or installing PowerShell 7.
- Adding a persisted shell selector.
- Making Git Bash, WSL, Nushell, or another optional shell the automatic default.
- Changing the external-terminal feature or Windows Terminal integration.
- Changing terminal WebSocket schemas, renderer state, xterm rendering, or tmux behavior.
- Forcing a global code page or file encoding.

## Success Criteria

- A clean Windows 11 installation opens Windows PowerShell 5.1 in an internal terminal.
- A Windows 11 installation with stable PowerShell 7 opens `pwsh.exe` instead.
- Invalid or missing optional candidates fall back without preventing terminal creation.
- The selected shell receives the exact requested Windows working directory, including Unicode and spaces.
- A packaged GitHub Windows smoke test attaches, writes a command, observes Unicode output, resizes, and closes the actual PTY session.
- Existing macOS, Linux, remote, tmux, and renderer behavior is unchanged.
- `bun run typecheck`, `bun run test`, and `bun run check:architecture` pass.
